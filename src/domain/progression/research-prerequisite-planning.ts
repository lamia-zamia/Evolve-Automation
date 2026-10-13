/** Backward expansion over captured native Research declarations and fresh state facts. */

export interface NativeResearchPrerequisite {
  readonly technologyId: string;
  readonly requiredLevel: number;
  readonly applicabilityBoundary?: string;
}

export type NativeResearchRequirementDeclaration =
  | {
      readonly kind: "declared";
      readonly requirements: readonly NativeResearchPrerequisite[];
    }
  | { readonly kind: "conditional" | "unavailable"; readonly reason: string };

export interface NativeResearchActionDefinition {
  readonly actionId: string;
  readonly grantTechnology: string;
  readonly grantLevel: number;
  readonly prerequisites: NativeResearchRequirementDeclaration;
  readonly hasNativeCondition: boolean;
  readonly routeRestrictions: readonly string[] | undefined;
  readonly restrictions: readonly Readonly<{
    kind: string;
    values: readonly string[];
  }>[];
}

export interface NativeResearchPrerequisiteInput {
  readonly targetActionId: string;
  readonly definitions: readonly NativeResearchActionDefinition[] | undefined;
  readonly grantLevels: ReadonlyMap<string, number> | undefined;
  readonly offeredActionIds: ReadonlySet<string> | undefined;
  readonly offerGenerations: ReadonlyMap<string, number> | undefined;
  readonly cycle: number;
  readonly progressionEpoch: string;
  readonly rootGeneration: number | undefined;
  readonly maxDepth: number;
  readonly maxActions: number;
  readonly expectedFreshness?: Readonly<{
    readonly cycle: number;
    readonly progressionEpoch: string;
    readonly rootGeneration: number;
    readonly offerGenerations: ReadonlyMap<string, number>;
  }>;
}

