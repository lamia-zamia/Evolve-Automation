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
  let truncated = false;

  const examineNode = (key) => {
    if (active.has(key)) return false;
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
    if (requirement === undefined || !examineNode(key)) return undefined;
    if (
      requirement.id !==
        `research:${requirement.technologyId}:${requirement.requiredLevel}` ||
      (grantLevels !== undefined &&
        requirement.observedLevel !== grantLevels.get(requirement.technologyId))
    ) {
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
    if (action === undefined || definition === undefined || !examineNode(key))
      return undefined;
    if (definition.prerequisites.kind !== "declared") {
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
      result === undefined ? (truncated ? "truncated" : "not-found") : "found",
    targetActionId,
    ancestorActionId,
    witness: result,
    work: Object.freeze({
      ...work,
      maxNodes,
      maxEdges,
    }),
    truncationReasons: Object.freeze(
      truncated ? ["retained graph examination budget exhausted"] : [],
    ),
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
}) {
  if (definition === undefined) return "unknown-definition-unavailable";
  if (currentOffer === undefined) return "unknown-current-offer-unavailable";
  if (currentOffer.actionId !== definition.actionId)
    return "unknown-current-offer-mismatch";
  if (currentOffer.bindingGeneration < 1)
    return "unknown-current-binding-invalid";
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
  if (inputConsistency !== "consistent" || currentEvidence !== "complete")
    return "unknown-incomplete-evidence";
  return "proven-unrelated";
}

export function classifyP13KOutcome({
  certificateComplete,
  actionableObligationCount,
}) {
  if (!certificateComplete || actionableObligationCount < 1) return "C";
  return actionableObligationCount > 1 ? "B" : "A";
}
