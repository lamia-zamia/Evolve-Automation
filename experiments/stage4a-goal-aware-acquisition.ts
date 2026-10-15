import {
  evaluateResearchGoalCandidates,
  type ResearchGoalCandidate,
  type ResearchGoalCandidateEvidence,
} from "../src/domain/progression/research-goal-candidates.ts";
import { planNativeResearchPrerequisites } from "../src/domain/progression/research-prerequisite-planning.ts";
import type {
  NativeResearchApplicability,
  NativeResearchActionDefinition,
} from "../src/domain/progression/research-prerequisite-planning.ts";
import type { TradeRoutesInput } from "../src/domain/economy/market/trade-routes.ts";

interface Stage4aResourceSample {
  readonly resourceId: string;
  readonly holding: number | undefined;
  readonly capacity: number | undefined;
}

interface Stage4aMarketResource {
  readonly resourceId: string;
  readonly holding: number;
  readonly capacity: number;
  readonly demanded: boolean;
  readonly requestedQuantity: number | undefined;
  readonly importsEnabled: boolean;
  readonly importPricePerPeriod: number;
  readonly importQuantityPerPeriod: number;
  readonly controlElementId: string;
  readonly controlGeneration: number;
}

interface Stage4aMarketContext {
  readonly rootCurrent: boolean;
  readonly rootGeneration: number;
  readonly progressionEpoch: string;
  readonly boardCurrent: boolean;
  readonly ownerEnabled: boolean;
  readonly controls: readonly Readonly<{
    elementId: string;
    generation: number;
    methods: readonly string[];
  }>[];
  readonly resources: readonly Stage4aMarketResource[];
}

interface Stage4aCatalog {
  readonly current: boolean;
  readonly source: string;
  readonly selectedPrestige: string;
  readonly researchPermission: unknown;
  readonly triggersEnabled: unknown;
  readonly rootGeneration: number;
  readonly progressionEpoch: string;
  readonly offers: readonly Readonly<{
    elementId: string;
    grantTechnology: string;
    grantLevel: number;
    generation: number;
    cost: Readonly<Record<string, number>>;
    nativeAffordable: boolean;
  }>[];
  readonly definitions: readonly unknown[];
  readonly grantLevels: readonly (readonly [string, number])[];
  readonly applicability: readonly (readonly [
    string,
    NativeResearchApplicability,
  ])[];
  readonly resourceSamples: readonly Stage4aResourceSample[];
}

export interface GoalAwareAcquisitionDecision {
  readonly status:
    | "signal"
    | "already-demanded"
    | "candidate-affordable"
    | "candidate-not-marketable"
    | "ambiguous"
    | "unavailable";
  readonly reason: string;
  readonly goalActionId?: string;
  readonly goalId?: string;
  readonly rootGeneration?: number;
  readonly progressionEpoch?: string;
  readonly graphStatus?: string;
  readonly graphCompleteness?: string;
  readonly candidates: readonly Readonly<{
    actionId: string;
    generation: number;
    relevance: string;
    pathApplicability: string;
    chainActionIds: readonly string[];
    nativeAffordable: boolean;
    actionableFrontier: boolean;
    cost: Readonly<Record<string, number>>;
    missingResources: readonly Readonly<{
      resourceId: string;
      price: number;
      holding: number;
      capacity: number;
    }>[];
    incompleteResources: readonly string[];
    rank: readonly [number, number, number];
  }>[];
  readonly selectedActionId?: string;
  readonly selectedOfferGeneration?: number;
  readonly resourceId?: string;
  readonly targetQuantity?: number;
  readonly shortfall?: number;
  readonly requestedQuantity?: number;
}

