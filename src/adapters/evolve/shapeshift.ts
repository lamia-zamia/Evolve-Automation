import type { ShapeshiftInput } from "../../domain/shapeshift.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import type { ShapeshiftControls } from "../../ports/progression-controls.ts";
import { stale, SUCCEEDED } from "../command-outcomes.ts";
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
  const currentGenus = race["ss_genus"];
  return Object.freeze({
    isShapeshifter: Boolean(race["shapeshifter"]),
    shifterGenus,
    currentGenus: typeof currentGenus === "string" ? currentGenus : null,
  });
}

export function createShapeshiftCommandExecutor(dependencies: {
  readonly getGame: () => unknown;
  readonly controls: ShapeshiftControls;
}): DecisionExecutor<string | null> {
  return Object.freeze({
    execute(targetGenus: string | null) {
      if (targetGenus === null) {
        return SUCCEEDED;
      }
      const game = requireRecord(dependencies.getGame(), "game");
      const race = requireRecord(
        requireRecord(game["global"], "game.global")["race"],
        "game.global.race",
      );
      if (!race["shapeshifter"]) {
        return stale("shapeshift-locked", "shapeshifting became unavailable");
      }
      if (race["ss_genus"] === targetGenus) {
        return stale(
          "shape-already-selected",
          "target shape is already active",
        );
      }
      if (!dependencies.controls.setShape(targetGenus)) {
        return stale(
          "shapeshift-controls-unavailable",
          "shapeshift controls became unavailable",
        );
      }
      return SUCCEEDED;
    },
  });
}
