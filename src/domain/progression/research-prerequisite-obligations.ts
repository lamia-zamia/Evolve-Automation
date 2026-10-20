import type {
  NativeResearchActionDefinition,
  NativeResearchApplicability,
  NativeResearchPrerequisiteGraph,
} from "./research-prerequisite-planning.ts";
import {
  admitResourceClaim,
  type ResourceClaim,
  type ResourceClaimEvidence,
} from "../economy/resources/resource-claims.ts";

export interface ResearchPrerequisiteObligationPlan {
  readonly status: "verified" | "unavailable";
  readonly inputConsistency?: "consistent" | "incomplete" | "inconsistent";
  readonly inputConsistencyReasons?: readonly string[];
  readonly mandatoryActionIds: readonly string[];
  readonly alternativeGroups: readonly Readonly<{
    readonly requirementId: string;
    readonly actionIds: readonly string[];
  }>[];
  readonly mandatoryProofs?: readonly Readonly<{
    readonly actionId: string;
    readonly requirementId: string;
    readonly technologyId: string;
    readonly requiredLevel: number;
    readonly grantAlternatives: readonly Readonly<{
      readonly actionId: string;
      readonly outcome: CandidatePathResult;
    }>[];
    readonly supportingRequirements: readonly Readonly<{
      readonly requirementId: string;
      readonly grantAlternatives: readonly Readonly<{
        readonly actionId: string;
        readonly outcome: CandidatePathResult;
      }>[];
    }>[];
  }>[];
  readonly work?: Readonly<{
    nativePathVisits: number;
    nativePathVisitBudget: number;
  }>;
  readonly reasons: readonly string[];
  readonly authority?: Readonly<{
    readonly targetActionId: string;
    readonly freshness: NativeResearchPrerequisiteGraph["freshness"];
    readonly snapshotIdentity: string;
  }>;
}

export function currentMandatoryResearchEvidence(
  plan: Readonly<ResearchPrerequisiteObligationPlan>,
  graph: Readonly<NativeResearchPrerequisiteGraph>,
  input: Readonly<{
    goalActionId: string;
    ownerCycle: number;
    progressionEpoch: string;
    rootGeneration: number;
    offers: ReadonlyMap<string, number>;
  }>,
): "complete" | "partial" | "unavailable" {
  if (plan.status === "unavailable") return "unavailable";
  if (plan.inputConsistency !== "consistent") return "partial";
  const authority = plan.authority;
  const graphOffers = graph.freshness.offerGenerations;
  if (
    authority === undefined ||
    !Number.isSafeInteger(input.ownerCycle) ||
    input.ownerCycle < 0 ||
    !Number.isSafeInteger(input.rootGeneration) ||
    input.rootGeneration < 0 ||
    authority.targetActionId !== input.goalActionId ||
    graph.targetActionId !== input.goalActionId ||
    graph.freshness.cycle !== input.ownerCycle ||
    authority.snapshotIdentity !==
      researchPrerequisiteSnapshotIdentity(graph) ||
    JSON.stringify(authority.freshness) !== JSON.stringify(graph.freshness) ||
    graph.freshness.progressionEpoch !== input.progressionEpoch ||
    graph.freshness.rootGeneration !== input.rootGeneration ||
    graphOffers === undefined ||
    [...graphOffers, ...input.offers].some(
      ([, generation]) => !Number.isSafeInteger(generation) || generation < 1,
    ) ||
    graphOffers.length !== input.offers.size ||
    graphOffers.some(
      ([actionId, generation]) => input.offers.get(actionId) !== generation,
    ) ||
    plan.mandatoryActionIds.some((actionId) => !input.offers.has(actionId))
  )
    return "partial";
  return "complete";
}

export interface NativeResearchEligibilityEvidence {
  readonly actionId: string;
  readonly status: NativeResearchApplicability["status"];
  readonly reasons: readonly string[];
  readonly freshness: NativeResearchPrerequisiteGraph["freshness"];
  readonly snapshotIdentity: string;
}

export function bindNativeResearchEligibilityEvidence(
  graph: Readonly<NativeResearchPrerequisiteGraph>,
  observation: Readonly<{
    actionId: string;
    status: NativeResearchApplicability["status"];
    reasons?: readonly string[];
  }>,
): Readonly<NativeResearchEligibilityEvidence> {
  return Object.freeze({
    actionId: observation.actionId,
    status: observation.status,
    reasons: Object.freeze([...(observation.reasons ?? [])]),
    freshness: graph.freshness,
    snapshotIdentity: researchPrerequisiteSnapshotIdentity(graph),
  });
}

