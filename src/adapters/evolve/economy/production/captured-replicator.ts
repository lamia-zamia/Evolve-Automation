/** Bounded Matter Replicator selection through the captured industry panel. */

import {
  planReplicatorGovernorSettings,
  planReplicatorGovernorTask,
  planReplicatorPriority,
  planReplicatorSelection,
  type ReplicatorGovernorSettingsInput,
  type ReplicatorMetric,
  type ReplicatorPlanningInput,
} from "../../../../domain/economy/production/replicator.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { CapturedDemandSample } from "../resources/captured-resource-demand.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

export const REPLICATOR_CONTROL = "iReplicator";
export const GOVERNOR_CONTROL = "govOffice";

// DeadSpace's replicatorRes() is Object.keys(atomic_mass) with these exclusions.
const ATOMIC_MASS = Object.freeze({
  Food: 4.355,
  Lumber: 7.668,
  Chrysotile: 15.395,
  Stone: 20.017,
  Crystal: 5.062,
  Furs: 13.009,
  Copper: 63.546,
  Iron: 55.845,
  Aluminium: 26.9815,
  Cement: 20.009,
  Coal: 12.0107,
  Oil: 5.342,
  Uranium: 238.0289,
  Steel: 55.9,
  Titanium: 47.867,
  Alloy: 45.264,
  Polymer: 120.054,
  Iridium: 192.217,
  Helium_3: 3.0026,
  Deuterium: 2.014,
  Tungsten: 183.84,
  Neutronium: 248.74,
  Adamantite: 178.803,
  Infernite: 222.666,
  Elerium: 297.115,
  Nano_Tube: 15.083,
  Graphene: 26.9615,
  Stanene: 33.9615,
  Bolognium: 75.898,
  Unobtainium: 168.59,
  Vitreloy: 41.08,
  Orichalcum: 237.8,
  Asphodel_Powder: 0.01,
  Elysanite: 13.666,
  Water: 18.01,
  Plywood: 7.666,
  Brick: 20.009,
  Wrought_Iron: 55.845,
  Sheet_Metal: 26.9815,
  Mythril: 94.239,
  Aerogel: 7.84,
  Nanoweave: 23.71,
  Scarletite: 188.6,
  Quantium: 241.35,
  Super_Fuel: 84.16,
  Aerographene: 4.62,
});

const ALWAYS_BLACKLISTED = new Set([
  "Asphodel_Powder",
  "Elysanite",
  "Quantium",
  "Super_Fuel",
]);

/**
 * Whether upstream offers a resource to the replicator at all: an atomic-mass
 * entry outside the never-offered set. Run-time fasting/iceage exclusions
 * still apply in automation; the settings table lists every candidate.
 */
export function isReplicableResourceId(id: string): boolean {
  return Object.hasOwn(ATOMIC_MASS, id) && !ALWAYS_BLACKLISTED.has(id);
}

export interface CapturedReplicatorDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => CapturedDemandSample;
}

interface GovernorSession {
  readonly control: GameControlHandle;
  readonly tasks: readonly string[];
  readonly settings: ReplicatorGovernorSettingsInput | null;
}

export interface CapturedReplicatorAutomation {
  run(): CommandExecutionOutcome;
}

function settingBoolean(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: boolean,
): boolean | undefined {
  const value = settings[key];
  return value === undefined
    ? fallback
    : typeof value === "boolean"
      ? value
      : undefined;
}

