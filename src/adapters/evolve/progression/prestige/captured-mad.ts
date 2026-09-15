/**
 * Captured MAD prestige input and commands for the independent runtime.
 *
 * DeadSpace keeps the MAD definition lexical, but publishes the facts its panel and reset gate
 * use on the reactive root. The panel's own `arm` and `launch` methods are captured when the
 * military tab is drawn, so this adapter never reaches for the private `warhead` function.
 */

import type {
  PrestigeBranch,
  PrestigeCommand,
  PrestigeInput,
} from "../../../../domain/progression/prestige/prestige.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameActivitySink } from "../../../../ports/game-message-log.ts";
import type {
  PrestigeExecutor,
  PrestigeReader,
} from "../../../../ports/prestige.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import {
  coerceNumber,
  finite,
  isNonArrayRecord,
  readProperty,
} from "../../../validation.ts";

export const CAPTURED_MAD_CONTROL = "mad";

type MadBranch = Extract<PrestigeBranch, { readonly type: "mad" }>;

export interface CapturedMadPrestigeDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readGoal: () => string;
  readonly setGoal: (goal: string) => void;
  /** Reports a prestige after the launch replaced the captured game root. */
  readonly onActivity?: GameActivitySink;
}

function capturedMadSettingsRecord(raw: unknown): Record<PropertyKey, unknown> {
  return isNonArrayRecord(raw) ? raw : {};
}

function capturedMadSettingBoolean(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = settings[key];
  return value === undefined ? fallback : Boolean(value);
}

function capturedMadSettingNumber(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number {
  return finite(settings[key]) ?? fallback;
}

/**
 * Reads the MAD branch from one root. Missing numeric bags preserve DeadSpace's arithmetic
 * behavior as `NaN`: an uninitialized count cannot satisfy the wait-for-population gate, but it
 * does not turn a displayed and eligible MAD panel into a hard adapter failure.
 */
export function readCapturedMadBranch(
  root: unknown,
  rawSettings: unknown,
): MadBranch {
  const settings = capturedMadSettingsRecord(rawSettings);
  const civic = readProperty(root, "civic");
  const mad = readProperty(civic, "mad");
  const tech = readProperty(root, "tech");
  const garrison = readProperty(civic, "garrison");
  const population = readProperty(readProperty(root, "resource"), "Population");
  const currentSoldiers =
    coerceNumber(readProperty(garrison, "workers")) -
    coerceNumber(readProperty(garrison, "crew"));
  const maxSoldiers =
    coerceNumber(readProperty(garrison, "max")) -
    coerceNumber(readProperty(garrison, "crew"));
  const madDisplay = readProperty(mad, "display") === true;
  const madLevel = coerceNumber(readProperty(tech, "mad"));

  return Object.freeze({
    type: "mad",
    // `tech.mad` is the captured grant that the upstream `haveTech('mad')` gate reports; display
    // is the separate `civic.mad.display` flag written by the game's tech action.
    eligible: madDisplay && madLevel > 0,
    armed: Boolean(readProperty(mad, "armed")),
    waitForPopulation: capturedMadSettingBoolean(
      settings,
      "prestigeMADWait",
      true,
    ),
    currentSoldiers,
    maxSoldiers,
    currentPopulation: coerceNumber(readProperty(population, "amount")),
    maxPopulation: coerceNumber(readProperty(population, "max")),
    requiredPopulation: capturedMadSettingNumber(
      settings,
      "prestigeMADPopulation",
      1,
    ),
  });
}

function invokeMadControl(
  controls: GameControlRegistry,
  method: "arm" | "launch",
): void {
  const control = controls.resolve(CAPTURED_MAD_CONTROL);
  if (control === undefined || !control.methods.includes(method)) {
    throw new Error(`captured MAD control lacks ${method}`);
  }
  const result = controls.invoke(control, method);
  if (!result.ok) {
    throw new Error(
      `captured MAD ${method} failed: ${result.detail ?? result.reason}`,
    );
  }
}

/** Creates the reader/executor pair consumed by the existing pure MAD planner. */
export function createCapturedMadPrestige(
  dependencies: CapturedMadPrestigeDependencies,
): { readonly reader: PrestigeReader; readonly executor: PrestigeExecutor } {
  let sampledRoot: unknown;
  const reader: PrestigeReader = Object.freeze({
    samplePrestige(): PrestigeInput {
      const settings = capturedMadSettingsRecord(dependencies.readSettings());
      const root = dependencies.rootState.readRoot();
      sampledRoot = root;
      const prestigeType =
        typeof settings["prestigeType"] === "string"
          ? settings["prestigeType"]
          : "none";
      const branch: PrestigeBranch =
        prestigeType === "mad"
          ? readCapturedMadBranch(root, settings)
          : { type: "noop" };
      return Object.freeze({
        goal: dependencies.readGoal(),
        branch: Object.freeze(branch),
      });
    },
  });

  const executor: PrestigeExecutor = Object.freeze({
    execute(command: PrestigeCommand): void {
      switch (command.kind) {
        case "set-goal":
          dependencies.setGoal(command.goal);
          return;
        case "arm-mad":
        case "launch-mad":
          if (dependencies.rootState.readRoot() !== sampledRoot) {
            throw new Error("captured MAD root changed after sampling");
          }
          invokeMadControl(
            dependencies.controls,
            command.kind === "arm-mad" ? "arm" : "launch",
          );
          if (
            command.kind === "launch-mad" &&
            dependencies.rootState.readRoot() !== sampledRoot
          ) {
            dependencies.onActivity?.({
              message: "Prestiged",
              color: "info",
              tags: Object.freeze(["achievements"]),
            });
          }
          return;
        case "log-prestige":
          // The activity sink observes the root transition after launch; logging this planner
          // command would report an attempted prestige before the game actually reset.
          return;
        default:
          // Non-MAD branches are intentionally represented as noop by this bounded reader.
          return;
      }
    },
  });
  return Object.freeze({ reader, executor });
}
