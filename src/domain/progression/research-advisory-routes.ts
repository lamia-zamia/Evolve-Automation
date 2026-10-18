import {
  evaluateGoalFeasibility,
  type GoalFeasibility,
  type GoalResourceStock,
} from "../economy/goal-feasibility.ts";
import type {
  NativeResearchActionDefinition,
  NativeResearchApplicability,
} from "./research-prerequisite-planning.ts";

export interface AdvisoryResearchOffer {
  readonly actionId: string;
  readonly generation: number;
  readonly cost: Readonly<Record<string, number>>;
  readonly nativeAffordable: boolean;
}

export interface AdvisoryResearchRouteInput {
  readonly targetActionId: string;
  readonly definitions: readonly NativeResearchActionDefinition[] | undefined;
  readonly grantLevels: ReadonlyMap<string, number> | undefined;
  readonly offers: readonly AdvisoryResearchOffer[] | undefined;
  readonly applicabilityByActionId?: ReadonlyMap<
    string,
    NativeResearchApplicability
  >;
  readonly terminalEligibility?: NativeResearchApplicability;
  readonly resourceStocks?: readonly GoalResourceStock[];
  readonly commitmentsKnown?: boolean;
  readonly validityEpoch: string;
  readonly rootGeneration: number;
  readonly progressionEpoch: string;
  readonly expectedRootGeneration?: number;
  readonly expectedProgressionEpoch?: string;
  /** Hard total operation budget across expansion, alternatives, candidates and witnesses. */
  readonly maxDependencyExpansions: number;
  readonly maxDependencyDepth: number;
  readonly maxCandidates: number;
}

