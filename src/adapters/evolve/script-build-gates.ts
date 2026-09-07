/**
 * Script-computed build gates that are not present in the upstream game root.
 *
 * The storage pass calculates which Knowledge commitments are waiting on capacity and publishes
 * the two requirement values in script state. Capacity itself is read from the captured resource
 * port, so this bridge does not retain the legacy resource wrapper or game clone.
 */

import type { KnowledgeGateLevels } from "../../domain/progression/build/building-weighting.ts";
import type { GameResourceSource } from "../../ports/game-world-state.ts";
import { isRecord } from "../validation.ts";

export interface ScriptBuildGateDependencies {
  readonly getState: () => unknown;
  readonly resources: GameResourceSource;
}

function readNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

/** Reads the storage planner's Knowledge requirements and captured Knowledge capacity. */
export function createScriptKnowledgeGateReader(
  dependencies: ScriptBuildGateDependencies,
): () => KnowledgeGateLevels {
  return () => {
    const state = dependencies.getState();
    const knowledge = dependencies.resources.readResources(["Knowledge"]);
    const capacity = knowledge?.resources.get("Knowledge")?.max;
    return Object.freeze({
      cheapestTechKnowledge: isRecord(state)
        ? readNumber(state["cheapestTechKnowledge"])
        : Number.NaN,
      knowledgeRequiredByBuildTargets: isRecord(state)
        ? readNumber(state["knowledgeRequiredByBuildTargets"])
        : Number.NaN,
      knowledgeCapacity: capacity === undefined ? Number.NaN : capacity,
    });
  };
}
