import type { ForeignAchievementGoal } from "../domain/combat/foreign-achievements.ts";

/**
 * Script state and phase-constant game gates that the building-weighting rules
 * read, sampled and frozen once per weighting phase.
 *
 * Target membership is by identity because `updatePriorityTargets` stores the
 * live building and project wrappers, and the weighting phase is handed those
 * same wrappers.
 *
 * The gate fields answer questions about the run, not about a candidate, so
 * their answer cannot change while one weighting phase applies rules.
 */
export type BuildingWeightingSnapshot = {
  readonly queuedTargets: ReadonlySet<unknown>;
  readonly triggerTargets: ReadonlySet<unknown>;
  readonly knowledgeRequiredByTechs: number;
  readonly knowledgeRequiredByBuildTargets: number;
  readonly cheapestTechKnowledge: number;
  /** A fleet is being accumulated for an assault mission. */
  readonly galaxyAssaultPending: boolean;
  /** Built defense platforms already out-defend all stargate piracy. */
  readonly stargatePiracySupressed: boolean;
  /** The built fleet already out-rates the unmet piracy of every useful region. */
  readonly galaxyPiracyCoveredByFleet: boolean;
  /** Race harvests lumber, so the Sacrificial Altar harvest bonus applies. */
  readonly lumberRace: boolean;
  /** Banana Republic objective "b2", the one the Dwarf World Collider serves. */
  readonly bananaColliderObjectiveComplete: boolean;
  readonly inflationAssistActive: boolean;
  readonly inflationMoneyReachable: boolean;
  /** Retirement assist is active and at least one preparation target is short. */
  readonly retirementPreparationIncomplete: boolean;
  readonly guardDreadedActive: boolean;
  readonly guardEnergeticActive: boolean;
  readonly guardRedDeadActive: boolean;
  readonly guardPacifistActive: boolean;
  readonly foreignAchievementGoal: ForeignAchievementGoal | null;
  readonly hellSupressUseful: boolean;
  /** Gate supression is under the configured floor, so more towers still help. */
  readonly gateTowerSupressionTooLow: boolean;
  /** The gate's demons are fully supressed, so another turret cannot help. */
  readonly gateDemonsSupressed: boolean;
  /** Ruins Guard Posts have not yet reached their prebuild supression target. */
  readonly hellGuardPostPrebuildIncomplete: boolean;
  readonly geckNeeded: boolean;
  readonly prestigeEdenAllowed: boolean;
  readonly prestigeRetireAllowed: boolean;
  readonly pillarFinished: boolean;
  /** Auto prestige targets MAD and its tech is researched or affordable now. */
  readonly madPrestigeAwaited: boolean;
  /** Overlord achievement: the womling friend stat is earned in this universe. */
  readonly womlingFriendEarned: boolean;
  /** Overlord achievement: the womling god stat is earned in this universe. */
  readonly womlingGodEarned: boolean;
  /** Overlord achievement: the womling lord stat is earned in this universe. */
  readonly womlingLordEarned: boolean;
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
