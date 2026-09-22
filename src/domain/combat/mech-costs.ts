/**
 * Mech space/cost/refund formulas.
 *
 * Restates `mechSize` and `mechCost` from `D:/work/Evolve-DeadSpace/src/portal.js`
 * (lines 6319 and 7193, DeadSpace `fa62465f`) for the classic frame line, plus
 * the list `scrap` refund (`portal.js:7093-7107`: `floor(c/3)` Supply,
 * `floor(s/2)` Soul Gems). Automatic design never builds infernal frames, so
 * only the standard costs are modeled; anything else reads as unknown.
 */

export const CLASSIC_MECH_SIZES = Object.freeze([
  "small",
  "medium",
  "large",
  "titan",
  "collector",
]);

export interface MechCostFigures {
  readonly supply: number;
  readonly gems: number;
  readonly space: number;
}

/** Bay space from `mechSize`; the `prepared >= 2` discount is the game's. */
export function mechFrameSpace(
  size: string,
  prepared: number,
): number | undefined {
  const veteran = prepared >= 2;
  switch (size) {
    case "small":
      return 2;
    case "medium":
      return veteran ? 4 : 5;
    case "large":
      return veteran ? 8 : 10;
    case "titan":
      return veteran ? 20 : 25;
    case "collector":
      return 1;
    default:
      return undefined;
  }
}

/** Supply cost from `mechCost` for a standard (non-infernal) frame. */
export function mechFrameSupplyCost(
  size: string,
  prepared: number,
): number | undefined {
  const veteran = prepared >= 2;
  switch (size) {
    case "small":
      return veteran ? 50_000 : 75_000;
    case "medium":
      return 180_000;
    case "large":
      return 375_000;
    case "titan":
      return 750_000;
    case "collector":
      return veteran ? 8_000 : 10_000;
    default:
      return undefined;
  }
}

/** Soul Gem cost from `mechCost` for a standard (non-infernal) frame. */
export function mechFrameGemCost(size: string): number | undefined {
  switch (size) {
    case "small":
      return 1;
    case "medium":
      return 4;
    case "large":
      return 20;
    case "titan":
      return 75;
    case "collector":
      return 1;
    default:
      return undefined;
  }
}

export function mechFrameCost(
  size: string,
  prepared: number,
): MechCostFigures | undefined {
  const supply = mechFrameSupplyCost(size, prepared);
  const gems = mechFrameGemCost(size);
  const space = mechFrameSpace(size, prepared);
  if (supply === undefined || gems === undefined || space === undefined) {
    return undefined;
  }
  return Object.freeze({ supply, gems, space });
}

/** List-`scrap` refunds for a standard frame. */
export function mechFrameRefund(
  size: string,
  prepared: number,
): Readonly<{ supply: number; gems: number }> | undefined {
  const cost = mechFrameCost(size, prepared);
  if (cost === undefined) return undefined;
  return Object.freeze({
    supply: Math.floor(cost.supply / 3),
    gems: Math.floor(cost.gems / 2),
  });
}
