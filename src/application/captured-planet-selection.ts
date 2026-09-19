import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planPlanetSelection,
  planSinglePlanetSelection,
  type PlanetSelectionDecision,
} from "../domain/progression/evolution/planet-selection.ts";
import type { CapturedPlanetSelectionReader } from "../ports/captured-planet-selection.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";

const CAPTURED_PLANET_SELECTION_SUCCEEDED: CommandExecutionOutcome =
  Object.freeze({
    status: "succeeded",
  });

export interface CapturedPlanetSelectionCycleDependencies {
  readonly reader: CapturedPlanetSelectionReader;
  readonly executor: DecisionExecutor<PlanetSelectionDecision>;
}

/**
 * Selects a planet: the scored candidate when the adapter could sample every drawn row, and
 * otherwise the sole drawn row. An unavailable ranking is a reason to fall back, not to guess.
 */
export function runCapturedPlanetSelection({
  reader,
  executor,
}: CapturedPlanetSelectionCycleDependencies): CommandExecutionOutcome {
  const sample = reader.sample();
  const decision =
    sample.ranking === undefined
      ? planSinglePlanetSelection(sample.gate, sample.candidateIds)
      : planPlanetSelection(sample.ranking);
  if (decision === null) return CAPTURED_PLANET_SELECTION_SUCCEEDED;
  return executor.execute(decision);
}
