export interface CraftGateInput {
  readonly populationUnlocked: boolean;
  readonly noCraft: boolean;
}

interface CraftMaterialBase {
  readonly resourceId: string;
  readonly costPerCraft: number;
  readonly currentQuantity: number;
  readonly maxQuantity: number;
  readonly craftPreserve: number;
}

export type CraftMaterialView = CraftMaterialBase &
  (
    | {
        readonly mode: "demanded" | "required";
        readonly availableQuantity: number;
      }
    | {
        readonly mode: "income";
        readonly rateOfChange: number;
        readonly ticksPerSecond: number;
      }
    | { readonly mode: "blocked" }
  );

export interface CraftCandidateInput {
  readonly index: number;
  readonly craftableId: string | null;
  readonly unlocked: boolean;
  readonly autoCraftEnabled: boolean;
  readonly materials: readonly CraftMaterialView[];
}

export interface CraftSpend {
  readonly resourceId: string;
  readonly expectedCurrentQuantity: number;
  readonly amount: number;
}

export interface CraftDecision {
  readonly index: number;
  readonly craftableId: string;
  readonly count: number;
  readonly spend: readonly CraftSpend[];
}

export function shouldRunCraft(input: Readonly<CraftGateInput>): boolean {
  return input.populationUnlocked && !input.noCraft;
}

/** Pure port of the ordered legacy affordability calculation for one craftable. */
export function planCraft(
  input: Readonly<CraftCandidateInput>,
): CraftDecision | null {
  if (
    !input.unlocked ||
    !input.autoCraftEnabled ||
    input.craftableId === null ||
    input.materials.length === 0
  ) {
    return null;
  }

  let affordableAmount = Number.MAX_SAFE_INTEGER;
  for (const material of input.materials) {
    affordableAmount = Math.min(
      affordableAmount,
      Math.ceil(
        (material.currentQuantity -
          material.maxQuantity * material.craftPreserve) /
          material.costPerCraft,
      ),
    );

    if (material.mode === "blocked") {
      return null;
    }
    if (material.mode === "demanded" || material.mode === "required") {
      affordableAmount = Math.min(
        affordableAmount,
        material.availableQuantity / material.costPerCraft,
      );
    } else if (material.mode === "income") {
      affordableAmount = Math.min(
        affordableAmount,
        Math.ceil(
          material.rateOfChange /
            material.ticksPerSecond /
            material.costPerCraft,
        ),
      );
    }
  }

  const count = Math.floor(affordableAmount);
  if (count < 1) {
    return null;
  }
  return Object.freeze({
    index: input.index,
    craftableId: input.craftableId,
    count,
    spend: Object.freeze(
      input.materials.map((material) =>
        Object.freeze({
          resourceId: material.resourceId,
          expectedCurrentQuantity: material.currentQuantity,
          amount: material.costPerCraft * count,
        }),
      ),
    ),
  });
}
