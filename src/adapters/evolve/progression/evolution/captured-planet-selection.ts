import {
  isPlanetSelectionAvailable,
  type PlanetSelectionDecision,
  type PlanetSelectionGate,
} from "../../../../domain/progression/evolution/planet-selection.ts";
import type {
  CapturedPlanetSelectionExecutor,
  CapturedPlanetSelectionReader,
} from "../../../../ports/captured-planet-selection.ts";
import type { GameDrawnActionsReader } from "../../../../ports/game-drawn-actions.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { PlanetSelectionControls } from "../../../../ports/progression-controls.ts";
import { stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";

const PLANET_ACTION_SELECTOR = "#evolution > .action";

export interface CapturedPlanetSelectionDependencies {
  readonly rootState: GameRootStateSource;
  readonly drawnActions: GameDrawnActionsReader;
  readonly readSettings: () => unknown;
  readonly controls: PlanetSelectionControls;
}

function capturedPlanetRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isNonArrayRecord(value) ? value : undefined;
}

function readRace(
  rootState: GameRootStateSource,
): Record<string, unknown> | undefined {
  return capturedPlanetRecord(
    readProperty(capturedPlanetRecord(rootState.readRoot()), "race"),
  );
}

function readGate(
  rootState: GameRootStateSource,
  readSettings: () => unknown,
): PlanetSelectionGate {
  const race = readRace(rootState);
  const settings = capturedPlanetRecord(readSettings());
  const targetName = settings?.["userPlanetTargetName"];
  const universe = race?.["universe"];
  return Object.freeze({
    universe: typeof universe === "string" ? universe : null,
    seeded: Boolean(race?.["seeded"]),
    chose: Boolean(race?.["chose"]),
    // Keep the game's lenient non-string comparison: only the literal "none"
    // disables selection, while other values use the sole-row safe path.
    targetName: typeof targetName === "string" ? targetName : null,
  });
}

export function createCapturedPlanetSelection({
  rootState,
  drawnActions,
  readSettings,
  controls,
}: CapturedPlanetSelectionDependencies): Readonly<{
  readonly reader: CapturedPlanetSelectionReader;
  readonly executor: CapturedPlanetSelectionExecutor;
}> {
  const reader: CapturedPlanetSelectionReader = Object.freeze({
    sample() {
      const candidateIds = drawnActions
        .read(PLANET_ACTION_SELECTOR)
        .map((action) => action.id);
      return Object.freeze({
        gate: readGate(rootState, readSettings),
        candidateIds: Object.freeze(candidateIds),
      });
    },
  });

  const executor: CapturedPlanetSelectionExecutor = Object.freeze({
    execute(decision: Readonly<PlanetSelectionDecision>) {
      const gate = readGate(rootState, readSettings);
      if (!isPlanetSelectionAvailable(gate)) {
        return stale(
          "planet-selection-unavailable",
          "planet selection became unavailable",
        );
      }
      if (!controls.selectPlanet(decision.elementId)) {
        return stale(
          "planet-control-unavailable",
          "planet selection control became unavailable",
        );
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
