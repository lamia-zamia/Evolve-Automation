import type { ShapeshiftInput } from "../../../domain/traits/shapeshift.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type { ShapeshiftControls } from "../../../ports/progression-controls.ts";
import type { ShapeshiftReader } from "../../../ports/shapeshift.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  requireRecord,
  requireString,
  readProperty,
} from "../../validation.ts";

export const CAPTURED_SHAPESHIFT_CONTROL = "sshifter";

export interface CapturedShapeshiftDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly ensureControls: () => boolean;
}

function capturedShapeshiftRace(rootState: GameRootStateSource) {
  return requireRecord(
    readProperty(rootState.readRoot(), "race"),
    "global.race",
  );
}

export function createCapturedShapeshiftAutomation(
  dependencies: CapturedShapeshiftDependencies,
): {
  readonly reader: ShapeshiftReader;
  readonly controls: ShapeshiftControls;
  readonly executor: DecisionExecutor<string | null>;
} {
  const reader: ShapeshiftReader = Object.freeze({
    read(): ShapeshiftInput {
      const race = capturedShapeshiftRace(dependencies.rootState);
      const settings = requireRecord(dependencies.readSettings(), "settings");
      const currentGenus = readProperty(race, "ss_genus");
      return Object.freeze({
        isShapeshifter: Boolean(readProperty(race, "shapeshifter")),
        shifterGenus: requireString(
          readProperty(settings, "shifterGenus"),
          "settings.shifterGenus",
        ),
        currentGenus: typeof currentGenus === "string" ? currentGenus : null,
      });
    },
  });

  const controls: ShapeshiftControls = Object.freeze({
    setShape(genus: string): boolean {
      if (!dependencies.ensureControls()) return false;
      const handle = dependencies.controls.resolve(CAPTURED_SHAPESHIFT_CONTROL);
      if (handle === undefined || !handle.methods.includes("setShape")) {
        return false;
      }
      const result = dependencies.controls.invoke(handle, "setShape", [genus]);
      // The Vue wrapper's return value is not the game effect; the executor verifies ss_genus.
      return result.ok;
    },
  });

  const executor: DecisionExecutor<string | null> = Object.freeze({
    execute(targetGenus: string | null) {
      if (targetGenus === null) return SUCCEEDED;
      const race = capturedShapeshiftRace(dependencies.rootState);
      if (!readProperty(race, "shapeshifter")) {
        return stale("shapeshift-locked", "shapeshifting became unavailable");
      }
      if (readProperty(race, "ss_genus") === targetGenus) {
        return stale(
          "shape-already-selected",
          "target shape is already active",
        );
      }
      controls.setShape(targetGenus);
      return readProperty(
        capturedShapeshiftRace(dependencies.rootState),
        "ss_genus",
      ) === targetGenus
        ? SUCCEEDED
        : stale(
            "shapeshift-postcondition-failed",
            "the game did not apply the requested shape",
          );
    },
  });

  return Object.freeze({ reader, controls, executor });
}
