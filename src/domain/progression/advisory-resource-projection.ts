import {
  compareGoalStrategies,
  evaluateGoalFeasibility,
  type GoalFeasibility,
  type GoalResourceCommitment,
  type GoalResourceStock,
  type GoalStrategyCandidate,
} from "../economy/goal-feasibility.ts";
import type {
  AdvisoryResearchCandidate,
  AdvisoryResearchRoutePlan,
} from "./research-advisory-routes.ts";

export interface AdvisoryResourceObservation {
  readonly resourceId: string;
  readonly amount: number | undefined;
  readonly capacity: number | undefined;
  readonly netRate: number | undefined;
  readonly rateConfidence: GoalResourceStock["rateConfidence"];
  readonly validityEpoch: string;
}

export interface AdvisoryResourceOfferPrice {
  readonly actionId: string;
  readonly price:
    readonly Readonly<{ resourceId: string; amount: number }>[] | null;
}

export interface AdvisoryResourceProjectionInput {
  readonly routes: Readonly<AdvisoryResearchRoutePlan>;
  readonly prices: readonly AdvisoryResourceOfferPrice[];
  readonly observations: readonly AdvisoryResourceObservation[] | undefined;
  readonly commitments: readonly GoalResourceCommitment[];
  readonly commitmentsKnown: boolean;
  readonly validityEpoch: string;
  readonly mandatoryEvidence: "complete" | "partial" | "unavailable";
  readonly mandatoryActionIds: readonly string[];
  readonly interventionsByActionId?: ReadonlyMap<
    string,
    readonly GoalStrategyCandidate[]
  >;
}

export interface AdvisoryCandidateResourceEvidence {
  readonly actionId: string;
  readonly nativeOffer: Readonly<AdvisoryResourceOfferPrice> | undefined;
  readonly nativeAffordability: "affordable" | "unaffordable";
  readonly requirements: readonly Readonly<{
    readonly resourceId: string;
    readonly required: number;
    readonly holding: number | undefined;
    readonly capacity: number | undefined;
    readonly observedNetRate: number | undefined;
    readonly rateConfidence: GoalResourceStock["rateConfidence"] | undefined;
    readonly missingAuthority: readonly string[];
    readonly knownCommitment: number;
    readonly externalCommitments: "complete" | "unknown";
    readonly capacityConstraint: "below-price" | "sufficient" | "unknown";
    readonly affordabilityConstraint: "shortfall" | "covered" | "unknown";
    readonly bottleneck: boolean;
  }>[];
  readonly currentAffordability: Readonly<GoalFeasibility> | undefined;
  readonly estimatedTimeToAfford: Readonly<{
    readonly validated: number | undefined;
    readonly diagnostic: number | undefined;
    readonly authority: GoalFeasibility["authority"] | "unavailable";
  }>;
  readonly routePotentialNeeds: readonly Readonly<{
    readonly actionId: string;
    readonly currentNativeOfferPrice:
      AdvisoryResourceOfferPrice["price"] | undefined;
    readonly priceStatus: "currently-offered" | "not-currently-offered";
  }>[];
  readonly orAlternativePotentialNeeds: readonly Readonly<{
    readonly requirementId: string;
    readonly alternatives: readonly Readonly<{
      readonly actionId: string;
      readonly currentNativeOfferPrice:
        AdvisoryResourceOfferPrice["price"] | undefined;
      readonly priceStatus: "currently-offered" | "not-currently-offered";
    }>[];
  }>[];
  readonly routeEvidence: AdvisoryResearchCandidate["routeEvidence"];
  readonly advancesRequirements: AdvisoryResearchCandidate["dependencyWitness"]["advancesRequirements"];
  readonly remainingRequirements: AdvisoryResearchCandidate["dependencyWitness"]["remainingRequirements"];
  readonly excludedBranches: readonly string[];
  readonly conditionalFutureEligibility: readonly string[];
  readonly interventionComparison: Readonly<{
    readonly status: "available" | "partial" | "unavailable";
    readonly evidence: ReturnType<typeof compareGoalStrategies> | undefined;
    readonly reasons: readonly string[];
  }>;
}

