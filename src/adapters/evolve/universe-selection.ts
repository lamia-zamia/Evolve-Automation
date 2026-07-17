import type { UniverseSelectionInput } from "../../domain/universe-selection.ts";
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
  return Object.freeze({
    hasBigbang: Boolean(race["bigbang"]),
    universe: race["universe"],
    targetName,
  });
}
