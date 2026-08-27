import type { ForeignAchievementGoal } from "../../combat/foreign-achievements.ts";

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
 * The AutoBuild weighting multiplier settings, named by the setting each one
 * comes from so the policy, the defaults, and the settings panel all use one
 * spelling.
 */
export type BuildingWeightName =
  | "buildingWeightingNew"
  | "buildingWeightingUnderpowered"
  | "buildingWeightingNeedfulPowerPlant"
  | "buildingWeightingUselessPowerPlant"
  | "buildingWeightingNeedfulKnowledge"
  | "buildingWeightingUselessKnowledge"
  | "buildingWeightingNonOperatingCity"
  | "buildingWeightingNonOperating"
  | "buildingWeightingMissingSupply"
  | "buildingWeightingMissingSupport"
  | "buildingWeightingUselessSupport"
  | "buildingWeightingMissingFuel"
  | "buildingWeightingMADUseless"
  | "buildingWeightingUnusedEjectors"
  | "buildingWeightingCrateUseless"
  | "buildingWeightingHorseshoeUseless"
  | "buildingWeightingZenUseless"
  | "buildingWeightingGateTurret"
  | "buildingWeightingNeedStorage"
  | "buildingWeightingUselessHousing"
  | "buildingWeightingTemporal"
  | "buildingWeightingSolar"
  | "buildingWeightingVacuumCollapse"
  | "buildingWeightingTruepathDigsite"
  | "buildingWeightingOverlord"
  | "buildingWeightingAuthority"
  | "buildingWeightingBananaObjective"
  | "buildingWeightingInflationMoney"
  | "buildingWeightingRetirementPrep";

export type BuildingWeights = Readonly<Record<BuildingWeightName, number>>;

/**
 * The outcome of a two-building choice the script resolves once per weighting
 * phase: which side of the pair is not worth building, and the title of the
 * side it loses to. `null` whenever there is nothing to choose — either side
 * unbuildable, or neither ahead of the other.
 */
export type BuildingChoice = {
  /** Catalog key of the side that is not worth building right now. */
  readonly worseId: string;
  /** Display title of the side the script prefers. */
  readonly betterTitle: string;
} | null;

/**
 * One of the three Womling contact actions the Overlord achievement wants
 * built in order, with the stat it earns and whether the script could build it
 * now.
 */
export type WomlingOverlordAction = {
  /** Catalog key of the contact action. */
  readonly id: string;
  /** Display name used when the rule reports which action is still missing. */
  readonly name: string;
  /** The Overlord stat this action earns is already earned in this universe. */
  readonly statEarned: boolean;
  /** AutoBuild could build this action right now. */
  readonly autoBuildable: boolean;
};

/**
 * The part of a candidate the screening rules read, projected on its own so a
 * candidate an early rule discards never costs a full projection.
 *
 * Most of a late-game `priorityList` is locked buildings that the `locked` rule
 * zeroes immediately, and projecting one of those was measured as the single
 * largest cost in the weighting phase. Every field here is answerable without
 * touching the game's cost, power, or consumption machinery.
 */
export type BuildingWeightingScreeningCandidate = {
  /** The script's catalog key, e.g. `"Barracks"`. Stable candidate identity. */
  readonly id: string;
  /** The configured weight this candidate starts from, before any rule applies. */
  readonly baseWeight: number;
  readonly unlocked: boolean;
  readonly autoBuildEnabled: boolean;
  readonly count: number;
  readonly autoMax: number;
};

/**
 * One build candidate, projected from the compatibility building wrapper into
 * immutable data before any rule sees it.
 *
 * A locked candidate reports the neutral answers for everything the game only
 * maintains while a building is unlocked. The `locked` rule zeroes such a
 * candidate before any later rule reads those fields, and the wrapper's own
 * values are stale rather than meaningful while a building is locked.
 */
