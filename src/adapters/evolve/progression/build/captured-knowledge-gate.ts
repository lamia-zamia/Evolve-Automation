/**
 * The Knowledge-capacity gate, from the captured research catalog.
 *
 * The gate answers one question the build cycle asks: is research currently blocked by Knowledge
 * storage rather than by anything else? When it is, a Knowledge building is allowed past a saving
 * conflict, because the thing being saved for cannot be reached until capacity grows. Without the
 * gate that allowance never applies and an expensive saving target can starve research indefinitely.
 *
 * It never buys a discovery pass of its own. The offered-technology catalog costs one, and this
 * reads whichever catalog the cycle already had a reason to draw — the research cycle's, or the
 * research queue's. With neither in use no catalog is ever read and the gate stays open, which is
 * the behaviour that existed before it.
 *
 * Only the technology half is captured. `knowledgeRequiredByBuildTargets` — the Knowledge a queued
 * or top-weighted build target reserves — stays zero until build candidates are sampled for it; it
 * can only leave the gate open, never close it wrongly.
 */

import {
  calculateKnowledgeRequirements,
  type KnowledgeTechCost,
} from "../../../../domain/knowledge-requirements.ts";
import { canAfford } from "../../../../domain/game-world.ts";
import type { KnowledgeGateLevels } from "../../../../domain/progression/build/building-weighting.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { OfferedTech } from "../../../../ports/game-tech-catalog.ts";
import { readProperty } from "../../../validation.ts";

const KNOWLEDGE = "Knowledge";

const OPEN_GATE: KnowledgeGateLevels = Object.freeze({
  cheapestTechKnowledge: 0,
  knowledgeRequiredByBuildTargets: 0,
  knowledgeCapacity: 0,
});

export interface CapturedKnowledgeGateDependencies {
  readonly rootState: GameRootStateSource;
  readonly resources: GameResourceSource;
  /** The most recent offered-technology catalog, or undefined when none has been read. */
  readonly readLastOfferedTechs: () =>
    readonly Readonly<OfferedTech>[] | undefined;
}

function knowledgeCapacity(rootState: GameRootStateSource): number | undefined {
  const maximum = readProperty(
    readProperty(readProperty(rootState.readRoot(), "resource"), KNOWLEDGE),
    "max",
  );
  return typeof maximum === "number" && Number.isFinite(maximum) && maximum > 0
    ? maximum
    : undefined;
}

function techCost(
  resources: GameResourceSource,
  tech: Readonly<OfferedTech>,
): KnowledgeTechCost | undefined {
  const knowledge = tech.cost[KNOWLEDGE];
  if (typeof knowledge !== "number" || !Number.isFinite(knowledge)) {
    return undefined;
  }
  const others: Record<string, number> = {};
  for (const [id, amount] of Object.entries(tech.cost)) {
    if (id !== KNOWLEDGE) others[id] = amount;
  }
  const sample = resources.readResources(Object.keys(others));
  return Object.freeze({
    knowledgeCost: knowledge,
    otherCostsAffordable: sample !== undefined && canAfford(sample, others),
  });
}

export function createCapturedKnowledgeGateReader({
  rootState,
  resources,
  readLastOfferedTechs,
}: CapturedKnowledgeGateDependencies): () => KnowledgeGateLevels {
  return () => {
    const capacity = knowledgeCapacity(rootState);
    const offered = readLastOfferedTechs();
    if (capacity === undefined || offered === undefined) return OPEN_GATE;
    const techKnowledgeCosts: KnowledgeTechCost[] = [];
    for (const tech of offered) {
      const cost = techCost(resources, tech);
      if (cost !== undefined) techKnowledgeCosts.push(cost);
    }
    const requirements = calculateKnowledgeRequirements({
      techKnowledgeCosts: Object.freeze(techKnowledgeCosts),
      reservedTargets: Object.freeze([]),
      buildCandidates: Object.freeze([]),
    });
    return Object.freeze({
      cheapestTechKnowledge: requirements.cheapestTechKnowledge,
      knowledgeRequiredByBuildTargets: 0,
      knowledgeCapacity: capacity,
    });
  };
}
