import type {
  PlanetSelectionDecision,
  PlanetSelectionGate,
  PlanetSelectionInput,
} from "../domain/progression/evolution/planet-selection.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

/** The part of planet selection answerable from the game root and drawn rows. */
export interface CapturedPlanetSelectionSample {
  readonly gate: PlanetSelectionGate;
  readonly candidateIds: readonly string[];
  /**
   * The complete scoring input, present only when every required fact was available for every
   * drawn candidate. Absent means "cannot rank" — never "nothing to rank" — so the caller falls
   * back to the sole-row safe path rather than scoring a partial sample.
   */
  readonly ranking?: PlanetSelectionInput;
}

export interface CapturedPlanetSelectionReader {
  sample(): CapturedPlanetSelectionSample;
}

export type CapturedPlanetSelectionExecutor =
  DecisionExecutor<PlanetSelectionDecision>;
