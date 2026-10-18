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
  readonly maxDependencyExpansions: number;
  readonly maxDependencyDepth: number;
  readonly maxCandidates: number;
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
  readonly terminalRelationship: "declared-dependency" | "unknown";
  readonly knownPrerequisiteChain: readonly string[];
  readonly alternativeBranches: readonly (readonly string[])[];
  readonly missingRequirements: readonly string[];
  readonly nativeConditionsNotValidated: readonly string[];
  readonly excludedRoutes: readonly string[];
  readonly conditionalFutureSteps: readonly string[];
  readonly currentAffordability: Readonly<GoalFeasibility> | undefined;
  readonly strategicBenefit: "proven" | "provisional" | "unquantifiable";
  readonly reasons: readonly string[];
}

export interface AdvisoryResearchRoutePlan {
  readonly status: "complete" | "incomplete" | "unavailable";
  readonly candidates: readonly Readonly<AdvisoryResearchCandidate>[];
  readonly selectedActionId: string | undefined;
  readonly selection: "ordered" | "provisional" | "ambiguous" | "none";
  readonly work: Readonly<{
    nodesVisited: number;
    alternativesExplored: number;
    cycles: number;
    sharedSubgraphReuse: number;
    truncated: boolean;
    truncationReasons: readonly string[];
    candidateEvaluations: number;
    phases: Readonly<Record<string, number>>;
  }>;
  readonly reasons: readonly string[];
}

type RoutePath = {
  actions: string[];
  missing: string[];
  conditions: string[];
  exclusions: string[];
  conditional: string[];
};

const requirementKey = (technologyId: string, level: number) =>
  `${technologyId}:${level}`;

