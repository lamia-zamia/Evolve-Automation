import type { NativeResearchPrerequisiteGraph } from "./research-prerequisite-planning.ts";

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
  readonly preference: "not-evaluated";
  readonly candidates: readonly Readonly<ResearchGoalCandidate>[];
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
      reasons: Object.freeze([...new Set(reasons)]),
    });
  });

  return Object.freeze({
    goalId: input.goalId,
    targetActionId: input.targetActionId,
    baselineSelectedActionId: input.baselineSelectedActionId,
    baselineSelectedDisposition: input.baselineSelectedDisposition,
    preferredActionId: undefined,
    preference: "not-evaluated",
    candidates: Object.freeze(candidates),
  });
}