function isStage4aRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteStage4aAmount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function normalizeStage4aResearchDefinition(
  value: unknown,
): Readonly<NativeResearchActionDefinition> | undefined {
  if (!isStage4aRecord(value)) return undefined;
  const eligibility = isStage4aRecord(value.eligibility)
    ? value.eligibility
    : value;
  const actionId = value.actionId;
  const grantTechnology = value.grantTechnology;
  const grantLevel = finiteStage4aAmount(value.grantLevel);
  const rawPrerequisites = value.prerequisites;
  if (
    typeof actionId !== "string" ||
    typeof grantTechnology !== "string" ||
    grantLevel === undefined ||
    !isStage4aRecord(rawPrerequisites) ||
    typeof eligibility.hasNativeCondition !== "boolean"
  )
    return undefined;
  const prerequisites: NativeResearchActionDefinition["prerequisites"] =
    rawPrerequisites.kind === "declared" &&
    Array.isArray(rawPrerequisites.requirements)
      ? {
          kind: "declared",
          requirements: rawPrerequisites.requirements.flatMap((requirement) =>
            isStage4aRecord(requirement) &&
            typeof requirement.technologyId === "string" &&
            finiteStage4aAmount(requirement.requiredLevel) !== undefined
              ? [
                  Object.freeze({
                    technologyId: requirement.technologyId,
                    requiredLevel: requirement.requiredLevel as number,
                    ...(typeof requirement.applicabilityBoundary === "string"
                      ? {
                          applicabilityBoundary:
                            requirement.applicabilityBoundary,
                        }
                      : {}),
                  }),
                ]
              : [],
          ),
        }
      : (rawPrerequisites.kind === "conditional" ||
            rawPrerequisites.kind === "unavailable") &&
          typeof rawPrerequisites.reason === "string"
        ? {
            kind: rawPrerequisites.kind,
            reason: rawPrerequisites.reason,
          }
        : undefined;
  if (prerequisites === undefined) return undefined;
  if (
    prerequisites.kind === "declared" &&
    prerequisites.requirements.length !==
      (rawPrerequisites.requirements as unknown[]).length
  )
    return undefined;
  const rawRoutes = eligibility.routeRestrictions;
  const routeRestrictions =
    rawRoutes === undefined
      ? undefined
      : Array.isArray(rawRoutes) &&
          rawRoutes.every((route) => typeof route === "string")
        ? Object.freeze([...rawRoutes])
        : undefined;
  if (rawRoutes !== undefined && routeRestrictions === undefined)
    return undefined;
  if (!Array.isArray(eligibility.restrictions)) return undefined;
  const restrictions = eligibility.restrictions.flatMap((restriction) =>
    isStage4aRecord(restriction) &&
    typeof restriction.kind === "string" &&
    Array.isArray(restriction.values) &&
    restriction.values.every((entry) => typeof entry === "string")
      ? [
          Object.freeze({
            kind: restriction.kind,
            values: Object.freeze([...restriction.values]),
          }),
        ]
      : [],
  );
  if (restrictions.length !== eligibility.restrictions.length) return undefined;
  return Object.freeze({
    actionId,
    grantTechnology,
    grantLevel,
    prerequisites,
    hasNativeCondition: eligibility.hasNativeCondition,
    routeRestrictions,
    restrictions: Object.freeze(restrictions),
  });
}

