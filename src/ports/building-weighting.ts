/**
 * Script state that the building-weighting rules read, sampled and frozen once
 * per weighting phase.
 *
 * Target membership is by identity because `updatePriorityTargets` stores the
 * live building and project wrappers, and the weighting phase is handed those
 * same wrappers.
 */
export type BuildingWeightingSnapshot = {
  readonly queuedTargets: ReadonlySet<unknown>;
  readonly triggerTargets: ReadonlySet<unknown>;
  readonly knowledgeRequiredByTechs: number;
  readonly knowledgeRequiredByBuildTargets: number;
  readonly cheapestTechKnowledge: number;
};

/**
 * Contract between the building-weighting policy and whatever applies its
 * rules to build candidates.
 *
 * `enabled` is evaluated once per weighting phase and `multiplier` is probed
 * once with no match so that rules returning x1 can be skipped entirely.
 * `match` then runs per candidate building; any truthy result applies the rule
 * and is passed back into `describe` and `multiplier`.
 *
 * `enabled` and `match` receive the phase snapshot, which is the only route by
 * which a rule may observe script state. `describe` and `multiplier` do not
 * receive it because no rule needs it there; add it when one does.
 *
 * TRANSITIONAL: the candidate and the match result are still the live
 * compatibility building wrapper and an untyped rule payload. They become an
 * immutable candidate view and a typed match once the weighting policy reads
 * validated game and settings snapshots instead of live getter bags.
 */
export type BuildingWeightingRule = {
  /** Stable identifier for tests and diagnostics. Rule order is still the array order. */
  readonly id: string;
  readonly enabled: (snapshot: BuildingWeightingSnapshot) => boolean;
  readonly match: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    building: any,
    snapshot: BuildingWeightingSnapshot,
  ) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly describe: (match: any, building: any) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly multiplier: (match?: any) => number;
};