export interface AdvisoryRequirementWitness {
  readonly id: string;
  readonly technologyId: string;
  readonly requiredLevel: number;
  readonly observedLevel: number | undefined;
  readonly status: "satisfied" | "unsatisfied" | "unknown" | "excluded";
  readonly alternativeActionIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface AdvisoryActionWitness {
  readonly actionId: string;
  /** Each listed requirement is conjunctive; requirement alternatives are disjunctive. */
  readonly prerequisiteRequirementIds: readonly string[];
  readonly prerequisiteStatus: "declared" | "unknown";
  readonly reasons: readonly string[];
}

export interface AdvisoryResearchCandidate {
  readonly actionId: string;
  readonly currentActionability: "current-native-offer";
  readonly mandatoryObligation: "not-certified";
  readonly authorizationToSpend: false;
  readonly generation: number;
  readonly cost: Readonly<Record<string, number>>;
  readonly nativeAffordable: boolean;
  readonly terminalActionId: string;
  readonly routeEvidence:
    | "declared-contribution"
    | "conditional-contribution"
    | "excluded"
    | "unknown"
    | "unrelated";
  readonly dependencyWitness: Readonly<{
    readonly advancesRequirementId: string | undefined;
    readonly connectedRequirementIds: readonly string[];
    readonly advancesRequirements: readonly Readonly<AdvisoryRequirementWitness>[];
    readonly remainingRequirements: readonly Readonly<AdvisoryRequirementWitness>[];
    readonly pathActionIds: readonly string[];
    readonly reasons: readonly string[];
  }>;
  readonly currentAffordability: Readonly<GoalFeasibility> | undefined;
  readonly reasons: readonly string[];
}

export interface AdvisoryResearchRoutePlan {
  readonly status: "complete" | "incomplete" | "unavailable";
  readonly candidates: readonly Readonly<AdvisoryResearchCandidate>[];
  readonly selectedActionId: string | undefined;
  readonly selection: "ordered" | "provisional" | "ambiguous" | "none";
  readonly work: Readonly<{
    nodesVisited: number;
    actionExpansions: number;
    requirementExpansions: number;
    alternativesExplored: number;
    cycles: number;
    sharedSubgraphReuse: number;
    truncated: boolean;
    truncationReasons: readonly string[];
    candidateEvaluations: number;
    operations: number;
    retainedActionWitnesses: number;
    retainedRequirementWitnesses: number;
    retainedCandidateWitnesses: number;
    retainedPathActionReferences: number;
    retainedActionRequirementReferences: number;
    retainedAlternativeReferences: number;
    retainedCandidateRequirementReferences: number;
    retainedReasonReferences: number;
    peakPendingWalkStates: number;
    phases: Readonly<Record<string, number>>;
  }>;
  readonly reasons: readonly string[];
}

interface MutableRequirement extends AdvisoryRequirementWitness {
  alternativeActionIds: string[];
  reasons: string[];
}
interface MutableAction extends AdvisoryActionWitness {
  prerequisiteRequirementIds: string[];
  reasons: string[];
}
interface CandidateEvidence {
  actionIds: string[];
  connectedRequirementIds: Set<string>;
  reasons: Set<string>;
  excludedReasons: Set<string>;
  conditionalReasons: Set<string>;
  declaredRoute: boolean;
  unknownRoute: boolean;
  pathKinds: Set<string>;
}

const requirementKey = (technologyId: string, level: number) =>
  `research:${technologyId}:${level}`;
const sortedUnique = (values: Iterable<string>) => [...new Set(values)];

/** Advisory graph only. It never certifies mandatory work or authorizes spending. */
export function planAdvisoryResearchRoutes(
  input: Readonly<AdvisoryResearchRouteInput>,
): Readonly<AdvisoryResearchRoutePlan> {
  const phases = {
    indexDefinitions: 0,
    expandDependencies: 0,
    discoverCandidates: 0,
  };
  const work = {
    nodesVisited: 0,
    actionExpansions: 0,
    requirementExpansions: 0,
    alternativesExplored: 0,
    cycles: 0,
    sharedSubgraphReuse: 0,
    truncated: false,
    truncationReasons: [] as string[],
    candidateEvaluations: 0,
    operations: 0,
    retainedActionWitnesses: 0,
    retainedRequirementWitnesses: 0,
    retainedCandidateWitnesses: 0,
    retainedPathActionReferences: 0,
    retainedActionRequirementReferences: 0,
    retainedAlternativeReferences: 0,
    retainedCandidateRequirementReferences: 0,
    retainedReasonReferences: 0,
    peakPendingWalkStates: 0,
    phases,
  };
  const reasons: string[] = [];
  const unavailable =
    input.definitions === undefined ||
    input.grantLevels === undefined ||
    input.offers === undefined;
  const stale =
    (input.expectedRootGeneration !== undefined &&
      input.expectedRootGeneration !== input.rootGeneration) ||
    (input.expectedProgressionEpoch !== undefined &&
      input.expectedProgressionEpoch !== input.progressionEpoch);
  const freezeWork = () =>
    Object.freeze({
      ...work,
      truncationReasons: Object.freeze(sortedUnique(work.truncationReasons)),
      phases: Object.freeze({ ...phases }),
    });
  const consume = (reason: string) => {
    if (work.operations >= Math.max(0, input.maxDependencyExpansions)) {
      work.truncated = true;
      work.truncationReasons.push(reason);
      return false;
    }
    work.operations += 1;
    return true;
  };
  const consumeMany = (count: number, reason: string) => {
    const units = Math.max(0, Math.ceil(count));
    if (units > Math.max(0, input.maxDependencyExpansions) - work.operations) {
      work.truncated = true;
      work.truncationReasons.push(reason);
      return false;
    }
    work.operations += units;
    return true;
  };
  const sortFailure = Symbol("bounded-sort-exhausted");
  const boundedSort = <T>(
    values: readonly T[],
    compare: (left: T, right: T) => number,
    reason: string,
  ): T[] | undefined => {
    if (!consumeMany(values.length, `${reason}-copy-budget`)) return undefined;
    const copy = [...values];
    try {
      return copy.sort((left, right) => {
        if (!consume(reason)) throw sortFailure;
        return compare(left, right);
      });
    } catch (error) {
      if (error === sortFailure) return undefined;
      throw error;
    }
  };
  const incompleteBeforeGraph = (reason: string) => {
    reasons.push(reason);
    return Object.freeze({
      status: "incomplete" as const,
      candidates: Object.freeze([]),
      selectedActionId: undefined,
      selection: "none" as const,
      work: freezeWork(),
      reasons: Object.freeze(sortedUnique(reasons)),
    });
  };
  const addActionReason = (node: MutableAction, reason: string) => {
    if (!consume("reason-witness-budget")) return false;
    node.reasons.push(reason);
    work.retainedReasonReferences += 1;
    return true;
  };
  const addRequirementReason = (node: MutableRequirement, reason: string) => {
    if (!consume("reason-witness-budget")) return false;
    node.reasons.push(reason);
    work.retainedReasonReferences += 1;
    return true;
  };
  const retainCandidateReason = (reasons: Set<string>, reason: string) => {
    if (reasons.has(reason)) return;
    reasons.add(reason);
    work.retainedReasonReferences += 1;
  };
  if (unavailable || stale) {
    reasons.push(
      unavailable
        ? "effective definitions, current grants, or native offers are unavailable"
        : "root or progression evidence was invalidated",
    );
    return Object.freeze({
      status: "unavailable",
      candidates: Object.freeze([]),
      selectedActionId: undefined,
      selection: "none",
      work: freezeWork(),
      reasons: Object.freeze(reasons),
    });
  }

  const sourceDefinitions = input.definitions!;
  const sourceOffers = input.offers!;
  const definitions = boundedSort(
    sourceDefinitions,
    (a, b) => a.actionId.localeCompare(b.actionId),
    "registry-definition-sort-budget",
  );
  if (definitions === undefined)
    return incompleteBeforeGraph(
      "bounded definition indexing exhausted before graph exploration",
    );
  const grants = input.grantLevels!;
  const offers = boundedSort(
    sourceOffers,
    (a, b) => a.actionId.localeCompare(b.actionId),
    "registry-offer-sort-budget",
  );
  if (offers === undefined)
    return incompleteBeforeGraph(
      "bounded offer indexing exhausted before graph exploration",
    );
  const byId = new Map<string, NativeResearchActionDefinition>();
  const byGrant = new Map<string, NativeResearchActionDefinition[]>();
  for (const d of definitions) {
    if (!consume("registry-index-budget"))
      return incompleteBeforeGraph(
        "bounded definition indexing exhausted before graph exploration",
      );
    byId.set(d.actionId, d);
    const list = byGrant.get(d.grantTechnology) ?? [];
    list.push(d);
    byGrant.set(d.grantTechnology, list);
  }
  const offerById = new Map<string, AdvisoryResearchOffer>();
  for (const offer of offers) {
    if (!consume("registry-index-budget"))
      return incompleteBeforeGraph(
        "bounded offer indexing exhausted before graph exploration",
      );
    offerById.set(offer.actionId, offer);
  }
  phases.indexDefinitions = definitions.length;
  const actionNodes = new Map<string, MutableAction>();
  const requirementNodes = new Map<string, MutableRequirement>();
  const expandedActions = new Set<string>();
  const expandedRequirements = new Set<string>();
  const active = new Set<string>();
  const unknownPrerequisiteActionIds = new Set<string>();
  const ensureAction = (
    id: string,
    depth: number,
  ): MutableAction | undefined => {
    const existing = actionNodes.get(id);
    if (existing !== undefined) {
      work.sharedSubgraphReuse += 1;
      return existing;
    }
    if (!consume("total-operation-budget")) return undefined;
    if (depth > input.maxDependencyDepth) {
      work.truncated = true;
      work.truncationReasons.push("dependency-depth-budget");
      return undefined;
    }
    const definition = byId.get(id);
    if (definition === undefined) return undefined;
    const node: MutableAction = {
      actionId: id,
      prerequisiteRequirementIds: [],
      prerequisiteStatus:
        definition.prerequisites.kind === "declared" ? "declared" : "unknown",
      reasons: [],
    };
    actionNodes.set(id, node);
    work.retainedActionWitnesses += 1;
    work.nodesVisited += 1;
    work.actionExpansions += 1;
    return node;
  };
  const ensureRequirement = (
    technologyId: string,
    requiredLevel: number,
    depth: number,
  ): MutableRequirement | undefined => {
    const id = requirementKey(technologyId, requiredLevel);
    const existing = requirementNodes.get(id);
    if (existing !== undefined) {
      work.sharedSubgraphReuse += 1;
      return existing;
    }
    if (!consume("total-operation-budget")) return undefined;
    if (depth > input.maxDependencyDepth) {
      work.truncated = true;
      work.truncationReasons.push("dependency-depth-budget");
      return undefined;
    }
    const level = grants.get(technologyId);
    const validLevel =
      level !== undefined && Number.isFinite(level) && level >= 0;
    const node: MutableRequirement = {
      id,
      technologyId,
      requiredLevel,
      observedLevel: validLevel ? level : undefined,
      status: !validLevel
        ? "unknown"
        : level! >= requiredLevel
          ? "satisfied"
          : "unsatisfied",
      alternativeActionIds: [],
      reasons: [],
    };
    if (!validLevel)
      addRequirementReason(
        node,
        `current grant level unavailable: ${technologyId}`,
      );
    requirementNodes.set(id, node);
    work.retainedRequirementWitnesses += 1;
    return node;
  };
  const expandAction = (id: string, depth: number): void => {
    const node = ensureAction(id, depth);
    if (node === undefined || expandedActions.has(id)) return;
    if (active.has(id)) {
      work.cycles += 1;
      return;
    }
    expandedActions.add(id);
    phases.expandDependencies += 1;
    const definition = byId.get(id)!;
    const applicability =
      id === input.targetActionId
        ? (input.terminalEligibility ?? input.applicabilityByActionId?.get(id))
        : input.applicabilityByActionId?.get(id);
    if (applicability?.status === "unknown")
      for (const reason of applicability.reasons)
        if (!addActionReason(node, reason)) return;
    if (applicability?.status === "excluded")
      for (const reason of applicability.reasons)
        if (!addActionReason(node, `excluded: ${reason}`)) return;
    if (
      definition.hasNativeCondition &&
      !addActionReason(
        node,
        id === input.targetActionId
          ? "terminal native condition not evaluated"
          : "native condition not evaluated",
      )
    )
      return;
    if (
      definition.routeRestrictions !== undefined &&
      applicability?.status !== "eligible" &&
      !addActionReason(node, "route restriction not validated")
    )
      return;
    if (
      definition.restrictions.length > 0 &&
      applicability?.status !== "eligible" &&
      !addActionReason(
        node,
        "trait, gene, or technology restrictions not validated",
      )
    )
      return;
    if (definition.prerequisites.kind !== "declared") {
      unknownPrerequisiteActionIds.add(id);
      addActionReason(node, definition.prerequisites.reason);
      return;
    }
    active.add(id);
    const prereqs = boundedSort(
      definition.prerequisites.requirements,
      (a, b) =>
        requirementKey(a.technologyId, a.requiredLevel).localeCompare(
          requirementKey(b.technologyId, b.requiredLevel),
        ),
      "prerequisite-order-budget",
    );
    if (prereqs === undefined) {
      active.delete(id);
      return;
    }
    for (const prerequisite of prereqs) {
      const reqNode = ensureRequirement(
        prerequisite.technologyId,
        prerequisite.requiredLevel,
        depth + 1,
      );
      if (reqNode === undefined) continue;
      if (!consume("total-operation-budget")) break;
      if (node.prerequisiteRequirementIds.at(-1) !== reqNode.id) {
        node.prerequisiteRequirementIds.push(reqNode.id);
        work.retainedActionRequirementReferences += 1;
      }
      if (
        reqNode.status === "satisfied" ||
        expandedRequirements.has(reqNode.id)
      )
        continue;
      expandedRequirements.add(reqNode.id);
      work.requirementExpansions += 1;
      const actions: NativeResearchActionDefinition[] = [];
      for (const candidate of byGrant.get(reqNode.technologyId) ?? []) {
        if (!consume("alternative-examination-budget")) break;
        work.alternativesExplored += 1;
        if (candidate.grantLevel >= reqNode.requiredLevel)
          actions.push(candidate);
      }
      if (work.truncated) break;
      for (const candidate of actions) {
        reqNode.alternativeActionIds.push(candidate.actionId);
        work.retainedAlternativeReferences += 1;
        if (active.has(candidate.actionId)) {
          work.cycles += 1;
          continue;
        }
        expandAction(candidate.actionId, depth + 1);
        if (work.truncated) break;
      }
      if (actions.length === 0)
        addRequirementReason(
          reqNode,
          `no retained action grants ${reqNode.technologyId} ${reqNode.requiredLevel}`,
        );
    }
    active.delete(id);
  };

  const targetExists = byId.has(input.targetActionId);
  if (targetExists) expandAction(input.targetActionId, 0);
  else
    reasons.push(
      `terminal action ${input.targetActionId} is missing from effective definitions`,
    );

  let hasUnknownReachableRequirement = false;
  const candidateEvidence = new Map<string, CandidateEvidence>();
  const candidateRequirements = new Map<string, Set<string>>();
  const visitedStates = new Set<string>();
  type WalkPath = {
    readonly actionId: string;
    readonly previous: WalkPath | undefined;
  };
  type WalkState = {
    readonly actionId: string;
    readonly excluded: boolean;
    readonly conditional: boolean;
    readonly path: WalkPath | undefined;
  };
  const queue: WalkState[] = byId.has(input.targetActionId)
    ? [
        {
          actionId: input.targetActionId,
          excluded: false,
          conditional: false,
          path: undefined,
        },
      ]
    : [];
  const pathContains = (path: WalkPath | undefined, actionId: string) => {
    for (let cursor = path; cursor !== undefined; cursor = cursor.previous) {
      if (!consume("cycle-processing-budget")) return undefined;
      if (cursor.actionId === actionId) return true;
    }
    return false;
  };
  while (queue.length > 0 && !work.truncated) {
    const state = queue.shift()!;
    if (!consume("total-operation-budget")) break;
    phases.discoverCandidates += 1;
    const stateKey = `${state.actionId}|${state.excluded ? 1 : 0}|${state.conditional ? 1 : 0}`;
    if (visitedStates.has(stateKey)) continue;
    visitedStates.add(stateKey);
    const node = actionNodes.get(state.actionId);
    if (node === undefined) continue;
    const app =
      state.actionId === input.targetActionId
        ? (input.terminalEligibility ??
          input.applicabilityByActionId?.get(state.actionId))
        : input.applicabilityByActionId?.get(state.actionId);
    const localExcluded =
      state.excluded ||
      app?.status === "excluded" ||
      node.reasons.some((reason) => reason.startsWith("excluded:"));
    const localConditional =
      state.conditional ||
      app?.status === "unknown" ||
      node.reasons.some((reason) => !reason.startsWith("excluded:")) ||
      node.prerequisiteStatus === "unknown" ||
      !offerById.has(state.actionId);
    const offer = offerById.get(state.actionId);
    if (offer !== undefined && state.actionId !== input.targetActionId) {
      let evidence = candidateEvidence.get(state.actionId);
      if (evidence === undefined) {
        if (!consume("candidate-budget")) break;
        if (work.candidateEvaluations >= input.maxCandidates) {
          work.truncated = true;
          work.truncationReasons.push("candidate-count-budget");
          break;
        }
        const path: string[] = [];
        for (
          let cursor = state.path;
          cursor !== undefined;
          cursor = cursor.previous
        )
          path.push(cursor.actionId);
        path.reverse();
        for (let i = 0; i < path.length + 1; i += 1) {
          if (!consume("witness-construction-budget")) break;
        }
        if (work.truncated) break;
        if (!consume("witness-construction-budget")) break;
        evidence = {
          actionIds: [...path, state.actionId],
          connectedRequirementIds: new Set(
            candidateRequirements.get(state.actionId) ?? [],
          ),
          reasons: new Set(),
          excludedReasons: new Set(),
          conditionalReasons: new Set(),
          declaredRoute: false,
          unknownRoute: false,
          pathKinds: new Set(),
        };
        candidateEvidence.set(state.actionId, evidence);
        work.retainedCandidateWitnesses += 1;
        work.candidateEvaluations += 1;
        work.retainedPathActionReferences += evidence.actionIds.length;
      }
      const pathNodes: MutableAction[] = [];
      for (const id of evidence.actionIds) {
        if (!consume("candidate-discovery-budget")) break;
        const pathNode = actionNodes.get(id);
        if (pathNode === undefined) continue;
        pathNodes.push(pathNode);
        if (!consumeMany(pathNode.reasons.length, "candidate-discovery-budget"))
          break;
      }
      if (work.truncationReasons.includes("candidate-discovery-budget")) break;
      if (localExcluded) {
        for (const pathNode of pathNodes)
          for (const reason of pathNode.reasons.filter((value) =>
            value.startsWith("excluded:"),
          ))
            retainCandidateReason(
              evidence.excludedReasons,
              reason.slice("excluded:".length).trim(),
            );
        evidence.pathKinds.add("excluded");
      } else if (localConditional) {
        for (const pathNode of pathNodes)
          for (const reason of pathNode.reasons.filter(
            (value) => !value.startsWith("excluded:"),
          ))
            retainCandidateReason(evidence.conditionalReasons, reason);
        retainCandidateReason(
          evidence.conditionalReasons,
          "future native offer membership is unvalidated",
        );
        evidence.pathKinds.add("conditional");
      } else {
        evidence.declaredRoute = true;
        evidence.pathKinds.add("declared");
      }
      if (node.prerequisiteStatus === "unknown") evidence.unknownRoute = true;
    }
    if (node.prerequisiteStatus === "unknown") continue;
    for (const reqId of node.prerequisiteRequirementIds) {
      const reqNode = requirementNodes.get(reqId);
      if (reqNode === undefined) continue;
      if (reqNode.status === "unknown") hasUnknownReachableRequirement = true;
      for (const alternative of reqNode.alternativeActionIds) {
        if (!consume("total-operation-budget")) break;
        work.alternativesExplored += 1;
        const cycle = pathContains(state.path, alternative);
        if (work.truncated) break;
        if (cycle || alternative === state.actionId) {
          work.cycles += 1;
          continue;
        }
        if (offerById.has(alternative)) {
          const connected =
            candidateRequirements.get(alternative) ?? new Set<string>();
          if (!connected.has(reqId)) {
            connected.add(reqId);
            work.retainedCandidateRequirementReferences += 1;
          }
          candidateRequirements.set(alternative, connected);
          const evidence = candidateEvidence.get(alternative);
          evidence?.connectedRequirementIds.add(reqId);
        }
        queue.push({
          actionId: alternative,
          excluded: localExcluded,
          conditional: localConditional || reqNode.status === "unknown",
          path: { actionId: state.actionId, previous: state.path },
        });
        work.peakPendingWalkStates = Math.max(
          work.peakPendingWalkStates,
          queue.length,
        );
      }
      if (work.truncationReasons.includes("witness-construction-budget")) break;
    }
  }

  for (const offer of offers) {
    if (
      offer.actionId === input.targetActionId ||
      candidateEvidence.has(offer.actionId)
    )
      continue;
    if (!consume("candidate-budget")) break;
    if (work.candidateEvaluations >= input.maxCandidates) {
      work.truncated = true;
      work.truncationReasons.push("candidate-count-budget");
      break;
    }
    const unknownRelationship =
      !targetExists ||
      work.truncated ||
      actionNodes.get(input.targetActionId)?.prerequisiteStatus === "unknown" ||
      unknownPrerequisiteActionIds.size > 0 ||
      hasUnknownReachableRequirement;
    const evidence: CandidateEvidence = {
      actionIds: [],
      connectedRequirementIds: new Set(),
      reasons: new Set(),
      excludedReasons: new Set(),
      conditionalReasons: new Set(),
      declaredRoute: false,
      unknownRoute: unknownRelationship,
      pathKinds: new Set([unknownRelationship ? "unknown" : "unrelated"]),
    };
    if (work.truncated)
      retainCandidateReason(
        evidence.conditionalReasons,
        "dependency search incomplete; relationship is unknown",
      );
    if (unknownRelationship && !work.truncated)
      retainCandidateReason(
        evidence.conditionalReasons,
        targetExists
          ? unknownPrerequisiteActionIds.size > 0
            ? "reachable action has an unknown prerequisite declaration; relationship is unresolved"
            : "terminal dependency evidence is insufficient to classify this offer"
          : "terminal action definition is unavailable; relationship is unknown",
      );
    candidateEvidence.set(offer.actionId, evidence);
    work.retainedCandidateWitnesses += 1;
    work.candidateEvaluations += 1;
  }

  const output: AdvisoryResearchCandidate[] = [];
  const frozenRequirementWitnesses = new Map<
    string,
    Readonly<AdvisoryRequirementWitness>
  >();
  const getRequirementWitness = (id: string) => {
    const cached = frozenRequirementWitnesses.get(id);
    if (cached !== undefined) return cached;
    const node = requirementNodes.get(id);
    if (node === undefined) return undefined;
    if (
      !consumeMany(
        1 + node.alternativeActionIds.length + node.reasons.length,
        "witness-construction-budget",
      )
    )
      return undefined;
    const witness = Object.freeze({
      ...node,
      alternativeActionIds: Object.freeze([...node.alternativeActionIds]),
      reasons: Object.freeze(sortedUnique(node.reasons)),
    });
    frozenRequirementWitnesses.set(id, witness);
    work.retainedRequirementWitnesses += 1;
    work.retainedAlternativeReferences += node.alternativeActionIds.length;
    work.retainedReasonReferences += node.reasons.length;
    return witness;
  };
  for (const [actionId, evidence] of candidateEvidence) {
    if (!consume("witness-construction-budget")) break;
    const offer = offerById.get(actionId)!;
    if (
      !consumeMany(
        evidence.connectedRequirementIds.size,
        "witness-construction-budget",
      )
    )
      break;
    const connected = sortedUnique(evidence.connectedRequirementIds);
    const advances = connected[0];
    work.retainedCandidateRequirementReferences += connected.length * 2;
    const advancesRequirements: Readonly<AdvisoryRequirementWitness>[] = [];
    for (const id of connected) {
      const witness = getRequirementWitness(id);
      if (work.truncationReasons.includes("witness-construction-budget")) break;
      if (witness !== undefined) advancesRequirements.push(witness);
    }
    if (work.truncationReasons.includes("witness-construction-budget")) break;
    const pathRequirementIds = new Set<string>();
    for (let index = 0; index < evidence.actionIds.length - 1; index += 1) {
      if (!consume("witness-construction-budget")) break;
      const parent = actionNodes.get(evidence.actionIds[index]!);
      const childId = evidence.actionIds[index + 1]!;
      for (const requirementId of parent?.prerequisiteRequirementIds ?? []) {
        if (!consume("witness-construction-budget")) break;
        const alternatives =
          requirementNodes.get(requirementId)?.alternativeActionIds ?? [];
        for (const alternative of alternatives) {
          if (!consume("witness-construction-budget")) break;
          if (alternative === childId) pathRequirementIds.add(requirementId);
        }
        if (work.truncationReasons.includes("witness-construction-budget"))
          break;
      }
      if (work.truncationReasons.includes("witness-construction-budget")) break;
    }
    if (work.truncationReasons.includes("witness-construction-budget")) break;
    const requiredByWitnessActionsSet = new Set<string>();
    for (const id of evidence.actionIds) {
      if (!consume("witness-construction-budget")) break;
      for (const reqId of actionNodes.get(id)?.prerequisiteRequirementIds ??
        []) {
        if (!consume("witness-construction-budget")) break;
        requiredByWitnessActionsSet.add(reqId);
      }
      if (work.truncationReasons.includes("witness-construction-budget")) break;
    }
    if (work.truncationReasons.includes("witness-construction-budget")) break;
    const requiredByWitnessActions = sortedUnique(requiredByWitnessActionsSet);
    const remaining: Readonly<AdvisoryRequirementWitness>[] = [];
    for (const id of requiredByWitnessActions) {
      if (!consume("witness-construction-budget")) break;
      if (
        pathRequirementIds.has(id) ||
        evidence.connectedRequirementIds.has(id)
      )
        continue;
      const witness = getRequirementWitness(id);
      if (work.truncationReasons.includes("witness-construction-budget")) break;
      if (witness !== undefined) {
        remaining.push(witness);
        work.retainedCandidateRequirementReferences += 1;
      }
    }
    if (work.truncationReasons.includes("witness-construction-budget")) break;
    if (
      !consumeMany(
        evidence.reasons.size +
          evidence.conditionalReasons.size +
          evidence.excludedReasons.size,
        "witness-construction-budget",
      )
    )
      break;
    const pathReasons = sortedUnique([
      ...evidence.reasons,
      ...evidence.conditionalReasons,
      ...evidence.excludedReasons,
    ]);
    const routeEvidence = evidence.pathKinds.has("declared")
      ? "declared-contribution"
      : evidence.pathKinds.has("conditional")
        ? "conditional-contribution"
        : evidence.pathKinds.has("excluded") && !work.truncated
          ? "excluded"
          : evidence.pathKinds.has("unknown") ||
              evidence.unknownRoute ||
              work.truncated
            ? "unknown"
            : evidence.pathKinds.has("excluded")
              ? "excluded"
              : evidence.pathKinds.has("unrelated")
                ? "unrelated"
                : "unknown";
    const remainingConditions: string[] = [];
    for (const requirement of remaining) {
      for (const alternative of requirement.alternativeActionIds) {
        if (!consume("witness-construction-budget")) break;
        const action = actionNodes.get(alternative);
        if (action !== undefined) {
          if (
            !consumeMany(action.reasons.length, "witness-construction-budget")
          )
            break;
          remainingConditions.push(...action.reasons);
          if (action.prerequisiteStatus === "unknown")
            if (!consume("witness-construction-budget")) break;
          if (action.prerequisiteStatus === "unknown")
            remainingConditions.push(
              "native prerequisite declaration is unknown",
            );
        }
      }
      if (work.truncationReasons.includes("witness-construction-budget")) break;
    }
    if (work.truncationReasons.includes("witness-construction-budget")) break;
    const conditional = sortedUnique([
      ...evidence.conditionalReasons,
      ...remainingConditions,
    ]);
    const dependencyReasons = sortedUnique([...pathReasons, ...conditional]);
    const candidateReasons = [
      "current native offer proves actionability for this observation only",
      ...pathReasons,
      ...(routeEvidence === "excluded"
        ? ["all recorded connections require an explicitly excluded branch"]
        : []),
      ...(conditional.length > 0
        ? ["future eligibility or offer authority remains unresolved"]
        : []),
    ];
    if (
      !consumeMany(
        dependencyReasons.length + candidateReasons.length,
        "witness-construction-budget",
      )
    )
      break;
    if (
      input.resourceStocks !== undefined &&
      !consumeMany(
        Object.keys(offer.cost).length + input.resourceStocks.length + 1,
        "witness-construction-budget",
      )
    )
      break;
    const affordability =
      input.resourceStocks === undefined
        ? undefined
        : evaluateGoalFeasibility(
            actionId,
            Object.entries(offer.cost).map(([resourceId, amount]) => ({
              resourceId,
              poolId: "anywhere",
              amount,
            })),
            input.resourceStocks,
            [],
            input.validityEpoch,
            input.commitmentsKnown ?? false,
          );
    output.push(
      Object.freeze({
        actionId,
        currentActionability: "current-native-offer",
        mandatoryObligation: "not-certified",
        authorizationToSpend: false,
        generation: offer.generation,
        cost: offer.cost,
        nativeAffordable: offer.nativeAffordable,
        terminalActionId: input.targetActionId,
        routeEvidence,
        dependencyWitness: Object.freeze({
          advancesRequirementId: advances,
          connectedRequirementIds: Object.freeze(connected),
          advancesRequirements: Object.freeze(advancesRequirements),
          remainingRequirements: Object.freeze(remaining),
          pathActionIds: Object.freeze(evidence.actionIds),
          reasons: Object.freeze(dependencyReasons),
        }),
        currentAffordability: affordability,
        reasons: Object.freeze(candidateReasons),
      }),
    );
    work.retainedCandidateWitnesses += 1;
    work.retainedReasonReferences +=
      dependencyReasons.length + candidateReasons.length;
  }
  if (work.truncated)
    reasons.push(
      "bounded dependency exploration exhausted; route coverage and candidate comparison are incomplete",
    );
  const status = work.truncated
    ? "incomplete"
    : !targetExists
      ? "unavailable"
      : output.length > 0
        ? "complete"
        : targetExists
          ? "complete"
          : "unavailable";
  return Object.freeze({
    status,
    candidates: Object.freeze(output),
    selectedActionId: undefined,
    selection: "none",
    work: freezeWork(),
    reasons: Object.freeze(sortedUnique(reasons)),
  });
}