/** Test-only experiment policy: select from current native graph evidence and emit a bounded gap. */
export function evaluateGoalAwareAcquisition(
  catalogValue: unknown,
  marketInputValue: unknown,
  marketContextValue: unknown,
): GoalAwareAcquisitionDecision {
  const unavailable = (reason: string): GoalAwareAcquisitionDecision =>
    Object.freeze({
      status: "unavailable",
      reason,
      candidates: Object.freeze([]),
    });
  if (
    !isStage4aRecord(catalogValue) ||
    !Array.isArray(catalogValue.offers) ||
    !Array.isArray(catalogValue.definitions) ||
    !Array.isArray(catalogValue.grantLevels) ||
    !Array.isArray(catalogValue.applicability) ||
    !Array.isArray(catalogValue.resourceSamples)
  )
    return unavailable("native Research catalog is incomplete");
  const catalog = catalogValue as unknown as Stage4aCatalog;
  if (
    catalog.current !== true ||
    catalog.source !== "shared-current-cycle" ||
    !Number.isSafeInteger(catalog.rootGeneration) ||
    typeof catalog.progressionEpoch !== "string" ||
    typeof catalog.selectedPrestige !== "string"
  )
    return unavailable(
      "native Research catalog is stale or has no selected goal",
    );
  if (catalog.researchPermission !== true || catalog.triggersEnabled === true)
    return unavailable(
      "Research owner permission is disabled or delegated to triggers",
    );
  const definitions = catalog.definitions.flatMap((definition) => {
    const normalized = normalizeStage4aResearchDefinition(definition);
    return normalized === undefined ? [] : [normalized];
  });
  if (definitions.length !== catalog.definitions.length)
    return unavailable("native Research definitions are not fully recognized");
  if (
    !isStage4aRecord(marketInputValue) ||
    !Array.isArray(marketInputValue.priorityList) ||
    !isStage4aRecord(marketContextValue)
  )
    return unavailable("current Market capture is incomplete");
  const marketInput = marketInputValue as unknown as TradeRoutesInput;
  const marketContext = marketContextValue as unknown as Stage4aMarketContext;
  if (
    marketContext.rootCurrent !== true ||
    marketContext.rootGeneration !== catalog.rootGeneration ||
    marketContext.progressionEpoch !== catalog.progressionEpoch ||
    marketContext.boardCurrent !== true ||
    marketContext.ownerEnabled !== true
  )
    return unavailable(
      "Market owner, root, or board is not current and enabled",
    );

  const goalDefinitions = definitions.filter(
    (definition) =>
      definition.grantTechnology === catalog.selectedPrestige &&
      definition.grantLevel >= 1,
  );
  if (goalDefinitions.length !== 1)
    return unavailable(
      "selected prestige does not identify one native goal action",
    );
  const goalActionId = goalDefinitions[0]!.actionId;
  const offers = catalog.offers;
  const generations = new Map(
    offers.map((offer) => [offer.elementId, offer.generation]),
  );
  const grants = new Map(catalog.grantLevels);
  const applicability = new Map(catalog.applicability);
  const graph = planNativeResearchPrerequisites({
    targetActionId: goalActionId,
    definitions,
    grantLevels: grants,
    offeredActionIds: new Set(offers.map((offer) => offer.elementId)),
    offerGenerations: generations,
    cycle: 0,
    progressionEpoch: catalog.progressionEpoch,
    rootGeneration: catalog.rootGeneration,
    maxDepth: 16,
    maxActions: 256,
    applicabilityByActionId: applicability,
  });
  const holdings = new Map(
    catalog.resourceSamples.map((sample) => [sample.resourceId, sample]),
  );
  const evidence: ResearchGoalCandidateEvidence[] = offers.map(
    (offer, index) => {
      const samples = Object.keys(offer.cost).map((resourceId) =>
        holdings.get(resourceId),
      );
      const resourceAffordable = samples.every(
        (sample, sampleIndex) =>
          sample !== undefined &&
          finiteStage4aAmount(sample.holding) !== undefined &&
          finiteStage4aAmount(
            offer.cost[Object.keys(offer.cost)[sampleIndex]],
          ) !== undefined &&
          sample.holding! >= offer.cost[Object.keys(offer.cost)[sampleIndex]]!,
      );
      return {
        actionId: offer.elementId,
        grantTechnology: offer.grantTechnology,
        grantLevel: offer.grantLevel,
        index,
        generation: offer.generation,
        cost: offer.cost,
        nativeAffordable: offer.nativeAffordable,
        resourceAffordable: samples.some((sample) => sample === undefined)
          ? undefined
          : resourceAffordable,
        hasCostConflict: undefined,
        hasExplicitExclusion:
          applicability.get(offer.elementId)?.status === "excluded"
            ? true
            : applicability.get(offer.elementId)?.status === "eligible"
              ? false
              : undefined,
        reservationEvidence: "not-evaluated",
        explicitExclusionEvidence:
          applicability.get(offer.elementId)?.status === "excluded"
            ? "excluded"
            : applicability.get(offer.elementId)?.status === "eligible"
              ? "none"
              : "unavailable",
        exclusionReason:
          applicability.get(offer.elementId)?.status === "excluded"
            ? applicability.get(offer.elementId)?.reasons.join("; ")
            : undefined,
      };
    },
  );
  const evaluation = evaluateResearchGoalCandidates({
    goalId: `prestige:${catalog.selectedPrestige}`,
    targetActionId: goalActionId,
    goalSatisfied: graph.targetStatus === "satisfied",
    graph,
    cycle: 0,
    progressionEpoch: catalog.progressionEpoch,
    rootGeneration: catalog.rootGeneration,
    offers: evidence,
    baselineSelectedActionId: undefined,
  });
  const marketById = new Map(
    marketContext.resources.map((resource) => [resource.resourceId, resource]),
  );
  const offeredById = new Map(offers.map((offer) => [offer.elementId, offer]));
  const frontier = new Set(graph.actionableFrontier);
  const candidates = evaluation.candidates
    .filter(
      (candidate) =>
        candidate.evidenceFresh &&
        candidate.actionability === "current-native-offer" &&
        (candidate.relevance === "verified-prerequisite" ||
          candidate.relevance === "conditional-prerequisite") &&
        candidate.pathApplicability !== "excluded" &&
        candidate.explicitlyExcluded !== true,
    )
    .map((candidate) => {
      const missingResources = Object.entries(candidate.cost).flatMap(
        ([resourceId, price]) => {
          const sample = holdings.get(resourceId);
          if (
            sample === undefined ||
            finiteStage4aAmount(sample.holding) === undefined ||
            finiteStage4aAmount(sample.capacity) === undefined ||
            !Number.isFinite(price) ||
            price < 0 ||
            sample.holding! >= price
          )
            return [];
          return [
            Object.freeze({
              resourceId,
              price,
              holding: sample.holding!,
              capacity: sample.capacity!,
            }),
          ];
        },
      );
      const incompleteResources = Object.entries(candidate.cost).flatMap(
        ([resourceId, price]) => {
          const sample = holdings.get(resourceId);
          return sample === undefined ||
            finiteStage4aAmount(sample.holding) === undefined ||
            finiteStage4aAmount(sample.capacity) === undefined ||
            !Number.isFinite(price) ||
            price < 0
            ? [resourceId]
            : [];
        },
      );
      const actionableFrontier = frontier.has(candidate.actionId);
      const rank = [
        candidate.relevance === "verified-prerequisite" ? 0 : 1,
        actionableFrontier ? 0 : 1,
        candidate.chainActionIds.length,
      ] as const;
      return {
        candidate,
        offer: offeredById.get(candidate.actionId),
        missingResources,
        incompleteResources,
        actionableFrontier,
        rank,
      };
    })
    .filter(({ offer }) => offer !== undefined)
    .filter(
      ({ candidate }) =>
        frontier.has(candidate.actionId) ||
        candidate.pathApplicability === "eligible" ||
        candidate.pathApplicability === "conditional",
    )
    .sort(
      (left, right) =>
        left.rank[0] - right.rank[0] ||
        left.rank[1] - right.rank[1] ||
        left.rank[2] - right.rank[2],
    );
  const publicCandidates = Object.freeze(
    candidates.map(
      ({
        candidate,
        offer,
        missingResources,
        incompleteResources,
        actionableFrontier,
        rank,
      }) =>
        Object.freeze({
          actionId: candidate.actionId,
          generation: offer!.generation,
          relevance: candidate.relevance,
          pathApplicability: candidate.pathApplicability,
          chainActionIds: candidate.chainActionIds,
          nativeAffordable: candidate.nativeAffordable,
          actionableFrontier,
          cost: candidate.cost,
          missingResources: Object.freeze(missingResources),
          incompleteResources: Object.freeze(incompleteResources),
          rank,
        }),
    ),
  );
  const base = {
    goalActionId,
    goalId: `prestige:${catalog.selectedPrestige}`,
    rootGeneration: catalog.rootGeneration,
    progressionEpoch: catalog.progressionEpoch,
    graphStatus: graph.targetStatus,
    graphCompleteness: graph.dependencyEvidence,
    candidates: publicCandidates,
  };
  if (candidates.length === 0)
    return Object.freeze({
      ...base,
      status: "unavailable",
      reason:
        "no current offered Research action has a supported goal relationship",
    });
  const bestRank = candidates[0]!.rank;
  const best = candidates.filter(
    (entry) =>
      entry.rank[0] === bestRank[0] &&
      entry.rank[1] === bestRank[1] &&
      entry.rank[2] === bestRank[2],
  );
  if (best.length !== 1)
    return Object.freeze({
      ...base,
      status: "ambiguous",
      reason:
        "multiple current native offers share the top transparent relevance/path rank",
    });
  const selected = best[0]!;
  const missingMarketResources = selected.missingResources.flatMap(
    (missing) => {
      const market = marketById.get(missing.resourceId);
      const routeResource = marketInput.priorityList.find(
        (resource) => resource.id === missing.resourceId,
      );
      const control = marketContext.controls.find(
        (entry) => entry.elementId === market?.controlElementId,
      );
      if (
        market === undefined ||
        routeResource === undefined ||
        market.importsEnabled !== true ||
        !routeResource.autoTradeBuyEnabled ||
        !routeResource.isRoutesUnlocked ||
        missing.price > missing.capacity ||
        !Number.isFinite(market.importPricePerPeriod) ||
        market.importPricePerPeriod <= 0 ||
        !Number.isFinite(market.importQuantityPerPeriod) ||
        market.importQuantityPerPeriod <= 0 ||
        control === undefined ||
        control.generation !== market.controlGeneration ||
        !control.methods.includes("autoBuy")
      )
        return [];
      return [{ missing, market }];
    },
  );
  if (selected.candidate.nativeAffordable)
    return Object.freeze({
      ...base,
      status: "candidate-affordable",
      reason: "selected native offer has no resource shortfall to acquire",
      selectedActionId: selected.candidate.actionId,
      selectedOfferGeneration: selected.offer!.generation,
    });
  if (selected.incompleteResources.length > 0)
    return Object.freeze({
      ...base,
      status: "candidate-not-marketable",
      reason:
        "native price is known but current holding or storage evidence is incomplete",
      selectedActionId: selected.candidate.actionId,
      selectedOfferGeneration: selected.offer!.generation,
    });
  if (selected.missingResources.length === 0)
    return Object.freeze({
      ...base,
      status: "candidate-affordable",
      reason:
        "captured holdings cover the native price although the native affordability verdict disagrees",
      selectedActionId: selected.candidate.actionId,
      selectedOfferGeneration: selected.offer!.generation,
    });
  if (missingMarketResources.length !== 1)
    return Object.freeze({
      ...base,
      status:
        missingMarketResources.length > 1
          ? "ambiguous"
          : "candidate-not-marketable",
      reason:
        missingMarketResources.length > 1
          ? "selected Research price has multiple importable shortfalls"
          : "selected Research price has no current permitted Market import shortfall",
      selectedActionId: selected.candidate.actionId,
      selectedOfferGeneration: selected.offer!.generation,
    });
  const { missing, market } = missingMarketResources[0]!;
  const shortfall = missing.price - missing.holding;
  const requested = market.requestedQuantity;
  if (market.demanded)
    return Object.freeze({
      ...base,
      status: "already-demanded",
      reason:
        "the existing Market demand sample already marks this resource demanded",
      selectedActionId: selected.candidate.actionId,
      selectedOfferGeneration: selected.offer!.generation,
      resourceId: missing.resourceId,
      targetQuantity: missing.price,
      shortfall,
      requestedQuantity: requested,
    });
  if (requested !== undefined && requested >= missing.price)
    return Object.freeze({
      ...base,
      status: "already-demanded",
      reason:
        "existing requested quantity already reaches the native Research price",
      selectedActionId: selected.candidate.actionId,
      selectedOfferGeneration: selected.offer!.generation,
      resourceId: missing.resourceId,
      targetQuantity: missing.price,
      shortfall,
      requestedQuantity: requested,
    });
  return Object.freeze({
    ...base,
    status: "signal",
    reason: "fresh native price exceeds current stock and fits current storage",
    selectedActionId: selected.candidate.actionId,
    selectedOfferGeneration: selected.offer!.generation,
    resourceId: missing.resourceId,
    targetQuantity: missing.price,
    shortfall,
    requestedQuantity: requested,
  });
}
