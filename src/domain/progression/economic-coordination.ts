import { hasSufficientGoalCapacity } from "../economy/goal-feasibility.ts";
import {
  findCostConflict,
  type CostConflict,
  type ReservedCostTarget,
  type ResourceCostMap,
} from "../cost-conflicts.ts";
import {
  planJobs,
  type JobsAssignment,
  type JobsCycleInput,
  type JobsDecision,
} from "../civic/jobs.ts";

export interface EconomicCoordinationOwnerCycle {
  readonly ownerId: string;
  readonly workCycleId: string;
  readonly workCycleProvenance:
    "native-captured" | "normalized-from-captured-period";
  readonly rootGeneration: number;
  readonly progressionGeneration: string;
  readonly controlGeneration: number;
  readonly evidenceId: string;
}

export interface EconomicCoordinationCurrentEpoch {
  readonly snapshotId: string;
  readonly snapshotProvenance:
    "native-captured" | "normalized-from-captured-period";
  readonly validityEpoch: string;
  readonly lineageId: string;
  readonly period: number;
  readonly rootGeneration: number;
  readonly progressionGeneration: string;
  readonly controlGeneration: number;
  readonly ownerWorkCycles: Readonly<Record<string, string | undefined>>;
}

export interface EconomicCoordinationClaim extends ReservedCostTarget {
  readonly owner: Readonly<EconomicCoordinationOwnerCycle>;
}

export interface EconomicGoalProvenance {
  readonly source: "economic-goal-graph";
  readonly goalId: string;
  readonly evidenceIds: readonly string[];
  readonly playerSelected: false;
  readonly executionAuthority: "none";
}

export interface EconomicResourceStock {
  readonly name: string;
  readonly currentQuantity: number;
  readonly capacity: number;
  readonly snapshotId: string;
  readonly evidenceId: string;
}

export interface EconomicResourceCoordinationInput {
  readonly goal: Readonly<{
    readonly targetId: string;
    readonly price: ResourceCostMap;
    readonly priceComplete: boolean;
    readonly provenance: Readonly<EconomicGoalProvenance>;
  }>;
  readonly proposal?: Readonly<{
    readonly owner: Readonly<EconomicCoordinationOwnerCycle>;
    readonly snapshotId: string;
    readonly targetId: string;
    readonly protectedAmounts: ResourceCostMap;
  }>;
  readonly currentTarget: Readonly<{
    readonly owner: Readonly<EconomicCoordinationOwnerCycle>;
    readonly snapshotId: string;
    readonly targetId: string;
    readonly price: ResourceCostMap;
    readonly priceComplete: boolean;
  }>;
  readonly currentEpoch: Readonly<EconomicCoordinationCurrentEpoch>;
  readonly stocks: Readonly<Record<string, EconomicResourceStock | undefined>>;
  readonly nativeQueues: Readonly<{
    readonly complete: boolean;
    readonly snapshotId: string;
    readonly commitments: readonly Readonly<EconomicCoordinationClaim>[];
  }>;
  readonly competingAutomationClaims: Readonly<{
    readonly complete: boolean;
    readonly snapshotId: string;
    readonly claims: readonly Readonly<EconomicCoordinationClaim>[];
  }>;
  readonly nextPurchase?: Readonly<{
    readonly owner: Readonly<EconomicCoordinationOwnerCycle>;
    readonly snapshotId: string;
    readonly targetId: string;
    readonly cost: ResourceCostMap;
    readonly independentlyObserved: boolean;
    readonly evidenceId: string;
  }>;
}

export type EconomicResourceCoordinationStatus =
  "unreserved" | "proposed" | "conflict" | "unavailable" | "enforceable";

export interface EconomicResourceCoordinationAssessment {
  readonly status: EconomicResourceCoordinationStatus;
  readonly snapshotProvenance?:
    "native-captured" | "normalized-from-captured-period";
  readonly reservationValidity: "current" | "invalid" | "unavailable";
  readonly invalidationConditions: readonly string[];
  readonly reasons: readonly string[];
  readonly proposal?: Readonly<{
    readonly targetId: string;
    readonly protectedAmounts: ResourceCostMap;
    readonly provenance: Readonly<EconomicGoalProvenance>;
    readonly owner: Readonly<EconomicCoordinationOwnerCycle>;
  }>;
  readonly nextPurchaseConflict?: Readonly<CostConflict>;
  readonly executionAuthority: "none";
}

const RESOURCE_RESERVATION_INVALIDATORS = Object.freeze([
  "source-snapshot-changed",
  "owner-work-cycle-changed",
  "root-generation-changed",
  "progression-generation-changed",
  "control-generation-changed",
  "construction-target-or-price-changed",
  "material-stock-or-capacity-changed",
  "native-queue-commitments-changed",
  "competing-automation-claims-changed",
  "next-purchase-changed",
]);

function unavailableResourceAssessment(
  reasons: readonly string[],
  reservationValidity: "invalid" | "unavailable" = "unavailable",
): EconomicResourceCoordinationAssessment {
  return Object.freeze({
    status: "unavailable",
    reservationValidity,
    invalidationConditions: RESOURCE_RESERVATION_INVALIDATORS,
    reasons: Object.freeze([...reasons]),
    executionAuthority: "none",
  });
}

function isFiniteNonnegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function ownerEvidenceIsCurrent(
  owner: Readonly<EconomicCoordinationOwnerCycle>,
  epoch: Readonly<EconomicCoordinationCurrentEpoch>,
): boolean {
  return (
    isNonemptyString(owner.ownerId) &&
    isNonemptyString(owner.workCycleId) &&
    (owner.workCycleProvenance === "native-captured" ||
      owner.workCycleProvenance === "normalized-from-captured-period") &&
    isNonemptyString(owner.evidenceId) &&
    isNonemptyString(owner.progressionGeneration) &&
    Number.isFinite(owner.rootGeneration) &&
    Number.isFinite(owner.controlGeneration) &&
    owner.rootGeneration === epoch.rootGeneration &&
    owner.progressionGeneration === epoch.progressionGeneration &&
    owner.controlGeneration === epoch.controlGeneration &&
    epoch.ownerWorkCycles[owner.ownerId] === owner.workCycleId
  );
}

function claimsAreCurrent(
  claims: readonly Readonly<EconomicCoordinationClaim>[],
  epoch: Readonly<EconomicCoordinationCurrentEpoch>,
): boolean {
  return claims.every((claim) => ownerEvidenceIsCurrent(claim.owner, epoch));
}

function hasCompleteResourceEvidence(
  costs: ResourceCostMap,
  stocks: Readonly<Record<string, EconomicResourceStock | undefined>>,
  snapshotId: string,
): boolean {
  return Object.entries(costs).every(([resourceId, cost]) => {
    const stock = stocks[resourceId];
    return (
      isFiniteNonnegative(cost) &&
      stock !== undefined &&
      isNonemptyString(stock.name) &&
      stock.snapshotId === snapshotId &&
      isNonemptyString(stock.evidenceId) &&
      isFiniteNonnegative(stock.currentQuantity) &&
      Number.isFinite(stock.capacity) &&
      stock.currentQuantity <= stock.capacity &&
      hasSufficientGoalCapacity(stock.capacity, cost)
    );
  });
}