/** Advisory only: current offers remain actionable independently of route certainty. */
export function planAdvisoryResearchRoutes(
  input: Readonly<AdvisoryResearchRouteInput>,
): Readonly<AdvisoryResearchRoutePlan> {
  const phases = {
    indexDefinitions: 0,
    expandDependencies: 0,
    evaluateCandidates: 0,
  };
  const work = {
    nodesVisited: 0,
    alternativesExplored: 0,
    cycles: 0,
    sharedSubgraphReuse: 0,
    truncated: false,
    truncationReasons: [] as string[],
    candidateEvaluations: 0,
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
      work: Object.freeze({
        ...work,
        truncationReasons: Object.freeze([...work.truncationReasons]),
        phases: Object.freeze({ ...phases }),
      }),
      reasons: Object.freeze(reasons),
    });
  }

  const definitions = input.definitions!;
  const grants = input.grantLevels!;
  const offers = input.offers!;
  phases.indexDefinitions = definitions.length;
  const byId = new Map(
    definitions.map((definition) => [definition.actionId, definition]),
  );
  const byGrant = new Map<string, NativeResearchActionDefinition[]>();
  for (const definition of definitions) {
    const entries = byGrant.get(definition.grantTechnology) ?? [];
    entries.push(definition);
    byGrant.set(definition.grantTechnology, entries);
  }
  const offerById = new Map(offers.map((offer) => [offer.actionId, offer]));
  const actionCache = new Map<string, RoutePath[]>();
  const requirementCache = new Map<string, RoutePath[]>();
  const active = new Set<string>();
  const actionStack: string[] = [];
  const candidates = new Map<string, RoutePath[]>();
  const encounteredExclusions: string[] = [];

  const expandAction = (actionId: string, depth = 0): RoutePath[] => {
    if (active.has(actionId)) {
      work.cycles += 1;
      return [];
    }
    const cached = actionCache.get(actionId);
    if (cached !== undefined) {
      work.sharedSubgraphReuse += 1;
      return cached;
    }
    if (work.nodesVisited >= input.maxDependencyExpansions) {
      work.truncated = true;
      work.truncationReasons.push("dependency-expansion-budget");
      return [];
    }
    if (depth >= input.maxDependencyDepth) {
      work.truncated = true;
      work.truncationReasons.push("dependency-depth-budget");
      return [];
    }
    work.nodesVisited += 1;
    phases.expandDependencies += 1;
    const definition = byId.get(actionId);
    if (definition === undefined) return [];
    active.add(actionId);
    actionStack.push(actionId);
    const app = input.applicabilityByActionId?.get(actionId);
    const conditions: string[] = [];
    const exclusions: string[] = [];
    if (app?.status === "unknown") conditions.push(...app.reasons);
    if (app?.status === "excluded") exclusions.push(...app.reasons);
    if (definition.hasNativeCondition)
      conditions.push("native condition not evaluated");
    if (
      definition.routeRestrictions !== undefined &&
      app?.status !== "eligible"
    )
      conditions.push("route restriction not validated");
    if (definition.restrictions.length > 0 && app?.status !== "eligible")
      conditions.push("trait, gene, or technology restrictions not validated");
    if (exclusions.length > 0)
      encounteredExclusions.push(`${actionId}: ${exclusions.join(", ")}`);

    let paths: RoutePath[];
    if (offerById.has(actionId)) {
      paths = [
        {
          actions: [actionId],
          missing: [],
          conditions,
          exclusions,
          conditional: [],
        },
      ];
      const candidatePaths = candidates.get(actionId) ?? [];
      candidatePaths.push({
        actions: [...actionStack].reverse(),
        missing: [],
        conditions,
        exclusions,
        conditional: [],
      });
      candidates.set(actionId, candidatePaths);
    } else if (definition.prerequisites.kind !== "declared") {
      paths = [
        {
          actions: [actionId],
          missing: [],
          conditions,
          exclusions,
          conditional: [
            definition.prerequisites.reason,
            "future native offer membership is unvalidated",
          ],
        },
      ];
    } else {
      const branches: RoutePath[] = [];
      for (const prerequisite of definition.prerequisites.requirements) {
        const level = grants.get(prerequisite.technologyId);
        if (level === undefined || !Number.isFinite(level) || level < 0) {
          branches.push({
            actions: [actionId],
            missing: [
              `current grant level unavailable: ${prerequisite.technologyId}`,
            ],
            conditions,
            exclusions,
            conditional: ["future native offer membership is unvalidated"],
          });
          continue;
        }
        if (level >= prerequisite.requiredLevel) continue;
        const key = requirementKey(
          prerequisite.technologyId,
          prerequisite.requiredLevel,
        );
        let routes = requirementCache.get(key);
        if (routes !== undefined) work.sharedSubgraphReuse += 1;
        else {
          const actions = (byGrant.get(prerequisite.technologyId) ?? []).filter(
            (candidate) => candidate.grantLevel >= prerequisite.requiredLevel,
          );
          actions.sort(
            (left, right) =>
              Number(offerById.has(right.actionId)) -
              Number(offerById.has(left.actionId)),
          );
          work.alternativesExplored += actions.length;
          routes = [];
          if (actions.length === 0)
            routes.push({
              actions: [],
              missing: [
                `no retained action grants ${prerequisite.technologyId} ${prerequisite.requiredLevel}`,
              ],
              conditions: [],
              exclusions: [],
              conditional: [],
            });
          for (const candidate of actions) {
            for (const route of expandAction(candidate.actionId, depth + 1)) {
              if (routes.length >= input.maxDependencyExpansions) {
                work.truncated = true;
                work.truncationReasons.push("route-alternative-budget");
                break;
              }
              routes.push(route);
            }
          }
          requirementCache.set(key, routes);
        }
        for (const route of routes)
          branches.push({
            actions: [...route.actions, actionId],
            missing: [...route.missing],
            conditions: [...conditions, ...route.conditions],
            exclusions: [...exclusions, ...route.exclusions],
            conditional: [
              "future native offer membership is unvalidated",
              ...route.conditional,
            ],
          });
      }
      paths =
        branches.length > 0
          ? branches
          : [
              {
                actions: [actionId],
                missing: [],
                conditions,
                exclusions,
                conditional: ["future native offer membership is unvalidated"],
              },
            ];
    }
    active.delete(actionId);
    actionStack.pop();
    actionCache.set(actionId, paths);
    return paths;
  };

  const target = byId.get(input.targetActionId);
  const otherRequiredBranchEvidence = {
    missing: [] as string[],
    conditions: [] as string[],
    exclusions: [] as string[],
    conditional: [] as string[],
  };
  if (target === undefined) {
    reasons.push(
      `terminal action ${input.targetActionId} is missing from effective definitions`,
    );
  } else if (target.prerequisites.kind !== "declared") {
    reasons.push(target.prerequisites.reason);
  } else {
    const terminalApp =
      input.terminalEligibility ??
      input.applicabilityByActionId?.get(target.actionId);
    const terminalConditions = target.hasNativeCondition
      ? ["terminal native condition not evaluated"]
      : [];
    const terminalExclusions =
      terminalApp?.status === "excluded" ? [...terminalApp.reasons] : [];
    if (terminalApp?.status === "unknown")
      terminalConditions.push(...terminalApp.reasons);
    if (
      target.routeRestrictions !== undefined &&
      terminalApp?.status !== "eligible"
    )
      terminalConditions.push("terminal route restriction not validated");
    if (target.restrictions.length > 0 && terminalApp?.status !== "eligible")
      terminalConditions.push(
        "terminal trait, gene, or technology restrictions not validated",
      );
    const terminalConditional = offerById.has(target.actionId)
      ? []
      : ["terminal future native offer membership is unvalidated"];
    if (terminalExclusions.length > 0)
      encounteredExclusions.push(
        `${target.actionId}: ${terminalExclusions.join(", ")}`,
      );

    for (const prerequisite of target.prerequisites.requirements) {
      const level = grants.get(prerequisite.technologyId);
      if (level === undefined || !Number.isFinite(level) || level < 0) {
        reasons.push(
          `current grant level unavailable: ${prerequisite.technologyId}`,
        );
        continue;
      }
      if (level >= prerequisite.requiredLevel) continue;
      const key = requirementKey(
        prerequisite.technologyId,
        prerequisite.requiredLevel,
      );
      let routes = requirementCache.get(key);
      if (routes !== undefined) work.sharedSubgraphReuse += 1;
      else {
        const actions = (byGrant.get(prerequisite.technologyId) ?? []).filter(
          (candidate) => candidate.grantLevel >= prerequisite.requiredLevel,
        );
        actions.sort(
          (left, right) =>
            Number(offerById.has(right.actionId)) -
            Number(offerById.has(left.actionId)),
        );
        work.alternativesExplored += actions.length;
        routes = [];
        if (actions.length === 0)
          routes.push({
            actions: [],
            missing: [
              `no retained action grants ${prerequisite.technologyId} ${prerequisite.requiredLevel}`,
            ],
            conditions: [],
            exclusions: [],
            conditional: [],
          });
        for (const candidate of actions) {
          for (const route of expandAction(candidate.actionId, 1)) {
            if (routes.length >= input.maxDependencyExpansions) {
              work.truncated = true;
              work.truncationReasons.push("route-alternative-budget");
              break;
            }
            routes.push(route);
          }
        }
        requirementCache.set(key, routes);
      }
      for (const route of routes) {
        const full = {
          actions: [...route.actions, target.actionId],
          missing: route.missing,
          conditions: [...route.conditions, ...terminalConditions],
          exclusions: [...route.exclusions, ...terminalExclusions],
          conditional: [...route.conditional, ...terminalConditional],
        };
        const currentOffer = offerById.get(route.actions[0] ?? "");
        if (currentOffer === undefined) continue;
        const existing = candidates.get(currentOffer.actionId) ?? [];
        existing.push(full);
        candidates.set(currentOffer.actionId, existing);
      }
      if (!routes.some((route) => offerById.has(route.actions[0] ?? ""))) {
        for (const route of routes) {
          otherRequiredBranchEvidence.missing.push(...route.missing);
          otherRequiredBranchEvidence.conditions.push(...route.conditions);
          otherRequiredBranchEvidence.exclusions.push(...route.exclusions);
          otherRequiredBranchEvidence.conditional.push(...route.conditional);
        }
      }
    }
  }

  const output: AdvisoryResearchCandidate[] = [];
  for (const [actionId, rawPaths] of candidates) {
    if (output.length >= input.maxCandidates) {
      work.truncated = true;
      work.truncationReasons.push("candidate-evaluation-budget");
      break;
    }
    work.candidateEvaluations += 1;
    phases.evaluateCandidates += 1;
    const offer = offerById.get(actionId)!;
    const completedPaths = rawPaths.map((path) => {
      const actions =
        path.actions.at(-1) === input.targetActionId
          ? path.actions
          : [...path.actions, input.targetActionId];
      const inheritedConditions: string[] = [];
      const inheritedExclusions: string[] = [];
      const inheritedConditional: string[] = [];
      for (const stepId of actions.slice(1)) {
        const definition = byId.get(stepId);
        if (definition === undefined) continue;
        const applicability =
          stepId === input.targetActionId
            ? (input.terminalEligibility ??
              input.applicabilityByActionId?.get(stepId))
            : input.applicabilityByActionId?.get(stepId);
        if (applicability?.status === "unknown")
          inheritedConditions.push(...applicability.reasons);
        if (applicability?.status === "excluded")
          inheritedExclusions.push(...applicability.reasons);
        if (definition.hasNativeCondition)
          inheritedConditions.push(
            stepId === input.targetActionId
              ? "terminal native condition not evaluated"
              : "native condition not evaluated",
          );
        if (
          definition.routeRestrictions !== undefined &&
          applicability?.status !== "eligible"
        )
          inheritedConditions.push("route restriction not validated");
        if (
          definition.restrictions.length > 0 &&
          applicability?.status !== "eligible"
        )
          inheritedConditions.push(
            "trait, gene, or technology restrictions not validated",
          );
        if (!offerById.has(stepId))
          inheritedConditional.push(
            stepId === input.targetActionId
              ? "terminal future native offer membership is unvalidated"
              : "future native offer membership is unvalidated",
          );
      }
      return {
        ...path,
        actions,
        conditions: [...path.conditions, ...inheritedConditions],
        exclusions: [...path.exclusions, ...inheritedExclusions],
        conditional: [...path.conditional, ...inheritedConditional],
      };
    });
    const paths = completedPaths.filter((path) => path.exclusions.length === 0);
    const evidencePaths = paths.length > 0 ? paths : completedPaths;
    const unique = (
      field: "missing" | "conditions" | "exclusions" | "conditional",
    ) => [...new Set(evidencePaths.flatMap((path) => path[field]))];
    const chains = [
      ...new Map(
        evidencePaths.map((path) => [
          path.actions.join("\u0000"),
          [...path.actions],
        ]),
      ).values(),
    ];
    const missing = [
      ...new Set([
        ...unique("missing"),
        ...otherRequiredBranchEvidence.missing,
      ]),
    ];
    const conditions = [
      ...new Set([
        ...unique("conditions"),
        ...otherRequiredBranchEvidence.conditions,
      ]),
    ];
    const excluded = [
      ...new Set([
        ...unique("exclusions"),
        ...otherRequiredBranchEvidence.exclusions,
      ]),
    ];
    const conditional = [
      ...new Set([
        ...unique("conditional"),
        ...otherRequiredBranchEvidence.conditional,
      ]),
    ];
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
        terminalRelationship: "declared-dependency",
        knownPrerequisiteChain: chains[0] ?? [],
        alternativeBranches: Object.freeze(
          chains.map((chain) => Object.freeze(chain)),
        ),
        missingRequirements: Object.freeze(missing),
        nativeConditionsNotValidated: Object.freeze(conditions),
        excludedRoutes: Object.freeze(excluded),
        conditionalFutureSteps: Object.freeze(conditional),
        currentAffordability: affordability,
        strategicBenefit:
          missing.length > 0
            ? "unquantifiable"
            : conditions.length + conditional.length + excluded.length > 0
              ? "provisional"
              : "proven",
        reasons: Object.freeze([
          "current native offer proves actionability for this observation only",
          ...(conditions.length + conditional.length > 0
            ? ["future eligibility remains uncertain"]
            : []),
          ...(excluded.length > 0
            ? ["some declared routes are explicitly excluded"]
            : []),
        ]),
      }),
    );
  }

  const comparable = output.filter(
    (candidate) =>
      candidate.currentAffordability?.estimatedTime !== undefined &&
      candidate.currentAffordability.authority === "validated",
  );
  const sameBasis =
    comparable.length === output.length &&
    comparable.length > 0 &&
    comparable.every(
      (candidate) =>
        candidate.currentAffordability!.validityEpoch ===
        comparable[0]!.currentAffordability!.validityEpoch,
    );
  const ranked = sameBasis
    ? [...comparable].sort(
        (left, right) =>
          left.currentAffordability!.estimatedTime! -
          right.currentAffordability!.estimatedTime!,
      )
    : [];
  const tied =
    ranked.length > 1 &&
    ranked[0]!.currentAffordability!.estimatedTime ===
      ranked[1]!.currentAffordability!.estimatedTime;
  const selected = ranked.length > 0 && !tied ? ranked[0] : undefined;
  if (work.truncated)
    reasons.push(
      "dependency or candidate search budget exhausted; unexplored alternatives remain",
    );
  const status = work.truncated
    ? "incomplete"
    : output.length > 0
      ? "complete"
      : "unavailable";
  return Object.freeze({
    status,
    candidates: Object.freeze(output),
    selectedActionId: selected?.actionId,
    selection:
      selected === undefined
        ? output.length > 1
          ? "ambiguous"
          : output.length === 1
            ? "provisional"
            : "none"
        : selected.strategicBenefit === "proven"
          ? "ordered"
          : "provisional",
    work: Object.freeze({
      ...work,
      truncationReasons: Object.freeze([...new Set(work.truncationReasons)]),
      phases: Object.freeze({ ...phases }),
    }),
    reasons: Object.freeze([...new Set(reasons)]),
  });
}
