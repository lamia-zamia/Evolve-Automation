export const BANANA_OBJECTIVE_IDS = ["b1", "b2", "b3", "b4", "b5"] as const;

export type BananaObjectiveId = (typeof BANANA_OBJECTIVE_IDS)[number];

export interface BananaSmoothieInput {
  readonly featStar: number;
  readonly tradeRoutes: readonly number[];
}

export interface BananaRepublicProgress {
  readonly objectives: Readonly<Record<BananaObjectiveId, boolean>>;
  readonly smoothie: Readonly<BananaSmoothieInput>;
}

export interface BananaRepublicGuardInput {
  readonly enabled: boolean;
  readonly bananaRace: boolean;
  readonly progress: Readonly<BananaRepublicProgress>;
}

export function isBananaObjectiveId(value: string): value is BananaObjectiveId {
  return (BANANA_OBJECTIVE_IDS as readonly string[]).includes(value);
}

export function isBananaRepublicObjectiveComplete(
  progress: Readonly<BananaRepublicProgress>,
  objective: BananaObjectiveId,
): boolean {
  return progress.objectives[objective];
}

export function isBananaRepublicSmoothieComplete(
  input: Readonly<BananaSmoothieInput>,
): boolean {
  if (input.featStar > 0) return true;

  let exportRoutes = 0;
  let hasBigImport = false;
  for (const trade of input.tradeRoutes) {
    if (trade > 0) exportRoutes += trade;
    else if (trade <= -500) hasBigImport = true;
  }
  return hasBigImport && exportRoutes >= 500;
}

export function isBananaRepublicReadyForUnification(
  progress: Readonly<BananaRepublicProgress>,
): boolean {
  return (
    BANANA_OBJECTIVE_IDS.every((objective) => progress.objectives[objective]) &&
    isBananaRepublicSmoothieComplete(progress.smoothie)
  );
}

export function isBananaRepublicGuardActive(
  input: Readonly<BananaRepublicGuardInput>,
): boolean {
  return (
    input.enabled &&
    input.bananaRace &&
    !isBananaRepublicReadyForUnification(input.progress)
  );
}
