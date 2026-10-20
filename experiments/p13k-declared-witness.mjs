export function reconstructDeclaredResearchWitness(
  graph,
  definitions,
  applicabilityByActionId,
  grantLevels,
  targetActionId,
  ancestorActionId,
) {
  const actions = new Map(
    graph.actions.map((action) => [action.actionId, action]),
  );
  const requirements = new Map(
    graph.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const byActionId = new Map(
    definitions.map((definition) => [definition.actionId, definition]),
  );
  const byGrantTechnology = new Map();
  for (const definition of definitions) {
    const actions = byGrantTechnology.get(definition.grantTechnology) ?? [];
    actions.push(definition);
    byGrantTechnology.set(definition.grantTechnology, actions);
  }
  const maxNodes = actions.size + requirements.size;
  const maxEdges =
    graph.actions.reduce(
      (count, action) => count + action.prerequisiteIds.length,
      0,
    ) +
    graph.requirements.reduce(
      (count, requirement) => count + requirement.candidateActionIds.length,
      0,
    );
  const work = {
    nodesExamined: 0,
    edgesExamined: 0,
    alternativeBranchesExamined: 0,
  };
  const actionMemo = new Map();
  const requirementMemo = new Map();
  const active = new Set();
  const unknownReasons = new Set();
  let truncated = false;

  const examineNode = (key) => {
    if (active.has(key)) {
      unknownReasons.add(`cycle encountered at ${key}`);
      return false;
    }
    if (work.nodesExamined >= maxNodes) {
      truncated = true;
      return false;
    }
    work.nodesExamined += 1;
    active.add(key);
    return true;
  };
  const examineEdge = () => {
    if (work.edgesExamined >= maxEdges) {
      truncated = true;
      return false;
    }
    work.edgesExamined += 1;
    return true;
  };

  if (!byActionId.has(targetActionId) || !byActionId.has(ancestorActionId))
    return Object.freeze({
      status: "unavailable",
      targetActionId,
      ancestorActionId,
      witness: undefined,
      work: Object.freeze({ ...work, maxNodes, maxEdges }),
      truncationReasons: Object.freeze([
        "a witness action definition is missing",
      ]),
    });

  const visitRequirement = (requirementId) => {
    if (requirementMemo.has(requirementId))
      return requirementMemo.get(requirementId);
    const requirement = requirements.get(requirementId);
    const key = `requirement:${requirementId}`;
    if (requirement === undefined) {
      unknownReasons.add(`retained requirement ${requirementId} is missing`);
      unknownReasons.add(`unresolved requirement branch ${requirementId}`);
      return undefined;
    }
    if (!examineNode(key)) return undefined;
    if (
      requirement.id !==
        `research:${requirement.technologyId}:${requirement.requiredLevel}` ||
      (grantLevels !== undefined &&
        requirement.observedLevel !== grantLevels.get(requirement.technologyId))
    ) {
      unknownReasons.add(
        `retained requirement ${requirementId} does not match native identity or current grant level`,
      );
      active.delete(key);
      requirementMemo.set(requirementId, undefined);
      return undefined;
    }
    const expectedCandidates =
      requirement.observedLevel !== undefined &&
      requirement.observedLevel >= requirement.requiredLevel
        ? []
        : (byGrantTechnology.get(requirement.technologyId) ?? [])
            .filter(
              (candidate) => candidate.grantLevel >= requirement.requiredLevel,
            )
            .map(({ actionId }) => actionId);
    if (
      JSON.stringify([...expectedCandidates].sort()) !==
      JSON.stringify([...requirement.candidateActionIds].sort())
    ) {
      unknownReasons.add(
        `retained candidates for ${requirementId} do not match effective definitions`,
      );
      active.delete(key);
      requirementMemo.set(requirementId, undefined);
      return undefined;
    }
    let found;
    for (const candidateActionId of requirement.candidateActionIds) {
      if (!examineEdge()) break;
      work.alternativeBranchesExamined += 1;
      if (candidateActionId === ancestorActionId) {
        found = {
          actions: [],
          branches: [
            {
              requirementId,
              technologyId: requirement.technologyId,
              requiredLevel: requirement.requiredLevel,
              candidateActionIds: [...requirement.candidateActionIds],
              selectedActionId: candidateActionId,
            },
          ],
        };
        break;
      }
      const tail = visitAction(candidateActionId);
      if (tail !== undefined) {
        found = {
          actions: tail.actions,
          branches: [
            {
              requirementId,
              technologyId: requirement.technologyId,
              requiredLevel: requirement.requiredLevel,
              candidateActionIds: [...requirement.candidateActionIds],
              selectedActionId: candidateActionId,
            },
            ...tail.branches,
          ],
        };
        break;
      }
    }
    active.delete(key);
    requirementMemo.set(requirementId, found);
    return found;
  };

  const visitAction = (actionId) => {
    if (actionId === ancestorActionId) return { actions: [], branches: [] };
    if (actionMemo.has(actionId)) return actionMemo.get(actionId);
    const action = actions.get(actionId);
    const definition = byActionId.get(actionId);
    const key = `action:${actionId}`;
    if (action === undefined || definition === undefined) {
      unknownReasons.add(
        action === undefined
          ? `retained action ${actionId} is missing`
          : `effective definition for ${actionId} is missing`,
      );
      unknownReasons.add(`unresolved action branch ${actionId}`);
      return undefined;
    }
    if (!examineNode(key)) return undefined;
    if (definition.prerequisites.kind !== "declared") {
      unknownReasons.add(
        `prerequisite declaration for ${actionId} is not fully declared`,
      );
      active.delete(key);
      actionMemo.set(actionId, undefined);
      return undefined;
    }
    const declared = definition.prerequisites.requirements.map(
      ({ technologyId, requiredLevel }) =>
        `research:${technologyId}:${requiredLevel}`,
    );
    if (
      action.grantTechnology !== definition.grantTechnology ||
      action.grantLevel !== definition.grantLevel ||
      JSON.stringify([...action.prerequisiteIds].sort()) !==
        JSON.stringify([...declared].sort())
    ) {
      unknownReasons.add(
        `retained action ${actionId} does not match its effective definition`,
      );
      active.delete(key);
      actionMemo.set(actionId, undefined);
      return undefined;
    }
    let found;
    const orderedPrerequisiteIds = [...action.prerequisiteIds].sort(
      (left, right) => {
        const leftLevel = requirements.get(left)?.requiredLevel ?? 0;
        const rightLevel = requirements.get(right)?.requiredLevel ?? 0;
        return rightLevel - leftLevel;
      },
    );
    for (const prerequisiteId of orderedPrerequisiteIds) {
      if (!examineEdge()) break;
      const tail = visitRequirement(prerequisiteId);
      if (tail !== undefined) {
        found = {
          actions: [
            {
              actionId,
              grantTechnology: action.grantTechnology,
              grantLevel: action.grantLevel,
              applicability: applicabilityByActionId?.get(actionId),
              andRequirements: definition.prerequisites.requirements,
            },
            ...tail.actions,
          ],
          branches: tail.branches,
        };
        break;
      }
    }
    active.delete(key);
    actionMemo.set(actionId, found);
    return found;
  };

  const result = visitAction(targetActionId);
  return Object.freeze({
    status:
      result !== undefined
        ? "found"
        : truncated
          ? "truncated"
          : unknownReasons.size > 0
            ? "unknown"
            : "not-found",
    targetActionId,
    ancestorActionId,
    witness: result,
    searchComplete:
      result === undefined && !truncated && unknownReasons.size === 0,
    visitedCycles: Object.freeze(
      [...unknownReasons].filter((reason) =>
        reason.startsWith("cycle encountered at "),
      ),
    ),
    unresolvedBranches: Object.freeze(
      [...unknownReasons].filter((reason) => reason.startsWith("unresolved ")),
    ),
    work: Object.freeze({
      ...work,
      maxNodes,
      maxEdges,
    }),
    truncationReasons: Object.freeze(
      truncated ? ["retained graph examination budget exhausted"] : [],
    ),
    unknownReasons: Object.freeze([...unknownReasons]),
  });
}

export function classifyDeclaredRelationship({
  goalActionId,
  definition,
  witness,
  mandatoryActionIds,
  alternativeGroups,
  inputConsistency,
  currentOffer,
  currentEvidence,
  currentAuthority,
}) {
  if (definition === undefined) return "unknown-definition-unavailable";
  if (currentOffer === undefined) return "unknown-current-offer-unavailable";
  if (currentOffer.actionId !== definition.actionId)
    return "unknown-current-offer-mismatch";
  if (
    !Number.isSafeInteger(currentOffer.bindingGeneration) ||
    currentOffer.bindingGeneration < 1
  )
    return "unknown-current-binding-invalid";
  if (currentAuthority !== true) return "unknown-current-authority";
  const completeAuthority =
    inputConsistency === "consistent" && currentEvidence === "complete";
  if (mandatoryActionIds.includes(currentOffer.actionId) && completeAuthority)
    return "mandatory";
  if (
    completeAuthority &&
    alternativeGroups.some(({ actionIds }) =>
      actionIds.includes(currentOffer.actionId),
    )
  )
    return "one-of-several-mandatory-alternatives";
  if (
    witness?.status === "found" &&
    witness.targetActionId === goalActionId &&
    witness.ancestorActionId === currentOffer.actionId
  ) {
    if (
      witness.witness?.actions.some(
        (action) => action.applicability?.status !== "eligible",
      )
    )
      return "unknown-path-applicability";
    return "indirect-declared-path-candidate";
  }
  if (
    mandatoryActionIds.includes(currentOffer.actionId) ||
    alternativeGroups.some(({ actionIds }) =>
      actionIds.includes(currentOffer.actionId),
    )
  )
    return "unknown-incomplete-mandatory-authority";
  if (witness?.status === "truncated") return "unknown-witness-truncated";
  if (witness?.status === "unknown" || witness?.status === "unavailable")
    return "unknown-witness-incomplete";
  if (witness?.status !== "not-found" || witness.searchComplete !== true)
    return "unknown-witness-incomplete";
  if (inputConsistency !== "consistent" || currentEvidence !== "complete")
    return "unknown-incomplete-evidence";
  return "proven-unrelated";
}

export function deriveCycle232EconomicDecision({
  cycle,
  offer,
  ownerRead,
  result,
  grantBefore,
  grantAfter,
}) {
  const actionId = "tech-steel_containers";
  const valid =
    cycle === 232 &&
    offer?.actionId === actionId &&
    Number.isSafeInteger(offer.bindingGeneration) &&
    offer.bindingGeneration > 0 &&
    offer.nativeAffordableAtDraw === true &&
    ownerRead?.actionId === actionId &&
    ownerRead.ownerAffordable === true &&
    ownerRead.nativeAffordable === true &&
    ownerRead.resourceAffordable === true &&
    result?.kind === "result" &&
    result.cycle === cycle &&
    result.actionId === actionId &&
    result.disposition === "researched" &&
    Number.isSafeInteger(grantBefore) &&
    Number.isSafeInteger(grantAfter) &&
    grantAfter === grantBefore + 1 &&
    result.grantAfter === grantAfter;
  return Object.freeze({
    cycle,
    decision: valid
      ? "no incremental resource intervention justified"
      : "unavailable",
    reason: valid
      ? "the current native offer was affordable at the native Research owner boundary, the owner confirmed all resource affordability, and the native Research result advanced the grant"
      : "native offer, owner affordability, Research result, and grant transition do not form a complete consistent cycle-232 evidence chain",
    evidence: Object.freeze({
      offer: offer ?? "unavailable",
      ownerRead: ownerRead ?? "unavailable",
      result: result ?? "unavailable",
      grantBefore: grantBefore ?? "unavailable",
      grantAfter: grantAfter ?? "unavailable",
    }),
    smelterAuthority:
      "none; Research price and affordability do not carry into another owner cycle",
  });
}

export function classifyP13KOutcome({
  certificateComplete,
  actionableObligationCount,
}) {
  if (!certificateComplete || actionableObligationCount < 1) return "C";
  return actionableObligationCount > 1 ? "B" : "A";
}
