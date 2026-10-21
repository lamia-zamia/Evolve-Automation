import type { ResourceClaimLedger } from "./resource-claims.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;

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
  /** Explicit, test-surface-only Research target supplied to the existing Gather owner. */
  readonly testOnlyStoneTarget?: Readonly<{
    quantity: number;
    clickBudget: number;
  }>;
  /** Explicit test-surface material shortages for one current native Research offer. */
  readonly testOnlyMaterialTarget?: Readonly<{
    readonly Lumber?: Readonly<{ quantity: number; clickBudget: number }>;
    readonly Stone?: Readonly<{ quantity: number; clickBudget: number }>;
  }>;
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

  if (
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true &&
    input.stopped &&
    input.clickable.stone
  ) {
    const testStoneTarget = input.testOnlyStoneTarget;
    if (
      testStoneTarget !== undefined &&
      Number.isFinite(testStoneTarget.quantity) &&
      testStoneTarget.quantity <= input.resources.Stone.maxQuantity &&
      Number.isSafeInteger(testStoneTarget.clickBudget) &&
      testStoneTarget.clickBudget > 0
    ) {
      const resource = input.resources.Stone;
      const current = quantities.Stone;
      const shortage = Math.max(0, testStoneTarget.quantity - current);
      const amount = Math.min(
        Math.ceil(shortage / input.resourcesPerClick),
        testStoneTarget.clickBudget,
        input.clickLimit,
      );
      if (amount > 0) {
        operations.push(
          Object.freeze({
            actionId: "stone",
            amount,
            beforeAction: Object.freeze([
              Object.freeze({
                resourceId: "Stone",
                expectedQuantity: current,
                quantity: current,
              }),
            ]),
            afterAction: Object.freeze([
              Object.freeze({
                resourceId: "Stone",
                expectedQuantity: current,
                quantity: Math.min(
                  current + amount * input.resourcesPerClick,
                  resource.maxQuantity,
                ),
              }),
            ]),
          }),
        );
      }
    }
  }

  if (
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true &&
    input.stopped &&
    input.testOnlyMaterialTarget !== undefined
  ) {
    for (const resourceId of ["Lumber", "Stone"] as const) {
      const target = input.testOnlyMaterialTarget[resourceId];
      const actionId = resourceId === "Lumber" ? "lumber" : "stone";
      if (
        target === undefined ||
        !input.clickable[actionId] ||
        !Number.isFinite(target.quantity) ||
        target.quantity <= 0 ||
        target.quantity > input.resources[resourceId].maxQuantity ||
        !Number.isSafeInteger(target.clickBudget) ||
        target.clickBudget <= 0
      )
        continue;
      const current = quantities[resourceId];
      const clickLimit = Math.min(
        Math.ceil(
          Math.max(0, target.quantity - current) / input.resourcesPerClick,
        ),
        target.clickBudget,
        input.clickLimit,
      );
      if (clickLimit <= 0) continue;
      const conjuring = input.materialConjuring && quantities.Mana >= 1;
      if (
        conjuring &&
        input.resourceClaimLedger !== undefined &&
        remainingClaimSpend < 1
      )
        continue;
      const conjuredClicks = conjuring
        ? Math.min(
            clickLimit,
            Math.floor(quantities.Mana),
            Math.floor(remainingClaimSpend),
          )
        : 0;
      const manaAfterConjuring = quantities.Mana - conjuredClicks;
      const quantityAfterConjuring = Math.min(
        current + conjuredClicks * input.resourcesPerClick * 10,
        input.resources[resourceId].maxQuantity,
      );
      const ordinaryClicks =
        quantityAfterConjuring >= target.quantity || manaAfterConjuring >= 1
          ? 0
          : Math.min(
              clickLimit - conjuredClicks,
              Math.ceil(
                Math.max(0, target.quantity - quantityAfterConjuring) /
                  input.resourcesPerClick,
              ),
            );
      const amount = conjuredClicks + ordinaryClicks;
      if (amount <= 0) continue;
      quantities.Mana = manaAfterConjuring;
      if (input.resourceClaimLedger !== undefined)
        remainingClaimSpend = Math.max(0, remainingClaimSpend - conjuredClicks);
      const quantity = Math.min(
        quantityAfterConjuring + ordinaryClicks * input.resourcesPerClick,
        input.resources[resourceId].maxQuantity,
      );
      operations.push(
        Object.freeze({
          actionId,
          amount,
          beforeAction: Object.freeze([
            Object.freeze({
              resourceId,
              expectedQuantity: current,
              quantity: current,
            }),
          ]),
          afterAction: Object.freeze([
            Object.freeze({
              resourceId,
              expectedQuantity: current,
              quantity,
            }),
          ]),
        }),
      );
      quantities[resourceId] = quantity;
    }
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
