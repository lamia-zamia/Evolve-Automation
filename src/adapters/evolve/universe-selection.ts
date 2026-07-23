import type { UniverseSelectionInput } from "../../domain/progression/evolution/universe-selection.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import type { UniverseSelectionControls } from "../../ports/progression-controls.ts";
import { stale, SUCCEEDED } from "../command-outcomes.ts";
import { requireRecord } from "../validation.ts";

export interface UniverseSelectionReaderDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
}

export function readUniverseSelectionInput(
  dependencies: UniverseSelectionReaderDependencies,
): UniverseSelectionInput {
  const game = requireRecord(dependencies.getGame(), "game");
  const settings = requireRecord(dependencies.getSettings(), "settings");
  const race = requireRecord(
    requireRecord(game["global"], "game.global")["race"],
    "game.global.race",
  );
  const targetName = settings["userUniverseTargetName"];
  if (typeof targetName !== "string") {
    throw new TypeError("settings.userUniverseTargetName must be a string");
  }
  const universe = race["universe"];
  return Object.freeze({
    hasBigbang: Boolean(race["bigbang"]),
    universe: typeof universe === "string" ? universe : null,
    targetName,
  });
}

export function createUniverseSelectionCommandExecutor(dependencies: {
  readonly getGame: () => unknown;
  readonly controls: UniverseSelectionControls;
}): DecisionExecutor<string | null> {
  return Object.freeze({
    execute(targetName: string | null) {
      if (targetName === null) {
        return SUCCEEDED;
      }
      const game = requireRecord(dependencies.getGame(), "game");
      const race = requireRecord(
        requireRecord(game["global"], "game.global")["race"],
        "game.global.race",
      );
      if (!race["bigbang"] || race["universe"] !== "bigbang") {
        return stale(
          "universe-selection-unavailable",
          "universe selection became unavailable",
        );
      }
      if (!dependencies.controls.selectUniverse(targetName)) {
        return stale(
          "universe-control-unavailable",
          "universe selection control became unavailable",
        );
      }
      return SUCCEEDED;
    },
  });
}
