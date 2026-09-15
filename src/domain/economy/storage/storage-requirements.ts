import {
  calculateKnowledgeRequirements,
  type KnowledgeRequirements,
  type KnowledgeRequirementsInput,
} from "../../knowledge-requirements.ts";

export interface StorageResourceState {
  readonly id: string;
  /** Omitted for civilization-wide storage; named pools are DeadSpace regional ledgers. */
  readonly pool?: string;
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
  readonly pool?: string;
}

export interface StorageRequestTarget {
  readonly costs: readonly StorageRequestCost[];
  readonly pool?: string;
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
  readonly pool?: string;
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

/** Global and named-pool requirements must never share an accumulator. */
export function storageRequirementScopeKey(
  resourceId: string,
  pool?: string,
): string {
  return `${resourceId}\u0000${pool === undefined || pool === "*" ? "*" : pool}`;
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
  const resourceIds = new Set<string>();
  for (const resource of input.resources) {
    acc.set(storageRequirementScopeKey(resource.id, resource.pool), {
      maxCost: resource.maxCost,
      storageRequired: resource.storageRequired,
      maxQuantity: resource.maxQuantity,
      hasStorage: resource.hasStorage,
      autoSellEnabled: resource.autoSellEnabled,
      autoSellRatio: resource.autoSellRatio,
    });
    resourceIds.add(resource.id);
  }

  function requestStorageFor(list: readonly StorageRequestTarget[]): void {
    for (const target of list) {
      let storageSuffient = true;
      for (const cost of target.costs) {
        const resource = acc.get(
          storageRequirementScopeKey(cost.resourceId, cost.pool ?? target.pool),
        );
        if (resource === undefined) {
          if (resourceIds.has(cost.resourceId) && cost.amount > 0) {
            storageSuffient = false;
          }
          continue;
        }
        resource.maxCost = Math.max(cost.amount, resource.maxCost);
        if (resource.maxQuantity < cost.amount && !resource.hasStorage) {
          storageSuffient = false;
        }
      }
      if (!storageSuffient) continue;
      for (const cost of target.costs) {
        const resource = acc.get(
          storageRequirementScopeKey(cost.resourceId, cost.pool ?? target.pool),
        );
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
    const money = acc.get(storageRequirementScopeKey("Money"));
    if (money !== undefined) {
      money.maxCost = Math.max(money.maxCost, input.inflationMoney);
      money.storageRequired = Math.max(
        money.storageRequired,
        input.inflationMoney,
      );
    }
  }
  if (input.retirementGraphene !== null) {
    const graphene = acc.get(storageRequirementScopeKey("Graphene"));
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
    const state = acc.get(
      storageRequirementScopeKey(resource.id, resource.pool),
    );
    return Object.freeze({
      id: resource.id,
      ...(resource.pool === undefined ? {} : { pool: resource.pool }),
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
