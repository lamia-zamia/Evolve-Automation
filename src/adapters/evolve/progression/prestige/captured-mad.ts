/**
 * Captured prestige input and commands for the independent runtime.
 *
 * DeadSpace keeps the MAD definition lexical, but publishes the facts its panel and reset gate
 * use on the reactive root. The panel's own `arm` and `launch` methods are captured when the
 * military tab is drawn, so this adapter never reaches for the private `warhead` function.
 * DeadSpace's ordinary prestige actions are also lexical definitions, but their action rows are
 * captured by the same page surface: `space-terraform`, `interstellar-ascend`, and
 * `eden-apotheosis` call the game's own Terraform, Ascension, and Apotheosis reset paths.
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

/** DeadSpace action rows that commit the ordinary building-shaped prestige branches. */
export const CAPTURED_BUILDING_PRESTIGE_ACTIONS = Object.freeze({
  terraform: Object.freeze({ elementId: "space-terraform", region: "space" }),
  ascension: Object.freeze({
    elementId: "interstellar-ascend",
    region: "interstellar",
  }),
  apotheosis: Object.freeze({
    elementId: "eden-apotheosis",
    region: "eden",
  }),
});

export type CapturedBuildingPrestigeType =
  keyof typeof CAPTURED_BUILDING_PRESTIGE_ACTIONS;

export function isCapturedBuildingPrestigeType(
  value: unknown,
): value is CapturedBuildingPrestigeType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      CAPTURED_BUILDING_PRESTIGE_ACTIONS,
      value,
    )
  );
}

type MadBranch = Extract<PrestigeBranch, { readonly type: "mad" }>;

export interface CapturedMadPrestigeDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readGoal: () => string;
  readonly setGoal: (goal: string) => void;
  /** Reads the game's offered action rows for the named prestige panel. */
  readonly readBuildingResetActions?: (
    regions: readonly string[],
  ) => ReadonlySet<string> | undefined;
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
  let resetCommitted = false;
  const reader: PrestigeReader = Object.freeze({
    samplePrestige(): PrestigeInput {
      const settings = capturedMadSettingsRecord(dependencies.readSettings());
      const root = dependencies.rootState.readRoot();
      sampledRoot = root;
      const prestigeType =
        typeof settings["prestigeType"] === "string"
          ? settings["prestigeType"]
          : "none";
      let branch: PrestigeBranch = { type: "noop" };
      if (!resetCommitted && prestigeType === "mad") {
        branch = readCapturedMadBranch(root, settings);
      } else if (
        !resetCommitted &&
        isCapturedBuildingPrestigeType(prestigeType)
      ) {
        const action = CAPTURED_BUILDING_PRESTIGE_ACTIONS[prestigeType];
        const offered = dependencies.readBuildingResetActions?.([
          action.region,
        ]);
        // A missing panel sample is an unknown gate, not a locked reset. The planner only
        // receives a boolean after the game has answered whether it drew the action row.
        if (offered !== undefined) {
          branch = {
            type: "building-reset",
            building: action.elementId,
            unlocked: offered.has(action.elementId),
          };
        }
      }
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
        case "click-building": {
          if (dependencies.rootState.readRoot() !== sampledRoot) {
            throw new Error("captured prestige root changed after sampling");
          }
          const handle = dependencies.controls.resolve(command.id);
          if (handle === undefined || !handle.methods.includes("action")) {
            throw new Error(
              `captured prestige action ${command.id} is unavailable`,
            );
          }
          const result = dependencies.controls.invoke(handle, "action");
          if (!result.ok) {
            throw new Error(
              `captured prestige action ${command.id} failed: ${result.detail ?? result.reason}`,
            );
          }
          // DeadSpace's reset action returns true after it has scheduled the browser reload. Keep
          // the old root from receiving a duplicate click if that reload is still pending.
          if (result.value === true) resetCommitted = true;
          return;
        }
        default:
          // Unsupported branches are intentionally represented as noop by this bounded reader.
          return;
      }
    },
  });
  return Object.freeze({ reader, executor });
}