export function researchPrerequisiteSnapshotIdentity(
  graph: Readonly<NativeResearchPrerequisiteGraph>,
): string {
  return JSON.stringify([
    graph.provenance,
    graph.targetActionId,
    graph.targetStatus,
    graph.dependencyEvidence,
    graph.actions.map((action) => [
      action.actionId,
      action.grantTechnology,
      action.grantLevel,
      action.status,
      [...action.prerequisiteIds].sort(),
    ]),
    graph.requirements.map((requirement) => [
      requirement.id,
      requirement.technologyId,
      requirement.requiredLevel,
      requirement.observedLevel,
      requirement.declaredStatus,
      requirement.status,
      [...requirement.candidateActionIds].sort(),
    ]),
    [...graph.actionableFrontier].sort(),
  ]);
}

export interface IndependentResearchClaimPlan {
  readonly status: "available" | "unavailable";
  readonly claims: readonly Readonly<ResourceClaim>[];
  readonly reasons: readonly string[];
}

interface ResearchPathEvidence {
  readonly status: "known" | "no-path" | "unknown";
  readonly mandatoryActionIds: ReadonlySet<string>;
  readonly reasons: readonly string[];
}

const emptyResearchPath: ResearchPathEvidence = Object.freeze({
  status: "known",
  mandatoryActionIds: new Set<string>(),
  reasons: Object.freeze([]),
});

function intersectResearchActions(
  paths: readonly ReadonlySet<string>[],
): ReadonlySet<string> {
  const [first, ...rest] = paths;
  if (first === undefined) return new Set();
  return new Set(
    [...first].filter((actionId) => rest.every((path) => path.has(actionId))),
  );
}

