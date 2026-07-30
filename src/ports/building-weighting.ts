import type { ForeignAchievementGoal } from "../domain/combat/foreign-achievements.ts";

/**
 * Why Supply is being withheld from buildings for the mech bay: a mech is
 * already under construction, or the next affordable one is being saved for.
 */
export type MechSupplySavingReason = "building" | "saving";

/**
 * Why a Sacrificial Altar sacrifice cannot happen: a parasite race needs windy
 * weather, nobody works the default job, or every sacrifice bonus is already
 * higher than the script considers worth extending.
 */
export type SacrificeBlockedReason =
  "windless" | "no-default-workers" | "bonus-capped";

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
  /** The True Path scenario is running. */
  readonly truepathRace: boolean;
  /**
   * Miners are the race's only source of Chrysotile: it is smoldering, so
   * Chrysotile replaces Stone, and sappy, so it has no quarry workers to mine
   * it instead.
   */
  readonly mineIsOnlyChrysotileSource: boolean;
  /** The Witch Hunter scenario is running. */
  readonly witchHunterRace: boolean;
  /** The Warlord scenario is running. */
  readonly warlordRace: boolean;
  /** The race is artificial, so population is assembled rather than grown. */
  readonly artificialRace: boolean;
  /** The race enslaves, so the Slave Market is available. */
  readonly slaverRace: boolean;
  /** The race cannibalizes, so the Sacrificial Altar is available. */
  readonly cannibalizeRace: boolean;
  /**
   * Why sacrificing is impossible or pointless right now, or `null` when it is
   * worth doing. Always `null` for a race that cannot sacrifice at all.
   */
  readonly sacrificeBlocked: SacrificeBlockedReason | null;
  /** The Banana Republic scenario is running. */
  readonly bananaRace: boolean;
  /** The Lone Survivor scenario is running. */
  readonly loneSurvivorRace: boolean;
  /** The race is hooved, so it needs Horseshoes. */
  readonly hoovedRace: boolean;
  /** The race is calm, so it needs Zen from Meditation Spaces. */
  readonly calmRace: boolean;
  /** The Cataclysm impact will still destroy the planet's buildings. */
  readonly orbitalDecayImpactPending: boolean;
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
  /** Spire Ports are still below the port share of the optimal supply ratio. */
  readonly spirePortPrebuildIncomplete: boolean;
  /** Spire Base Camps are still below the camp share of the optimal supply ratio. */
  readonly spireBaseCampPrebuildIncomplete: boolean;
  /**
   * Per-Bireme diminishing factor in the Lake supply formula. Bloodstone Spire
   * rank 2 improves it, so one more Bireme is worth more than it otherwise is.
   */
  readonly lakeBiremeSupplyRate: number;
  /**
   * Power one more Neutron Citadel would draw. Only the citadel candidate reads
   * it; the value is still defined, and meaningless, before the citadel exists.
   */
  readonly nextCitadelPowerDraw: number;
  /**
   * Mass Ejector capacity the game has already assigned to resources. `0`
   * before the first ejector exists.
   */
  readonly assignedEjectorCapacity: number;
  /** Unification is researched, so the Test Launch can no longer be sabotaged. */
  readonly worldUnified: boolean;
  /**
   * Chance that the True Path Test Launch is not sabotaged, which falls with
   * every foreign government still outside the player's control. Only the Test
   * Launch candidate reads it, and it is meaningless outside True Path.
   */
  readonly testLaunchSuccessChance: number;
  /** The Spire Waygate is finished, so no more of them are wanted. */
  readonly spireWaygateComplete: boolean;
  /** The Spire Edenic Gate is finished, so no more of them are wanted. */
  readonly spireEdenicGateComplete: boolean;
  /** The Elysium Fire Support Base is unlocked, so its build limits apply. */
  readonly elysiumFireSupportUnlocked: boolean;
  /** The Elysium garrison is destroyed, so Fire Support Bases are useless. */
  readonly elysiumGarrisonDestroyed: boolean;
  /** The Elerium Cannon is researched, lifting the Fire Support Base cap. */
  readonly eleriumCannonResearched: boolean;
  /** The Asphodel Stabilizer is unlocked, so its Warehouse cap applies. */
  readonly asphodelStabilizerUnlocked: boolean;
  /** The Spire Sphinx is solved and cannot be used again. */
  readonly spireSphinxSolved: boolean;
  /** Cure research has reached the level that ends population assembly. */
  readonly assemblyCureComplete: boolean;
  /** Tau Ceti is reached, so the solar system is no longer the frontier. */
  readonly tauCetiReached: boolean;
  /**
   * The Tau Ceti gas giant name contest is open, so its entries are the only
   * buildings that want randomized weighting.
   */
  readonly gasGiantNameContestActive: boolean;
  /**
   * A Shrine built now would raise a bonus other than the configured one. False
   * for every race that has no Shrine and whenever any Shrine is acceptable.
   */
  readonly shrineBonusUnwanted: boolean;
  readonly geckNeeded: boolean;
  readonly prestigeEdenAllowed: boolean;
  readonly prestigeRetireAllowed: boolean;
  readonly pillarFinished: boolean;
  /** Auto prestige targets MAD and its tech is researched or affordable now. */
  readonly madPrestigeAwaited: boolean;
  /** Supply is being withheld for the mech bay, or `null` when it is not. */
  readonly mechSupplySaving: MechSupplySavingReason | null;
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