export type BuildingWeightingCandidate = BuildingWeightingScreeningCandidate & {
  /** The script's own name for the building. */
  readonly name: string;
  /** The game's action id within its tab, e.g. `"s_alter"`. */
  readonly actionId: string;
  /** The game tab the building lives on, e.g. `"city"`. */
  readonly tab: string;
  /** The region within the tab, e.g. `"spc_moon"`; `""` when the tab has none. */
  readonly location: string;
  /** AutoPower manages this building's on/off state. */
  readonly smartManaged: boolean;
  /** Affordable at the amount AutoBuild would buy. */
  readonly affordable: boolean;
  /** Power one more would draw; negative for a building that produces power. */
  readonly powered: number;
  /** Built copies the game has switched off. */
  readonly stateOffCount: number;
  /** Raises the population cap. */
  readonly housing: boolean;
  /** Raises the soldier cap. */
  readonly garrison: boolean;
  /** Raises Max Knowledge. */
  readonly knowledge: boolean;
  /** Wants a randomized weight, which only the gas giant name contest does. */
  readonly randomlyWeighted: boolean;
  /** Resource cost of one more, keyed by the game's resource id. */
  readonly cost: Readonly<Record<string, number>>;
  /**
   * The resource this candidate produces directly, keyed by the script's
   * resource catalog key, or `null` when the candidate is an ordinary building.
   */
  readonly producedResource: string | null;
  /** Name of a consumed resource the candidate cannot sustain, or `null`. */
  readonly missingConsumption: string | null;
  /** Name of a support the candidate cannot cover, or `null`. */
  readonly missingSupport: string | null;
  /** Name of a support the candidate provides that nothing needs, or `null`. */
  readonly uselessSupport: string | null;
};

/**
 * The configured prestige route, narrowed to the routes whose construction the
 * weighting rules treat differently. Every other configured route, including
 * "none" and any route this script does not yet distinguish, is `"other"`.
 */
export type PrestigeRoute =
  "bioseed" | "whitehole" | "vacuum" | "ascension" | "terraform" | "other";

/**
 * Script state and phase-constant game gates that the building-weighting rules
 * read, sampled and frozen once per weighting phase.
 *
 * The gate fields answer questions about the run, not about a candidate, so
 * their answer cannot change while one weighting phase applies rules.
 */
