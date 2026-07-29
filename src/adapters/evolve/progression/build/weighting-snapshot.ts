import type { BuildingWeightingSnapshot } from "../../../../ports/building-weighting.ts";
import {
  requireArray,
  requireNumber,
  requireRecord,
} from "../../../validation.ts";

export interface WeightingSnapshotDependencies {
  readonly getState: () => unknown;
}

/**
 * Samples the script state that the building-weighting rules read.
 *
 * Called once per weighting phase so every rule observes the same values. The
 * target lists are converted to identity sets here: the rules only ask whether
 * a candidate is a queued or trigger target, and rescanning both arrays for
 * every candidate is the shape this replaced.
 */
export function createWeightingSnapshotReader({
  getState,
}: WeightingSnapshotDependencies): () => BuildingWeightingSnapshot {
  return () => {
    const state = requireRecord(getState(), "state");
    return Object.freeze({
      queuedTargets: new Set(
        requireArray(state["queuedTargets"], "state.queuedTargets"),
      ),
      triggerTargets: new Set(
        requireArray(state["triggerTargets"], "state.triggerTargets"),
      ),
      knowledgeRequiredByTechs: requireNumber(
        state["knowledgeRequiredByTechs"],
        "state.knowledgeRequiredByTechs",
      ),
      knowledgeRequiredByBuildTargets: requireNumber(
        state["knowledgeRequiredByBuildTargets"],
        "state.knowledgeRequiredByBuildTargets",
      ),
      cheapestTechKnowledge: requireNumber(
        state["cheapestTechKnowledge"],
        "state.cheapestTechKnowledge",
      ),
    });
  };
}
