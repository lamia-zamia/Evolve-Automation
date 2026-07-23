import {
  createPlanetSelectionControls,
  createUniverseSelectionControls,
} from "../adapters/browser/progression-controls.ts";
import {
  createEvolutionCommandExecutor,
  createEvolutionReader,
} from "../adapters/evolve/progression/evolution/evolution.ts";
import {
  createPlanetSelectionCommandExecutor,
  createPlanetSelectionReader,
} from "../adapters/evolve/progression/evolution/planet-selection.ts";
import {
  createUniverseSelectionCommandExecutor,
  readUniverseSelectionInput,
} from "../adapters/evolve/progression/evolution/universe-selection.ts";
import { runEvolution } from "../application/evolution.ts";
import { runPlanetSelection } from "../application/planet-selection.ts";
import { planUniverseSelection } from "../domain/progression/evolution/universe-selection.ts";

// Composition seam for the evolution subsystem: evolution, universe selection,
// and planet selection are one coupled slice because `runEvolution` drives the
// other two as sub-steps (`runUniverseSelection` / `runPlanetSelection`). The
// seam builds each control's reader/executor once and returns all three, wiring
// evolution to the sibling controls — exactly as the runtime closure did. The
// planet-generation game model stays in the closure and is passed in through the
// planet-selection reader's `getGeneratePlanets` accessor.
export function createEvolutionControls(dependencies: {
  evolutionReader: Parameters<typeof createEvolutionReader>[0];
  evolutionExecutor: Parameters<typeof createEvolutionCommandExecutor>[0];
  challengeGroups: Parameters<
    typeof createEvolutionReader
  >[0]["challengeGroups"];
  universeSelection: {
    reader: Parameters<typeof readUniverseSelectionInput>[0];
    executor: {
      getGame: () => unknown;
      getDocument: () => unknown;
    };
  };
  planetSelection: {
    reader: Parameters<typeof createPlanetSelectionReader>[0];
    executor: {
      getGame: () => unknown;
      getDocument: () => unknown;
      getMouseEvent: () => unknown;
    };
  };
}) {
  const universeSelectionExecutor = createUniverseSelectionCommandExecutor({
    getGame: dependencies.universeSelection.executor.getGame,
    controls: createUniverseSelectionControls(
      dependencies.universeSelection.executor.getDocument,
    ),
  });
  const autoUniverseSelection = () =>
    universeSelectionExecutor.execute(
      planUniverseSelection(
        readUniverseSelectionInput(dependencies.universeSelection.reader),
      ),
    );

  const planetSelectionReader = createPlanetSelectionReader(
    dependencies.planetSelection.reader,
  );
  const planetSelectionExecutor = createPlanetSelectionCommandExecutor({
    getGame: dependencies.planetSelection.executor.getGame,
    controls: createPlanetSelectionControls(
      dependencies.planetSelection.executor.getDocument,
      dependencies.planetSelection.executor.getMouseEvent,
    ),
  });
  const autoPlanetSelection = () =>
    runPlanetSelection({
      reader: planetSelectionReader,
      executor: planetSelectionExecutor,
    });

  const evolutionReader = createEvolutionReader(dependencies.evolutionReader);
  const evolutionExecutor = createEvolutionCommandExecutor(
    dependencies.evolutionExecutor,
  );
  const autoEvolution = () =>
    runEvolution({
      reader: evolutionReader,
      executor: evolutionExecutor,
      runUniverseSelection: autoUniverseSelection,
      runPlanetSelection: autoPlanetSelection,
      challengeGroups: dependencies.challengeGroups,
    });

  return Object.freeze({
    autoEvolution,
    autoUniverseSelection,
    autoPlanetSelection,
  });
}
