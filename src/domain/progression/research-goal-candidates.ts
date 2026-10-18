import type { NativeResearchPrerequisiteGraph } from "./research-prerequisite-planning.ts";
import {
  evaluateGoalFeasibility,
  type GoalFeasibility,
  type GoalResourceStock,
} from "../economy/goal-feasibility.ts";
import {
  classifyMandatoryResearchPrerequisiteObligations,
  researchPrerequisiteSnapshotIdentity,
  type ResearchPrerequisiteObligationPlan,
} from "./research-prerequisite-obligations.ts";

export type ResearchGoalRelevance =
  | "verified-prerequisite"
  | "conditional-prerequisite"
  | "optional-investment"
  | "unrelated"
  | "unavailable";

export interface ResearchGoalCandidateEvidence {
  readonly actionId: string;
  readonly grantTechnology: string;
  readonly grantLevel: number;
  readonly index: number;
  readonly generation: number;
  readonly cost: Readonly<Record<string, number>>;
  readonly nativeAffordable: boolean;
  readonly resourceAffordable: boolean | undefined;
  readonly hasCostConflict: boolean | undefined;
  readonly hasExplicitExclusion: boolean | undefined;
  readonly reservationEvidence?:
    "none" | "conflict" | "unavailable" | "not-evaluated" | "not-observed";
  readonly explicitExclusionEvidence?:
    "none" | "excluded" | "unavailable" | "not-evaluated" | "not-observed";
  readonly reservationReason?: string;
  readonly exclusionReason?: string;
  readonly optionalInvestmentEffectKnown?: boolean;
}

export interface ResearchGoalCandidateInput {
  readonly goalId: string;
  readonly targetActionId: string;
  readonly goalSatisfied: boolean;
  readonly graph: NativeResearchPrerequisiteGraph;
  readonly cycle: number;
  readonly progressionEpoch: string;
  readonly rootGeneration: number | undefined;
  readonly offers: readonly ResearchGoalCandidateEvidence[];
  readonly obligations?: Readonly<ResearchPrerequisiteObligationPlan>;
  readonly resourceStocks?: readonly GoalResourceStock[];
  /** The shared spenders are not fully observed yet; projections remain shadow-only. */
  readonly commitmentsKnown?: boolean;
  readonly baselineSelectedActionId: string | undefined;
  readonly baselineSelectedDisposition?:
    "researched" | "no-observed-research" | "stopped" | undefined;
}

export interface ResearchGoalCandidate {
  readonly goalId: string;
  readonly targetActionId: string;
  readonly actionId: string;
  readonly grantTechnology: string;
  readonly grantLevel: number;
  readonly index: number;
  readonly relevance: ResearchGoalRelevance;
  /** Declared graph relation; this is not permission to execute an action. */
  readonly dependencyRelation: "declared-prerequisite" | "none" | "unknown";
  /** Applicability of the complete route to the terminal action. */
  readonly pathApplicability:
    "eligible" | "conditional" | "excluded" | "unavailable";
  /** Current native offer membership is observed separately from the dependency graph. */
  readonly actionability: "current-native-offer" | "unknown";
  readonly chainActionIds: readonly string[];
  readonly cost: Readonly<Record<string, number>>;
  readonly nativeAffordable: boolean;
  readonly affordability: "native-affordable" | "native-denied";
  readonly resourceAffordability: "affordable" | "insufficient" | "unknown";
  readonly reservationConflict: boolean | undefined;
  readonly explicitlyExcluded: boolean | undefined;
  readonly reservationEvidence:
    "none" | "conflict" | "unavailable" | "not-evaluated" | "not-observed";
  readonly explicitExclusionEvidence:
    "none" | "excluded" | "unavailable" | "not-evaluated" | "not-observed";
  readonly reservationReason: string | undefined;
  readonly exclusionReason: string | undefined;
  readonly evidenceFresh: boolean;
  readonly downstreamCosts: "unknown";
  readonly frontierTime: Readonly<GoalFeasibility> | undefined;
  readonly reasons: readonly string[];
}

export type ResearchFrontierSelectionStatus =
  | "supported-best-known-strategy"
  | "provisional-mandatory-prerequisite-choice"
  | "ambiguous-alternatives"
  | "blocked-by-missing-native-authority"
  | "infeasible"
  | "no-required-frontier";

