import {
  calculateKnowledgeRequirements,
  type KnowledgeRequirements,
  type KnowledgeRequirementsInput,
} from "../../knowledge-requirements.ts";

export interface StorageResourceState {
  readonly id: string;
  readonly maxQuantity: number;
  /** Current (post-reset) maxCost; accumulated with Math.max. */
  readonly maxCost: number;
  /** Current (post-reset) storageRequired; accumulated with Math.max. */
  readonly storageRequired: number;
  readonly hasStorage: boolean;
  readonly autoSellEnabled: boolean;
  readonly autoSellRatio: number;
}

export interface StorageRequestCost {
  readonly resourceId: string;
  readonly amount: number;
}

export interface StorageRequestTarget {
  readonly costs: readonly StorageRequestCost[];
}

export interface StorageRequirementsInput {
  readonly storageAssignExtra: boolean;
  readonly autoMarket: boolean;
  readonly noTrade: boolean;
  /** Target lists in the exact legacy requestStorageFor call order. */
  readonly requestLists: readonly (readonly StorageRequestTarget[])[];
  readonly knowledge: KnowledgeRequirementsInput;
  readonly resources: readonly StorageResourceState[];
  /** Money reserve when the inflation-challenge assist is active, else null. */
  readonly inflationMoney: number | null;
  /** Graphene reserve when the retirement-challenge assist is active, else null. */
  readonly retirementGraphene: number | null;
}

export interface StorageResourceRequirement {
  readonly id: string;
  readonly maxCost: number;
  readonly storageRequired: number;
}

export interface StorageRequirementsResult {
  readonly resources: readonly StorageResourceRequirement[];
  readonly knowledge: KnowledgeRequirements;
}

interface Accumulator {
  maxCost: number;
  storageRequired: number;
  readonly maxQuantity: number;
  readonly hasStorage: boolean;
  readonly autoSellEnabled: boolean;
  readonly autoSellRatio: number;
}

/**
 * Pure equivalent of the legacy `calculateRequiredStorages`. Replays the
 * sequential `requestStorageFor` accumulation over immutable inputs: maxCost is
 * raised for every cost resource even when storage is insufficient; storageRequired
 * is raised only when every cost fits (or the resource has dedicated storage),
 * using the 3% buffer and the half-capacity fallback. Inflation/retirement reserves
 * and the auto-sell division are applied afterward in the original order.
 */
export function planStorageRequirements(
  input: Readonly<StorageRequirementsInput>,
): StorageRequirementsResult {
  const bufferMult = input.storageAssignExtra ? 1.03 : 1;
  const acc = new Map<string, Accumulator>();
  for (const resource of input.resources) {
    acc.set(resource.id, {
      maxCost: resource.maxCost,
      storageRequired: resource.storageRequired,
      maxQuantity: resource.maxQuantity,
      hasStorage: resource.hasStorage,
      autoSellEnabled: resource.autoSellEnabled,
      autoSellRatio: resource.autoSellRatio,
    });
  }

  function requestStorageFor(list: readonly StorageRequestTarget[]): void {
    for (const target of list) {
      let storageSuffient = true;
      for (const cost of target.costs) {
        const resource = acc.get(cost.resourceId);
        if (resource === undefined) continue;
        resource.maxCost = Math.max(cost.amount, resource.maxCost);
        if (resource.maxQuantity < cost.amount && !resource.hasStorage) {
          storageSuffient = false;
        }
      }
      if (!storageSuffient) continue;
      for (const cost of target.costs) {
        const resource = acc.get(cost.resourceId);
        if (resource === undefined) continue;
        let assumeCost = cost.amount * bufferMult;
        if (resource.maxQuantity < assumeCost && !resource.hasStorage) {
          assumeCost = (cost.amount + resource.maxQuantity) / 2;
        }
        resource.storageRequired = Math.max(
          assumeCost,
          resource.storageRequired,
        );
      }
    }
  }

  for (const list of input.requestLists) {
    requestStorageFor(list);
  }

  if (input.inflationMoney !== null) {
    const money = acc.get("Money");
    if (money !== undefined) {
      money.maxCost = Math.max(money.maxCost, input.inflationMoney);
      money.storageRequired = Math.max(
        money.storageRequired,
        input.inflationMoney,
      );
    }
  }
  if (input.retirementGraphene !== null) {
    const graphene = acc.get("Graphene");
    if (graphene !== undefined) {
      graphene.maxCost = Math.max(graphene.maxCost, input.retirementGraphene);
      graphene.storageRequired = Math.max(
        graphene.storageRequired,
        input.retirementGraphene,
      );
    }
  }

  if (input.storageAssignExtra && !input.noTrade && input.autoMarket) {
    for (const resource of acc.values()) {
      if (resource.autoSellEnabled && resource.autoSellRatio > 0) {
        resource.storageRequired /= resource.autoSellRatio;
      }
    }
  }

  const resources = input.resources.map((resource) => {
    const state = acc.get(resource.id);
    return Object.freeze({
      id: resource.id,
      maxCost: state === undefined ? resource.maxCost : state.maxCost,
      storageRequired:
        state === undefined ? resource.storageRequired : state.storageRequired,
    });
  });

  return Object.freeze({
    resources: Object.freeze(resources),
    knowledge: calculateKnowledgeRequirements(input.knowledge),
  });
}
