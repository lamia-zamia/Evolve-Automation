import type { ResourceClaimLedger } from "./resource-claims.ts";

export type GatherActionId =
  "food" | "lumber" | "stone" | "chrysotile" | "slaughter";

export type GatherResourceId =
  "Food" | "Lumber" | "Stone" | "Chrysotile" | "Furs" | "Mana";

export interface GatherResourceInput {
  readonly currentQuantity: number;
  readonly maxQuantity: number;
}

export interface GatherResourcesInput {
  readonly stopped: boolean;
  readonly resourcesPerClick: number;
  readonly clickLimit: number;
  readonly fasting: boolean;
  readonly soulEater: boolean;
  readonly primitive: boolean;
  readonly foodConjuring: boolean;
  readonly materialConjuring: boolean;
  readonly fursUnlocked: boolean;
  /** Test-only callers may provide an admitted-claim budget; ordinary sessions omit it. */
  readonly resourceClaimLedger?: Readonly<ResourceClaimLedger>;
  readonly clickable: Readonly<Record<GatherActionId, boolean>>;
  readonly resources: Readonly<Record<GatherResourceId, GatherResourceInput>>;
}

export interface GatherResourceAssignment {
  readonly resourceId: GatherResourceId;
  readonly expectedQuantity: number;
  readonly quantity: number;
}

export interface GatherOperation {
  readonly actionId: GatherActionId;
  /** Preserves the legacy `for (let i = 0; i < amount; i++)` bound. */
  readonly amount: number;
  readonly beforeAction: readonly GatherResourceAssignment[];
  readonly afterAction: readonly GatherResourceAssignment[];
}

export interface GatherResourcesDecision {
  readonly operations: readonly GatherOperation[];
}

const DIRECT_TARGETS = Object.freeze([
  Object.freeze({ actionId: "food", resourceId: "Food" }),
  Object.freeze({ actionId: "lumber", resourceId: "Lumber" }),
  Object.freeze({ actionId: "stone", resourceId: "Stone" }),
  Object.freeze({ actionId: "chrysotile", resourceId: "Chrysotile" }),
] as const);