export type BuildingWeightingSnapshot = {
  /** The configured multiplier each weighting rule applies when it matches. */
  readonly weights: BuildingWeights;
  /**
   * Only the freighter with the better Money storage per crew is wanted, so the
   * other one is not worth building.
   */
  readonly buildBestFreighterOnly: boolean;
  /** AutoBuild is running; every candidate is worthless while it is off. */
  readonly autoBuildEnabled: boolean;
  /** AutoFleet is running, so it can be trusted to cover galaxy piracy. */
  readonly autoFleetEnabled: boolean;
  /** Miner jobs are switched off, so mines cannot be staffed. */
  readonly minerJobsDisabled: boolean;
  readonly prestigeRoute: PrestigeRoute;
  /** Only build what the configured prestige route actually needs. */
  readonly limitPrestigeConstruction: boolean;
  /** Soul Gems are being saved for the Whitehole reset. */
  readonly saveSoulGemsForPrestige: boolean;
  /**
   * Authority is unlocked and its cap is below the target the script manages
   * toward, so the buildings that raise the cap are worth prioritizing. Always
   * false while Authority management is off.
   */
  readonly authorityCapBelowTarget: boolean;
  /** Max Knowledge the Gorddon Embassy is worth waiting for. */
  readonly embassyKnowledgeTarget: number;
  /** The slave pens are full, so a Slave Market cannot sell into them. */
  readonly slavePensFull: boolean;
  /**
   * Money storage is still filling and income is below the level at which
   * buying slaves is considered affordable.
   */
  readonly slaveIncomeInsufficient: boolean;
  /** The Banana Republic objective guard is on, so its objectives are worth priority. */
  readonly bananaRepublicGuardActive: boolean;
  /** Catalog keys of the buildings a queued build target is waiting on. */
  readonly queuedTargets: ReadonlySet<string>;
  /** Catalog keys of the buildings an active trigger is waiting on. */
  readonly triggerTargets: ReadonlySet<string>;
  readonly knowledgeRequiredByTechs: number;
  readonly knowledgeRequiredByBuildTargets: number;
  readonly cheapestTechKnowledge: number;
  /** Max Knowledge, which every knowledge requirement above is compared against. */
  readonly knowledgeCapacity: number;
  /** Soul Gems on hand, out of which a Soul Gem building cost is paid. */
  readonly soulGemQuantity: number;
  /** Lake support no ship is consuming yet. */
  readonly lakeSupportSpare: number;
  /** Tau Belt support the belt provides. */
  readonly tauBeltSupportAvailable: number;
  /** Tau Belt support the belt's ships already consume. */
  readonly tauBeltSupportUsed: number;
  /** Power is unlocked, so power weighting applies at all. */
  readonly powerUnlocked: boolean;
  /** Power still free for one more building to draw. */
  readonly powerSurplus: number;
  /** Power the buildings the game left switched off would draw if powered. */
  readonly unpoweredPowerDemand: number;
  /** Population is at its housing cap. */
  readonly populationAtCap: boolean;
  /** Population has fallen below one, so nobody is left to sacrifice. */
  readonly populationEmpty: boolean;
  /** The housing cap is meaningfully above the population living in it. */
  readonly housingUnderused: boolean;
  /** Some built crates or containers are still unassigned. */
  readonly unusedStorageParts: boolean;
  /** Crates or containers are unlocked and every built one is assigned. */
  readonly storagePartsAllAssigned: boolean;
  /** Oil storage is below the most expensive mission that needs it. */
  readonly oilStorageBelowMissionCost: boolean;
  /**
   * Helium-3 is unlocked and its storage is below the most expensive mission
   * that needs it.
   */
  readonly heliumStorageBelowMissionCost: boolean;
  /** Spare Horseshoes already cover the storage the hooved race needs. */
  readonly horseshoesSufficient: boolean;
  /** The game's display name for Horseshoes. */
  readonly horseshoeTitle: string;
  /** Zen is below its cap, so no more Meditation Spaces are needed. */
  readonly zenBelowCap: boolean;
  /** The True Path Test Launch exists as a buildable action. */
  readonly testLaunchUnlocked: boolean;
  /** The Eris Digsite exists and is short of the 100 that secure it. */
  readonly erisDigsiteUnsecured: boolean;
  /** A Gateway Starbase stands, so Andromeda is reached and its jobs matter. */
  readonly andromedaReached: boolean;
  /** Which freighter carries less Money per crew, when both are buildable. */
  readonly freighterChoice: BuildingChoice;
  /** Which Lake ship supplies less, when both are buildable. */
  readonly lakeShipChoice: BuildingChoice;
  /** Which Spire supply building supplies less, when both are buildable. */
  readonly spireSupplyChoice: BuildingChoice;
  /** Asphodel Warehouses built, which caps the Stabilizers worth building. */
  readonly asphodelWarehouseCount: number;
  /** No Gorddon Embassy has been built, and one is all the script wants. */
  readonly embassyMissing: boolean;
  /** The Matrioshka Brain is short of the 1000 segments the retirement route needs. */
  readonly matrioshkaBrainIncomplete: boolean;
  /** Built Mass Ejector capacity the game has not assigned to any resource. */
  readonly unusedEjectorCapacity: number;
  /** Neither oil well exists, so nothing is producing Oil yet. */
  readonly noOilProduction: boolean;
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
   * Power one more Neutron Citadel would draw. Only the citadel candidate reads
   * it; the value is still defined, and meaningless, before the citadel exists.
   */
  readonly nextCitadelPowerDraw: number;
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
  /**
   * The three Womling contact actions in Overlord achievement order. Empty
   * outside a True Path run, where none of them exists.
   */
  readonly womlingOverlordActions: readonly WomlingOverlordAction[];
};

/**
 * Contract between the building-weighting policy and whatever applies its
 * rules to build candidates.
 *
 * `enabled` is evaluated once per weighting phase and `multiplier` is probed
 * once with no match so that rules returning x1 can be skipped entirely.
 * `match` then runs per candidate; any truthy result applies the rule and is
 * passed back into `describe` and `multiplier`.
 *
 * `Match` is the payload one rule hands from its own `match` to its own
 * `describe` and `multiplier`. It never travels between rules, so an ordered
 * list holds rules with different payloads as `BuildingWeightingRule<unknown>`.
 *
 * Every phase receives the snapshot, which is the only route by which a rule
 * may observe script state.
 */
