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
  if (input.stopped) return null;

  const quantities: Record<GatherResourceId, number> = {
    Food: input.resources.Food.currentQuantity,
    Lumber: input.resources.Lumber.currentQuantity,
    Stone: input.resources.Stone.currentQuantity,
    Chrysotile: input.resources.Chrysotile.currentQuantity,
    Furs: input.resources.Furs.currentQuantity,
    Mana: input.resources.Mana.currentQuantity,
  };
  const operations: GatherOperation[] = [];

  for (const target of DIRECT_TARGETS) {
    if (!input.clickable[target.actionId]) continue;
    if (target.actionId === "food" && input.fasting) continue;

    const resource = input.resources[target.resourceId];
    const current = quantities[target.resourceId];
    const conjuring =
      target.actionId === "food"
        ? input.foodConjuring
        : input.materialConjuring;
    let amount: number;
    const beforeAction: GatherResourceAssignment[] = [];
    if (conjuring) {
      amount = Math.floor(
        Math.min(
          (resource.maxQuantity - current) / (input.resourcesPerClick * 10),
          quantities.Mana,
          input.clickLimit,
        ),
      );
      const manaQuantity = quantities.Mana - amount;
      beforeAction.push(
        Object.freeze({
          resourceId: "Mana",
          expectedQuantity: quantities.Mana,
          quantity: manaQuantity,
        }),
      );
      quantities.Mana = manaQuantity;
      const resourceQuantity = current + amount * input.resourcesPerClick;
      beforeAction.push(
        Object.freeze({
          resourceId: target.resourceId,
          expectedQuantity: current,
          quantity: resourceQuantity,
        }),
      );
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
        afterAction: Object.freeze([]),
      }),
    );
  }

  if (input.clickable.slaughter) {
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