function validateNativePrerequisiteInputs(
  graph: Readonly<NativeResearchPrerequisiteGraph>,
  definitions: readonly NativeResearchActionDefinition[],
  grantLevels: ReadonlyMap<string, number>,
  applicability: ReadonlyMap<string, NativeResearchApplicability>,
  targetEligibility: NativeResearchEligibilityEvidence,
): Readonly<{
  consistency: "consistent" | "incomplete" | "inconsistent";
  reasons: readonly string[];
}> {
  const reconciledTargetFacts =
    targetEligibility.actionId === graph.targetActionId &&
    targetEligibility.status === "eligible"
      ? new Set([
          "target has a native condition function whose context was not evaluated",
          "target route restrictions were retained but not evaluated",
          "target trait, gene, or exclusion restrictions were retained but not evaluated",
        ])
      : new Set<string>();
  const incompleteReasons = graph.unavailableFacts.filter(
    (reason) => !reconciledTargetFacts.has(reason),
  );
  const inconsistentReasons: string[] = [];
  if (graph.dependencyEvidence === "unavailable")
    incompleteReasons.push(
      "native prerequisite dependency declarations are unavailable",
    );
  else if (graph.dependencyEvidence === "partial")
    incompleteReasons.push(
      "native prerequisite dependency declarations are partial",
    );
  incompleteReasons.push(
    ...graph.limits.map((limit) => `graph limit ${limit}`),
  );
  if (graph.provenance !== "effective-native-research-definition-snapshot")
    inconsistentReasons.push(
      "graph provenance does not identify an effective native snapshot",
    );
  const definitionsById = new Map(
    definitions.map((definition) => [definition.actionId, definition]),
  );
  for (const gate of graph.actions) {
    const definition = definitionsById.get(gate.actionId);
    if (definition === undefined) {
      incompleteReasons.push(
        `native action definition is missing for ${gate.actionId}`,
      );
      continue;
    }
    if (
      definition.grantTechnology !== gate.grantTechnology ||
      definition.grantLevel !== gate.grantLevel
    ) {
      inconsistentReasons.push(
        `graph action ${gate.actionId} grant identity contradicts its native definition`,
      );
      continue;
    }
    if (gate.status === "excluded") {
      if (applicability.get(gate.actionId)?.status !== "excluded")
        inconsistentReasons.push(
          `graph action ${gate.actionId} is excluded without matching applicability evidence`,
        );
      continue;
    }
    if (gate.status === "frontier" && gate.actionId !== graph.targetActionId)
      continue;
    const expectedRequirementIds =
      definition.prerequisites.kind === "declared"
        ? definition.prerequisites.requirements.map(
            ({ technologyId, requiredLevel }) =>
              `research:${technologyId}:${requiredLevel}`,
          )
        : [];
    if (
      JSON.stringify([...gate.prerequisiteIds].sort()) !==
      JSON.stringify([...expectedRequirementIds].sort())
    )
      inconsistentReasons.push(
        `graph action ${gate.actionId} prerequisite identities contradict its native definition`,
      );
  }
  for (const requirement of graph.requirements) {
    if (
      requirement.id !==
      `research:${requirement.technologyId}:${requirement.requiredLevel}`
    ) {
      inconsistentReasons.push(
        `graph requirement ${requirement.id} has an invalid technology or level identity`,
      );
      continue;
    }
    if (
      requirement.observedLevel !== grantLevels.get(requirement.technologyId)
    ) {
      if (
        requirement.observedLevel === undefined ||
        grantLevels.get(requirement.technologyId) === undefined
      )
        incompleteReasons.push(
          `current grant level for ${requirement.technologyId} is unavailable`,
        );
      else
        inconsistentReasons.push(
          `graph requirement ${requirement.id} observed level contradicts current grant levels`,
        );
    }
    const expectedCandidates =
      requirement.observedLevel !== undefined &&
      requirement.observedLevel >= requirement.requiredLevel
        ? []
        : definitions
            .filter(
              (definition) =>
                definition.grantTechnology === requirement.technologyId &&
                definition.grantLevel >= requirement.requiredLevel,
            )
            .map(({ actionId }) => actionId)
            .sort();
    if (
      JSON.stringify([...requirement.candidateActionIds].sort()) !==
      JSON.stringify(expectedCandidates)
    )
      inconsistentReasons.push(
        `graph requirement ${requirement.id} candidate actions contradict native grant definitions`,
      );
  }
  const consistency =
    inconsistentReasons.length > 0
      ? "inconsistent"
      : incompleteReasons.length > 0
        ? "incomplete"
        : "consistent";
  return Object.freeze({
    consistency,
    reasons: Object.freeze([
      ...new Set(
        consistency === "inconsistent"
          ? inconsistentReasons
          : incompleteReasons,
      ),
    ]),
  });
}

/**
 * Finds actions required by every complete AND/OR path in the captured native prerequisite graph.
 * A frontier proves current actionability only; conditional and missing branches remain unknown.
 */
