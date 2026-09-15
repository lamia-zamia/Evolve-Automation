import type {
  PlanetSelectionDecision,
  PlanetSelectionGate,
} from "../domain/progression/evolution/planet-selection.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

/** The part of planet selection answerable from the game root and drawn rows. */
export interface CapturedPlanetSelectionSample {
  readonly gate: PlanetSelectionGate;
  readonly candidateIds: readonly string[];
}

export interface CapturedPlanetSelectionReader {
  sample(): CapturedPlanetSelectionSample;
}

export type CapturedPlanetSelectionExecutor =
  DecisionExecutor<PlanetSelectionDecision>;