export interface AdvisoryResourceProjection {
  readonly status: "available" | "partial" | "unavailable";
  readonly candidates: readonly Readonly<AdvisoryCandidateResourceEvidence>[];
  readonly mandatoryGoalNeeds: Readonly<{
    readonly evidence: AdvisoryResourceProjectionInput["mandatoryEvidence"];
    readonly actionIds: readonly string[];
    readonly actionPrices: readonly Readonly<{
      readonly actionId: string;
      readonly price: AdvisoryResourceOfferPrice["price"] | undefined;
    }>[];
    readonly status: "established" | "incomplete" | "none-established";
    readonly reasons: readonly string[];
  }>;
  readonly comparisons: readonly Readonly<{
    readonly lessExpensiveActionId: string;
    readonly moreExpensiveActionId: string;
    readonly dimension: "current-native-price-component-dominance";
    readonly resourceIds: readonly string[];
  }>[];
  readonly affordabilityComparisons: readonly Readonly<{
    readonly feasibleActionId: string;
    readonly infeasibleActionId: string;
    readonly dimension: "known-current-affordability";
  }>[];
  readonly commitments: Readonly<{
    readonly known: boolean;
    readonly observations: readonly GoalResourceCommitment[];
    readonly unknownExternalCommitments: boolean;
  }>;
  readonly validityEpoch: string;
  readonly reasons: readonly string[];
}

const validAmount = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0;