function hasStaleResourceEvidence(
  costs: readonly ResourceCostMap[],
  stocks: Readonly<Record<string, EconomicResourceStock | undefined>>,
  snapshotId: string,
): boolean {
  return costs.some((cost) =>
    Object.keys(cost).some((resourceId) => {
      const stock = stocks[resourceId];
      return stock !== undefined && stock.snapshotId !== snapshotId;
    }),
  );
}

function sameCostMap(left: ResourceCostMap, right: ResourceCostMap): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && left[key] === right[key],
    )
  );
}

/** Compares a diagnostic resource proposal with current, owner-tagged commitments. */
export function assessEconomicResourceCoordination(
  input: Readonly<EconomicResourceCoordinationInput>,
): Readonly<EconomicResourceCoordinationAssessment> {
  const proposal = input.proposal;
  if (proposal === undefined) {
    return Object.freeze({
      status: "unreserved",
      snapshotProvenance: input.currentEpoch.snapshotProvenance,
      reservationValidity: "current",
      invalidationConditions: RESOURCE_RESERVATION_INVALIDATORS,
      reasons: Object.freeze(["no target-specific reserve was proposed"]),
      executionAuthority: "none",
    });
  }

  const owners = [proposal.owner, input.currentTarget.owner];
  if (input.nextPurchase !== undefined) owners.push(input.nextPurchase.owner);
  const evidenceSnapshotIds = [
    proposal.snapshotId,
    input.currentTarget.snapshotId,
    input.nativeQueues.snapshotId,
    input.competingAutomationClaims.snapshotId,
    ...(input.nextPurchase === undefined
      ? []
      : [input.nextPurchase.snapshotId]),
  ];
  if (
    !isNonemptyString(input.currentEpoch.snapshotId) ||
    (input.currentEpoch.snapshotProvenance !== "native-captured" &&
      input.currentEpoch.snapshotProvenance !==
        "normalized-from-captured-period") ||
    !isNonemptyString(input.currentEpoch.validityEpoch) ||
    !isNonemptyString(input.currentEpoch.lineageId) ||
    !Number.isSafeInteger(input.currentEpoch.period) ||
    evidenceSnapshotIds.some((snapshotId) => !isNonemptyString(snapshotId))
  ) {
    return unavailableResourceAssessment([
      "one or more owner observations have no snapshot identity",
    ]);
  }
  if (
    evidenceSnapshotIds.some(
      (snapshotId) => snapshotId !== input.currentEpoch.snapshotId,
    )
  ) {
    return unavailableResourceAssessment(
      ["the proposal, stock, queue, claim, or purchase snapshot is stale"],
      "invalid",
    );
  }
  if (
    !input.goal.priceComplete ||
    !input.currentTarget.priceComplete ||
    input.goal.provenance.source !== "economic-goal-graph" ||
    !isNonemptyString(input.goal.provenance.goalId) ||
    !Array.isArray(input.goal.provenance.evidenceIds) ||
    input.goal.provenance.evidenceIds.length === 0 ||
    !input.goal.provenance.evidenceIds.every(isNonemptyString) ||
    input.goal.provenance.playerSelected !== false ||
    input.goal.provenance.executionAuthority !== "none" ||
    proposal.targetId !== input.goal.targetId ||
    proposal.targetId !== input.currentTarget.targetId ||
    !sameCostMap(input.goal.price, input.currentTarget.price) ||
    Object.keys(proposal.protectedAmounts).length === 0 ||
    Object.entries(proposal.protectedAmounts).some(
      ([resourceId, amount]) =>
        !isFiniteNonnegative(amount) ||
        amount === 0 ||
        amount > (input.goal.price[resourceId] ?? -1),
    )
  ) {
    return unavailableResourceAssessment([
      "the proposed reserve does not match a complete current goal and Construction price",
    ]);
  }
  if (!input.nativeQueues.complete) {
    return unavailableResourceAssessment([
      "native queue commitments were not completely observed",
    ]);
  }
  if (!input.competingAutomationClaims.complete) {
    return unavailableResourceAssessment([
      "competing automation claims were not completely observed",
    ]);
  }
  const allCommitmentCosts = [
    input.goal.price,
    input.currentTarget.price,
    proposal.protectedAmounts,
    ...input.nativeQueues.commitments.map((claim) => claim.cost),
    ...input.competingAutomationClaims.claims.map((claim) => claim.cost),
    ...(input.nextPurchase === undefined ? [] : [input.nextPurchase.cost]),
  ];
  if (
    hasStaleResourceEvidence(
      allCommitmentCosts,
      input.stocks,
      input.currentEpoch.snapshotId,
    )
  ) {
    return unavailableResourceAssessment(
      ["material stock or capacity evidence is stale"],
      "invalid",
    );
  }
  if (
    !hasCompleteResourceEvidence(
      proposal.protectedAmounts,
      input.stocks,
      input.currentEpoch.snapshotId,
    )
  ) {
    return unavailableResourceAssessment([
      "protected materials lack current stock or sufficient capacity evidence",
    ]);
  }
  if (
    !owners.every((owner) =>
      ownerEvidenceIsCurrent(owner, input.currentEpoch),
    ) ||
    !claimsAreCurrent(
      [
        ...input.nativeQueues.commitments,
        ...input.competingAutomationClaims.claims,
      ],
      input.currentEpoch,
    )
  ) {
    return unavailableResourceAssessment(
      [
        "owner work-cycle or root/progression/control generation evidence is stale",
      ],
      "invalid",
    );
  }
  if (
    !hasCompleteResourceEvidence(
      input.goal.price,
      input.stocks,
      input.currentEpoch.snapshotId,
    ) ||
    input.nativeQueues.commitments.some(
      (claim) =>
        !hasCompleteResourceEvidence(
          claim.cost,
          input.stocks,
          input.currentEpoch.snapshotId,
        ),
    ) ||
    input.competingAutomationClaims.claims.some(
      (claim) =>
        !hasCompleteResourceEvidence(
          claim.cost,
          input.stocks,
          input.currentEpoch.snapshotId,
        ),
    )
  ) {
    return unavailableResourceAssessment([
      "a current price or owner commitment lacks complete stock/capacity evidence",
    ]);
  }

  const purchase = input.nextPurchase;
  if (
    purchase !== undefined &&
    (!purchase.independentlyObserved ||
      !isNonemptyString(purchase.evidenceId) ||
      !ownerEvidenceIsCurrent(purchase.owner, input.currentEpoch) ||
      !hasCompleteResourceEvidence(
        purchase.cost,
        input.stocks,
        input.currentEpoch.snapshotId,
      ))
  ) {
    return unavailableResourceAssessment([
      "the spending owner's next purchase is missing independent current evidence",
    ]);
  }

  const proposedTargetName = `Proposed goal reserve: ${proposal.targetId}`;
  const reservedTargets: ReservedCostTarget[] = [
    ...input.nativeQueues.commitments,
    ...input.competingAutomationClaims.claims,
    {
      name: proposedTargetName,
      cause: "diagnostic proposal; no execution authority",
      cost: proposal.protectedAmounts,
    },
  ];
  const conflict =
    purchase === undefined
      ? null
      : findCostConflict({
          actionCost: purchase.cost,
          reservedTargets,
          resources: Object.fromEntries(
            Object.entries(input.stocks).map(([resourceId, stock]) => [
              resourceId,
              stock === undefined
                ? undefined
                : {
                    name: stock.name,
                    currentQuantity: stock.currentQuantity,
                  },
            ]),
          ),
        });
  const proposalConflicts =
    conflict?.targetNames.includes(proposedTargetName) ?? false;
  const status: EconomicResourceCoordinationStatus = proposalConflicts
    ? "conflict"
    : "proposed";
  return Object.freeze({
    status,
    snapshotProvenance: input.currentEpoch.snapshotProvenance,
    reservationValidity: "current",
    invalidationConditions: RESOURCE_RESERVATION_INVALIDATORS,
    reasons: Object.freeze(
      proposalConflicts
        ? [
            "the independently observed purchase would consume proposed protected materials",
          ]
        : ["the reserve is diagnostic and has no demonstrated owner contract"],
    ),
    proposal: Object.freeze({
      targetId: proposal.targetId,
      protectedAmounts: Object.freeze({ ...proposal.protectedAmounts }),
      provenance: input.goal.provenance,
      owner: proposal.owner,
    }),
    ...(conflict === null || !proposalConflicts
      ? {}
      : { nextPurchaseConflict: conflict }),
    executionAuthority: "none",
  });
}

