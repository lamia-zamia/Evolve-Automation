/** Bounded, read-only economic goal analysis over already captured evidence. */

import {
  compareGoalStrategies,
  type GoalResourceCommitment,
  type GoalResourceNeed,
  type GoalResourceStock,
  type GoalStrategyCandidate,
  type GoalStrategyComparison,
} from "../economy/goal-feasibility.ts";
import {
  combinePrerequisiteStatuses,
  traverseGoalGraph,
  type GoalDefinition,
  type GoalGraphLimits,
  type GoalStatus,
  type GoalTraversal,
} from "./goal-planning.ts";

export const ECONOMIC_GOAL_GRAPH_LIMITS: Readonly<GoalGraphLimits> =
  Object.freeze({ maxDepth: 6, maxGoals: 20 });

export type EconomicDependencyKind =
  | "terminal-condition"
  | "physical-prerequisite"
  | "native-owner-ordering"
  | "resource-requirement"
  | "labor-food-requirement"
  | "productive-effect";

export type EconomicEvidenceConfidence =
  "established" | "provisional" | "unavailable";

export interface EconomicEvidenceReference {
  readonly id: string;
  readonly snapshotId: string;
  readonly period: number;
  readonly validityEpoch: string;
}

export interface EconomicPinnedGameIdentity {
  readonly revision: string;
  readonly sha256: string;
}

export interface EconomicPinnedMechanicsEvidence {
  readonly id: string;
  readonly snapshotId: string;
  readonly pinnedGameRevision: string;
  readonly sourceSha256: string;
}

export interface EconomicConstructionObservation extends EconomicEvidenceReference {
  readonly targetId?: string;
  readonly price?: Readonly<Record<string, number>>;
  readonly priceComplete?: boolean;
  readonly stock?: Readonly<Record<string, number>>;
  readonly authorityValid?: boolean;
  readonly queuesEmpty?: boolean;
  readonly competingClaimsAbsent?: boolean;
}

export interface EconomicPopulationObservation extends EconomicEvidenceReference {
  readonly race?: string;
  readonly population?: number;
  readonly populationCapacity?: number;
  readonly basicHousing?: number;
  readonly farmCount?: number;
  readonly quarryCount?: number;
  readonly farmers?: number;
  readonly quarryWorkers?: number;
  readonly miningLevel?: number;
  readonly lumberCapacity?: number;
  readonly stoneCapacity?: number;
  readonly foodOutput?: number;
  readonly foodConsumption?: number;
  readonly lumberProduction?: number;
  readonly stoneProduction?: number;
}

export interface EconomicLaborCounterfactual extends EconomicEvidenceReference {
  readonly minimumFarmers?: number;
  readonly farmersAfterReassignment?: number;
  readonly foodOutputAfterReassignment?: number;
  readonly foodOutputWithTwoFarmers?: number;
  readonly foodConsumptionAtPopulation?: number;
  readonly oneQuarryWorkerStoneOutputPositive?: boolean;
  readonly stableThroughPeriod?: number;
  readonly stableSampleCount?: number;
  readonly foodProjectionPositiveAtEverySample?: boolean;
  readonly foodProjectionStableAcrossSamples?: boolean;
  readonly nativeAssignmentObserved?: boolean;
}

export interface EconomicJobSettingsObservation extends EconomicEvidenceReference {
  readonly autoJobs?: boolean;
  readonly jobSetDefault?: boolean;
  readonly quarryWorkerEnabled?: boolean;
  readonly farmerEnabled?: boolean;
  readonly quarryWorkerPriority?: number;
  readonly farmerPriority?: number;
  readonly quarryWorkerBreakpoints?: readonly [number, number, number];
  readonly farmerBreakpoints?: readonly [number, number, number];
  readonly priorityOrderEvidence?: Readonly<EconomicEvidenceReference>;
  readonly breakpointEvidence?: Readonly<EconomicEvidenceReference>;
}

export interface EconomicStrategyEvidence {
  readonly validityEpoch: string;
  readonly requirements: readonly GoalResourceNeed[];
  readonly stocks: readonly GoalResourceStock[];
  readonly commitments: readonly GoalResourceCommitment[];
  readonly commitmentsKnown: boolean;
  readonly candidates: readonly GoalStrategyCandidate[];
}

export interface EconomicGoalDependenciesInput {
  /** Identity for this retained-evidence window; it is never a live runtime epoch. */
  readonly analysisSnapshotId: string;
  readonly validityEpoch: string;
  readonly pinnedGame: Readonly<EconomicPinnedGameIdentity>;
  readonly construction?: Readonly<EconomicConstructionObservation>;
  readonly state?: Readonly<EconomicPopulationObservation>;
  readonly labor?: Readonly<EconomicLaborCounterfactual>;
  readonly jobSettings?: Readonly<EconomicJobSettingsObservation>;
  readonly nativeMechanics: Readonly<{
    readonly requiredMiningLevel?: number;
    readonly raceId?: string;
    readonly raceEligible?: boolean;
    readonly quarryUnlocksQuarryWorker?: boolean;
    readonly storageWithoutShed?: Readonly<{
      readonly Lumber?: number;
      readonly Stone?: number;
    }>;
    readonly storageEvidence?: Readonly<EconomicEvidenceReference>;
    readonly mechanicsEvidence?: Readonly<EconomicPinnedMechanicsEvidence>;
  }>;
  readonly strategyEvidence?: Readonly<EconomicStrategyEvidence>;
  readonly graphLimits?: Readonly<Partial<GoalGraphLimits>>;
}

