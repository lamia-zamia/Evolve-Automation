export interface KnowledgeReservedTarget {
  /** Knowledge component of the target's cost (0 when absent). */
  readonly knowledgeCost: number;
  /** Whether the target is a research technology (excluded from build costs). */
  readonly isTechnology: boolean;
  /** Whether the target itself produces Knowledge (excluded from build costs). */
  readonly isKnowledge: boolean;
}

export interface KnowledgeBuildCandidate {
  readonly knowledgeCost: number;
  readonly isKnowledge: boolean;
  readonly weighting: number;
  readonly autoBuildable: boolean;
}

export interface KnowledgeRequirementsInput {
  /** Knowledge costs of every currently unlocked tech, plus any embassy reserve. */
  readonly techKnowledgeCosts: readonly number[];
  /** Queued and triggered targets whose Knowledge must be reserved. */
  readonly reservedTargets: readonly Readonly<KnowledgeReservedTarget>[];
  /** Building and project priority-list entries; the single highest-weighted
   * auto-buildable non-Knowledge candidate also reserves Knowledge. */
  readonly buildCandidates: readonly Readonly<KnowledgeBuildCandidate>[];
}

export interface KnowledgeRequirements {
  readonly knowledgeRequiredByTechs: number;
  readonly cheapestTechKnowledge: number;
  readonly knowledgeRequiredByBuildTargets: number;
}

function reserveBuildCost(
  costs: number[],
  target: KnowledgeReservedTarget,
): void {
  if (target.isTechnology || target.isKnowledge) return;
  if (target.knowledgeCost > 0) costs.push(target.knowledgeCost);
}

/**
 * Pure Knowledge-storage planning: the most expensive tech, the cheapest tech,
 * and the most expensive build target that must have its Knowledge reserved.
 */
export function calculateKnowledgeRequirements(
  input: Readonly<KnowledgeRequirementsInput>,
): KnowledgeRequirements {
  const knowledgeRequiredByTechs = Math.max(0, ...input.techKnowledgeCosts);
  const cheapestTechKnowledge =
    input.techKnowledgeCosts.length > 0
      ? Math.min(...input.techKnowledgeCosts)
      : 0;

  const buildKnowledgeCosts: number[] = [];
  for (const target of input.reservedTargets) {
    reserveBuildCost(buildKnowledgeCosts, target);
  }

  let topTarget: KnowledgeBuildCandidate | null = null;
  for (const candidate of input.buildCandidates) {
    if (!candidate.autoBuildable || candidate.isKnowledge) continue;
    if (!topTarget || candidate.weighting > topTarget.weighting) {
      topTarget = candidate;
    }
  }
  if (topTarget && topTarget.knowledgeCost > 0) {
    buildKnowledgeCosts.push(topTarget.knowledgeCost);
  }

  return {
    knowledgeRequiredByTechs,
    cheapestTechKnowledge,
    knowledgeRequiredByBuildTargets: Math.max(0, ...buildKnowledgeCosts),
  };
}
