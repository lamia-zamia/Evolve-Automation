/**
 * Pure equivalent of the legacy `autoAlchemy`. It computes the per-resource
 * transmutation adjustment over an immutable snapshot and returns the ordered
 * decrease/increase command lists. The composition root calls `transmuteLess`
 * / `transmuteMore`; this function performs no reads or mutations.
 */

export interface AlchemyResourceView {
  readonly id: string;
  /** `AlchemyManager.currentCount(res.id)`. */
  readonly currentCount: number;
  /** `AlchemyManager.resWeighting(res.id)`. */
  readonly weighting: number;
  /** `res.isUseful()`. */
  readonly isUseful: boolean;
  /** `AlchemyManager.transmuteTier(res)` (fullmetal helper only). */
  readonly transmuteTier: number;
  /** `res.instance?.basic` (fullmetal helper only). */
  readonly isBasic: boolean;
}

export interface AlchemyInput {
  readonly unlocked: boolean;
  readonly crystalDemanded: boolean;
  readonly manaRateOfChange: number;
  readonly manaStorageRatio: number;
  readonly manaCurrentQuantity: number;
  readonly crystalCurrentQuantity: number;
  readonly crystalRateOfChange: number;
  readonly autoPylon: boolean;
  readonly magicAlchemyManaUse: number;
  readonly magicFullmetalHelper: boolean;
  readonly universeMagic: boolean;
  readonly alchemyTech: number;
  readonly fullmetalStar: number;
  readonly achievementLevel: number;
  /** `AlchemyManager.managedPriorityList()`, in order. */
  readonly resources: readonly AlchemyResourceView[];
}

export interface AlchemyAdjustment {
  readonly id: string;
  readonly count: number;
}

export interface AlchemyDecision {
  readonly decrease: readonly AlchemyAdjustment[];
  readonly increase: readonly AlchemyAdjustment[];
}

const EMPTY: AlchemyDecision = Object.freeze({
  decrease: Object.freeze([]),
  increase: Object.freeze([]),
});

export function planAlchemy(input: Readonly<AlchemyInput>): AlchemyDecision {
  if (!input.unlocked) {
    return EMPTY;
  }

  const adjust = new Map<string, number>();
  for (const res of input.resources) {
    adjust.set(res.id, res.currentCount * -1);
  }

  if (!input.crystalDemanded) {
    const activeList = input.resources.filter(
      (res) => res.weighting > 0 && res.isUseful,
    );
    let totalWeighting = 0;
    let currentTransmute = 0;
    for (const res of activeList) {
      totalWeighting += res.weighting;
      currentTransmute += res.currentCount;
    }
    const manaAvailable =
      (currentTransmute + input.manaRateOfChange) *
      (!input.autoPylon && input.manaStorageRatio > 0.99
        ? 1
        : input.magicAlchemyManaUse);
    const crystalAvailable =
      currentTransmute * 0.15 +
      input.crystalCurrentQuantity +
      input.crystalRateOfChange;
    const maxTransmute = Math.floor(
      Math.min(manaAvailable, crystalAvailable * (1 / 0.15)),
    );
    for (const res of activeList) {
      adjust.set(
        res.id,
        (adjust.get(res.id) ?? 0) +
          Math.floor(maxTransmute * (res.weighting / totalWeighting)),
      );
    }
  }

  if (
    input.magicFullmetalHelper &&
    input.universeMagic &&
    input.alchemyTech >= 2 &&
    input.fullmetalStar < input.achievementLevel &&
    input.manaCurrentQuantity >= 1 &&
    input.crystalCurrentQuantity >= 0.15
  ) {
    const fullmetal = input.resources.find(
      (res) => res.transmuteTier > 1 && !res.isBasic,
    );
    if (fullmetal) {
      adjust.set(
        fullmetal.id,
        Math.max(adjust.get(fullmetal.id) ?? 0, 1 - fullmetal.currentCount),
      );
    }
  }

  const decrease: AlchemyAdjustment[] = [];
  const increase: AlchemyAdjustment[] = [];
  for (const res of input.resources) {
    const delta = adjust.get(res.id) ?? 0;
    if (delta < 0) {
      decrease.push(Object.freeze({ id: res.id, count: delta * -1 }));
    }
  }
  for (const res of input.resources) {
    const delta = adjust.get(res.id) ?? 0;
    if (delta > 0) {
      increase.push(Object.freeze({ id: res.id, count: delta }));
    }
  }

  return Object.freeze({
    decrease: Object.freeze(decrease),
    increase: Object.freeze(increase),
  });
}
