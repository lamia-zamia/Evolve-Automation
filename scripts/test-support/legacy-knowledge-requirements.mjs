// Exact copy of the pre-migration knowledge-storage arithmetic from
// storage-requirements.calculateRequiredStorages, over the same immutable input the
// domain function consumes. Used only to prove old-versus-new equivalence.

export function legacyCalculateKnowledgeRequirements(input) {
  const knowledgeRequiredByTechs = Math.max(0, ...input.techKnowledgeCosts);
  const cheapestTechKnowledge =
    input.techKnowledgeCosts.length > 0
      ? Math.min(...input.techKnowledgeCosts)
      : 0;

  const buildKnowledgeCosts = [];
  const addBuildKnowledgeCosts = (targets) => {
    for (const target of targets) {
      if (target.isTechnology || target.isKnowledge) continue;
      if (target.knowledgeCost > 0)
        buildKnowledgeCosts.push(target.knowledgeCost);
    }
  };
  addBuildKnowledgeCosts(input.reservedTargets);
  const topTarget = input.buildCandidates
    .filter((object) => object.autoBuildable && !object.isKnowledge)
    .reduce(
      (top, object) =>
        !top || object.weighting > (top.weighting ?? 0) ? object : top,
      null,
    );
  if (topTarget) {
    addBuildKnowledgeCosts([{ ...topTarget, isTechnology: false }]);
  }

  return {
    knowledgeRequiredByTechs,
    cheapestTechKnowledge,
    knowledgeRequiredByBuildTargets: Math.max(0, ...buildKnowledgeCosts),
  };
}