export function planGatherResources(
  input: Readonly<GatherResourcesInput>,
): GatherResourcesDecision | null {
  const quantities: Record<GatherResourceId, number> = {
    Food: input.resources.Food.currentQuantity,
    Lumber: input.resources.Lumber.currentQuantity,
    Stone: input.resources.Stone.currentQuantity,
    Chrysotile: input.resources.Chrysotile.currentQuantity,
    Furs: input.resources.Furs.currentQuantity,
    Mana: input.resources.Mana.currentQuantity,
  };
  const operations: GatherOperation[] = [];
  let remainingClaimSpend =
    input.resourceClaimLedger?.spendableStock ?? Infinity;

  for (const target of DIRECT_TARGETS) {
    if (!input.clickable[target.actionId]) continue;
    // After bootstrap, keep only the immediate zero-Food recovery available. The game reduces
    // population when Food runs out; collecting routine materials would spend Mana on Conjuring.
    if (
      input.stopped &&
      (target.actionId !== "food" || input.resources.Food.currentQuantity > 0)
    ) {
      continue;
    }
    if (target.actionId === "food" && input.fasting) continue;

    const resource = input.resources[target.resourceId];
    const current = quantities[target.resourceId];
    const conjuring =
      target.actionId === "food"
        ? input.foodConjuring
        : input.materialConjuring;
    // Zero Food stock is the only verified emergency edge here; upstream also has
    // production-aware foodApplied/shortagePools starvation checks that this reader lacks.
    const foodSafetyOverride = target.actionId === "food" && current <= 0;
    const spendingBlocked =
      input.resourceClaimLedger !== undefined &&
      !foodSafetyOverride &&
      conjuring &&
      quantities.Mana >= 1 &&
      remainingClaimSpend < 1;
    if (spendingBlocked) continue;
    const paidManaLimit = foodSafetyOverride
      ? Math.max(1, remainingClaimSpend)
      : remainingClaimSpend;
    let amount: number;
    const beforeAction: GatherResourceAssignment[] = [];
    const afterAction: GatherResourceAssignment[] = [];
    if (conjuring && quantities.Mana >= 1) {
      // Pinned actions.js gather val() spends one Mana and multiplies gain by ten while Mana >= 1.
      const conjuredClicks = Math.min(
        Math.ceil(
          (resource.maxQuantity - current) / (input.resourcesPerClick * 10),
        ),
        Math.floor(quantities.Mana),
        Math.floor(paidManaLimit),
        input.clickLimit,
      );
      const manaQuantity = quantities.Mana - conjuredClicks;
      amount = conjuredClicks;
      if (conjuredClicks > 0 && manaQuantity < 1) {
        amount += Math.ceil(
          Math.min(
            Math.max(
              0,
              (resource.maxQuantity -
                current -
                conjuredClicks * input.resourcesPerClick * 10) /
                input.resourcesPerClick,
            ),
            input.clickLimit - conjuredClicks,
          ),
        );
      }
      const resourceQuantity = Math.min(
        current +
          conjuredClicks * input.resourcesPerClick * 10 +
          (amount - conjuredClicks) * input.resourcesPerClick,
        resource.maxQuantity,
      );
      beforeAction.push(
        Object.freeze({
          resourceId: "Mana",
          expectedQuantity: quantities.Mana,
          quantity: quantities.Mana,
        }),
        Object.freeze({
          resourceId: target.resourceId,
          expectedQuantity: current,
          quantity: current,
        }),
      );
      afterAction.push(
        Object.freeze({
          resourceId: "Mana",
          expectedQuantity: quantities.Mana,
          quantity: manaQuantity,
        }),
        Object.freeze({
          resourceId: target.resourceId,
          expectedQuantity: current,
          quantity: resourceQuantity,
        }),
      );
      const plannedManaSpend = Math.max(0, quantities.Mana - manaQuantity);
      quantities.Mana = manaQuantity;
      if (input.resourceClaimLedger !== undefined) {
        remainingClaimSpend = Math.max(
          0,
          remainingClaimSpend - plannedManaSpend,
        );
      }
      quantities[target.resourceId] = resourceQuantity;
    } else {
      amount = Math.ceil(
        Math.min(
          (resource.maxQuantity - current) / input.resourcesPerClick,
          input.clickLimit,
        ),
      );
      const resourceQuantity = Math.min(
        current + amount * input.resourcesPerClick,
        resource.maxQuantity,
      );
      beforeAction.push(
        Object.freeze({
          resourceId: target.resourceId,
          expectedQuantity: current,
          quantity: current,
        }),
      );
      afterAction.push(
        Object.freeze({
          resourceId: target.resourceId,
          expectedQuantity: current,
          quantity: resourceQuantity,
        }),
      );
      quantities[target.resourceId] = resourceQuantity;
    }
    operations.push(
      Object.freeze({
        actionId: target.actionId,
        amount,
        beforeAction: Object.freeze(beforeAction),
        afterAction: Object.freeze(afterAction),
      }),
    );
  }

  if (!input.stopped && input.clickable.slaughter) {
    const amount = Math.min(
      Math.max(
        input.resources.Lumber.maxQuantity - quantities.Lumber,
        input.resources.Food.maxQuantity - quantities.Food,
        input.resources.Furs.maxQuantity - quantities.Furs,
      ) / input.resourcesPerClick,
      input.clickLimit,
    );
    const afterAction: GatherResourceAssignment[] = [];
    const assignCapped = (resourceId: "Lumber" | "Food" | "Furs") => {
      const current = quantities[resourceId];
      const quantity = Math.min(
        current + amount * input.resourcesPerClick,
        input.resources[resourceId].maxQuantity,
      );
      afterAction.push(
        Object.freeze({
          resourceId,
          expectedQuantity: current,
          quantity,
        }),
      );
      quantities[resourceId] = quantity;
    };
    assignCapped("Lumber");
    if (input.soulEater && input.primitive && !input.fasting) {
      assignCapped("Food");
    }
    if (input.fursUnlocked) assignCapped("Furs");
    operations.push(
      Object.freeze({
        actionId: "slaughter",
        amount,
        beforeAction: Object.freeze([]),
        afterAction: Object.freeze(afterAction),
      }),
    );
  }

  return operations.length === 0
    ? null
    : Object.freeze({ operations: Object.freeze(operations) });
}