/** Joins route witnesses to the existing captured price and resource observations. */
export function projectAdvisoryResearchResources(
  input: Readonly<AdvisoryResourceProjectionInput>,
): Readonly<AdvisoryResourceProjection> {
  const prices = new Map(input.prices.map((offer) => [offer.actionId, offer]));
  const observations = new Map(
    (input.observations ?? []).map((observation) => [
      observation.resourceId,
      observation,
    ]),
  );
  const stocks: GoalResourceStock[] = [...observations.values()].flatMap(
    (observation) =>
      validAmount(observation.amount) &&
      observation.capacity !== undefined &&
      Number.isFinite(observation.capacity) &&
      observation.netRate !== undefined &&
      Number.isFinite(observation.netRate)
        ? [
            {
              resourceId: observation.resourceId,
              poolId: "anywhere",
              amount: observation.amount!,
              capacity: observation.capacity,
              netRate: observation.netRate,
              rateConfidence: observation.rateConfidence,
              validityEpoch: observation.validityEpoch,
            },
          ]
        : [],
  );
  const reasons =
    input.observations === undefined
      ? ["current resource observations are unavailable"]
      : [];
  if (!input.commitmentsKnown)
    reasons.push("external spending-owner commitments are incomplete");

  const candidates = input.routes.candidates.map((candidate) => {
    const nativeOffer = prices.get(candidate.actionId);
    const needs = nativeOffer?.price?.map((entry) => ({
      resourceId: entry.resourceId,
      poolId: "anywhere",
      amount: entry.amount,
    }));
    const feasibility =
      needs === undefined || input.observations === undefined
        ? undefined
        : evaluateGoalFeasibility(
            candidate.actionId,
            needs,
            stocks,
            input.commitments,
            input.validityEpoch,
            input.commitmentsKnown,
          );
    const requirements = (nativeOffer?.price ?? []).map((price) => {
      const observed = observations.get(price.resourceId);
      const knownCommitment = input.commitments
        .filter((item) => item.resourceId === price.resourceId)
        .reduce((sum, item) => sum + item.amount, 0);
      const missingAuthority = [
        ...(observed === undefined ? ["resource-observation"] : []),
        ...(observed?.amount === undefined || !Number.isFinite(observed.amount)
          ? ["holdings"]
          : []),
        ...(observed?.capacity === undefined ||
        !Number.isFinite(observed.capacity)
          ? ["capacity"]
          : []),
        ...(observed?.netRate === undefined ||
        !Number.isFinite(observed.netRate)
          ? ["production-or-consumption-rate"]
          : []),
      ];
      const amount = observed?.amount;
      const cap = observed?.capacity;
      const reserved = knownCommitment;
      const shortfall = validAmount(amount)
        ? price.amount + reserved > amount
        : undefined;
      const capacityConstraint =
        cap === undefined || !Number.isFinite(cap)
          ? ("unknown" as const)
          : cap < 0 || cap >= price.amount + reserved
            ? ("sufficient" as const)
            : ("below-price" as const);
      return Object.freeze({
        resourceId: price.resourceId,
        required: price.amount,
        holding: amount,
        capacity: cap,
        observedNetRate: observed?.netRate,
        rateConfidence: observed?.rateConfidence,
        missingAuthority: Object.freeze(missingAuthority),
        knownCommitment: reserved,
        externalCommitments: input.commitmentsKnown
          ? ("complete" as const)
          : ("unknown" as const),
        capacityConstraint,
        affordabilityConstraint:
          shortfall === undefined || !input.commitmentsKnown
            ? ("unknown" as const)
            : shortfall
              ? ("shortfall" as const)
              : ("covered" as const),
        bottleneck: candidate.nativeAffordable === false && shortfall === true,
      });
    });
    const routePotentialNeeds = candidate.dependencyWitness.pathActionIds.map(
      (actionId) => {
        const offer = prices.get(actionId);
        return Object.freeze({
          actionId,
          currentNativeOfferPrice: offer?.price,
          priceStatus:
            offer === undefined
              ? ("not-currently-offered" as const)
              : ("currently-offered" as const),
        });
      },
    );
    const orAlternativePotentialNeeds = [
      ...candidate.dependencyWitness.advancesRequirements,
      ...candidate.dependencyWitness.remainingRequirements,
    ].map((requirement) => ({
      requirementId: requirement.id,
      alternatives: requirement.alternativeActionIds.map((actionId) => {
        const offer = prices.get(actionId);
        return Object.freeze({
          actionId,
          currentNativeOfferPrice: offer?.price,
          priceStatus:
            offer === undefined
              ? ("not-currently-offered" as const)
              : ("currently-offered" as const),
        });
      }),
    }));
    const excludedBranches = candidate.dependencyWitness.reasons.filter(
      (reason) => reason.startsWith("excluded:"),
    );
    const conditionalFutureEligibility =
      candidate.dependencyWitness.reasons.filter(
        (reason) => !reason.startsWith("excluded:"),
      );
    const interventions = input.interventionsByActionId?.get(
      candidate.actionId,
    );
    const observedResourceIds = new Set(
      stocks.map((stock) => stock.resourceId),
    );
    const interventionsComplete =
      interventions !== undefined &&
      interventions.length > 0 &&
      interventions.every(
        (intervention) =>
          intervention.preconditions.satisfied &&
          intervention.productionChanges !== undefined &&
          intervention.effectsComplete &&
          intervention.effectAuthority === "validated" &&
          intervention.validityEpoch === input.validityEpoch &&
          intervention.unavailableReasons.length === 0 &&
          intervention.acquisitionCosts.every(
            (cost) =>
              cost.poolId === "anywhere" &&
              Number.isFinite(cost.amount) &&
              cost.amount >= 0 &&
              observedResourceIds.has(cost.resourceId),
          ) &&
          intervention.productionChanges.every(
            (change) =>
              change.poolId === "anywhere" &&
              Number.isFinite(change.netRateDelta) &&
              (change.capacityDelta === undefined ||
                Number.isFinite(change.capacityDelta)) &&
              observedResourceIds.has(change.resourceId),
          ),
      );
    const interventionEvidence =
      !interventionsComplete || needs === undefined
        ? undefined
        : compareGoalStrategies(
            `current-action:${candidate.actionId}`,
            needs,
            stocks,
            input.commitments,
            interventions,
            input.validityEpoch,
            input.commitmentsKnown,
          );
    const interventionReasons =
      interventionEvidence?.strategies
        .slice(1)
        .flatMap((strategy) => strategy.unavailableReasons) ?? [];
    const interventionComparison = Object.freeze({
      status:
        interventionsComplete !== true || interventionEvidence === undefined
          ? ("unavailable" as const)
          : interventionEvidence.strategies.some(
                (strategy) => strategy.authority !== "validated",
              )
            ? ("partial" as const)
            : interventionEvidence.strategies
                  .slice(1)
                  .some((strategy) => strategy.rankable) ||
                interventionEvidence.strategies
                  .slice(1)
                  .every((strategy) => strategy.status === "infeasible")
              ? ("available" as const)
              : ("unavailable" as const),
      evidence: interventionEvidence,
      reasons: Object.freeze(
        interventionsComplete !== true
          ? [
              interventions === undefined || interventions.length === 0
                ? "no supported marginal economic interventions were observed"
                : "intervention cost, preconditions, effects, or resource scope are incomplete",
            ]
          : interventionEvidence?.strategies
                .slice(1)
                .some((strategy) => strategy.rankable)
            ? [...new Set(interventionReasons)]
            : [
                ...new Set([
                  ...interventionReasons,
                  "no comparable validated intervention result is available",
                ]),
              ],
      ),
    });
    return Object.freeze({
      actionId: candidate.actionId,
      nativeOffer,
      nativeAffordability: candidate.nativeAffordable
        ? ("affordable" as const)
        : ("unaffordable" as const),
      requirements: Object.freeze(requirements),
      currentAffordability: feasibility,
      estimatedTimeToAfford: Object.freeze({
        validated:
          feasibility?.authority === "validated"
            ? feasibility.estimatedTime
            : undefined,
        diagnostic: feasibility?.diagnosticEstimatedTime,
        authority: feasibility?.authority ?? "unavailable",
      }),
      routePotentialNeeds: Object.freeze(routePotentialNeeds),
      orAlternativePotentialNeeds: Object.freeze(orAlternativePotentialNeeds),
      routeEvidence: candidate.routeEvidence,
      advancesRequirements: candidate.dependencyWitness.advancesRequirements,
      remainingRequirements: candidate.dependencyWitness.remainingRequirements,
      excludedBranches: Object.freeze(excludedBranches),
      conditionalFutureEligibility: Object.freeze(conditionalFutureEligibility),
      interventionComparison,
    });
  });

  const mandatoryPrices = input.mandatoryActionIds.map((actionId) =>
    prices.get(actionId),
  );
  const mandatoryUnknown =
    input.mandatoryEvidence !== "complete" ||
    mandatoryPrices.some((offer) => offer?.price == null);
  const mandatoryGoalNeeds = Object.freeze({
    evidence: input.mandatoryEvidence,
    actionIds: Object.freeze([...input.mandatoryActionIds]),
    actionPrices: Object.freeze(
      input.mandatoryActionIds.map((actionId) =>
        Object.freeze({
          actionId,
          price: prices.get(actionId)?.price,
        }),
      ),
    ),
    status:
      input.mandatoryActionIds.length === 0
        ? ("none-established" as const)
        : mandatoryUnknown
          ? ("incomplete" as const)
          : ("established" as const),
    reasons: Object.freeze(
      mandatoryUnknown
        ? [
            ...(input.mandatoryActionIds.length === 0
              ? ["no mandatory action cost is independently established"]
              : [
                  "mandatory goal costs are not completely established for current offers",
                ]),
          ]
        : [],
    ),
  });
  if (
    candidates.some((candidate) =>
      candidate.requirements.some(
        (requirement) => requirement.missingAuthority.length > 0,
      ),
    )
  )
    reasons.push(
      "one or more candidate price resources lack complete observations",
    );
  if (mandatoryGoalNeeds.status === "incomplete")
    reasons.push(...mandatoryGoalNeeds.reasons);

  const comparisons: AdvisoryResourceProjection["comparisons"][number][] = [];
  const affordabilityComparisons: AdvisoryResourceProjection["affordabilityComparisons"][number][] =
    [];
  const comparableCandidates = candidates.filter(
    (candidate) =>
      candidate.routeEvidence === "declared-contribution" ||
      candidate.routeEvidence === "conditional-contribution",
  );
  for (
    let leftIndex = 0;
    leftIndex < comparableCandidates.length;
    leftIndex += 1
  ) {
    const left = comparableCandidates[leftIndex]!;
    const leftPrice = prices.get(left.actionId)?.price;
    if (leftPrice === null || leftPrice === undefined) continue;
    for (const right of comparableCandidates.slice(leftIndex + 1)) {
      if (left.nativeAffordability !== right.nativeAffordability)
        affordabilityComparisons.push(
          Object.freeze({
            feasibleActionId:
              left.nativeAffordability === "affordable"
                ? left.actionId
                : right.actionId,
            infeasibleActionId:
              left.nativeAffordability === "unaffordable"
                ? left.actionId
                : right.actionId,
            dimension: "known-current-affordability",
          }),
        );
      const rightPrice = prices.get(right.actionId)?.price;
      if (rightPrice === null || rightPrice === undefined) continue;
      const leftAmounts = new Map(
        leftPrice.map((item) => [item.resourceId, item.amount]),
      );
      const rightAmounts = new Map(
        rightPrice.map((item) => [item.resourceId, item.amount]),
      );
      const resourceIds = [
        ...new Set([...leftAmounts.keys(), ...rightAmounts.keys()]),
      ].sort();
      const leftNoMore = resourceIds.every(
        (id) => (leftAmounts.get(id) ?? 0) <= (rightAmounts.get(id) ?? 0),
      );
      const rightNoMore = resourceIds.every(
        (id) => (rightAmounts.get(id) ?? 0) <= (leftAmounts.get(id) ?? 0),
      );
      if (leftNoMore && !rightNoMore)
        comparisons.push(
          Object.freeze({
            lessExpensiveActionId: left.actionId,
            moreExpensiveActionId: right.actionId,
            dimension: "current-native-price-component-dominance",
            resourceIds: Object.freeze(resourceIds),
          }),
        );
      else if (rightNoMore && !leftNoMore)
        comparisons.push(
          Object.freeze({
            lessExpensiveActionId: right.actionId,
            moreExpensiveActionId: left.actionId,
            dimension: "current-native-price-component-dominance",
            resourceIds: Object.freeze(resourceIds),
          }),
        );
    }
  }

  return Object.freeze({
    status:
      input.observations === undefined
        ? "unavailable"
        : reasons.length > 0
          ? "partial"
          : "available",
    candidates: Object.freeze(candidates),
    mandatoryGoalNeeds,
    comparisons: Object.freeze(comparisons),
    affordabilityComparisons: Object.freeze(affordabilityComparisons),
    commitments: Object.freeze({
      known: input.commitmentsKnown,
      observations: Object.freeze([...input.commitments]),
      unknownExternalCommitments: !input.commitmentsKnown,
    }),
    validityEpoch: input.validityEpoch,
    reasons: Object.freeze(reasons),
  });
}
