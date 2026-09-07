/** Captured achievement progress used by run-level automation decisions. */

export interface AchievementStateSample {
  readonly stars: ReadonlyMap<string, number>;
  readonly bananaObjectives: ReadonlyMap<string, boolean>;
}

function sampled<T>(
  values: ReadonlyMap<string, T>,
  id: string,
  kind: string,
): T {
  const value = values.get(id);
  if (value === undefined) {
    throw new TypeError(`${kind} ${id} was not sampled`);
  }
  return value;
}

export function achievementStar(
  sample: Readonly<AchievementStateSample>,
  id: string,
): number {
  return sampled(sample.stars, id, "achievement");
}

export function bananaObjectiveComplete(
  sample: Readonly<AchievementStateSample>,
  id: string,
): boolean {
  return sampled(sample.bananaObjectives, id, "banana objective");
}