export interface NativeFoodFormulaEvidence {
  readonly farmerImpact: number;
  readonly fullFarmBonus: number;
  readonly productionMultiplier: number;
  readonly modifierFingerprint: string;
  readonly sourceEvidenceIds: readonly string[];
}

export interface NativeFoodObservation {
  readonly snapshotId: string;
  readonly period: number;
  readonly lineageId: string;
  readonly validityEpoch: string;
  readonly modifierFingerprint: string;
  readonly population: number;
  readonly populationCapacity: number;
  readonly farmCount: number;
  readonly farmers: number;
  readonly foodOutput: number;
  readonly foodConsumption: number;
}

export interface SustainableFoodAssessment {
  readonly status: "feasible" | "infeasible" | "unavailable";
  readonly minimumFarmers?: number;
  readonly currentFoodOutput?: number;
  readonly foodConsumption?: number;
  readonly currentNetFood?: number;
  readonly reasons: readonly string[];
}

function isWholeNonnegative(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Pinned native Farmer output: farm slots receive the full Farm/Agriculture bonus. */
export function calculateNativeFarmerFood(
  formula: Readonly<NativeFoodFormulaEvidence>,
  farmCount: number,
  farmers: number,
): number {
  if (
    !isWholeNonnegative(farmCount) ||
    !isWholeNonnegative(farmers) ||
    !Number.isFinite(formula.farmerImpact) ||
    !Number.isFinite(formula.fullFarmBonus) ||
    !Number.isFinite(formula.productionMultiplier)
  ) {
    return Number.NaN;
  }
  const fullFarmWorkers = Math.min(farmCount, farmers);
  const farmHands = farmers - fullFarmWorkers;
  return (
    formula.productionMultiplier *
    (fullFarmWorkers * (formula.farmerImpact + formula.fullFarmBonus) +
      farmHands * formula.farmerImpact)
  );
}

export function assessSustainableFoodMinimum(
  observation: Readonly<NativeFoodObservation>,
  formula: Readonly<NativeFoodFormulaEvidence>,
  nativeFarmerMinimum: number,
): Readonly<SustainableFoodAssessment> {
  if (
    !isNonemptyString(observation.snapshotId) ||
    !Number.isSafeInteger(observation.period) ||
    !isNonemptyString(observation.lineageId) ||
    !isNonemptyString(observation.validityEpoch) ||
    !isNonemptyString(observation.modifierFingerprint) ||
    observation.modifierFingerprint !== formula.modifierFingerprint ||
    !Array.isArray(formula.sourceEvidenceIds) ||
    formula.sourceEvidenceIds.length === 0 ||
    !formula.sourceEvidenceIds.every(isNonemptyString) ||
    !isWholeNonnegative(observation.population) ||
    !isWholeNonnegative(observation.populationCapacity) ||
    !isWholeNonnegative(observation.farmCount) ||
    !isWholeNonnegative(observation.farmers) ||
    !isWholeNonnegative(nativeFarmerMinimum) ||
    !Number.isFinite(observation.foodOutput) ||
    !isFiniteNonnegative(observation.foodConsumption) ||
    !Number.isFinite(formula.farmerImpact) ||
    !Number.isFinite(formula.fullFarmBonus) ||
    !Number.isFinite(formula.productionMultiplier) ||
    formula.farmerImpact < 0 ||
    formula.fullFarmBonus < 0 ||
    formula.productionMultiplier < 0
  ) {
    return Object.freeze({
      status: "unavailable",
      reasons: Object.freeze(["Food or native formula evidence is incomplete"]),
    });
  }
  const modeledOutput = calculateNativeFarmerFood(
    formula,
    observation.farmCount,
    observation.farmers,
  );
  if (Math.abs(modeledOutput - observation.foodOutput) > 1e-6) {
    return Object.freeze({
      status: "unavailable",
      reasons: Object.freeze([
        "captured Food output does not match the pinned Farmer formula and current modifiers",
      ]),
    });
  }
  if (
    observation.population > observation.populationCapacity ||
    observation.farmers > observation.population ||
    nativeFarmerMinimum > observation.population
  ) {
    return Object.freeze({
      status: "infeasible",
      currentFoodOutput: observation.foodOutput,
      foodConsumption: observation.foodConsumption,
      currentNetFood: observation.foodOutput - observation.foodConsumption,
      reasons: Object.freeze([
        "housing or native Farmer minimum is insufficient",
      ]),
    });
  }

  let minimumFarmers: number | undefined;
  for (
    let farmers = nativeFarmerMinimum;
    farmers <= observation.population;
    farmers++
  ) {
    if (
      calculateNativeFarmerFood(formula, observation.farmCount, farmers) >
      observation.foodConsumption
    ) {
      minimumFarmers = farmers;
      break;
    }
  }
  if (minimumFarmers === undefined) {
    return Object.freeze({
      status: "infeasible",
      currentFoodOutput: observation.foodOutput,
      foodConsumption: observation.foodConsumption,
      currentNetFood: observation.foodOutput - observation.foodConsumption,
      reasons: Object.freeze([
        "no Farmer count within the housed population produces a positive Food margin",
      ]),
    });
  }
  const currentNetFood = observation.foodOutput - observation.foodConsumption;
  return Object.freeze({
    status: "feasible",
    minimumFarmers,
    currentFoodOutput: observation.foodOutput,
    foodConsumption: observation.foodConsumption,
    currentNetFood,
    reasons: Object.freeze([
      "minimum is calculated from the matched native Farmer formula and Food consumption",
    ]),
  });
}

export interface SustainableJobsInput {
  readonly snapshotId: string;
  readonly period: number;
  readonly lineageId: string;
  readonly validityEpoch: string;
  readonly ownerWorkCycles: Readonly<Record<string, string | undefined>>;
  readonly plannerInput: Readonly<JobsCycleInput>;
  readonly plannerEvidence: Readonly<{
    readonly snapshotId: string;
    readonly period: number;
    readonly lineageId: string;
    readonly validityEpoch: string;
    readonly ownerId: string;
    readonly workCycleId: string;
    readonly workCycleProvenance:
      "native-captured" | "normalized-from-captured-period";
    readonly evidenceId: string;
    readonly input: Readonly<JobsCycleInput>;
  }>;
  readonly foodObservation: Readonly<NativeFoodObservation>;
  readonly foodFormula: Readonly<NativeFoodFormulaEvidence>;
  readonly availabilityProvenance: "observed" | "hypothetical" | "unavailable";
  readonly productionJobId: string;
  readonly workerCommitments: Readonly<{
    readonly evidenceStatus: "complete" | "assumed-empty" | "unavailable";
    readonly snapshotId: string;
    readonly period: number;
    readonly validityEpoch: string;
    readonly lineageId: string;
    readonly ownerId: string;
    readonly workCycleId: string;
    readonly workCycleProvenance:
      "native-captured" | "normalized-from-captured-period";
    readonly evidenceId: string;
    readonly minimumByJobId: Readonly<Record<string, number>>;
  }>;
}

export interface SustainableJobsPlanResult {
  readonly status: "sustainable" | "conflict" | "unavailable";
  readonly snapshotId: string;
  readonly period: number;
  readonly validityEpoch: string;
  readonly lineageId: string;
  readonly productiveJob: Readonly<{
    readonly id: string;
    readonly availabilityProvenance:
      "observed" | "hypothetical" | "unavailable";
    readonly unlocked: boolean;
    readonly managed: boolean;
    readonly currentWorkers: number | null;
  }>;
  readonly ordinaryProposal?: Readonly<JobsDecision>;
  readonly food: Readonly<SustainableFoodAssessment>;
  readonly ordinaryFood?: Readonly<{
    readonly farmerCount: number;
    readonly foodOutput: number;
    readonly foodConsumption: number;
    readonly netFood: number;
    readonly sustainable: boolean;
  }>;
  readonly constrainedAlternative?: Readonly<{
    readonly status: "feasible" | "conditional" | "unavailable";
    readonly decision?: Readonly<JobsDecision>;
    readonly changedAssignments: readonly Readonly<JobsAssignment>[];
    readonly availabilityProvenance:
      "observed" | "hypothetical" | "unavailable";
    readonly exceedsFarmerSmartMaximum: boolean;
    readonly workerCommitmentsPreserved: boolean;
    readonly workerCommitmentsEvidenceStatus:
      "complete" | "assumed-empty" | "unavailable";
    readonly reasons: readonly string[];
  }>;
  readonly executionAuthority: "none";
}

export type EconomicDependencyStatus =
  "observed" | "provisional" | "blocked" | "unavailable";

export type EconomicMissingCapability =
  | "Construction coordination"
  | "Gather authorization"
  | "Jobs allocation"
  | "native observation"
  | null;

export interface EconomicCrossOwnerDependencyInput {
  readonly lineageId: string;
  readonly materialAcquisition: Readonly<{
    readonly status: EconomicDependencyStatus;
    readonly evidenceId: string;
    readonly snapshotId: string;
    readonly validityEpoch: string;
    readonly testOnly: boolean;
    readonly targetId: string;
    readonly lineageId: string;
    readonly period: number;
  }>;
  readonly resourceCoordination: Readonly<EconomicResourceCoordinationInput>;
  readonly constructionOffer: Readonly<{
    readonly offerObserved: boolean;
    readonly completePriceObserved: boolean;
    readonly purchaseAuthorityObserved: boolean;
    readonly evidenceId: string;
    readonly snapshotId: string;
    readonly validityEpoch: string;
    readonly lineageId: string;
    readonly period: number;
    readonly targetId: string;
  }>;
  readonly housingPopulation: Readonly<{
    readonly snapshotId: string;
    readonly lineageId: string;
    readonly period: number;
    readonly validityEpoch: string;
    readonly evidenceId: string;
    readonly population: number;
    readonly capacity: number;
    readonly retainAllResidents: boolean;
  }>;
  readonly jobs: Readonly<SustainableJobsPlanResult>;
  readonly stoneProduction: Readonly<{
    readonly snapshotId: string;
    readonly lineageId: string;
    readonly period: number;
    readonly validityEpoch: string;
    readonly provenance: "native-observation" | "hypothetical" | "unavailable";
    readonly evidenceId: string;
    readonly amountPerTick: number | null;
  }>;
  readonly goalGraph: Readonly<{
    readonly snapshotId: string;
    readonly lineageId: string;
    readonly period: number;
    readonly validityEpoch: string;
    readonly objectiveStatus: "satisfied" | "unsatisfied" | "unavailable";
    readonly positiveStoneStatus: "satisfied" | "unsatisfied" | "unavailable";
    readonly evidenceId: string;
  }>;
}

export interface EconomicCrossOwnerDependencyAssessment {
  readonly requirements: Readonly<{
    readonly authorizedMaterialAcquisition: Readonly<{
      readonly status: EconomicDependencyStatus;
      readonly reason: string;
      readonly evidenceId: string | null;
    }>;
    readonly compatibleResourceCommitment: Readonly<{
      readonly status: EconomicDependencyStatus;
      readonly reason: string;
      readonly evidenceId: string | null;
    }>;
    readonly currentQuarryOfferAndPurchaseAuthority: Readonly<{
      readonly status: EconomicDependencyStatus;
      readonly reason: string;
      readonly evidenceId: string | null;
    }>;
    readonly sufficientHousingAndPopulation: Readonly<{
      readonly status: EconomicDependencyStatus;
      readonly reason: string;
      readonly evidenceId: string | null;
    }>;
    readonly sustainableJobsAssignment: Readonly<{
      readonly status: EconomicDependencyStatus;
      readonly reason: string;
      readonly evidenceId: string | null;
    }>;
    readonly positiveStoneProductionObserved: Readonly<{
      readonly status: EconomicDependencyStatus;
      readonly reason: string;
      readonly evidenceId: string | null;
    }>;
  }>;
  readonly objectiveStatus: "satisfied" | "unsatisfied" | "unavailable";
  readonly firstMissingCapability: EconomicMissingCapability;
  readonly executionAuthority: "none";
}

/** Joins resource, Construction, housing, Jobs and observed-production evidence. */
export function assessEconomicCrossOwnerDependencies(
  input: Readonly<EconomicCrossOwnerDependencyInput>,
): Readonly<EconomicCrossOwnerDependencyAssessment> {
  const resourceAssessment = assessEconomicResourceCoordination(
    input.resourceCoordination,
  );
  const resourcePeriod = input.resourceCoordination.currentEpoch.period;
  const lineageIsCurrent =
    isNonemptyString(input.lineageId) &&
    input.resourceCoordination.currentEpoch.lineageId === input.lineageId;
  const resourceStageIsCurrent =
    lineageIsCurrent && Number.isSafeInteger(resourcePeriod);
  const acquisitionJoined =
    resourceStageIsCurrent &&
    input.materialAcquisition.snapshotId ===
      input.resourceCoordination.currentEpoch.snapshotId &&
    input.materialAcquisition.validityEpoch ===
      input.resourceCoordination.currentEpoch.validityEpoch &&
    input.materialAcquisition.targetId ===
      input.resourceCoordination.goal.targetId &&
    input.materialAcquisition.lineageId === input.lineageId &&
    input.materialAcquisition.period === resourcePeriod;
  const acquisitionStatus: EconomicDependencyStatus =
    !isNonemptyString(input.materialAcquisition.evidenceId) ||
    !acquisitionJoined
      ? "unavailable"
      : input.materialAcquisition.testOnly &&
          input.materialAcquisition.status === "observed"
        ? "provisional"
        : input.materialAcquisition.status;
  const resourceStatus: EconomicDependencyStatus = !resourceStageIsCurrent
    ? "unavailable"
    : resourceAssessment.status === "enforceable"
      ? "observed"
      : resourceAssessment.status === "proposed"
        ? "provisional"
        : resourceAssessment.status === "conflict" ||
            resourceAssessment.status === "unreserved"
          ? "blocked"
          : "unavailable";
  const offerJoined =
    resourceStageIsCurrent &&
    input.constructionOffer.snapshotId ===
      input.resourceCoordination.currentEpoch.snapshotId &&
    input.constructionOffer.validityEpoch ===
      input.resourceCoordination.currentEpoch.validityEpoch &&
    input.constructionOffer.targetId ===
      input.resourceCoordination.currentTarget.targetId &&
    input.constructionOffer.targetId ===
      input.resourceCoordination.goal.targetId &&
    input.constructionOffer.lineageId === input.lineageId &&
    input.constructionOffer.period === resourcePeriod;
  const offerStatus: EconomicDependencyStatus =
    !isNonemptyString(input.constructionOffer.evidenceId) || !offerJoined
      ? "unavailable"
      : input.constructionOffer.offerObserved &&
          input.constructionOffer.completePriceObserved &&
          input.constructionOffer.purchaseAuthorityObserved
        ? "observed"
        : input.constructionOffer.offerObserved &&
            input.constructionOffer.completePriceObserved
          ? "provisional"
          : "unavailable";
  const housingJoinedToJobs =
    input.housingPopulation.lineageId === input.lineageId &&
    input.housingPopulation.snapshotId === input.jobs.snapshotId &&
    input.housingPopulation.period === input.jobs.period &&
    input.housingPopulation.validityEpoch === input.jobs.validityEpoch &&
    input.housingPopulation.period <= resourcePeriod &&
    input.jobs.period <= resourcePeriod &&
    input.jobs.lineageId === input.lineageId;
  const housed =
    isNonemptyString(input.housingPopulation.snapshotId) &&
    Number.isSafeInteger(input.housingPopulation.period) &&
    isNonemptyString(input.housingPopulation.validityEpoch) &&
    isNonemptyString(input.housingPopulation.evidenceId) &&
    housingJoinedToJobs &&
    isWholeNonnegative(input.housingPopulation.population) &&
    isWholeNonnegative(input.housingPopulation.capacity) &&
    input.housingPopulation.population > 0 &&
    input.housingPopulation.population <= input.housingPopulation.capacity &&
    input.housingPopulation.retainAllResidents;
  const housingStatus: EconomicDependencyStatus = housed
    ? "observed"
    : !isNonemptyString(input.housingPopulation.snapshotId) ||
        !isNonemptyString(input.housingPopulation.evidenceId) ||
        !housingJoinedToJobs
      ? "unavailable"
      : "blocked";
  const observedProductiveAssignment =
    input.jobs.status !== "unavailable" &&
    input.jobs.lineageId === input.lineageId &&
    input.jobs.period <= resourcePeriod &&
    input.jobs.productiveJob.availabilityProvenance === "observed" &&
    input.jobs.productiveJob.unlocked &&
    input.jobs.productiveJob.managed &&
    (input.jobs.productiveJob.currentWorkers ?? 0) > 0 &&
    input.jobs.food.status === "feasible" &&
    (input.jobs.food.currentNetFood ?? 0) > 0;
  const jobsStageIsCurrent =
    input.jobs.status !== "unavailable" &&
    input.jobs.lineageId === input.lineageId &&
    Number.isSafeInteger(input.jobs.period) &&
    input.jobs.period <= resourcePeriod;
  const jobsStatus: EconomicDependencyStatus = !jobsStageIsCurrent
    ? "unavailable"
    : observedProductiveAssignment
      ? "observed"
      : input.jobs.constrainedAlternative?.status === "feasible" ||
          input.jobs.constrainedAlternative?.status === "conditional" ||
          input.jobs.productiveJob.availabilityProvenance === "hypothetical"
        ? "provisional"
        : input.jobs.productiveJob.availabilityProvenance === "unavailable"
          ? "unavailable"
          : input.jobs.status === "conflict" ||
              input.jobs.productiveJob.availabilityProvenance === "observed"
            ? "blocked"
            : "unavailable";
  const stoneJoinedToGoalGraph =
    resourceStageIsCurrent &&
    input.stoneProduction.lineageId === input.lineageId &&
    input.goalGraph.lineageId === input.lineageId &&
    input.stoneProduction.snapshotId === input.goalGraph.snapshotId &&
    input.stoneProduction.period === input.goalGraph.period &&
    input.stoneProduction.validityEpoch === input.goalGraph.validityEpoch &&
    input.stoneProduction.period >= resourcePeriod;
  const positiveStoneObserved =
    isNonemptyString(input.stoneProduction.snapshotId) &&
    Number.isSafeInteger(input.stoneProduction.period) &&
    isNonemptyString(input.stoneProduction.validityEpoch) &&
    isNonemptyString(input.stoneProduction.evidenceId) &&
    stoneJoinedToGoalGraph &&
    input.stoneProduction.provenance !== "unavailable" &&
    input.stoneProduction.amountPerTick !== null &&
    Number.isFinite(input.stoneProduction.amountPerTick);
  const stoneStatus: EconomicDependencyStatus = positiveStoneObserved
    ? input.stoneProduction.amountPerTick! > 0
      ? input.stoneProduction.provenance === "native-observation"
        ? "observed"
        : "provisional"
      : "blocked"
    : "unavailable";
  const allRequirements = [
    acquisitionStatus,
    resourceStatus,
    offerStatus,
    housingStatus,
    jobsStatus,
    stoneStatus,
  ];
  const allObserved = allRequirements.every((status) => status === "observed");
  const graphEvidenceCurrent =
    stoneJoinedToGoalGraph &&
    isNonemptyString(input.goalGraph.snapshotId) &&
    isNonemptyString(input.goalGraph.validityEpoch) &&
    Number.isSafeInteger(input.goalGraph.period) &&
    isNonemptyString(input.goalGraph.evidenceId);
  const objectiveStatus =
    allObserved &&
    graphEvidenceCurrent &&
    input.goalGraph.objectiveStatus === "satisfied" &&
    input.goalGraph.positiveStoneStatus === "satisfied"
      ? "satisfied"
      : !graphEvidenceCurrent ||
          input.goalGraph.objectiveStatus === "unavailable" ||
          input.goalGraph.positiveStoneStatus === "unavailable"
        ? "unavailable"
        : "unsatisfied";

  let firstMissingCapability: EconomicMissingCapability = null;
  if (resourceAssessment.status === "conflict") {
    firstMissingCapability = "Construction coordination";
  } else if (resourceStatus !== "observed") {
    firstMissingCapability = "Construction coordination";
  } else if (acquisitionStatus !== "observed") {
    firstMissingCapability = "Gather authorization";
  } else if (offerStatus !== "observed") {
    firstMissingCapability = "native observation";
  } else if (housingStatus !== "observed") {
    firstMissingCapability = "native observation";
  } else if (jobsStatus !== "observed") {
    firstMissingCapability = "Jobs allocation";
  } else if (stoneStatus !== "observed") {
    firstMissingCapability = "native observation";
  }

  const evidence = (evidenceId: string): string | null =>
    isNonemptyString(evidenceId) ? evidenceId : null;
  return Object.freeze({
    requirements: Object.freeze({
      authorizedMaterialAcquisition: Object.freeze({
        status: acquisitionStatus,
        reason: input.materialAcquisition.testOnly
          ? "P38's separate Gather authorization was test-only and does not authorize a production continuation"
          : input.materialAcquisition.status === "observed"
            ? "a current authorized material-acquisition path was independently observed"
            : "a current authorized material-acquisition path is not established",
        evidenceId: evidence(input.materialAcquisition.evidenceId),
      }),
      compatibleResourceCommitment: Object.freeze({
        status: resourceStatus,
        reason:
          resourceAssessment.status === "conflict"
            ? "the observed native purchase conflicts with the proposed reserve, and no supported Construction owner contract was demonstrated"
            : resourceAssessment.status === "enforceable"
              ? "an independently demonstrated supported owner contract protects the target-specific reserve"
              : "a target-specific reserve has not been established as compatible with all competing spending",
        evidenceId: evidence(
          resourceAssessment.proposal?.owner.evidenceId ?? "",
        ),
      }),
      currentQuarryOfferAndPurchaseAuthority: Object.freeze({
        status: offerStatus,
        reason:
          offerStatus === "observed"
            ? "the current Quarry offer, complete price and native purchase authority are observed in the same capture"
            : input.constructionOffer.offerObserved &&
                input.constructionOffer.completePriceObserved
              ? "the current offer and price were observed, but independent purchase authority was not established"
              : "a current Quarry offer and complete price are unavailable",
        evidenceId: evidence(input.constructionOffer.evidenceId),
      }),
      sufficientHousingAndPopulation: Object.freeze({
        status: housingStatus,
        reason: housed
          ? `${input.housingPopulation.population} residents are housed and retained in the captured snapshot`
          : "current housing, population or resident-retention evidence is incomplete or insufficient",
        evidenceId: evidence(input.housingPopulation.evidenceId),
      }),
      sustainableJobsAssignment: Object.freeze({
        status: jobsStatus,
        reason: observedProductiveAssignment
          ? "the same-cycle native Quarry Worker assignment and positive Food margin are observed"
          : input.jobs.constrainedAlternative?.status === "feasible" ||
              input.jobs.constrainedAlternative?.status === "conditional"
            ? "a constrained plan preserves Food, population, native limits and worker commitments, but its assignment still requires owner authorization"
            : input.jobs.productiveJob.availabilityProvenance === "unavailable"
              ? "the current native productive job row or assignment evidence is unavailable"
              : "no supported sustainable Jobs assignment is established",
        evidenceId: evidence(input.jobs.snapshotId),
      }),
      positiveStoneProductionObserved: Object.freeze({
        status: stoneStatus,
        reason:
          stoneStatus === "observed"
            ? "positive Stone production is present in a matching native observation"
            : stoneStatus === "provisional"
              ? "positive Stone output is hypothetical and cannot satisfy the observed-production goal"
              : positiveStoneObserved
                ? "matching Stone evidence reports no positive production"
                : "a current native Stone-production observation is unavailable",
        evidenceId: evidence(input.stoneProduction.evidenceId),
      }),
    }),
    objectiveStatus,
    firstMissingCapability,
    executionAuthority: "none",
  });
}

function jobsPopulationIsRetained(
  assignments: readonly Readonly<JobsAssignment>[],
  population: number,
): boolean {
  return (
    assignments.reduce(
      (total, assignment) => total + assignment.workers + assignment.servants,
      0,
    ) === population
  );
}

function assignmentsForDecision(
  decision: Readonly<JobsDecision>,
): Map<number, JobsAssignment> {
  return new Map(
    decision.assignments.map((assignment) => [assignment.jobToken, assignment]),
  );
}

function productiveJobEvidence(
  input: Readonly<SustainableJobsInput>,
  currentEvidenceIsValid: boolean,
): SustainableJobsPlanResult["productiveJob"] {
  const job = input.plannerInput.jobs.find(
    (entry) => entry.id === input.productionJobId,
  );
  const currentWorkers =
    job !== undefined && isWholeNonnegative(job.workers) ? job.workers : null;
  const available =
    currentEvidenceIsValid &&
    job !== undefined &&
    job.unlocked &&
    job.managed &&
    input.availabilityProvenance !== "unavailable";
  return Object.freeze({
    id: input.productionJobId,
    availabilityProvenance: available
      ? input.availabilityProvenance
      : "unavailable",
    unlocked: job?.unlocked ?? false,
    managed: job?.managed ?? false,
    currentWorkers,
  });
}

function jobsAssignmentsMeetConstraints(
  assignments: readonly Readonly<JobsAssignment>[],
  input: Readonly<JobsCycleInput>,
  minimumByJobId: Readonly<Record<string, number>>,
): boolean {
  const jobsByToken = new Map(input.jobs.map((job) => [job.token, job]));
  const defaultJob = input.jobs.find(
    (job) => job.token === input.defaultJobToken,
  );
  const assignmentsByToken = new Map(
    assignments.map((assignment) => [assignment.jobToken, assignment]),
  );
  if (
    assignments.length !== input.jobs.length ||
    assignmentsByToken.size !== assignments.length ||
    input.jobs.some((job) => !assignmentsByToken.has(job.token))
  ) {
    return false;
  }
  for (const assignment of assignments) {
    const job = jobsByToken.get(assignment.jobToken);
    if (
      job === undefined ||
      !isWholeNonnegative(assignment.workers) ||
      !isWholeNonnegative(assignment.servants) ||
      ((!job.unlocked || !job.serves) && assignment.servants > 0) ||
      (!job.unlocked && assignment.workers > 0)
    ) {
      return false;
    }
    const minimum = Math.max(
      job.kind === "farmer" ? (job.farmerMinimum ?? 0) : 0,
      job.storageBackedMinimum ?? 0,
      minimumByJobId[job.id] ?? 0,
    );
    const effectiveEmployees =
      assignment.workers + assignment.servants * input.servantModifier;
    if (
      defaultJob?.token === assignment.jobToken &&
      assignment.workers < input.minimumDefault
    ) {
      return false;
    }
    if (
      assignment.workers < minimum ||
      !hasSufficientGoalCapacity(job.maximum, effectiveEmployees)
    ) {
      return false;
    }
  }
  return Object.entries(minimumByJobId).every(([jobId, minimum]) => {
    const job = input.jobs.find((entry) => entry.id === jobId);
    const assignment =
      job === undefined ? undefined : assignmentsByToken.get(job.token);
    return (
      isWholeNonnegative(minimum) &&
      job !== undefined &&
      assignment !== undefined &&
      assignment.workers >= minimum
    );
  });
}

/** Compares ordinary Jobs with a diagnostic Farmer-floor alternative. */
export function compareSustainableJobsPlan(
  input: Readonly<SustainableJobsInput>,
): Readonly<SustainableJobsPlanResult> {
  const workerCommitmentEvidenceIsCurrent =
    input.workerCommitments.snapshotId === input.snapshotId &&
    input.workerCommitments.period === input.period &&
    input.workerCommitments.validityEpoch === input.validityEpoch &&
    input.workerCommitments.lineageId === input.lineageId &&
    input.ownerWorkCycles !== null &&
    typeof input.ownerWorkCycles === "object" &&
    isNonemptyString(input.workerCommitments.ownerId) &&
    isNonemptyString(input.workerCommitments.workCycleId) &&
    input.ownerWorkCycles[input.workerCommitments.ownerId] ===
      input.workerCommitments.workCycleId &&
    input.ownerWorkCycles[input.plannerEvidence.ownerId] ===
      input.plannerEvidence.workCycleId &&
    (input.workerCommitments.workCycleProvenance === "native-captured" ||
      input.workerCommitments.workCycleProvenance ===
        "normalized-from-captured-period") &&
    (input.workerCommitments.evidenceStatus !== "complete" ||
      input.workerCommitments.workCycleProvenance === "native-captured");
  const unavailable = (
    reason: string,
    food: Readonly<SustainableFoodAssessment> = Object.freeze({
      status: "unavailable",
      reasons: Object.freeze([reason]),
    }),
    ordinaryProposal?: Readonly<JobsDecision>,
  ): Readonly<SustainableJobsPlanResult> =>
    Object.freeze({
      status: "unavailable",
      snapshotId: input.snapshotId,
      period: input.period,
      validityEpoch: input.validityEpoch,
      lineageId: input.lineageId,
      productiveJob: productiveJobEvidence(input, false),
      ...(ordinaryProposal === undefined ? {} : { ordinaryProposal }),
      food,
      executionAuthority: "none",
    });

  if (
    !isNonemptyString(input.snapshotId) ||
    !Number.isSafeInteger(input.period) ||
    !isNonemptyString(input.validityEpoch) ||
    input.snapshotId !== input.foodObservation.snapshotId ||
    input.period !== input.foodObservation.period ||
    !isNonemptyString(input.lineageId) ||
    input.lineageId !== input.foodObservation.lineageId ||
    input.validityEpoch !== input.foodObservation.validityEpoch ||
    input.plannerEvidence.snapshotId !== input.snapshotId ||
    input.plannerEvidence.period !== input.period ||
    input.plannerEvidence.lineageId !== input.lineageId ||
    input.plannerEvidence.validityEpoch !== input.validityEpoch ||
    !isNonemptyString(input.plannerEvidence.ownerId) ||
    !isNonemptyString(input.plannerEvidence.workCycleId) ||
    (input.plannerEvidence.workCycleProvenance !== "native-captured" &&
      input.plannerEvidence.workCycleProvenance !==
        "normalized-from-captured-period") ||
    !isNonemptyString(input.plannerEvidence.evidenceId) ||
    input.plannerEvidence.input !== input.plannerInput ||
    input.plannerInput.population !== input.foodObservation.population ||
    !Number.isFinite(input.plannerInput.servantModifier) ||
    input.plannerInput.servantModifier <= 0 ||
    !input.plannerInput.available ||
    !isWholeNonnegative(input.plannerInput.minimumDefault) ||
    !isWholeNonnegative(input.plannerInput.population) ||
    input.workerCommitments.evidenceStatus === "unavailable" ||
    !workerCommitmentEvidenceIsCurrent ||
    !isNonemptyString(input.workerCommitments.evidenceId) ||
    input.workerCommitments.minimumByJobId === null ||
    typeof input.workerCommitments.minimumByJobId !== "object"
  ) {
    return unavailable("Jobs or same-cycle Food evidence is missing or stale");
  }
  const farmer = input.plannerInput.jobs.find((job) => job.kind === "farmer");
  if (farmer === undefined)
    return unavailable("the captured Farmer row is missing");
  if (
    farmer.servants !== 0 ||
    farmer.workers !== input.foodObservation.farmers
  ) {
    return unavailable(
      "the captured Farmer workers do not match the same-cycle Food evidence or include unsupported Farmer servants",
    );
  }
  const productiveJob = productiveJobEvidence(input, true);
  const food = assessSustainableFoodMinimum(
    input.foodObservation,
    input.foodFormula,
    farmer.farmerMinimum ?? 0,
  );
  const ordinaryProposal = planJobs(input.plannerInput);
  if (ordinaryProposal === null) {
    return unavailable("ordinary Jobs planning is unavailable", food);
  }
  const fixedMinimum = input.workerCommitments.minimumByJobId;
  if (
    !jobsAssignmentsMeetConstraints(
      ordinaryProposal.assignments,
      input.plannerInput,
      fixedMinimum,
    )
  ) {
    return unavailable(
      "ordinary Jobs proposal violates native job constraints or worker commitments",
      food,
      ordinaryProposal,
    );
  }
  if (
    food.status !== "feasible" ||
    food.minimumFarmers === undefined ||
    !jobsPopulationIsRetained(
      ordinaryProposal.assignments,
      input.plannerInput.population,
    )
  ) {
    return unavailable(
      food.status === "feasible"
        ? "ordinary Jobs proposal does not retain the captured population"
        : "native Food feasibility is unavailable or infeasible",
      food,
      ordinaryProposal,
    );
  }
  const ordinaryAssignments = assignmentsForDecision(ordinaryProposal);
  const ordinaryFarmerCount =
    ordinaryAssignments.get(farmer.token)?.workers ?? 0;
  const ordinaryFoodOutput = calculateNativeFarmerFood(
    input.foodFormula,
    input.foodObservation.farmCount,
    ordinaryFarmerCount,
  );
  const ordinaryNetFood =
    ordinaryFoodOutput - input.foodObservation.foodConsumption;
  const ordinarySustainable = ordinaryNetFood > 0;
  const ordinaryFood = Object.freeze({
    farmerCount: ordinaryFarmerCount,
    foodOutput: ordinaryFoodOutput,
    foodConsumption: input.foodObservation.foodConsumption,
    netFood: ordinaryNetFood,
    sustainable: ordinarySustainable,
  });
  if (ordinarySustainable) {
    return Object.freeze({
      status: "sustainable",
      snapshotId: input.snapshotId,
      period: input.period,
      validityEpoch: input.validityEpoch,
      lineageId: input.lineageId,
      productiveJob,
      ordinaryProposal,
      food,
      ordinaryFood,
      executionAuthority: "none",
    });
  }

  const target = input.plannerInput.jobs.find(
    (job) => job.id === input.productionJobId,
  );
  if (
    target === undefined ||
    !target.unlocked ||
    !target.managed ||
    input.availabilityProvenance === "unavailable"
  ) {
    return Object.freeze({
      status: "conflict",
      snapshotId: input.snapshotId,
      period: input.period,
      validityEpoch: input.validityEpoch,
      lineageId: input.lineageId,
      productiveJob,
      ordinaryProposal,
      food,
      ordinaryFood,
      constrainedAlternative: Object.freeze({
        status: "unavailable",
        changedAssignments: Object.freeze([]),
        availabilityProvenance: input.availabilityProvenance,
        exceedsFarmerSmartMaximum: false,
        workerCommitmentsPreserved: false,
        workerCommitmentsEvidenceStatus: input.workerCommitments.evidenceStatus,
        reasons: Object.freeze([
          input.availabilityProvenance === "unavailable"
            ? "the productive job controls are unavailable"
            : "the productive job has no captured unlocked and managed row",
        ]),
      }),
      executionAuthority: "none",
    });
  }

  const targetAssignment = ordinaryAssignments.get(target.token);
  const farmerAssignment = ordinaryAssignments.get(farmer.token);
  if (targetAssignment === undefined || farmerAssignment === undefined) {
    return unavailable(
      "ordinary Jobs assignments do not contain both constrained rows",
      food,
      ordinaryProposal,
    );
  }
  const farmerMinimum = Math.max(
    farmer.farmerMinimum ?? 0,
    farmer.storageBackedMinimum ?? 0,
    fixedMinimum[farmer.id] ?? 0,
    food.minimumFarmers,
  );
  const workersToTransfer = Math.max(
    0,
    farmerMinimum - farmerAssignment.workers,
  );
  const targetAfterTransfer = targetAssignment.workers - workersToTransfer;
  const fixedTargetMinimum = Math.max(
    target.storageBackedMinimum ?? 0,
    fixedMinimum[target.id] ?? 0,
  );
  const nextAssignments = ordinaryProposal.assignments.map((assignment) => {
    if (assignment.jobToken === farmer.token) {
      return Object.freeze({
        ...assignment,
        workers: assignment.workers + workersToTransfer,
      });
    }
    if (assignment.jobToken === target.token) {
      return Object.freeze({ ...assignment, workers: targetAfterTransfer });
    }
    return assignment;
  });
  const validRows = jobsAssignmentsMeetConstraints(
    nextAssignments,
    input.plannerInput,
    fixedMinimum,
  );
  const suppliedCommitmentsPreserved =
    targetAfterTransfer >= fixedTargetMinimum &&
    Object.entries(fixedMinimum).every(([jobId, minimum]) => {
      const job = input.plannerInput.jobs.find((entry) => entry.id === jobId);
      const next =
        job === undefined
          ? undefined
          : nextAssignments.find((entry) => entry.jobToken === job.token);
      return job !== undefined && next !== undefined && next.workers >= minimum;
    });
  const alternativeOutput = calculateNativeFarmerFood(
    input.foodFormula,
    input.foodObservation.farmCount,
    farmerMinimum,
  );
  const alternativeNetFood =
    alternativeOutput - input.foodObservation.foodConsumption;
  const validAlternative =
    workersToTransfer > 0 &&
    targetAfterTransfer >= 0 &&
    validRows &&
    suppliedCommitmentsPreserved &&
    jobsPopulationIsRetained(nextAssignments, input.plannerInput.population) &&
    alternativeNetFood > 0;
  const changedAssignments = Object.freeze(
    nextAssignments.filter((assignment) => {
      const previous = ordinaryAssignments.get(assignment.jobToken);
      return previous?.workers !== assignment.workers;
    }),
  );
  const exceedsFarmerSmartMaximum =
    farmer.smartMaximum !== null && farmerMinimum > farmer.smartMaximum;
  const alternativeStatus = !validAlternative
    ? "unavailable"
    : input.workerCommitments.evidenceStatus === "complete"
      ? "feasible"
      : "conditional";
  const alternative = Object.freeze({
    status: alternativeStatus,
    ...(validAlternative
      ? {
          decision: Object.freeze({
            ...ordinaryProposal,
            assignments: Object.freeze(nextAssignments),
            lastFarmerCount: farmerMinimum,
          }),
        }
      : {}),
    changedAssignments,
    availabilityProvenance: input.availabilityProvenance,
    exceedsFarmerSmartMaximum,
    workerCommitmentsPreserved:
      input.workerCommitments.evidenceStatus === "complete" &&
      suppliedCommitmentsPreserved,
    workerCommitmentsEvidenceStatus: input.workerCommitments.evidenceStatus,
    reasons: Object.freeze(
      alternativeStatus === "feasible"
        ? [
            "workers move from the productive target to Farmer while retaining all residents and other assignments",
            ...(exceedsFarmerSmartMaximum
              ? [
                  "the Farmer count exceeds the ordinary planner smart maximum and requires separate owner authorization",
                ]
              : []),
            ...(input.availabilityProvenance === "hypothetical"
              ? ["the productive job row is hypothetical, not a live control"]
              : []),
          ]
        : alternativeStatus === "conditional"
          ? [
              "the assignment is feasible only under the assumed empty worker-commitment set; P38 did not capture a separate commitment registry",
              ...(exceedsFarmerSmartMaximum
                ? [
                    "the Farmer count exceeds the ordinary planner smart maximum and requires separate owner authorization",
                  ]
                : []),
              ...(input.availabilityProvenance === "hypothetical"
                ? ["the productive job row is hypothetical, not a live control"]
                : []),
            ]
          : [
              "capacity, native minima, worker commitments, population, or positive Food margin prevents this transfer",
            ],
    ),
  });
  return Object.freeze({
    status: "conflict",
    snapshotId: input.snapshotId,
    period: input.period,
    validityEpoch: input.validityEpoch,
    lineageId: input.lineageId,
    productiveJob,
    ordinaryProposal,
    food,
    ordinaryFood,
    constrainedAlternative: alternative,
    executionAuthority: "none",
  });
}
