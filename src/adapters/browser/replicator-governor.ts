import type {
  ReplicatorGovernorDecision,
  ReplicatorGovernorSettingsInput,
} from "../../domain/economy/production/replicator.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import type { ReplicatorGovernorOfficeReader } from "../../ports/replicator.ts";
import type { VueMethodResolver } from "./vue.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

interface GovernorSettingsRecord {
  readonly input: ReplicatorGovernorSettingsInput;
  readonly power: UnknownRecord;
  readonly resources: UnknownRecord;
}

function readGovernorSettings(
  office: UnknownRecord,
): GovernorSettingsRecord | null {
  const rawConfig = office["c"];
  if (rawConfig === undefined || rawConfig === null) {
    return null;
  }
  const config = requireRecord(rawConfig, "governorOffice.c");
  const rawReplicate = config["replicate"];
  if (rawReplicate === undefined || rawReplicate === null) {
    return null;
  }
  const replicate = requireRecord(rawReplicate, "governorOffice.c.replicate");
  const power = requireRecord(
    replicate["pow"],
    "governorOffice.c.replicate.pow",
  );
  const resources = requireRecord(
    replicate["res"],
    "governorOffice.c.replicate.res",
  );
  return Object.freeze({
    input: Object.freeze({
      powerOn: requireBoolean(power["on"], "governorOffice.c.replicate.pow.on"),
      focusQueue: requireBoolean(
        resources["que"],
        "governorOffice.c.replicate.res.que",
      ),
      focusNegative: requireBoolean(
        resources["neg"],
        "governorOffice.c.replicate.res.neg",
      ),
      switchOnCap: requireBoolean(
        resources["cap"],
        "governorOffice.c.replicate.res.cap",
      ),
      powerCap: requireNumber(
        power["cap"],
        "governorOffice.c.replicate.pow.cap",
      ),
    }),
    power,
    resources,
  });
}

function settingsMatch(
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

/**
 * Browser-owned bridge for the current Vue 2 governor office. The reader and
 * executor share only one explicitly opened office session per automation run.
 */
export function createReplicatorGovernorOffice(
  getOffice: () => unknown,
  resolveVueMethod: VueMethodResolver,
): {
  readonly reader: ReplicatorGovernorOfficeReader;
  readonly executor: DecisionExecutor<ReplicatorGovernorDecision>;
} {
  let office: UnknownRecord | null = null;

  return Object.freeze({
    reader: Object.freeze({
      open(): boolean {
        const value = getOffice();
        if (!value) {
          office = null;
          return false;
        }
        office = requireRecord(value, "governorOffice");
        return true;
      },

      readSettings(): ReplicatorGovernorSettingsInput | null {
        if (office === null) {
          throw new Error(
            "replicator governor office must be opened before reading settings",
          );
        }
        return readGovernorSettings(office)?.input ?? null;
      },
    }),

    executor: Object.freeze({
      execute(decision: Readonly<ReplicatorGovernorDecision>) {
        if (office === null) {
          return rejected(
            "governor-office-not-open",
            "replicator governor office session is not open",
          );
        }
        if (decision.kind === "assign-governor-task") {
          if (
            !Number.isSafeInteger(decision.taskIndex) ||
            decision.taskIndex < 0
          ) {
            return rejected(
              "invalid-governor-task-index",
              "governor task index must be a non-negative safe integer",
            );
          }
          const tasks = requireRecord(office["t"], "governorOffice.t");
          const actual = Object.values(tasks)[decision.taskIndex];
          if (actual !== decision.expectedTask) {
            return stale(
              "stale-governor-task",
              "governor task assignments changed",
              {
                taskIndex: decision.taskIndex,
                expected: decision.expectedTask,
                actual: typeof actual === "string" ? actual : null,
              },
            );
          }
          const setTask = requireFunction(
            office["setTask"],
            "governorOffice.setTask",
          );
          Reflect.apply(setTask, office, ["replicate", decision.taskIndex]);
          return SUCCEEDED;
        }

        const current = readGovernorSettings(office);
        if (current === null) {
          return stale(
            "stale-replicator-governor-settings",
            "replicator governor settings disappeared",
          );
        }
        if (!settingsMatch(current.input, decision.expected)) {
          return stale(
            "stale-replicator-governor-settings",
            "replicator governor settings changed",
          );
        }
        const forceUpdate = resolveVueMethod(office, "$forceUpdate");
        if (decision.enablePower) {
          current.power["on"] = true;
        }
        if (decision.disableQueue) {
          current.resources["que"] = false;
        }
        if (decision.disableNegative) {
          current.resources["neg"] = false;
        }
        if (decision.disableCapSwitch) {
          current.resources["cap"] = false;
        }
        if (decision.raisePowerCap) {
          current.power["cap"] = 1e12;
        }
        forceUpdate();
        return SUCCEEDED;
      },
    }),
  });
}