export type EconomicGoalNode = Readonly<GoalDefinition> &
  Readonly<{
    readonly confidence: EconomicEvidenceConfidence;
    readonly evidenceIds: readonly string[];
    readonly resourceRequirements?: readonly Readonly<{
      readonly resourceId: string;
      readonly required: number;
      readonly observed: number;
      readonly shortfall: number;
      readonly committed?: number;
      readonly unreserved?: number;
    }>[];
    readonly diagnostic?: Readonly<Record<string, string | number | boolean>>;
  }>;

export interface EconomicGoalDependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EconomicDependencyKind;
  readonly evidenceIds: readonly string[];
}

export interface EconomicGoalDependencyGraph {
  readonly objective: EconomicGoalNode;
  readonly goals: readonly EconomicGoalNode[];
  readonly edges: readonly EconomicGoalDependencyEdge[];
  readonly traversal: Readonly<GoalTraversal>;
  readonly limits: Readonly<GoalGraphLimits>;
  readonly freshness: Readonly<{
    readonly construction: "matched" | "stale" | "unavailable";
    readonly state: "matched" | "stale" | "unavailable";
    readonly labor: "matched" | "stale" | "unavailable";
    readonly jobSettings: "matched" | "stale" | "unavailable";
    readonly storage: "matched" | "stale" | "unavailable";
    readonly mechanics: "matched" | "stale" | "unavailable";
    readonly strategyStocks: "matched" | "stale" | "unavailable";
    readonly analysisSnapshotId: string;
    readonly validityEpoch: string;
  }>;
  readonly strategyComparison?: Readonly<GoalStrategyComparison>;
  readonly playerSelected: false;
  readonly executionAuthority: "none";
}

export interface EconomicGoalPathEvidenceAssessment {
  readonly decision: "A" | "B";
  readonly evidenceGaps: readonly string[];
}

const OBJECTIVE_ID =
  "economic:positive-stone-without-food-or-population-sacrifice";
const STONE_OUTPUT_ID = "economic:positive-stone-production";
const QUARRY_BUILT_ID = "building:rock-quarry";
const QUARRY_PRICE_ID = "resource:quarry-material-price";
const SHED_ORDER_ID = "construction-order:shed-before-quarry";
const QUARRY_ORDER_ID = "construction-order:quarry-is-current";
const STORAGE_FIT_ID = "resource:quarry-cost-fits-existing-storage";
const MINING_ID = "research:mining-level-1";
const RACE_ELIGIBLE_ID = "quarry:race-eligible";
const WORKER_ASSIGNED_ID = "job:quarry-worker-assigned";
const JOB_SETTINGS_ID = "job:native-settings-permit-quarry-worker";
const LABOR_CAPACITY_ID = "labor:three-farmers-plus-one-quarry-worker";
const FOOD_MARGIN_ID = "food:positive-after-reassignment";
const POPULATION_ID = "population:retained";

function freezeNode(
  goal: GoalDefinition,
  confidence: EconomicEvidenceConfidence,
  evidenceIds: readonly string[],
  extra: Pick<EconomicGoalNode, "resourceRequirements" | "diagnostic"> = {},
): EconomicGoalNode {
  return Object.freeze({
    ...goal,
    ...(goal.action === undefined
      ? {}
      : { action: Object.freeze({ ...goal.action }) }),
    ...(goal.quantity === undefined
      ? {}
      : { quantity: Object.freeze({ ...goal.quantity }) }),
    ...(goal.prerequisites === undefined
      ? {}
      : {
          prerequisites: Object.freeze({
            operator: goal.prerequisites.operator,
            goalIds: Object.freeze([...goal.prerequisites.goalIds]),
          }),
        }),
    ...(goal.unavailableFacts === undefined
      ? {}
      : { unavailableFacts: Object.freeze([...goal.unavailableFacts]) }),
    confidence,
    evidenceIds: Object.freeze([...new Set(evidenceIds)]),
    ...(extra.resourceRequirements === undefined
      ? {}
      : {
          resourceRequirements: Object.freeze(
            extra.resourceRequirements.map((requirement) =>
              Object.freeze({ ...requirement }),
            ),
          ),
        }),
    ...(extra.diagnostic === undefined
      ? {}
      : { diagnostic: Object.freeze({ ...extra.diagnostic }) }),
  });
}

function observationStatus(
  value: number | boolean | undefined,
  condition: (present: number | boolean) => boolean,
): GoalStatus {
  if (value === undefined) return "unavailable";
  return condition(value) ? "satisfied" : "unsatisfied";
}