export type BuildingWeightingRule<Match = boolean> = {
  /** Stable identifier for tests and diagnostics. Rule order is still the array order. */
  readonly id: string;
  /**
   * This rule's `match` reads nothing outside `BuildingWeightingScreeningCandidate`,
   * so it can decide a candidate before the full projection is paid for.
   *
   * Screening rules must form a prefix of the ordered list; the decider rejects
   * a list where one appears after a rule that needs the full candidate,
   * because screening a candidate past that point would reorder the rules.
   */
  readonly screening?: boolean;
  readonly enabled: (snapshot: BuildingWeightingSnapshot) => boolean;
  readonly match: (
    candidate: BuildingWeightingCandidate,
    snapshot: BuildingWeightingSnapshot,
  ) => Match | false | undefined;
  readonly describe: (
    match: Match,
    candidate: BuildingWeightingCandidate,
    snapshot: BuildingWeightingSnapshot,
  ) => string;
  readonly multiplier: (
    snapshot: BuildingWeightingSnapshot,
    match?: Match,
  ) => number;
};

/**
 * The same contract as `BuildingWeightingRule`, narrowed to what a rule marked
 * `screening` is allowed to read. The decider partitions the ordered list into
 * this shape once per phase.
 */
export type BuildingWeightingScreeningRule<Match = boolean> = {
  readonly id: string;
  readonly screening: true;
  readonly enabled: (snapshot: BuildingWeightingSnapshot) => boolean;
  readonly match: (
    candidate: BuildingWeightingScreeningCandidate,
    snapshot: BuildingWeightingSnapshot,
  ) => Match | false | undefined;
  readonly describe: (
    match: Match,
    candidate: BuildingWeightingScreeningCandidate,
    snapshot: BuildingWeightingSnapshot,
  ) => string;
  readonly multiplier: (
    snapshot: BuildingWeightingSnapshot,
    match?: Match,
  ) => number;
};

/**
 * One note a matched rule made about a candidate. The note is plain text: what
 * it looks like in a tooltip is the renderer's decision, not the policy's.
 */
export type BuildingWeightingAnnotation = {
  /** Id of the rule that produced the note. */
  readonly ruleId: string;
  readonly note: string;
};

/**
 * What the weighting rules decided about one candidate: the weight AutoBuild
 * sorts by, and the notes explaining it in the order the rules applied.
 *
 * A weight of zero means no rule after the one that zeroed it ran, so the
 * annotations end at that rule.
 */
export type BuildingWeightingDecision = {
  readonly weight: number;
  readonly annotations: readonly BuildingWeightingAnnotation[];
  /**
   * Id of the rule whose multiplier drove the weight to zero, or `null` when
   * no rule did. A candidate that reaches zero because its configured base
   * weight was already zero reports `null` too: no rule ruled it out.
   */
  readonly zeroedBy: string | null;
};

/**
 * The rules of one weighting phase, already selected against that phase's
 * snapshot. Every candidate of the phase is decided by the same one.
 */
export type BuildingWeightingPhase = {
  /**
   * Applies only this phase's screening rules. Returns the finished decision
   * when they settled the candidate, or `null` when it survived them and the
   * caller must project it fully and call `decide`.
   */
  readonly screen: (
    candidate: BuildingWeightingScreeningCandidate,
  ) => BuildingWeightingDecision | null;
  readonly decide: (
    candidate: BuildingWeightingCandidate,
  ) => BuildingWeightingDecision;
};

/**
 * Contract between whatever runs a weighting phase and the rules that decide
 * it. The caller samples the snapshot, begins a phase with it, and decides each
 * candidate; nothing it receives back can reach the game.
 */
export type BuildingWeightingDecider = {
  readonly beginPhase: (
    snapshot: BuildingWeightingSnapshot,
  ) => BuildingWeightingPhase;
};