export interface ResearchFrontierSelection {
  readonly status: ResearchFrontierSelectionStatus;
  readonly actionId: string | undefined;
  readonly comparedActionIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface ResearchGoalCandidateEvaluation {
  readonly goalId: string;
  readonly targetActionId: string;
  readonly baselineSelectedActionId: string | undefined;
  readonly baselineSelectedDisposition:
    "researched" | "no-observed-research" | "stopped" | undefined;
  /** Static relevance and affordability do not establish expected time-to-go value. */
  readonly preferredActionId: string | undefined;
  readonly preference: ResearchFrontierSelectionStatus;
  readonly frontierSelection: Readonly<ResearchFrontierSelection>;
  readonly candidates: readonly Readonly<ResearchGoalCandidate>[];
}

const RESEARCH_FRONTIER_POOL = "anywhere";

function readFrontierTime(
  actionId: string,
  cost: Readonly<Record<string, number>>,
  stocks: readonly GoalResourceStock[] | undefined,
  validityEpoch: string,
  commitmentsKnown: boolean,
): Readonly<GoalFeasibility> | undefined {
  if (stocks === undefined) return undefined;
  const requirements = Object.entries(cost).map(([resourceId, amount]) => ({
    resourceId,
    poolId: RESEARCH_FRONTIER_POOL,
    amount,
  }));
  return evaluateGoalFeasibility(
    actionId,
    requirements,
    stocks,
    [],
    validityEpoch,
    commitmentsKnown,
  );
}

function chooseResearchFrontier(
  obligations: Readonly<ResearchPrerequisiteObligationPlan> | undefined,
  graph: NativeResearchPrerequisiteGraph,
  candidates: readonly Readonly<ResearchGoalCandidate>[],
  validEvidence: boolean,
  commitmentsKnown: boolean,
): Readonly<ResearchFrontierSelection> {
  const reasons: string[] = [];
  if (!validEvidence || obligations?.status !== "verified") {
    return Object.freeze({
      status: "blocked-by-missing-native-authority",
      actionId: undefined,
      comparedActionIds: Object.freeze([]),
      reasons: Object.freeze([
        ...(obligations?.reasons ?? []),
        "current native prerequisite authority is unavailable",
      ]),
    });
  }
  const graphObligations = classifyMandatoryResearchPrerequisiteObligations(
    graph,
    true,
  );
  const authority = obligations.authority;
  const currentAuthority =
    graph.provenance === "effective-native-research-definition-snapshot" &&
    authority?.targetActionId === graph.targetActionId &&
    JSON.stringify(authority.freshness) === JSON.stringify(graph.freshness) &&
    authority.snapshotIdentity === researchPrerequisiteSnapshotIdentity(graph);
  const graphFrontier = new Set(graph.actionableFrontier);
  const normalizeGroups = (
    groups: ResearchPrerequisiteObligationPlan["alternativeGroups"],
  ) => {
    const normalized = groups
      .map((group) => ({
        requirementId: group.requirementId,
        actionIds: [
          ...new Set(group.actionIds.filter((id) => graphFrontier.has(id))),
        ].sort(),
      }))
      .filter((group) => group.actionIds.length > 0)
      .sort((left, right) =>
        left.requirementId.localeCompare(right.requirementId),
      );
    return normalized.filter(
      (group, index) =>
        index === 0 ||
        group.requirementId !== normalized[index - 1]?.requirementId ||
        JSON.stringify(group.actionIds) !==
          JSON.stringify(normalized[index - 1]?.actionIds),
    );
  };
  const graphMandatoryFrontier = graphObligations.mandatoryActionIds
    .filter((actionId) => graphFrontier.has(actionId))
    .sort();
  const suppliedMandatory = [...new Set(obligations.mandatoryActionIds)].sort();
  const suppliedMandatoryOutsideFrontier = obligations.mandatoryActionIds.find(
    (actionId) => !graphFrontier.has(actionId),
  );
  const projectedAlternativesMatch =
    JSON.stringify(normalizeGroups(graphObligations.alternativeGroups)) ===
    JSON.stringify(normalizeGroups(obligations.alternativeGroups));
  if (
    !currentAuthority ||
    graphObligations.status !== "verified" ||
    suppliedMandatoryOutsideFrontier !== undefined ||
    suppliedMandatory.length !== obligations.mandatoryActionIds.length ||
    JSON.stringify(graphMandatoryFrontier) !==
      JSON.stringify(suppliedMandatory) ||
    !projectedAlternativesMatch
  ) {
    return Object.freeze({
      status: "blocked-by-missing-native-authority",
      actionId: undefined,
      comparedActionIds: Object.freeze([]),
      reasons: Object.freeze([
        !currentAuthority
          ? "supplied native obligations are not bound to the current prerequisite snapshot and freshness"
          : graphObligations.status !== "verified"
            ? `current prerequisite graph cannot independently verify its obligations: ${graphObligations.reasons.join("; ")}`
            : suppliedMandatoryOutsideFrontier !== undefined
              ? `supplied obligation ${suppliedMandatoryOutsideFrontier} is not on the current actionable frontier`
              : JSON.stringify(graphMandatoryFrontier) !==
                  JSON.stringify(suppliedMandatory)
                ? "native mandatory obligations do not match the graph's mandatory current frontier projection"
                : "mandatory and alternative obligation evidence contradicts the current prerequisite graph",
      ]),
    });
  }
  const verifiedActionableFrontier = new Set(
    candidates
      .filter(
        (candidate) =>
          graphFrontier.has(candidate.actionId) &&
          candidate.actionability === "current-native-offer" &&
          candidate.pathApplicability === "eligible" &&
          candidate.dependencyRelation === "declared-prerequisite" &&
          candidate.explicitlyExcluded !== true,
      )
      .map((candidate) => candidate.actionId),
  );
  const obligationFrontier = new Set([
    ...obligations.mandatoryActionIds,
    ...obligations.alternativeGroups.flatMap((group) => group.actionIds),
  ]);
  const inconsistentMandatory = obligations.mandatoryActionIds.find(
    (actionId) => !verifiedActionableFrontier.has(actionId),
  );
  const uncoveredGraphAction = [...verifiedActionableFrontier].find(
    (actionId) => !obligationFrontier.has(actionId),
  );
  if (
    inconsistentMandatory !== undefined ||
    uncoveredGraphAction !== undefined
  ) {
    const excludedMandatory =
      inconsistentMandatory === undefined
        ? undefined
        : candidates.find(
            (candidate) => candidate.actionId === inconsistentMandatory,
          )?.explicitlyExcluded === true;
    const reason =
      inconsistentMandatory !== undefined
        ? excludedMandatory
          ? `obligation ${inconsistentMandatory} is excluded by current native applicability evidence`
          : `obligation ${inconsistentMandatory} is not a verified actionable frontier in the current prerequisite graph`
        : `graph frontier ${uncoveredGraphAction} is absent from the current mandatory and alternative obligations`;
    return Object.freeze({
      status: "blocked-by-missing-native-authority",
      actionId: undefined,
      comparedActionIds: Object.freeze([]),
      reasons: Object.freeze([reason]),
    });
  }
  const current = new Set(
    candidates
      .filter(
        (candidate) =>
          candidate.actionability === "current-native-offer" &&
          candidate.pathApplicability === "eligible" &&
          candidate.dependencyRelation === "declared-prerequisite" &&
          candidate.explicitlyExcluded !== true &&
          candidate.reservationConflict !== true,
      )
      .map((candidate) => candidate.actionId),
  );
  const alternatives = obligations.alternativeGroups.flatMap((group) =>
    group.actionIds.filter((actionId) => current.has(actionId)),
  );
  if (alternatives.length > 0) {
    return Object.freeze({
      status: "ambiguous-alternatives",
      actionId: undefined,
      comparedActionIds: Object.freeze([...new Set(alternatives)].sort()),
      reasons: Object.freeze([
        "native prerequisite graph contains current OR alternatives without comparable terminal-time evidence",
      ]),
    });
  }
  const mandatory = candidates.filter(
    (candidate) =>
      obligations.mandatoryActionIds.includes(candidate.actionId) &&
      current.has(candidate.actionId),
  );
  if (mandatory.length === 0) {
    return Object.freeze({
      status: "no-required-frontier",
      actionId: undefined,
      comparedActionIds: Object.freeze([]),
      reasons: Object.freeze([
        "no current verified mandatory action is available in the goal frontier",
      ]),
    });
  }
  const withTime = mandatory.map((candidate) => ({
    candidate,
    time: candidate.frontierTime,
  }));
  if (withTime.some(({ time }) => time?.estimatedTime === undefined)) {
    return Object.freeze({
      status: withTime.every(({ time }) => time?.status === "infeasible")
        ? "infeasible"
        : "blocked-by-missing-native-authority",
      actionId: undefined,
      comparedActionIds: Object.freeze(
        mandatory.map(({ actionId }) => actionId).sort(),
      ),
      reasons: Object.freeze([
        ...withTime.flatMap(({ time }) => time?.reasons ?? []),
        "one or more mandatory frontier actionability estimates are unavailable",
      ]),
    });
  }
  const ranked = [...withTime].sort(
    (left, right) =>
      (left.time?.estimatedTime ?? Number.POSITIVE_INFINITY) -
      (right.time?.estimatedTime ?? Number.POSITIVE_INFINITY),
  );
  const first = ranked[0];
  const second = ranked[1];
  if (first === undefined || first.time?.estimatedTime === undefined)
    return Object.freeze({
      status: "blocked-by-missing-native-authority",
      actionId: undefined,
      comparedActionIds: Object.freeze(
        mandatory.map(({ actionId }) => actionId).sort(),
      ),
      reasons: Object.freeze(["mandatory frontier estimates are unavailable"]),
    });
  if (
    second !== undefined &&
    second.time?.estimatedTime === first.time.estimatedTime
  ) {
    return Object.freeze({
      status: "blocked-by-missing-native-authority",
      actionId: undefined,
      comparedActionIds: Object.freeze(
        mandatory.map(({ actionId }) => actionId).sort(),
      ),
      reasons: Object.freeze([
        "mandatory actions have the same time to affordability, while downstream completion-time evidence is unknown",
      ]),
    });
  }
  if (!commitmentsKnown)
    reasons.push(
      "selection is provisional because shared spending commitments are incomplete",
    );
  reasons.push(
    "selection minimizes observed time to native affordability among verified mandatory prerequisites; terminal-time effects remain unknown",
  );
  return Object.freeze({
    status: "provisional-mandatory-prerequisite-choice",
    actionId: first.candidate.actionId,
    comparedActionIds: Object.freeze(
      mandatory.map(({ actionId }) => actionId).sort(),
    ),
    reasons: Object.freeze(reasons),
  });
}

export function hasVerifiedNonManaAffordabilityForManaOffer(
  cost: Readonly<Record<string, number>>,
  nonManaAffordable: boolean | undefined,
): boolean {
  return (cost.Mana ?? 0) <= 0 || nonManaAffordable === true;
}

function matchingResearchOffers(
  graph: NativeResearchPrerequisiteGraph,
  input: Readonly<ResearchGoalCandidateInput>,
): boolean {
  const observed = graph.freshness.offerGenerations;
  if (
    observed === undefined ||
    input.rootGeneration === undefined ||
    graph.freshness.cycle !== input.cycle ||
    graph.freshness.progressionEpoch !== input.progressionEpoch ||
    graph.freshness.rootGeneration !== input.rootGeneration ||
    observed.length !== input.offers.length
  )
    return false;
  const byId = new Map(input.offers.map((offer) => [offer.actionId, offer]));
  if (byId.size !== input.offers.length) return false;
  return observed.every(([actionId, generation]) => {
    const offer = byId.get(actionId);
    return offer !== undefined && offer.generation === generation;
  });
}

interface ResearchActionPaths {
  readonly verified: readonly string[] | undefined;
  readonly conditional: readonly string[] | undefined;
}

function readRelevantResearchActions(
  graph: NativeResearchPrerequisiteGraph,
): ReadonlyMap<string, ResearchActionPaths> {
  const actions = new Map(
    graph.actions.map((action) => [action.actionId, action]),
  );
  const requirements = new Map(
    graph.requirements.map((gate) => [gate.id, gate]),
  );
  const paths = new Map<
    string,
    { verified?: readonly string[]; conditional?: readonly string[] }
  >();
  const visited = new Set<string>();
  const queue: {
    actionId: string;
    conditional: boolean;
    chain: readonly string[];
  }[] = [];
  const target = actions.get(graph.targetActionId);
  if (target !== undefined)
    queue.push({
      actionId: target.actionId,
      // Eligibility of the terminal action does not change its declared dependency edges.
      conditional: false,
      chain: [target.actionId],
    });
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const stateKey = `${current.actionId}:${current.conditional ? "conditional" : "verified"}`;
    if (visited.has(stateKey)) continue;
    visited.add(stateKey);
    const path = paths.get(current.actionId) ?? {};
    if (current.conditional) path.conditional ??= current.chain;
    else path.verified ??= current.chain;
    paths.set(current.actionId, path);

    const action = actions.get(current.actionId);
    if (action === undefined) continue;
    for (const requirementId of action.prerequisiteIds) {
      const gate = requirements.get(requirementId);
      const requirementIsConditional =
        gate?.status === "conditional" || gate?.status === "unavailable";
      for (const candidateId of gate?.candidateActionIds ?? []) {
        const candidate = actions.get(candidateId);
        if (candidate?.status === "excluded") continue;
        const conditional =
          requirementIsConditional ||
          candidate?.status === "conditional" ||
          candidate?.status === "unavailable";
        queue.push({
          actionId: candidateId,
          conditional,
          chain: [...current.chain, candidateId],
        });
      }
    }
  }
  return new Map(
    [...paths].map(([actionId, path]) => [
      actionId,
      Object.freeze({
        verified: path.verified,
        conditional: path.conditional,
      }),
    ]),
  );
}

