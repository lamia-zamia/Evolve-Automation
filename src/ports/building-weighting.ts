/**
 * Contract between the building-weighting policy and whatever applies its
 * rules to build candidates.
 *
 * `enabled` is evaluated once per weighting phase and `multiplier` is probed
 * once with no match so that rules returning x1 can be skipped entirely.
 * `match` then runs per candidate building; any truthy result applies the rule
 * and is passed back into `describe` and `multiplier`.
 *
 * TRANSITIONAL: the candidate and the match result are still the live
 * compatibility building wrapper and an untyped rule payload. They become an
 * immutable candidate view and a typed match once the weighting policy reads a
 * validated snapshot instead of live getter bags.
 */
export type BuildingWeightingRule = {
  /** Stable identifier for tests and diagnostics. Rule order is still the array order. */
  readonly id: string;
  readonly enabled: () => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly match: (building: any) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly describe: (match: any, building: any) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly multiplier: (match?: any) => number;
};