function settingNumber(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number | undefined {
  const value = settings[key];
  return value === undefined ? fallback : finite(value);
}

function emptyInput(): ReplicatorPlanningInput {
  return Object.freeze({
    initialised: false,
    assignGovernorTask: false,
    scoreMode: "weight",
    selectHighestScore: false,
    productions: Object.freeze([]),
  });
}

function readGovernorSettings(
  governor: Record<PropertyKey, unknown>,
): ReplicatorGovernorSettingsInput | null {
  const config = readProperty(governor, "config");
  const replicate = readProperty(config, "replicate");
  const power = readProperty(replicate, "pow");
  const resources = readProperty(replicate, "res");
  if (!isRecord(power) || !isRecord(resources)) return null;
  const powerOn = power["on"];
  const focusQueue = resources["que"];
  const focusNegative = resources["neg"];
  const switchOnCap = resources["cap"];
  const powerCap = finite(power["cap"]);
  if (
    typeof powerOn !== "boolean" ||
    typeof focusQueue !== "boolean" ||
    typeof focusNegative !== "boolean" ||
    typeof switchOnCap !== "boolean" ||
    powerCap === undefined
  ) {
    return null;
  }
  return Object.freeze({
    powerOn,
    focusQueue,
    focusNegative,
    switchOnCap,
    powerCap,
  });
}

function readGovernorSession(
  root: unknown,
  techLevel: number,
  controls: GameControlRegistry,
): GovernorSession | undefined {
  const governor = readProperty(readProperty(root, "race"), "governor");
  const control = controls.resolve(GOVERNOR_CONTROL);
  const tasksValue = readProperty(governor, "tasks");
  if (
    !isRecord(governor) ||
    techLevel < 1 ||
    control === undefined ||
    !isRecord(tasksValue)
  ) {
    return undefined;
  }
  const tasks = Object.values(tasksValue);
  if (!tasks.every((task) => typeof task === "string")) return undefined;
  return Object.freeze({
    control,
    tasks: Object.freeze(
      tasks.filter((task): task is string => typeof task === "string"),
    ),
    settings: readGovernorSettings(governor),
  });
}

function excluded(id: string, race: Record<PropertyKey, unknown>): boolean {
  return (
    ALWAYS_BLACKLISTED.has(id) ||
    (id === "Food" && Boolean(race["fasting"])) ||
    (id === "Lumber" && Boolean(race["iceage"]))
  );
}

function readInput(dependencies: CapturedReplicatorDependencies): {
  readonly root: unknown;
  readonly input: ReplicatorPlanningInput;
  readonly metrics: readonly ReplicatorMetric[];
  readonly governor: GovernorSession | undefined;
} {
  const root = dependencies.rootState.readRoot();
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  const resources = readProperty(root, "resource");
  const replicator = readProperty(race, "replicator");
  const techLevel = finite(readProperty(tech, "replicator"));
  if (
    !isRecord(race) ||
    !isRecord(tech) ||
    !isRecord(resources) ||
    !isRecord(replicator) ||
    techLevel === undefined ||
    techLevel < 1
  ) {
    return Object.freeze({
      root,
      input: emptyInput(),
      metrics: Object.freeze([]),
      governor: undefined,
    });
  }

  const settingsValue = dependencies.readSettings();
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const assignGovernorTask = settingBoolean(
    settings,
    "replicatorAssignGovernorTask",
    false,
  );
  if (assignGovernorTask === undefined) {
    return Object.freeze({
      root,
      input: emptyInput(),
      metrics: Object.freeze([]),
      governor: undefined,
    });
  }
  const rawMode = settings["replicatorWeightingMode"];
  const scoreMode =
    rawMode === "mass"
      ? "mass"
      : rawMode === "quantity"
        ? "quantity"
        : "weight";
  const demand = dependencies.readDemand?.();
  const productions = [];
  const metrics = [];
  for (const [id, atomicMass] of Object.entries(ATOMIC_MASS)) {
    const resource = readProperty(resources, id);
    if (!isRecord(resource)) continue;
    const display = resource["display"];
    if (typeof display !== "boolean")
      return Object.freeze({
        root,
        input: emptyInput(),
        metrics: Object.freeze([]),
        governor: undefined,
      });
    const unlocked = display && !excluded(id, race);
    if (!unlocked) {
      productions.push(
        Object.freeze({
          id,
          unlocked: false,
          enabled: true,
          weighting: 0,
          priority: 0,
          demanded: false,
          useful: false,
        }),
      );
      continue;
    }
    const enabled = settingBoolean(settings, `replicator_${id}`, true);
    const weighting = settingNumber(settings, `replicator_w_${id}`, 1);
    const priority = settingNumber(settings, `replicator_p_${id}`, 1);
    if (
      enabled === undefined ||
      weighting === undefined ||
      priority === undefined
    ) {
      return Object.freeze({
        root,
        input: emptyInput(),
        metrics: Object.freeze([]),
        governor: undefined,
      });
    }
    if (!enabled || weighting <= 0) {
      productions.push(
        Object.freeze({
          id,
          unlocked: true,
          enabled,
          weighting,
          priority,
          demanded: false,
          useful: false,
        }),
      );
      continue;
    }
    const amount = finite(resource["amount"]);
    const maximum = finite(resource["max"]);
    if (amount === undefined || maximum === undefined) {
      return Object.freeze({
        root,
        input: emptyInput(),
        metrics: Object.freeze([]),
        governor: undefined,
      });
    }
    const demanded = demand?.isDemanded(id) ?? false;
    productions.push(
      Object.freeze({
        id,
        unlocked: true,
        enabled,
        weighting,
        priority,
        demanded,
        useful: maximum <= 0 || amount / maximum < 0.99 || demanded,
      }),
    );
    metrics.push(
      Object.freeze({
        productionId: id,
        currentQuantity: amount,
        atomicMass,
        exotic: id === "Elerium" || id === "Infernite",
      }),
    );
  }

  return Object.freeze({
    root,
    input: Object.freeze({
      initialised: true,
      assignGovernorTask,
      scoreMode,
      selectHighestScore: rawMode !== "legacy",
      productions: Object.freeze(productions),
    }),
    metrics: Object.freeze(metrics),
    governor: readGovernorSession(root, techLevel, dependencies.controls),
  });
}

function sameGovernorSettings(
  actual: Readonly<ReplicatorGovernorSettingsInput>,
  expected: Readonly<ReplicatorGovernorSettingsInput>,
): boolean {
  return (
    actual.powerOn === expected.powerOn &&
    actual.focusQueue === expected.focusQueue &&
    actual.focusNegative === expected.focusNegative &&
    actual.switchOnCap === expected.switchOnCap &&
    actual.powerCap === expected.powerCap
  );
}

function applyGovernor(
  dependencies: CapturedReplicatorDependencies,
  session: ReturnType<typeof readInput>,
): CommandExecutionOutcome {
  if (!session.input.assignGovernorTask || session.governor === undefined) {
    return SUCCEEDED;
  }

  const governor = session.governor;
  const taskPlan = planReplicatorGovernorTask(governor.tasks);
  if (taskPlan.status === "unavailable") return SUCCEEDED;
  if (taskPlan.assignment !== null) {
    if (!governor.control.methods.includes("setTask")) {
      return rejected(
        "governor-task-control-missing",
        "captured governor control cannot assign tasks",
      );
    }
    if (dependencies.rootState.readRoot() !== session.root) {
      return stale("replicator-root-changed", "captured game root changed");
    }
    const liveTasks = readProperty(
      readProperty(readProperty(session.root, "race"), "governor"),
      "tasks",
    );
    if (!isRecord(liveTasks)) {
      return stale(
        "stale-governor-tasks",
        "replicator governor tasks disappeared",
      );
    }
    const actual = Object.values(liveTasks)[taskPlan.assignment.taskIndex];
    if (actual !== taskPlan.assignment.expectedTask) {
      return stale(
        "stale-governor-task",
        "replicator governor task assignments changed",
      );
    }
    const result = dependencies.controls.invoke(governor.control, "setTask", [
      "replicate",
      taskPlan.assignment.taskIndex,
    ]);
    if (!result.ok) {
      return rejected(
        "governor-task-control-failed",
        result.detail ?? result.reason,
      );
    }
  }

  if (dependencies.rootState.readRoot() !== session.root) {
    return stale("replicator-root-changed", "captured game root changed");
  }
  const governorValue = readProperty(
    readProperty(session.root, "race"),
    "governor",
  );
  if (!isRecord(governorValue)) return SUCCEEDED;
  const settings = readGovernorSettings(governorValue);
  if (settings === null) return SUCCEEDED;
  const decision = planReplicatorGovernorSettings(settings);
  if (decision === null) return SUCCEEDED;
  if (session.governor.settings === null) {
    return stale(
      "stale-replicator-governor-settings",
      "replicator governor settings appeared after capture",
    );
  }
  if (!sameGovernorSettings(settings, session.governor.settings)) {
    return stale(
      "stale-replicator-governor-settings",
      "replicator governor settings changed",
    );
  }
  const config = readProperty(governorValue, "config");
  const replicate = readProperty(config, "replicate");
  const power = readProperty(replicate, "pow");
  const resources = readProperty(replicate, "res");
  if (!isRecord(power) || !isRecord(resources)) return SUCCEEDED;
  if (decision.enablePower) power["on"] = true;
  if (decision.disableQueue) resources["que"] = false;
  if (decision.disableNegative) resources["neg"] = false;
  if (decision.disableCapSwitch) resources["cap"] = false;
  if (decision.raisePowerCap) power["cap"] = 1e12;
  return SUCCEEDED;
}

export function createCapturedReplicatorAutomation(
  dependencies: CapturedReplicatorDependencies,
): CapturedReplicatorAutomation {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const session = readInput(dependencies);
      const priorityPlan = planReplicatorPriority(session.input);
      if (priorityPlan !== null) {
        const decision = planReplicatorSelection(priorityPlan, session.metrics);
        if (decision === null) return applyGovernor(dependencies, session);
        const handle = dependencies.controls.resolve(REPLICATOR_CONTROL);
        if (handle === undefined) {
          return stale(
            "replicator-control-missing",
            "captured replicator control is unavailable",
          );
        }
        if (dependencies.rootState.readRoot() !== session.root) {
          return stale("replicator-root-changed", "captured game root changed");
        }
        const result = dependencies.controls.invoke(handle, "setVal", [
          decision.productionId,
        ]);
        if (!result.ok) {
          return rejected(
            "replicator-control-failed",
            result.detail ?? result.reason,
          );
        }
      }
      return applyGovernor(dependencies, session);
    },
  });
}