function validAmount(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function boundedLimits(
  requested: Readonly<Partial<GoalGraphLimits>> | undefined,
): Readonly<GoalGraphLimits> {
  const clamp = (
    value: number | undefined,
    maximum: number,
    minimum: number,
  ) =>
    value === undefined || !Number.isFinite(value)
      ? maximum
      : Math.min(maximum, Math.max(minimum, Math.floor(value)));
  return Object.freeze({
    maxDepth: clamp(
      requested?.maxDepth,
      ECONOMIC_GOAL_GRAPH_LIMITS.maxDepth,
      0,
    ),
    maxGoals: clamp(
      requested?.maxGoals,
      ECONOMIC_GOAL_GRAPH_LIMITS.maxGoals,
      1,
    ),
  });
}

function evidenceId(
  observation: Readonly<{ id: string }> | undefined,
): string[] {
  return observation === undefined ? [] : [observation.id];
}

function buildEdges(
  goals: readonly EconomicGoalNode[],
): readonly EconomicGoalDependencyEdge[] {
  const edges: EconomicGoalDependencyEdge[] = [];
  for (const goal of goals) {
    for (const childId of goal.prerequisites?.goalIds ?? []) {
      let kind: EconomicDependencyKind = "physical-prerequisite";
      if (goal.id === OBJECTIVE_ID) {
        kind = "terminal-condition";
      } else if (childId === QUARRY_PRICE_ID || childId === STORAGE_FIT_ID) {
        kind = "resource-requirement";
      } else if (childId === SHED_ORDER_ID || childId === QUARRY_ORDER_ID) {
        kind = "native-owner-ordering";
      } else if (
        childId === LABOR_CAPACITY_ID ||
        childId === FOOD_MARGIN_ID ||
        childId === JOB_SETTINGS_ID
      ) {
        kind = "labor-food-requirement";
      } else if (
        goal.id === STONE_OUTPUT_ID &&
        childId === WORKER_ASSIGNED_ID
      ) {
        kind = "productive-effect";
      }
      const child = goals.find((entry) => entry.id === childId);
      edges.push(
        Object.freeze({
          from: goal.id,
          to: childId,
          kind,
          evidenceIds: Object.freeze(child?.evidenceIds ?? []),
        }),
      );
    }
  }
  return Object.freeze(edges);
}

/** Builds a bounded historical diagnostic graph; missing or stale captures stay unavailable. */
export function analyzeEconomicGoalDependencies(
  input: Readonly<EconomicGoalDependenciesInput>,
): EconomicGoalDependencyGraph {
  const construction = input.construction;
  const state =
    input.state?.validityEpoch === input.validityEpoch
      ? input.state
      : undefined;
  const labor =
    input.labor?.validityEpoch === input.validityEpoch
      ? input.labor
      : undefined;
  const jobSettings =
    input.jobSettings?.validityEpoch === input.validityEpoch
      ? input.jobSettings
      : undefined;
  const constructionMatched =
    construction !== undefined &&
    construction.validityEpoch === input.validityEpoch;
  const stateMatched = input.state !== undefined && state !== undefined;
  const laborMatched = input.labor !== undefined && labor !== undefined;
  const storageMatched =
    input.nativeMechanics.storageEvidence !== undefined &&
    input.nativeMechanics.storageEvidence.validityEpoch === input.validityEpoch;
  const mechanicsEvidence = input.nativeMechanics.mechanicsEvidence;
  const mechanicsFreshness =
    mechanicsEvidence === undefined || input.pinnedGame === undefined
      ? "unavailable"
      : mechanicsEvidence.snapshotId === input.pinnedGame.revision &&
          mechanicsEvidence.pinnedGameRevision === input.pinnedGame.revision &&
          mechanicsEvidence.sourceSha256 === input.pinnedGame.sha256
        ? "matched"
        : "stale";
  const mechanicsMatched = mechanicsFreshness === "matched";
  const jobSettingsMatched =
    input.jobSettings !== undefined && jobSettings !== undefined;
  const jobRulesMatched =
    jobSettings !== undefined &&
    jobSettings.priorityOrderEvidence?.validityEpoch === input.validityEpoch &&
    jobSettings.breakpointEvidence?.validityEpoch === input.validityEpoch;
  const currentQuarryOrder =
    constructionMatched &&
    construction.targetId === "city-rock_quarry" &&
    construction.authorityValid === true;
  const completePrice =
    constructionMatched &&
    construction.authorityValid === true &&
    construction.priceComplete === true &&
    construction.price !== undefined &&
    validAmount(construction.price.Lumber) &&
    validAmount(construction.price.Stone);
  const currentStock =
    constructionMatched &&
    construction.authorityValid === true &&
    construction.stock !== undefined &&
    validAmount(construction.stock.Lumber) &&
    validAmount(construction.stock.Stone);
  const resourceEvidenceComplete = completePrice && currentStock;
  const lumberRequired = completePrice ? construction.price.Lumber : undefined;
  const stoneRequired = completePrice ? construction.price.Stone : undefined;
  const lumberHeld = currentStock ? construction.stock.Lumber : undefined;
  const stoneHeld = currentStock ? construction.stock.Stone : undefined;
  const queuesAndClaimsKnown =
    constructionMatched &&
    construction.authorityValid === true &&
    construction.queuesEmpty !== undefined &&
    construction.competingClaimsAbsent !== undefined;
  const commitmentsKnown =
    queuesAndClaimsKnown &&
    construction.queuesEmpty === true &&
    construction.competingClaimsAbsent === true;
  const currentTargetStatus: GoalStatus =
    !constructionMatched || construction.authorityValid !== true
      ? "unavailable"
      : currentQuarryOrder
        ? "satisfied"
        : construction.targetId === undefined
          ? "unavailable"
          : "blocked";
  const materialStatus: GoalStatus = !resourceEvidenceComplete
    ? "unavailable"
    : lumberHeld! >= lumberRequired! && stoneHeld! >= stoneRequired!
      ? "satisfied"
      : "unsatisfied";
  const minimumFarmers = labor?.minimumFarmers;
  const farmersAfter = labor?.farmersAfterReassignment;
  const foodOutput = labor?.foodOutputAfterReassignment;
  const foodConsumption = labor?.foodConsumptionAtPopulation;
  const foodMargin =
    foodOutput !== undefined && foodConsumption !== undefined
      ? foodOutput - foodConsumption
      : undefined;
  const laborCapacityStatus: GoalStatus =
    state?.population === undefined ||
    state.populationCapacity === undefined ||
    minimumFarmers === undefined ||
    farmersAfter === undefined
      ? "unavailable"
      : state.population >= minimumFarmers + 1 &&
          state.populationCapacity >= state.population &&
          farmersAfter === minimumFarmers
        ? "satisfied"
        : "blocked";
  const foodIntervalEvidenceComplete =
    labor?.stableThroughPeriod !== undefined &&
    labor.stableThroughPeriod > labor.period &&
    labor.stableSampleCount !== undefined &&
    labor.stableSampleCount >= 2 &&
    labor.foodProjectionPositiveAtEverySample !== undefined &&
    labor.foodProjectionStableAcrossSamples !== undefined;
  const foodStatus: GoalStatus =
    foodMargin === undefined || !foodIntervalEvidenceComplete
      ? "unavailable"
      : foodMargin <= 0 ||
          labor?.foodProjectionPositiveAtEverySample !== true ||
          labor?.foodProjectionStableAcrossSamples !== true
        ? "blocked"
        : "satisfied";
  const populationStatus =
    state?.population === undefined || state.populationCapacity === undefined
      ? "unavailable"
      : state.population > 0 && state.populationCapacity >= state.population
        ? "satisfied"
        : "blocked";
  const miningStatus =
    state?.miningLevel === undefined ||
    !mechanicsMatched ||
    input.nativeMechanics.requiredMiningLevel === undefined
      ? "unavailable"
      : state.miningLevel >= input.nativeMechanics.requiredMiningLevel
        ? "satisfied"
        : "blocked";
  const raceStatus: GoalStatus =
    !mechanicsMatched ||
    state?.race === undefined ||
    input.nativeMechanics.raceId !== state.race ||
    input.nativeMechanics.raceEligible === undefined
      ? "unavailable"
      : input.nativeMechanics.raceEligible
        ? "satisfied"
        : "blocked";
  const storageFits =
    completePrice &&
    storageMatched &&
    input.nativeMechanics.storageWithoutShed !== undefined &&
    validAmount(input.nativeMechanics.storageWithoutShed.Lumber) &&
    validAmount(input.nativeMechanics.storageWithoutShed.Stone)
      ? input.nativeMechanics.storageWithoutShed.Lumber >= lumberRequired! &&
        input.nativeMechanics.storageWithoutShed.Stone >= stoneRequired!
      : undefined;
  const storageStatus: GoalStatus =
    storageFits === undefined
      ? "unavailable"
      : storageFits
        ? "satisfied"
        : "blocked";
  const shedOrderStatus: GoalStatus = currentQuarryOrder
    ? "satisfied"
    : constructionMatched &&
        construction.authorityValid === true &&
        construction.targetId !== undefined
      ? "blocked"
      : "unavailable";
  const quarryBuiltStatus = observationStatus(
    state?.quarryCount,
    (value) => typeof value === "number" && value > 0,
  );
  const workerAssignmentStatus = observationStatus(
    state?.quarryWorkers,
    (value) => typeof value === "number" && value > 0,
  );
  const workerOutputPositive = labor?.oneQuarryWorkerStoneOutputPositive;
  const workerUnlockStatus: GoalStatus =
    !mechanicsMatched ||
    input.nativeMechanics.quarryUnlocksQuarryWorker === undefined
      ? "unavailable"
      : input.nativeMechanics.quarryUnlocksQuarryWorker
        ? quarryBuiltStatus === "satisfied"
          ? "satisfied"
          : quarryBuiltStatus === "unavailable"
            ? "unavailable"
            : "unsatisfied"
        : "blocked";
  const jobSettingsComplete =
    jobSettings !== undefined &&
    jobSettings.autoJobs !== undefined &&
    jobSettings.jobSetDefault !== undefined &&
    jobSettings.quarryWorkerEnabled !== undefined &&
    jobSettings.farmerEnabled !== undefined &&
    Number.isFinite(jobSettings.quarryWorkerPriority) &&
    Number.isFinite(jobSettings.farmerPriority) &&
    jobSettings.quarryWorkerBreakpoints?.length === 3 &&
    jobSettings.quarryWorkerBreakpoints.every(Number.isFinite) &&
    jobSettings.farmerBreakpoints?.length === 3 &&
    jobSettings.farmerBreakpoints.every(Number.isFinite);
  const jobSettingsValid =
    jobSettings?.autoJobs === true &&
    jobSettings.jobSetDefault === true &&
    jobSettings.quarryWorkerEnabled === true &&
    jobSettings.farmerEnabled === true;
  const jobPriorityOrder =
    !jobRulesMatched ||
    jobSettings?.quarryWorkerPriority === undefined ||
    jobSettings.farmerPriority === undefined
      ? "unavailable"
      : jobSettings.quarryWorkerPriority < jobSettings.farmerPriority
        ? "quarry-worker-before-farmer"
        : jobSettings.quarryWorkerPriority > jobSettings.farmerPriority
          ? "farmer-before-quarry-worker"
          : "equal-priority";
  const jobSettingsStatus: GoalStatus =
    !jobSettingsComplete || !jobRulesMatched
      ? "unavailable"
      : jobSettingsValid
        ? "satisfied"
        : "blocked";
  const observedStoneOutputStatus = observationStatus(
    state?.stoneProduction,
    (value) => typeof value === "number" && value > 0,
  );
  const stoneOutputStatus = combinePrerequisiteStatuses("all", [
    quarryBuiltStatus,
    workerAssignmentStatus,
    observedStoneOutputStatus,
  ]);
  const stoneGoalStatus = combinePrerequisiteStatuses("all", [
    stoneOutputStatus,
    foodStatus,
    populationStatus,
  ]);
  const evidence = {
    construction: evidenceId(construction),
    state: evidenceId(state),
    labor: evidenceId(labor),
    storage: evidenceId(input.nativeMechanics.storageEvidence),
    mechanics: mechanicsMatched ? evidenceId(mechanicsEvidence) : [],
  };
  const resourceRequirements =
    resourceEvidenceComplete &&
    lumberRequired !== undefined &&
    stoneRequired !== undefined
      ? Object.freeze([
          Object.freeze({
            resourceId: "Lumber",
            required: lumberRequired,
            observed: lumberHeld!,
            shortfall: Math.max(0, lumberRequired - lumberHeld!),
            ...(commitmentsKnown
              ? { committed: 0, unreserved: lumberHeld! }
              : {}),
          }),
          Object.freeze({
            resourceId: "Stone",
            required: stoneRequired,
            observed: stoneHeld!,
            shortfall: Math.max(0, stoneRequired - stoneHeld!),
            ...(commitmentsKnown
              ? { committed: 0, unreserved: stoneHeld! }
              : {}),
          }),
        ])
      : undefined;
  const foodConfidence: EconomicEvidenceConfidence =
    foodStatus === "unavailable" ? "unavailable" : "provisional";
  const stoneFormulaConfidence: EconomicEvidenceConfidence =
    !mechanicsMatched ||
    labor === undefined ||
    workerOutputPositive === undefined
      ? "unavailable"
      : workerOutputPositive === false
        ? "established"
        : state?.stoneProduction !== undefined &&
            state.stoneProduction > 0 &&
            workerAssignmentStatus === "satisfied" &&
            labor.nativeAssignmentObserved
          ? "established"
          : "provisional";

  const rawGoals: EconomicGoalNode[] = [];
  const add = (
    goal: GoalDefinition,
    confidence: EconomicEvidenceConfidence,
    evidenceIds: readonly string[],
    extra: Pick<EconomicGoalNode, "resourceRequirements" | "diagnostic"> = {},
  ) => rawGoals.push(freezeNode(goal, confidence, evidenceIds, extra));
  const base = {
    scope: "run" as const,
  };

  add(
    {
      ...base,
      id: OBJECTIVE_ID,
      predicate: "sustainable-positive-stone-without-food-or-population-loss",
      provenance: "diagnostic-objective",
      reason:
        "Experimental terminal objective; no player selection or spending authority is implied.",
      status: stoneGoalStatus,
      prerequisites: {
        operator: "all",
        goalIds: [STONE_OUTPUT_ID, FOOD_MARGIN_ID, POPULATION_ID],
      },
    },
    "provisional",
    [...evidence.state, ...evidence.labor, ...evidence.mechanics],
  );
  add(
    {
      ...base,
      id: STONE_OUTPUT_ID,
      predicate: "native-stone-net-production-is-positive",
      provenance: "derived-requirement",
      reason:
        "The captured stop has no Quarry or Stone output; the positive job output is source-backed but unobserved in this replay.",
      status: stoneOutputStatus,
      prerequisites: {
        operator: "all",
        goalIds: [QUARRY_BUILT_ID, WORKER_ASSIGNED_ID],
      },
    },
    stoneFormulaConfidence,
    [...evidence.state, ...evidence.labor, ...evidence.mechanics],
    {
      diagnostic: {
        currentStoneProduction: state?.stoneProduction ?? "unavailable",
        oneWorkerStoneOutputPositiveByNativeFormula:
          labor?.oneQuarryWorkerStoneOutputPositive ?? "unavailable",
        nativeAssignmentObserved: labor?.nativeAssignmentObserved ?? false,
      },
    },
  );
  add(
    {
      ...base,
      id: QUARRY_BUILT_ID,
      predicate: "city-rock_quarry-count-at-least-one",
      provenance: "native-prerequisite",
      reason:
        "Quarry construction is the native path that unlocks the Quarry Worker; it is not itself productive or an assignment.",
      status: quarryBuiltStatus,
      prerequisites: {
        operator: "all",
        goalIds: [
          MINING_ID,
          QUARRY_PRICE_ID,
          STORAGE_FIT_ID,
          SHED_ORDER_ID,
          QUARRY_ORDER_ID,
          RACE_ELIGIBLE_ID,
        ],
      },
      action: { family: "construction", nativeId: "city-rock_quarry" },
    },
    state?.quarryCount === undefined ? "unavailable" : "established",
    [...evidence.state, ...evidence.construction, ...evidence.mechanics],
  );
  add(
    {
      ...base,
      id: MINING_ID,
      predicate: "mining-research-level-meets-native-quarry-gate",
      provenance: "native-prerequisite",
      reason: mechanicsMatched
        ? `Native Quarry requires Mining ${input.nativeMechanics.requiredMiningLevel ?? "unknown"}.`
        : "The pinned native Mining prerequisite is unavailable because its game-source identity is missing or mismatched.",
      status: miningStatus,
    },
    miningStatus === "unavailable" ? "unavailable" : "established",
    [...evidence.state, ...evidence.mechanics],
    {
      diagnostic: {
        capturedMiningLevel: state?.miningLevel ?? "unavailable",
        requiredMiningLevel: mechanicsMatched
          ? (input.nativeMechanics.requiredMiningLevel ?? "unavailable")
          : "unavailable",
      },
    },
  );
  add(
    {
      ...base,
      id: QUARRY_PRICE_ID,
      predicate: "complete-current-native-quarry-material-price-is-held",
      provenance: "derived-requirement",
      reason: commitmentsKnown
        ? "Price and stock are from a matched native Construction capture; queues and competing claims are clear, so the observed stock is unreserved and remains available to native Construction."
        : "A complete current price, stock, or reservation observation is unavailable; no missing material is assumed free.",
      status: materialStatus,
      ...(resourceRequirements === undefined
        ? {}
        : {
            quantity: {
              resourceId: "Lumber",
              amount: lumberRequired!,
              held: lumberHeld!,
            },
          }),
    },
    !resourceEvidenceComplete ? "unavailable" : "established",
    evidence.construction,
    resourceRequirements === undefined ? {} : { resourceRequirements },
  );
  add(
    {
      ...base,
      id: STORAGE_FIT_ID,
      predicate: "quarry-material-cost-fits-storage-without-shed",
      provenance: "derived-requirement",
      reason:
        storageFits === true
          ? "P19 capacity holds the full Quarry price without a Shed; Shed is not a physical storage prerequisite."
          : "Existing no-Shed storage capacity is unavailable or below the complete Quarry price.",
      status: storageStatus,
    },
    storageFits === undefined ? "unavailable" : "established",
    [...evidence.construction, ...evidence.storage],
  );
  add(
    {
      ...base,
      id: SHED_ORDER_ID,
      predicate: "native-owner-order-has-advanced-through-shed-to-quarry",
      provenance: "native-prerequisite",
      reason:
        "Shed was the prior native Construction target in this replay; it is an owner-ordering step, not a physical Quarry prerequisite.",
      status: shedOrderStatus,
    },
    shedOrderStatus === "unavailable" ? "unavailable" : "established",
    [...evidence.construction, ...evidence.state],
  );
  add(
    {
      ...base,
      id: QUARRY_ORDER_ID,
      predicate: "current-native-construction-target-is-rock-quarry",
      provenance: "native-prerequisite",
      reason:
        "The current native target and complete price come from a valid Construction publication; this is owner selection, not physical availability.",
      status: currentTargetStatus,
    },
    currentTargetStatus === "unavailable" ? "unavailable" : "established",
    evidence.construction,
  );
  add(
    {
      ...base,
      id: RACE_ELIGIBLE_ID,
      predicate: "native-quarry-race-gate-allows-current-civilization",
      provenance: "native-prerequisite",
      reason:
        "Pinned native Quarry race restrictions are evaluated separately from owner ordering.",
      status: raceStatus,
    },
    raceStatus === "unavailable" ? "unavailable" : "established",
    [...evidence.state, ...evidence.mechanics],
  );
  add(
    {
      ...base,
      id: WORKER_ASSIGNED_ID,
      predicate: "one-quarry-worker-is-natively-eligible-and-assigned",
      provenance: "native-prerequisite",
      reason:
        workerUnlockStatus === "unavailable"
          ? "The pinned native Quarry Worker unlock fact is unavailable because its game-source identity is missing or mismatched."
          : input.nativeMechanics.quarryUnlocksQuarryWorker === true
            ? "Quarry purchase exposes the Quarry Worker, but P36 stopped before purchase and no assignment control or production was observed."
            : "The native job unlock is unavailable or the Quarry has not been purchased.",
      status: workerAssignmentStatus,
      prerequisites: {
        operator: "all",
        goalIds: [
          QUARRY_BUILT_ID,
          "quarry:job-unlock-on-purchase",
          JOB_SETTINGS_ID,
          LABOR_CAPACITY_ID,
        ],
      },
      action: { family: "job", nativeId: "civ-quarry_worker" },
    },
    workerAssignmentStatus === "unavailable" ? "unavailable" : "provisional",
    [...evidence.state, ...evidence.labor, ...evidence.mechanics],
  );
  add(
    {
      ...base,
      id: JOB_SETTINGS_ID,
      predicate: "native-auto-job-settings-enable-quarry-worker",
      provenance: "derived-requirement",
      reason:
        jobSettingsStatus === "satisfied"
          ? "The retained settings enable autoJobs, default-job assignment, Quarry Worker, and Farmer. Farmer priority 5 precedes Quarry Worker priority 8 in the captured managed-job order; post-purchase reassignment remains unobserved."
          : "Native job assignment settings are unavailable or do not permit this route.",
      status: jobSettingsStatus,
    },
    jobSettingsStatus === "unavailable" ? "unavailable" : "provisional",
    [
      ...evidenceId(jobSettings),
      ...evidenceId(jobSettings?.priorityOrderEvidence),
      ...evidenceId(jobSettings?.breakpointEvidence),
    ],
    {
      diagnostic: {
        autoJobs: jobSettings?.autoJobs ?? "unavailable",
        jobSetDefault: jobSettings?.jobSetDefault ?? "unavailable",
        quarryWorkerEnabled: jobSettings?.quarryWorkerEnabled ?? "unavailable",
        farmerEnabled: jobSettings?.farmerEnabled ?? "unavailable",
        quarryWorkerPriority:
          jobSettings?.quarryWorkerPriority ?? "unavailable",
        farmerPriority: jobSettings?.farmerPriority ?? "unavailable",
        quarryWorkerBreakpoints:
          jobSettings?.quarryWorkerBreakpoints?.join(",") ?? "unavailable",
        farmerBreakpoints:
          jobSettings?.farmerBreakpoints?.join(",") ?? "unavailable",
        configuredPriorityOrder: jobPriorityOrder,
      },
    },
  );
  add(
    {
      ...base,
      id: LABOR_CAPACITY_ID,
      predicate: "retain-minimum-farmers-and-reassign-one-resident",
      provenance: "derived-requirement",
      reason:
        laborCapacityStatus === "satisfied"
          ? "Four housed residents can cover three Farmers plus one Quarry Worker, but one Farmer must be reassigned; no resident is currently unassigned."
          : "Population, capacity, minimum Farmer employment, or the reassignment state is unavailable or insufficient.",
      status: laborCapacityStatus,
      prerequisites: { operator: "all", goalIds: [FOOD_MARGIN_ID] },
      ...(minimumFarmers === undefined
        ? {}
        : {
            quantity: {
              resourceId: "Human",
              amount: minimumFarmers + 1,
              ...(state?.population === undefined
                ? {}
                : { held: state.population }),
            },
          }),
    },
    laborCapacityStatus === "unavailable" ? "unavailable" : "provisional",
    [...evidence.state, ...evidence.labor, ...evidence.mechanics],
    {
      diagnostic: {
        population: state?.population ?? "unavailable",
        populationCapacity: state?.populationCapacity ?? "unavailable",
        currentFarmers: state?.farmers ?? "unavailable",
        farmersAfterReassignment: farmersAfter ?? "unavailable",
        quarryWorkerAssignmentObserved:
          labor?.nativeAssignmentObserved ?? false,
      },
    },
  );
  add(
    {
      ...base,
      id: FOOD_MARGIN_ID,
      predicate: "food-output-after-farmer-reassignment-exceeds-consumption",
      provenance: "derived-requirement",
      reason:
        foodStatus === "satisfied"
          ? "Pinned Farmer formula plus matched P19/P36 captures predicts a positive Food margin with three Farmers; this assignment was not replayed."
          : "Food output after reassignment or resident consumption is unavailable, or the projected margin is nonpositive.",
      status: foodStatus,
      ...(foodMargin === undefined
        ? {}
        : {
            quantity: {
              resourceId: "Food",
              amount: foodConsumption!,
              held: foodOutput!,
            },
          }),
    },
    foodConfidence,
    [...evidence.state, ...evidence.labor, ...evidence.mechanics],
    {
      diagnostic: {
        minimumFarmers: minimumFarmers ?? "unavailable",
        projectedFoodOutput: foodOutput ?? "unavailable",
        foodConsumption: foodConsumption ?? "unavailable",
        foodNet: foodMargin ?? "unavailable",
        twoFarmerFoodOutput: labor?.foodOutputWithTwoFarmers ?? "unavailable",
        sampledStableThroughPeriod: labor?.stableThroughPeriod ?? "unavailable",
        sampledStableCount: labor?.stableSampleCount ?? "unavailable",
      },
    },
  );
  add(
    {
      ...base,
      id: POPULATION_ID,
      predicate: "current-population-is-housed-and-retained",
      provenance: "derived-requirement",
      reason:
        "The diagnostic assignment moves an existing resident and does not remove population; it does not require extra housing once four residents are present.",
      status: populationStatus,
    },
    populationStatus === "unavailable" ? "unavailable" : "established",
    evidence.state,
  );
  add(
    {
      ...base,
      id: "quarry:job-unlock-on-purchase",
      predicate: "quarry-purchase-enables-native-quarry-worker-job",
      provenance: "native-prerequisite",
      reason:
        workerUnlockStatus === "satisfied"
          ? "Native Quarry action exposes the Quarry Worker job after purchase."
          : "The job remains unavailable until Quarry purchase; the capture does not show the post-purchase control.",
      status: workerUnlockStatus,
      prerequisites: { operator: "all", goalIds: [QUARRY_BUILT_ID] },
    },
    workerUnlockStatus === "unavailable" ? "unavailable" : "established",
    [...evidence.construction, ...evidence.state, ...evidence.mechanics],
  );

  const allGoals = Object.freeze(rawGoals);
  const goalMap = new Map(allGoals.map((goal) => [goal.id, goal]));
  const limits = boundedLimits(input.graphLimits);
  const traversal = traverseGoalGraph(OBJECTIVE_ID, goalMap, limits);
  const visitedIds = new Set(traversal.visited);
  const goals = Object.freeze(
    traversal.visited.flatMap((id) => {
      const goal = goalMap.get(id);
      return goal === undefined ? [] : [goal];
    }),
  );
  const edges = Object.freeze(
    buildEdges(goals).filter(
      (edge) => visitedIds.has(edge.from) && visitedIds.has(edge.to),
    ),
  );
  const strategyStocks = input.strategyEvidence?.stocks ?? [];
  const strategyFreshness =
    input.strategyEvidence === undefined
      ? "unavailable"
      : input.strategyEvidence.validityEpoch !== input.validityEpoch ||
          strategyStocks.some(
            (stock) => stock.validityEpoch !== input.validityEpoch,
          )
        ? "stale"
        : "matched";
  const strategyComparison =
    input.strategyEvidence === undefined || strategyFreshness !== "matched"
      ? undefined
      : compareGoalStrategies(
          QUARRY_PRICE_ID,
          input.strategyEvidence.requirements,
          strategyStocks,
          input.strategyEvidence.commitments,
          input.strategyEvidence.candidates,
          input.validityEpoch,
          input.strategyEvidence.commitmentsKnown,
        );
  const objective = goals.find((goal) => goal.id === OBJECTIVE_ID);
  if (objective === undefined) throw new Error("economic objective missing");

  return Object.freeze({
    objective,
    goals,
    edges,
    traversal,
    limits,
    freshness: Object.freeze({
      construction:
        construction === undefined
          ? "unavailable"
          : constructionMatched
            ? "matched"
            : "stale",
      state:
        input.state === undefined
          ? "unavailable"
          : stateMatched
            ? "matched"
            : "stale",
      labor:
        input.labor === undefined
          ? "unavailable"
          : laborMatched
            ? "matched"
            : "stale",
      jobSettings:
        input.jobSettings === undefined
          ? "unavailable"
          : jobSettingsMatched
            ? "matched"
            : "stale",
      storage:
        input.nativeMechanics.storageEvidence === undefined
          ? "unavailable"
          : storageMatched
            ? "matched"
            : "stale",
      mechanics: mechanicsFreshness,
      strategyStocks: strategyFreshness,
      analysisSnapshotId: input.analysisSnapshotId,
      validityEpoch: input.validityEpoch,
    }),
    ...(strategyComparison === undefined ? {} : { strategyComparison }),
    playerSelected: false,
    executionAuthority: "none",
  });
}

/** Applies the P37 A/B evidence gate without authorizing any game action. */
export function evaluateEconomicGoalPathEvidence(
  graph: Readonly<EconomicGoalDependencyGraph>,
): EconomicGoalPathEvidenceAssessment {
  const requiredFreshness: readonly (keyof EconomicGoalDependencyGraph["freshness"])[] =
    [
      "construction",
      "state",
      "labor",
      "jobSettings",
      "storage",
      "mechanics",
      "strategyStocks",
    ];
  const requiredSatisfiedGoals = [
    MINING_ID,
    STORAGE_FIT_ID,
    SHED_ORDER_ID,
    QUARRY_ORDER_ID,
    RACE_ELIGIBLE_ID,
    JOB_SETTINGS_ID,
    LABOR_CAPACITY_ID,
    FOOD_MARGIN_ID,
    POPULATION_ID,
  ] as const;
  const evidenceGaps = [
    ...requiredFreshness.flatMap((source) =>
      graph.freshness[source] === "matched" ? [] : [`freshness:${source}`],
    ),
    ...requiredSatisfiedGoals.filter(
      (id) =>
        graph.goals.find((goal) => goal.id === id)?.status !== "satisfied",
    ),
  ];
  const materialPrice = graph.goals.find((goal) => goal.id === QUARRY_PRICE_ID);
  if (
    materialPrice?.confidence !== "established" ||
    materialPrice.resourceRequirements === undefined ||
    materialPrice.resourceRequirements.some(
      (requirement) =>
        requirement.committed === undefined ||
        requirement.unreserved === undefined,
    )
  ) {
    evidenceGaps.push(QUARRY_PRICE_ID);
  }
  const stoneProduction = graph.goals.find(
    (goal) => goal.id === STONE_OUTPUT_ID,
  );
  if (
    stoneProduction?.diagnostic?.oneWorkerStoneOutputPositiveByNativeFormula !==
    true
  ) {
    evidenceGaps.push(`${STONE_OUTPUT_ID}:positive-one-worker-formula`);
  }
  if (graph.strategyComparison === undefined) {
    evidenceGaps.push("strategyComparison");
  }
  if (graph.traversal.missing.length > 0)
    evidenceGaps.push("graph:missing-nodes");
  if (graph.traversal.cycles.length > 0) evidenceGaps.push("graph:cycles");
  if (graph.traversal.limits.length > 0) evidenceGaps.push("graph:limits");
  const uniqueEvidenceGaps = Object.freeze([...new Set(evidenceGaps)]);
  return Object.freeze({
    decision: uniqueEvidenceGaps.length === 0 ? "A" : "B",
    evidenceGaps: uniqueEvidenceGaps,
  });
}
