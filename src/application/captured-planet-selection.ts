import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
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

/** Selects a sole game-drawn planet candidate; scored candidate lists stand down. */
export function runCapturedPlanetSelection({
  reader,
  executor,
}: CapturedPlanetSelectionCycleDependencies): CommandExecutionOutcome {
  const sample = reader.sample();
  const decision = planSinglePlanetSelection(sample.gate, sample.candidateIds);
  if (decision === null) return CAPTURED_PLANET_SELECTION_SUCCEEDED;
  return executor.execute(decision);
}