export function classifyMandatoryResearchPrerequisiteObligations(
  graph: Readonly<NativeResearchPrerequisiteGraph>,
  targetCurrentlyEligible: boolean,
): Readonly<ResearchPrerequisiteObligationPlan> {
  const unavailable = (reasons: readonly string[]) =>
    Object.freeze({
      status: "unavailable" as const,
      mandatoryActionIds: Object.freeze([]),
      alternativeGroups: Object.freeze([]),
      reasons: Object.freeze([...new Set(reasons)]),
    });
  if (!targetCurrentlyEligible)
    return unavailable(["terminal Research action is not currently eligible"]);
  if (
    graph.targetStatus === "satisfied" ||
    graph.targetStatus === "unavailable"
  )
    return unavailable(["terminal prerequisite graph is unavailable"]);

  const actions = new Map(
    graph.actions.map((action) => [action.actionId, action]),
  );
  const requirements = new Map(
    graph.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const visiting = new Set<string>();
  const requirementResults = new Map<string, ResearchPathEvidence>();
  const actionResults = new Map<string, ResearchPathEvidence>();
  const alternativeGroups: {
    requirementId: string;
    actionIds: readonly string[];
  }[] = [];
  const reasons: string[] = [];

  const solveRequirement = (requirementId: string): ResearchPathEvidence => {
    const cached = requirementResults.get(requirementId);
    if (cached !== undefined) return cached;
    const requirement = requirements.get(requirementId);
    if (requirement === undefined)
      return {
        status: "unknown",
        mandatoryActionIds: new Set(),
        reasons: [`missing native prerequisite gate ${requirementId}`],
      };
    if (requirement.status === "satisfied") {
      requirementResults.set(requirementId, emptyResearchPath);
      return emptyResearchPath;
    }
    if (requirement.candidateActionIds.length === 0)
      return {
        status: "no-path",
        mandatoryActionIds: new Set(),
        reasons: requirement.reasons,
      };
    const paths: ReadonlySet<string>[] = [];
    let uncertain = false;
    for (const actionId of requirement.candidateActionIds) {
      const candidate = solveAction(actionId);
      if (candidate.status === "unknown") {
        uncertain = true;
        reasons.push(...candidate.reasons);
      } else if (candidate.status === "known")
        paths.push(candidate.mandatoryActionIds);
    }
    if (uncertain) {
      const result: ResearchPathEvidence = {
        status: "unknown",
        mandatoryActionIds: new Set(),
        reasons: [
          `${requirementId} has a conditional or unavailable alternative`,
        ],
      };
      requirementResults.set(requirementId, result);
      return result;
    }
    if (paths.length === 0)
      return {
        status: "no-path",
        mandatoryActionIds: new Set(),
        reasons: requirement.reasons,
      };
    if (paths.length > 1)
      alternativeGroups.push({
        requirementId,
        actionIds: Object.freeze([...requirement.candidateActionIds]),
      });
    const result: ResearchPathEvidence = {
      status: "known",
      mandatoryActionIds: intersectResearchActions(paths),
      reasons: [],
    };
    requirementResults.set(requirementId, result);
    return result;
  };

  const solveAction = (actionId: string): ResearchPathEvidence => {
    const cached = actionResults.get(actionId);
    if (cached !== undefined) return cached;
    if (visiting.has(actionId))
      return {
        status: "no-path",
        mandatoryActionIds: new Set(),
        reasons: [],
      };
    const action = actions.get(actionId);
    if (action === undefined)
      return {
        status: "unknown",
        mandatoryActionIds: new Set(),
        reasons: [`missing native action gate ${actionId}`],
      };
    if (action.status === "excluded") {
      const result: ResearchPathEvidence = {
        status: "no-path",
        mandatoryActionIds: new Set(),
        reasons: action.reasons,
      };
      actionResults.set(actionId, result);
      return result;
    }
    if (action.status === "frontier") {
      const result: ResearchPathEvidence = {
        status: "known",
        mandatoryActionIds: new Set([actionId]),
        reasons: [],
      };
      actionResults.set(actionId, result);
      return result;
    }
    if (action.status === "unavailable") {
      const result: ResearchPathEvidence = {
        status: "unknown",
        mandatoryActionIds: new Set(),
        reasons: action.reasons,
      };
      actionResults.set(actionId, result);
      return result;
    }
    if (action.prerequisiteIds.length === 0 && action.status !== "unsatisfied")
      return {
        status: "unknown",
        mandatoryActionIds: new Set(),
        reasons: action.reasons,
      };
    if (action.prerequisiteIds.length === 0)
      return {
        status: "unknown",
        mandatoryActionIds: new Set(),
        reasons: [`${actionId} has no verified path to a current offer`],
      };
    visiting.add(actionId);
    const requiredActions = new Set<string>([actionId]);
    let pathStatus: ResearchPathEvidence["status"] = "known";
    for (const requirementId of action.prerequisiteIds) {
      const prerequisite = solveRequirement(requirementId);
      if (prerequisite.status === "unknown") pathStatus = "unknown";
      else if (prerequisite.status === "no-path" && pathStatus === "known")
        pathStatus = "no-path";
      for (const requiredActionId of prerequisite.mandatoryActionIds)
        requiredActions.add(requiredActionId);
      reasons.push(...prerequisite.reasons);
    }
    visiting.delete(actionId);
    const result: ResearchPathEvidence = {
      status: pathStatus,
      mandatoryActionIds: requiredActions,
      reasons: pathStatus === "known" ? [] : action.reasons,
    };
    actionResults.set(actionId, result);
    return result;
  };

  const target = actions.get(graph.targetActionId);
  if (target === undefined || target.prerequisiteIds.length === 0)
    return unavailable(["terminal action has no captured prerequisite gates"]);
  const mandatory = new Set<string>();
  for (const requirementId of target.prerequisiteIds) {
    const requirement = solveRequirement(requirementId);
    if (requirement.status !== "known")
      reasons.push(
        ...requirement.reasons,
        `could not prove every path for ${requirementId}`,
      );
    for (const actionId of requirement.mandatoryActionIds)
      mandatory.add(actionId);
  }
  if (reasons.length > 0) return unavailable(reasons);
  return Object.freeze({
    status: "verified",
    mandatoryActionIds: Object.freeze([...mandatory].sort()),
    alternativeGroups: Object.freeze(
      alternativeGroups.map((group) => Object.freeze(group)),
    ),
    reasons: Object.freeze([...new Set(reasons)]),
  });
}

/** Admits a verified set of concurrent obligations and deduplicates identical claims. */
export function planIndependentResearchResourceClaims(
  evidence: readonly Readonly<ResourceClaimEvidence>[],
): Readonly<IndependentResearchClaimPlan> {
  const claimsById = new Map<string, Readonly<ResourceClaim>>();
  const reasons: string[] = [];
  for (const item of evidence) {
    if (item.prerequisiteRelation !== "verified") {
      reasons.push(
        `${item.nativeActionId} lacks verified prerequisite authority`,
      );
      continue;
    }
    const claim = admitResourceClaim(item);
    if (claim === undefined) {
      reasons.push(`${item.nativeActionId} claim evidence was rejected`);
      continue;
    }
    const existing = claimsById.get(claim.claimId);
    if (
      existing !== undefined &&
      JSON.stringify(existing) !== JSON.stringify(claim)
    )
      reasons.push(
        `${item.nativeActionId} duplicates an obligation with conflicting evidence`,
      );
    else claimsById.set(claim.claimId, claim);
  }
  const claims = [...claimsById.values()];
  const alternativeGroups = new Map<string, readonly ResourceClaim[]>();
  for (const claim of claims) {
    if (claim.allocationAuthority.kind !== "selected-alternative") continue;
    const group = alternativeGroups.get(claim.allocationAuthority.groupId);
    alternativeGroups.set(
      claim.allocationAuthority.groupId,
      group === undefined ? [claim] : [...group, claim],
    );
  }
  const selectedAlternativeIds = new Set<string>();
  for (const [groupId, group] of alternativeGroups) {
    const firstAuthority = group[0]?.allocationAuthority;
    if (firstAuthority?.kind !== "selected-alternative") continue;
    const consistent = group.every(
      (claim) =>
        claim.allocationAuthority.kind === "selected-alternative" &&
        claim.allocationAuthority.selectedActionId ===
          firstAuthority.selectedActionId &&
        claim.allocationAuthority.authorityId === firstAuthority.authorityId,
    );
    const selected = group.filter(
      (claim) => claim.nativeActionId === firstAuthority.selectedActionId,
    );
    if (!consistent || selected.length === 0) {
      reasons.push(`${groupId} lacks one consistent selected-action authority`);
      continue;
    }
    for (const claim of selected) selectedAlternativeIds.add(claim.claimId);
  }
  const admittedClaims = claims.filter(
    (claim) =>
      claim.allocationAuthority.kind === "independent" ||
      selectedAlternativeIds.has(claim.claimId),
  );
  const capacityByPool = new Map<
    string,
    { quantity: number; capacity: number }
  >();
  for (const claim of admittedClaims) {
    const poolKey = `${claim.resourceId}|${claim.poolId}`;
    const pool = capacityByPool.get(poolKey);
    if (pool === undefined)
      capacityByPool.set(poolKey, {
        quantity: claim.requiredQuantity,
        capacity: claim.observedCapacity,
      });
    else {
      pool.quantity += claim.requiredQuantity;
      pool.capacity = Math.min(pool.capacity, claim.observedCapacity);
    }
  }
  for (const [poolKey, pool] of capacityByPool)
    if (pool.quantity > pool.capacity)
      reasons.push(
        `${poolKey} aggregate prerequisite quantity exceeds current native capacity`,
      );
  if (reasons.length > 0)
    return Object.freeze({
      status: "unavailable",
      claims: Object.freeze([]),
      reasons: Object.freeze([...new Set(reasons)]),
    });
  return Object.freeze({
    status: "available",
    claims: Object.freeze(admittedClaims),
    reasons: Object.freeze([]),
  });
}

type CandidatePathResult = "mandatory" | "bypass" | "impossible" | "unknown";

/**
 * Proves current frontier actions that every valid declared route to a terminal gate requires.
 * It expands only grant alternatives for the terminal's own requirements, so unrelated deep
 * technology branches do not consume the prerequisite graph's global expansion budget.
 */
export function classifyMandatoryNativeResearchObligations(
  graph: Readonly<NativeResearchPrerequisiteGraph>,
  input: Readonly<{
    targetEligibility: NativeResearchEligibilityEvidence | undefined;
    definitions: readonly NativeResearchActionDefinition[] | undefined;
    grantLevels: ReadonlyMap<string, number> | undefined;
    applicabilityByActionId:
      ReadonlyMap<string, NativeResearchApplicability> | undefined;
    offeredActionIds: ReadonlySet<string> | undefined;
  }>,
): Readonly<ResearchPrerequisiteObligationPlan> {
  const nativePathVisitBudget = 512;
  let visits = 0;
  const unavailable = (
    reasons: readonly string[],
    inputConsistency?: "consistent" | "incomplete" | "inconsistent",
    inputConsistencyReasons?: readonly string[],
  ) =>
    Object.freeze({
      status: "unavailable" as const,
      ...(inputConsistency === undefined ? {} : { inputConsistency }),
      ...(inputConsistencyReasons === undefined
        ? {}
        : { inputConsistencyReasons }),
      mandatoryActionIds: Object.freeze([]),
      alternativeGroups: Object.freeze([]),
      work: Object.freeze({
        nativePathVisits: visits,
        nativePathVisitBudget,
      }),
      reasons: Object.freeze([...new Set(reasons)]),
    });
  const graphIdentity = researchPrerequisiteSnapshotIdentity(graph);
  const eligibility = input.targetEligibility;
  if (
    eligibility === undefined ||
    eligibility.actionId !== graph.targetActionId ||
    eligibility.snapshotIdentity !== graphIdentity ||
    JSON.stringify(eligibility.freshness) !== JSON.stringify(graph.freshness)
  )
    return unavailable([
      "terminal Research eligibility evidence is missing or stale for the current graph snapshot",
    ]);
  if (eligibility.status !== "eligible")
    return unavailable(
      eligibility.reasons.length > 0
        ? eligibility.reasons
        : ["terminal Research condition or route is not eligible"],
    );
  if (
    graph.targetStatus === "satisfied" ||
    input.definitions === undefined ||
    input.grantLevels === undefined ||
    input.applicabilityByActionId === undefined ||
    input.offeredActionIds === undefined
  )
    return unavailable([
      "current native Research prerequisite evidence is incomplete",
    ]);
  const definitions = new Map(
    input.definitions.map((definition) => [definition.actionId, definition]),
  );
  if (definitions.size !== input.definitions.length)
    return unavailable(["native action identities are duplicated"]);
  const inputValidation = validateNativePrerequisiteInputs(
    graph,
    input.definitions,
    input.grantLevels,
    input.applicabilityByActionId,
    eligibility,
  );
  if (inputValidation.consistency === "inconsistent")
    return Object.freeze({
      ...unavailable(inputValidation.reasons),
      inputConsistency: "inconsistent" as const,
      inputConsistencyReasons: inputValidation.reasons,
    });
  const target = definitions.get(graph.targetActionId);
  if (target?.prerequisites.kind !== "declared")
    return unavailable([
      "terminal action has no complete static prerequisite declaration",
    ]);
  const currentLevels = input.grantLevels;
  const applicability = input.applicabilityByActionId;
  const offered = input.offeredActionIds;
  const grants = new Map<string, NativeResearchActionDefinition[]>();
  for (const definition of input.definitions) {
    const entries = grants.get(definition.grantTechnology) ?? [];
    entries.push(definition);
    grants.set(definition.grantTechnology, entries);
  }
  const memo = new Map<string, CandidatePathResult>();
  const graphActions = new Map(
    graph.actions.map((action) => [action.actionId, action]),
  );
  const activeActions = new Set<string>();
  const activeRequirements = new Set<string>();
  const alternativeGroups: {
    requirementId: string;
    actionIds: readonly string[];
  }[] = [];
  const uncertaintyReasons: string[] = [];
  const unknownPathReasons = new Map<string, string>();
  const grantAlternativesByRequirement = new Map<
    string,
    readonly Readonly<{ actionId: string; outcome: CandidatePathResult }>[]
  >();

  const solveRequirement = (
    technologyId: string,
    requiredLevel: number,
    candidateActionId: string,
  ): CandidatePathResult => {
    const observedLevel = currentLevels.get(technologyId);
    if (observedLevel === undefined) return "unknown";
    if (observedLevel >= requiredLevel) return "bypass";
    const key = `requirement:${technologyId}:${requiredLevel}:${candidateActionId}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (activeRequirements.has(key)) return "unknown";
    const candidates = (grants.get(technologyId) ?? []).filter(
      (definition) => definition.grantLevel >= requiredLevel,
    );
    if (candidates.length === 0) return "impossible";
    activeRequirements.add(key);
    const routeOutcomes = candidates.map((definition) => ({
      actionId: definition.actionId,
      outcome: solveAction(
        definition,
        candidateActionId,
        technologyId,
        requiredLevel,
      ),
    }));
    grantAlternativesByRequirement.set(key, Object.freeze(routeOutcomes));
    const viable = routeOutcomes
      .map(({ outcome }) => outcome)
      .filter((outcome) => outcome !== "impossible");
    activeRequirements.delete(key);
    if (viable.includes("unknown"))
      unknownPathReasons.set(
        key,
        routeOutcomes
          .map(({ actionId, outcome }) => `${actionId}=${outcome}`)
          .join(","),
      );
    if (viable.length > 1)
      alternativeGroups.push({
        requirementId: `research:${technologyId}:${requiredLevel}`,
        actionIds: Object.freeze(
          candidates.map((definition) => definition.actionId),
        ),
      });
    const result =
      viable.length === 0
        ? "impossible"
        : viable.includes("unknown")
          ? "unknown"
          : viable.includes("bypass")
            ? "bypass"
            : "mandatory";
    memo.set(key, result);
    return result;
  };

  const solveAction = (
    definition: NativeResearchActionDefinition,
    candidateActionId: string,
    requiredTechnologyId: string,
    requiredLevel: number,
  ): CandidatePathResult => {
    visits += 1;
    if (visits > nativePathVisitBudget) {
      return "unknown";
    }
    if (definition.actionId === candidateActionId)
      return offered.has(definition.actionId) &&
        graphActions.get(definition.actionId)?.status === "frontier"
        ? "mandatory"
        : "unknown";
    if (offered.has(definition.actionId))
      return graphActions.get(definition.actionId)?.status === "frontier"
        ? "bypass"
        : "unknown";
    const graphAction = graphActions.get(definition.actionId);
    if (graphAction === undefined) return "unknown";
    if (graphAction.status === "excluded") return "impossible";
    const applicabilityState = applicability.get(definition.actionId);
    if (applicabilityState?.status === "excluded") return "impossible";
    if (definition.prerequisites.kind !== "declared") return "unknown";
    const actionKey = `${definition.actionId}:${requiredTechnologyId}:${requiredLevel}:${candidateActionId}`;
    const cached = memo.get(`action:${actionKey}`);
    if (cached !== undefined) return cached;
    if (activeActions.has(actionKey)) return "unknown";
    activeActions.add(actionKey);
    // Only same-technology prerequisites establish a route to a higher grant of this
    // technology. Other requirements can make an action route impossible, so ignoring
    // them is conservative: it can withhold a claim, but cannot invent a bypass route
    // through an action whose native condition or route eligibility is unknown.
    const sameTechnologyRequirements =
      definition.prerequisites.requirements.filter(
        (requirement) => requirement.technologyId === requiredTechnologyId,
      );
    // An action cannot be the first grant to a level if its native declaration
    // already requires that level (or a higher one). Exception boundaries stay
    // unknown because native skip semantics may change whether that gate applies.
    if (
      sameTechnologyRequirements.some(
        (requirement) =>
          requirement.requiredLevel >= requiredLevel &&
          requirement.applicabilityBoundary === undefined,
      )
    ) {
      activeActions.delete(actionKey);
      const result: CandidatePathResult = "impossible";
      memo.set(`action:${actionKey}`, result);
      return result;
    }
    const dependencies = sameTechnologyRequirements.map((requirement) =>
      requirement.applicabilityBoundary !== undefined &&
      (currentLevels.get(requirement.technologyId) ?? 0) <
        requirement.requiredLevel
        ? "unknown"
        : solveRequirement(
            requirement.technologyId,
            requirement.requiredLevel,
            candidateActionId,
          ),
    );
    activeActions.delete(actionKey);
    let result: CandidatePathResult;
    if (dependencies.includes("impossible")) result = "impossible";
    // A proven same-technology prerequisite establishes structural necessity even
    // when separate conditions, queues, or side prerequisites are unresolved.
    else if (dependencies.includes("mandatory")) result = "mandatory";
    else if (
      dependencies.includes("unknown") ||
      graphAction.status === "conditional" ||
      graphAction.status === "unavailable" ||
      applicabilityState?.status === "unknown" ||
      definition.hasNativeCondition
    )
      result = "unknown";
    else result = "bypass";
    memo.set(`action:${actionKey}`, result);
    return result;
  };

  const mandatoryActionIds: string[] = [];
  const mandatoryProofs: {
    actionId: string;
    requirementId: string;
    technologyId: string;
    requiredLevel: number;
    grantAlternatives: readonly Readonly<{
      actionId: string;
      outcome: CandidatePathResult;
    }>[];
    supportingRequirements: readonly Readonly<{
      requirementId: string;
      grantAlternatives: readonly Readonly<{
        actionId: string;
        outcome: CandidatePathResult;
      }>[];
    }>[];
  }[] = [];
  for (const offeredActionId of graph.actionableFrontier) {
    const candidate = definitions.get(offeredActionId);
    if (candidate === undefined || !offered.has(offeredActionId)) continue;
    if (applicability.get(offeredActionId)?.status === "excluded") {
      uncertaintyReasons.push(
        `${offeredActionId} is excluded by current native applicability evidence`,
      );
      continue;
    }
    const directRequirement = target.prerequisites.requirements.find(
      (requirement) => requirement.technologyId === candidate.grantTechnology,
    );
    if (directRequirement === undefined) continue;
    const requirementId = `research:${directRequirement.technologyId}:${directRequirement.requiredLevel}`;
    const requirementKey = `requirement:${directRequirement.technologyId}:${directRequirement.requiredLevel}:${offeredActionId}`;
    const outcome = solveRequirement(
      directRequirement.technologyId,
      directRequirement.requiredLevel,
      offeredActionId,
    );
    if (outcome === "unknown")
      uncertaintyReasons.push(
        `${offeredActionId} cannot be proven mandatory for ${directRequirement.technologyId}:${directRequirement.requiredLevel}; unresolved native alternatives: ${unknownPathReasons.get(requirementKey) ?? "incomplete native evidence"}`,
      );
    if (outcome === "mandatory") {
      mandatoryActionIds.push(offeredActionId);
      mandatoryProofs.push({
        actionId: offeredActionId,
        requirementId,
        technologyId: directRequirement.technologyId,
        requiredLevel: directRequirement.requiredLevel,
        grantAlternatives:
          grantAlternativesByRequirement.get(requirementKey) ??
          Object.freeze([]),
        supportingRequirements: Object.freeze(
          [...grantAlternativesByRequirement.entries()]
            .filter(([key]) => key.endsWith(`:${offeredActionId}`))
            .map(([key, grantAlternatives]) => {
              const parts = key.split(":");
              const technologyId = parts.slice(1, -2).join(":");
              const requiredLevel = parts.at(-2);
              return Object.freeze({
                requirementId: `research:${technologyId}:${requiredLevel}`,
                grantAlternatives,
              });
            }),
        ),
      });
    }
  }
  if (uncertaintyReasons.length > 0)
    return unavailable(
      uncertaintyReasons,
      inputValidation.consistency,
      inputValidation.reasons,
    );
  return Object.freeze({
    status: "verified",
    inputConsistency: inputValidation.consistency,
    inputConsistencyReasons: inputValidation.reasons,
    mandatoryActionIds: Object.freeze([...new Set(mandatoryActionIds)].sort()),
    alternativeGroups: Object.freeze(
      alternativeGroups.map((group) => Object.freeze(group)),
    ),
    mandatoryProofs: Object.freeze(
      mandatoryProofs.map((proof) => Object.freeze(proof)),
    ),
    work: Object.freeze({
      nativePathVisits: visits,
      nativePathVisitBudget,
    }),
    reasons: Object.freeze([]),
    authority: Object.freeze({
      targetActionId: graph.targetActionId,
      freshness: graph.freshness,
      snapshotIdentity: researchPrerequisiteSnapshotIdentity(graph),
    }),
  });
}
