import type { ShapeshiftInput } from "../../domain/shapeshift.ts";
import { requireRecord } from "../validation.ts";

export interface ShapeshiftReaderDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
}

export function readShapeshiftInput(
  dependencies: ShapeshiftReaderDependencies,
): ShapeshiftInput {
  const game = requireRecord(dependencies.getGame(), "game");
  const settings = requireRecord(dependencies.getSettings(), "settings");
  const race = requireRecord(
    requireRecord(game["global"], "game.global")["race"],
    "game.global.race",
  );
  const shifterGenus = settings["shifterGenus"];
  if (typeof shifterGenus !== "string") {
    throw new TypeError("settings.shifterGenus must be a string");
  }
  return Object.freeze({
    isShapeshifter: Boolean(race["shapeshifter"]),
    shifterGenus,
    currentGenus: race["ss_genus"],
  });
}
