export interface KnowledgeReservedTarget {
  /** Knowledge component of the target's cost (0 when absent). */
  readonly knowledgeCost: number;
  /** Whether the target is a research technology (excluded from build costs). */
  readonly isTechnology: boolean;
  /** Whether the target itself produces Knowledge (excluded from build costs). */
  readonly isKnowledge: boolean;
}

export interface KnowledgeTechCost {
  readonly knowledgeCost: number;
  /**
   * Whether every non-Knowledge cost of the technology is already paid for.
   * A technology still short of Money, Steel or any other material is not
   * waiting on Knowledge capacity, so it must not answer "how much Knowledge
   * capacity does the cheapest reachable technology need".
   */
  readonly otherCostsAffordable: boolean;
}

export interface KnowledgeBuildCandidate {
  readonly knowledgeCost: number;
  readonly isKnowledge: boolean;
  readonly weighting: number;
  readonly autoBuildable: boolean;
}

export interface KnowledgeRequirementsInput {
  /** Every currently unlocked tech, plus any embassy reserve. */
  readonly techKnowledgeCosts: readonly Readonly<KnowledgeTechCost>[];
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
 * Pure Knowledge-storage planning: the most expensive tech, the cheapest tech
 * that only Knowledge capacity still blocks, and the most expensive build
 * target that must have its Knowledge reserved.
 */
export function calculateKnowledgeRequirements(
  input: Readonly<KnowledgeRequirementsInput>,
): KnowledgeRequirements {
  const knowledgeRequiredByTechs = Math.max(
    0,
    ...input.techKnowledgeCosts.map((tech) => tech.knowledgeCost),
  );
  // Only technologies whose other costs are already covered can be released by
  // more Knowledge capacity. Counting one that is short of Money or Steel makes
  // the cheapest figure look satisfied and silently retires the
  // "need more knowledge" build rule for as long as that technology stays
  // unaffordable.
  //
  // A technology with no Knowledge cost at all is not waiting on Knowledge
  // either, and it is the worse case: it drives the minimum to 0, which is
  // below every capacity, so the rule can never fire again. The unification
  // pair costs nothing until a foreign power is ready, and it sits in the
  // unlocked list for the whole mid-game.
  const reachable = input.techKnowledgeCosts.filter(
    (tech) => tech.otherCostsAffordable && tech.knowledgeCost > 0,
  );
  const cheapestTechKnowledge =
    reachable.length > 0
      ? Math.min(...reachable.map((tech) => tech.knowledgeCost))
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