/** Evaluates relevance and feasibility evidence without changing Research execution order. */
export function evaluateResearchGoalCandidates(
  input: Readonly<ResearchGoalCandidateInput>,
): ResearchGoalCandidateEvaluation {
  const fresh = matchingResearchOffers(input.graph, input);
  const objectiveMatches = input.graph.targetActionId === input.targetActionId;
  const relevant = readRelevantResearchActions(input.graph);
  const verifiedFrontier = new Set(input.graph.actionableFrontier);
  const graphIncomplete = input.graph.dependencyEvidence !== "complete";
  const validityEpoch = `${input.progressionEpoch}|root:${input.rootGeneration ?? "unknown"}|cycle:${input.cycle}`;
  const candidates = input.offers.map((offer) => {
    const paths = relevant.get(offer.actionId);
    const chain = paths?.verified ?? paths?.conditional ?? [];
    const gate = input.graph.actions.find(
      (action) => action.actionId === offer.actionId,
    );
    const chainReasons = chain.flatMap(
      (actionId) =>
        input.graph.actions.find((action) => action.actionId === actionId)
          ?.reasons ?? [],
    );
    const reasons: string[] = [];
    let relevance: ResearchGoalRelevance;
    const dependencyRelation =
      paths?.verified !== undefined || paths?.conditional !== undefined
        ? "declared-prerequisite"
        : graphIncomplete
          ? "unknown"
          : "none";
    const targetGate = input.graph.actions.find(
      (action) => action.actionId === input.targetActionId,
    );
    const pathApplicability =
      targetGate?.status === "excluded" || gate?.status === "excluded"
        ? "excluded"
        : paths?.conditional !== undefined ||
            gate?.status === "conditional" ||
            gate?.status === "unavailable"
          ? "conditional"
          : "eligible";
    if (
      !fresh ||
      !objectiveMatches ||
      input.graph.targetStatus === "unavailable"
    ) {
      relevance = "unavailable";
      reasons.push(
        !objectiveMatches
          ? "prerequisite graph targets a different selected objective"
          : "prerequisite graph or offer evidence is unavailable or stale",
      );
    } else if (
      input.goalSatisfied ||
      input.graph.targetStatus === "satisfied"
    ) {
      relevance = "unrelated";
      reasons.push("selected terminal goal is already satisfied");
    } else if (paths?.verified !== undefined) {
      relevance = "verified-prerequisite";
      reasons.push(
        "action lies on a statically declared prerequisite path; terminal applicability is separate",
      );
      if (!verifiedFrontier.has(offer.actionId))
        reasons.push("candidate is not independently confirmed as actionable");
      reasons.push(...chainReasons);
      if (chain.length > 0) reasons.push(`chain ${chain.join(" -> ")}`);
    } else if (
      paths?.conditional !== undefined ||
      chain.length > 0 ||
      gate?.status === "conditional" ||
      gate?.status === "unavailable" ||
      gate?.status === "excluded"
    ) {
      relevance = "conditional-prerequisite";
      reasons.push(...chainReasons, ...(gate?.reasons ?? []));
      if (chain.length > 0)
        reasons.push(`conditional chain ${chain.join(" -> ")}`);
    } else if (graphIncomplete) {
      relevance = "unavailable";
      reasons.push(
        "graph incompleteness prevents ruling out a prerequisite path",
      );
    } else if (offer.optionalInvestmentEffectKnown === true) {
      relevance = "optional-investment";
      reasons.push(
        "supported economic effect exists without a hard prerequisite edge",
      );
    } else {
      relevance = "unrelated";
      reasons.push(
        "no hard prerequisite relationship appears in the complete known graph",
      );
    }
    if (!offer.nativeAffordable)
      reasons.push("native affordability verdict is false");
    if (offer.resourceAffordable === false)
      reasons.push("captured resources are insufficient for this price");
    if (offer.resourceAffordable === undefined)
      reasons.push("captured resource sufficiency is unavailable");
    if (offer.hasCostConflict)
      reasons.push("cost is reserved by a higher-priority commitment");
    if (offer.hasCostConflict === undefined)
      reasons.push(
        offer.reservationEvidence === "not-evaluated"
          ? "Research owner skipped reservation checks because native/resource affordability was denied"
          : "cost reservation evidence is unavailable",
      );
    if (offer.hasExplicitExclusion)
      reasons.push("explicit Research exclusion applies");
    if (offer.hasExplicitExclusion === undefined)
      reasons.push(
        offer.explicitExclusionEvidence === "not-evaluated"
          ? "Research owner skipped exclusion checks because native/resource affordability was denied"
          : "explicit Research exclusion evidence is unavailable",
      );
    return Object.freeze({
      goalId: input.goalId,
      targetActionId: input.targetActionId,
      actionId: offer.actionId,
      grantTechnology: offer.grantTechnology,
      grantLevel: offer.grantLevel,
      index: offer.index,
      relevance,
      dependencyRelation,
      pathApplicability,
      actionability: fresh ? "current-native-offer" : "unknown",
      chainActionIds: Object.freeze(chain),
      cost: offer.cost,
      nativeAffordable: offer.nativeAffordable,
      affordability: offer.nativeAffordable
        ? ("native-affordable" as const)
        : ("native-denied" as const),
      resourceAffordability:
        offer.resourceAffordable === undefined
          ? ("unknown" as const)
          : offer.resourceAffordable
            ? ("affordable" as const)
            : ("insufficient" as const),
      reservationConflict: offer.hasCostConflict,
      explicitlyExcluded: offer.hasExplicitExclusion,
      reservationEvidence:
        offer.reservationEvidence ??
        (offer.hasCostConflict === undefined
          ? "not-observed"
          : offer.hasCostConflict
            ? "conflict"
            : "none"),
      explicitExclusionEvidence:
        offer.explicitExclusionEvidence ??
        (offer.hasExplicitExclusion === undefined
          ? "not-observed"
          : offer.hasExplicitExclusion
            ? "excluded"
            : "none"),
      reservationReason: offer.reservationReason,
      exclusionReason: offer.exclusionReason,
      evidenceFresh: fresh && objectiveMatches,
      downstreamCosts: "unknown" as const,
      frontierTime:
        verifiedFrontier.has(offer.actionId) &&
        dependencyRelation === "declared-prerequisite"
          ? readFrontierTime(
              offer.actionId,
              offer.cost,
              input.resourceStocks,
              validityEpoch,
              input.commitmentsKnown ?? false,
            )
          : undefined,
      reasons: Object.freeze([...new Set(reasons)]),
    });
  });

  const frontierSelection = chooseResearchFrontier(
    input.obligations,
    input.graph,
    candidates,
    fresh && objectiveMatches && input.graph.targetStatus !== "unavailable",
    input.commitmentsKnown ?? false,
  );

  return Object.freeze({
    goalId: input.goalId,
    targetActionId: input.targetActionId,
    baselineSelectedActionId: input.baselineSelectedActionId,
    baselineSelectedDisposition: input.baselineSelectedDisposition,
    preferredActionId: frontierSelection.actionId,
    preference: frontierSelection.status,
    frontierSelection,
    candidates: Object.freeze(candidates),
  });
}