export interface NativeResearchActionGate {
  readonly actionId: string;
  readonly grantTechnology: string;
  readonly grantLevel: number;
  readonly status: "frontier" | "unsatisfied" | "conditional" | "unavailable";
  readonly prerequisiteIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface NativeResearchRequirementGate {
  readonly id: string;
  readonly technologyId: string;
  readonly requiredLevel: number;
  readonly observedLevel: number | undefined;
  readonly declaredStatus: "satisfied" | "unsatisfied" | "unavailable";
  readonly status: "satisfied" | "unsatisfied" | "conditional" | "unavailable";
  readonly candidateActionIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface NativeResearchPrerequisiteGraph {
  readonly targetActionId: string;
  readonly targetStatus:
    "satisfied" | "unsatisfied" | "conditional" | "unavailable";
  readonly actions: readonly Readonly<NativeResearchActionGate>[];
  readonly requirements: readonly Readonly<NativeResearchRequirementGate>[];
  readonly actionableFrontier: readonly string[];
  readonly cycles: readonly (readonly string[])[];
  readonly limits: readonly string[];
  readonly unavailableFacts: readonly string[];
  readonly provenance: "retained-native-static-research-registry";
  readonly freshness: Readonly<{
    readonly cycle: number;
    readonly progressionEpoch: string;
    readonly rootGeneration: number | undefined;
    readonly offerGenerations:
      readonly (readonly [string, number])[] | undefined;
  }>;
}

function validResearchLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Reconstructs only declared static requirements. Unoffered actions with route, condition, trait,
 * gene, or exclusion metadata stay conditional; this function never guesses their qualification.
 */
export function planNativeResearchPrerequisites(
  input: Readonly<NativeResearchPrerequisiteInput>,
): NativeResearchPrerequisiteGraph {
  const actions = new Map<string, NativeResearchActionGate>();
  const requirements = new Map<string, NativeResearchRequirementGate>();
  const frontier = new Set<string>();
  const cycles: string[][] = [];
  const limits: string[] = [];
  const unavailableFacts: string[] = [];
  const byActionId = new Map<string, NativeResearchActionDefinition>();
  const byGrant = new Map<string, NativeResearchActionDefinition[]>();
  const path: string[] = [];
  let registryValid = input.definitions !== undefined;
  if (input.definitions !== undefined) {
    for (const definition of input.definitions) {
      if (byActionId.has(definition.actionId)) {
        registryValid = false;
        unavailableFacts.push(
          `duplicate native action identity ${definition.actionId}`,
        );
        continue;
      }
      byActionId.set(definition.actionId, definition);
      const grantGroup = byGrant.get(definition.grantTechnology) ?? [];
      grantGroup.push(definition);
      byGrant.set(definition.grantTechnology, grantGroup);
    }
  } else
    unavailableFacts.push("retained native Research registry is unavailable");
  if (input.grantLevels === undefined)
    unavailableFacts.push("current technology levels are unavailable");
  if (input.offeredActionIds === undefined)
    unavailableFacts.push(
      "current native Research offer catalog is unavailable",
    );
  const offersMatch =
    input.expectedFreshness === undefined ||
    (input.offerGenerations !== undefined &&
      input.expectedFreshness.offerGenerations.size ===
        input.offerGenerations.size &&
      [...input.expectedFreshness.offerGenerations].every(
        ([actionId, generation]) =>
          input.offerGenerations?.get(actionId) === generation,
      ));
  const freshnessMatches = !(
    input.expectedFreshness !== undefined &&
    (input.expectedFreshness.cycle !== input.cycle ||
      input.expectedFreshness.progressionEpoch !== input.progressionEpoch ||
      input.expectedFreshness.rootGeneration !== input.rootGeneration ||
      !offersMatch)
  );
  if (!freshnessMatches)
    unavailableFacts.push(
      "research prerequisite observations are stale for the current root, cycle, or progression epoch",
    );

  const actionLimit = Math.max(1, Math.floor(input.maxActions));
  const depthLimit = Math.max(0, Math.floor(input.maxDepth));

  const expandAction = (
    actionId: string,
    depth: number,
  ): NativeResearchActionGate | undefined => {
    const cycleAt = path.indexOf(actionId);
    if (cycleAt >= 0) {
      cycles.push([...path.slice(cycleAt), actionId]);
      return undefined;
    }
    const existing = actions.get(actionId);
    if (existing !== undefined) return existing;
    if (actions.size >= actionLimit) {
      limits.push(`actions:${actionId}`);
      return undefined;
    }
    if (depth > depthLimit) {
      limits.push(`depth:${actionId}`);
      return undefined;
    }
    const definition = byActionId.get(actionId);
    if (definition === undefined) {
      unavailableFacts.push(`native action mapping is missing for ${actionId}`);
      return undefined;
    }
    if (input.offeredActionIds?.has(actionId)) {
      const gate = Object.freeze({
        actionId,
        grantTechnology: definition.grantTechnology,
        grantLevel: definition.grantLevel,
        status: "frontier" as const,
        prerequisiteIds: Object.freeze([]),
        reasons: Object.freeze([]),
      });
      actions.set(actionId, gate);
      frontier.add(actionId);
      return gate;
    }

    path.push(actionId);
    const prerequisiteIds: string[] = [];
    const reasons: string[] = [];
    if (definition.prerequisites.kind !== "declared") {
      reasons.push(definition.prerequisites.reason);
      const gate = Object.freeze({
        actionId,
        grantTechnology: definition.grantTechnology,
        grantLevel: definition.grantLevel,
        status:
          definition.prerequisites.kind === "conditional"
            ? ("conditional" as const)
            : ("unavailable" as const),
        prerequisiteIds: Object.freeze([]),
        reasons: Object.freeze(reasons),
      });
      actions.set(actionId, gate);
      path.pop();
      return gate;
    }
    if (definition.hasNativeCondition)
      reasons.push("native condition function was not evaluated");
    if (definition.routeRestrictions !== undefined)
      reasons.push("route restriction applicability was not evaluated");
    if (definition.restrictions.length > 0)
      reasons.push(
        "trait, gene, or exclusion restriction applicability was not evaluated",
      );
    const hasEligibilityBoundary = reasons.length > 0;
    if (hasEligibilityBoundary) {
      const gate = Object.freeze({
        actionId,
        grantTechnology: definition.grantTechnology,
        grantLevel: definition.grantLevel,
        status: "conditional" as const,
        prerequisiteIds: Object.freeze([]),
        reasons: Object.freeze(reasons),
      });
      actions.set(actionId, gate);
      path.pop();
      return gate;
    }
    // actions.js also supports queue precognition and requirement exceptions such as Flier's
    // cement skip. Those are not declared in an action's `reqs` record and remain unsupported.
    reasons.push(
      "native queue precognition and game-specific requirement exceptions were not evaluated",
    );

    let status: NativeResearchActionGate["status"] = "unsatisfied";
    for (const prerequisite of definition.prerequisites.requirements) {
      const gate = expandRequirement(prerequisite, depth + 1);
      if (gate !== undefined) prerequisiteIds.push(gate.id);
    }
    const childStatuses = prerequisiteIds.map(
      (id) => requirements.get(id)?.status,
    );
    if (childStatuses.includes("unavailable")) status = "unavailable";
    else if (childStatuses.includes("conditional")) status = "conditional";
    else if (childStatuses.every((child) => child === "satisfied")) {
      status = "conditional";
      reasons.push(
        "native offer is absent although captured declared prerequisites are satisfied",
      );
    }
    if (definition.prerequisites.requirements.length === 0) {
      status = "conditional";
      reasons.push(
        "action is not offered and no declared prerequisite explains its absence",
      );
    }
    const result = Object.freeze({
      actionId,
      grantTechnology: definition.grantTechnology,
      grantLevel: definition.grantLevel,
      status,
      prerequisiteIds: Object.freeze(prerequisiteIds),
      reasons: Object.freeze(reasons),
    });
    actions.set(actionId, result);
    path.pop();
    return result;
  };

  const expandRequirement = (
    prerequisite: NativeResearchPrerequisite,
    depth: number,
  ): NativeResearchRequirementGate | undefined => {
    const id = `research:${prerequisite.technologyId}:${prerequisite.requiredLevel}`;
    const existing = requirements.get(id);
    if (existing !== undefined) return existing;
    const observedLevel = input.grantLevels?.get(prerequisite.technologyId);
    if (!validResearchLevel(observedLevel)) {
      const reason =
        observedLevel === undefined
          ? `current grant level for ${prerequisite.technologyId} is unavailable`
          : `current grant level for ${prerequisite.technologyId} is invalid`;
      const gate = Object.freeze({
        id,
        technologyId: prerequisite.technologyId,
        requiredLevel: prerequisite.requiredLevel,
        observedLevel: undefined,
        declaredStatus: "unavailable" as const,
        status: "unavailable" as const,
        candidateActionIds: Object.freeze([]),
        reasons: Object.freeze([reason]),
      });
      requirements.set(id, gate);
      return gate;
    }
    if (observedLevel >= prerequisite.requiredLevel) {
      const gate = Object.freeze({
        id,
        technologyId: prerequisite.technologyId,
        requiredLevel: prerequisite.requiredLevel,
        observedLevel,
        declaredStatus: "satisfied" as const,
        status: "satisfied" as const,
        candidateActionIds: Object.freeze([]),
        reasons: Object.freeze([]),
      });
      requirements.set(id, gate);
      return gate;
    }
    if (prerequisite.applicabilityBoundary !== undefined) {
      const gate = Object.freeze({
        id,
        technologyId: prerequisite.technologyId,
        requiredLevel: prerequisite.requiredLevel,
        observedLevel,
        declaredStatus: "unsatisfied" as const,
        status: "conditional" as const,
        candidateActionIds: Object.freeze([]),
        reasons: Object.freeze([prerequisite.applicabilityBoundary]),
      });
      requirements.set(id, gate);
      return gate;
    }
    const candidates = (byGrant.get(prerequisite.technologyId) ?? []).filter(
      (candidate) => candidate.grantLevel >= prerequisite.requiredLevel,
    );
    const candidateActionIds: string[] = [];
    const reasons: string[] = [];
    if (!registryValid || input.offeredActionIds === undefined) {
      reasons.push(
        "native action mapping or offer membership is not authoritative",
      );
    }
    if (candidates.length === 0) {
      const gate = Object.freeze({
        id,
        technologyId: prerequisite.technologyId,
        requiredLevel: prerequisite.requiredLevel,
        observedLevel,
        declaredStatus: "unsatisfied" as const,
        status: "unavailable" as const,
        candidateActionIds: Object.freeze([]),
        reasons: Object.freeze([
          ...reasons,
          `no retained native action grants ${prerequisite.technologyId} level ${prerequisite.requiredLevel}`,
        ]),
      });
      requirements.set(id, gate);
      return gate;
    }
    let hasKnownUnmetCandidate = false;
    let hasConditionalCandidate = false;
    let hasUnavailableCandidate = false;
    for (const candidate of candidates) {
      candidateActionIds.push(candidate.actionId);
      const action = expandAction(candidate.actionId, depth);
      if (action === undefined) {
        if (limits.length > 0 || cycles.length > 0)
          hasConditionalCandidate = true;
        else hasUnavailableCandidate = true;
      } else if (action.status === "conditional") {
        hasConditionalCandidate = true;
        reasons.push(...action.reasons);
      } else if (action.status === "unavailable") {
        hasUnavailableCandidate = true;
        reasons.push(...action.reasons);
      } else if (action.status === "unsatisfied") {
        hasKnownUnmetCandidate = true;
      }
    }
    const status: NativeResearchRequirementGate["status"] =
      hasKnownUnmetCandidate
        ? "unsatisfied"
        : hasConditionalCandidate
          ? "conditional"
          : hasUnavailableCandidate
            ? "unavailable"
            : "unsatisfied";
    const gate = Object.freeze({
      id,
      technologyId: prerequisite.technologyId,
      requiredLevel: prerequisite.requiredLevel,
      observedLevel,
      declaredStatus: "unsatisfied" as const,
      status,
      candidateActionIds: Object.freeze(candidateActionIds),
      reasons: Object.freeze([...new Set(reasons)]),
    });
    requirements.set(id, gate);
    return gate;
  };

  const target = byActionId.get(input.targetActionId);
  let targetStatus: NativeResearchPrerequisiteGraph["targetStatus"] =
    "unavailable";
  if (!freshnessMatches) {
    targetStatus = "unavailable";
  } else if (!registryValid) {
    unavailableFacts.push("native Research action identities are ambiguous");
  } else if (target === undefined) {
    unavailableFacts.push(
      `target action ${input.targetActionId} is not in the retained native registry`,
    );
  } else if (
    !validResearchLevel(input.grantLevels?.get(target.grantTechnology))
  ) {
    unavailableFacts.push(
      `current grant level for ${target.grantTechnology} is unavailable`,
    );
  } else if (
    (input.grantLevels!.get(target.grantTechnology) ?? 0) >= target.grantLevel
  ) {
    targetStatus = "satisfied";
    if (target.prerequisites.kind === "declared")
      for (const prerequisite of target.prerequisites.requirements)
        expandRequirement(prerequisite, 1);
  } else if (input.offeredActionIds === undefined) {
    targetStatus = "unavailable";
  } else if (input.offeredActionIds?.has(input.targetActionId)) {
    frontier.add(input.targetActionId);
    if (target.prerequisites.kind === "declared")
      for (const prerequisite of target.prerequisites.requirements)
        expandRequirement(prerequisite, 1);
    actions.set(
      input.targetActionId,
      Object.freeze({
        actionId: target.actionId,
        grantTechnology: target.grantTechnology,
        grantLevel: target.grantLevel,
        status: "frontier",
        prerequisiteIds: Object.freeze([]),
        reasons: Object.freeze([]),
      }),
    );
    targetStatus = "unsatisfied";
  } else if (target.prerequisites.kind !== "declared") {
    targetStatus = target.prerequisites.kind;
    unavailableFacts.push(target.prerequisites.reason);
  } else {
    const gateStatuses: NativeResearchRequirementGate["status"][] = [];
    const targetPrerequisiteIds: string[] = [];
    for (const prerequisite of target.prerequisites.requirements) {
      const gate = expandRequirement(prerequisite, 1);
      if (gate !== undefined) {
        gateStatuses.push(gate.status);
        targetPrerequisiteIds.push(gate.id);
      }
    }
    if (gateStatuses.includes("unavailable")) targetStatus = "unavailable";
    else if (gateStatuses.includes("conditional")) targetStatus = "conditional";
    else
      targetStatus = gateStatuses.length === 0 ? "conditional" : "unsatisfied";
    if (target.hasNativeCondition)
      unavailableFacts.push(
        "target has a native condition function whose context was not evaluated",
      );
    if (target.routeRestrictions !== undefined)
      unavailableFacts.push(
        "target route restrictions were retained but not evaluated",
      );
    if (target.restrictions.length > 0)
      unavailableFacts.push(
        "target trait, gene, or exclusion restrictions were retained but not evaluated",
      );
    if (
      gateStatuses.length === 0 ||
      gateStatuses.every((status) => status === "satisfied")
    )
      targetStatus = "conditional";
    if (
      target.hasNativeCondition ||
      target.routeRestrictions !== undefined ||
      target.restrictions.length > 0
    )
      targetStatus = "conditional";
    actions.set(
      input.targetActionId,
      Object.freeze({
        actionId: target.actionId,
        grantTechnology: target.grantTechnology,
        grantLevel: target.grantLevel,
        status:
          targetStatus === "unavailable" || targetStatus === "conditional"
            ? targetStatus
            : "unsatisfied",
        prerequisiteIds: Object.freeze(targetPrerequisiteIds),
        reasons: Object.freeze([
          "native queue precognition and game-specific requirement exceptions were not evaluated",
          ...(target.hasNativeCondition
            ? ["native condition function was not evaluated"]
            : []),
          ...(target.routeRestrictions !== undefined
            ? ["route restriction applicability was not evaluated"]
            : []),
          ...(target.restrictions.length > 0
            ? [
                "trait, gene, or exclusion restriction applicability was not evaluated",
              ]
            : []),
        ]),
      }),
    );
  }
  return Object.freeze({
    targetActionId: input.targetActionId,
    targetStatus,
    actions: Object.freeze([...actions.values()]),
    requirements: Object.freeze([...requirements.values()]),
    actionableFrontier: Object.freeze([...frontier]),
    cycles: Object.freeze(cycles.map((cycle) => Object.freeze(cycle))),
    limits: Object.freeze(limits),
    unavailableFacts: Object.freeze([...new Set(unavailableFacts)]),
    provenance: "retained-native-static-research-registry",
    freshness: Object.freeze({
      cycle: input.cycle,
      progressionEpoch: input.progressionEpoch,
      rootGeneration: input.rootGeneration,
      offerGenerations:
        input.offerGenerations === undefined
          ? undefined
          : Object.freeze(
              [...input.offerGenerations].map(([actionId, generation]) =>
                Object.freeze([actionId, generation] as const),
              ),
            ),
    }),
  });
}
