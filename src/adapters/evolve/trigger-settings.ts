import {
  createTriggerSettingsReadModel,
  normalizeTriggerValue,
  type TriggerSettingsActionInput,
  type TriggerSettingsCheck,
  type TriggerSettingsReadModel,
  type TriggerSettingsRow,
} from "../../domain/progression/build/trigger-settings.ts";
import { requireRecord } from "../validation.ts";

interface TriggerSettingsEvolveDependencies {
  readonly getTriggerManager: () => unknown;
  readonly getCheckTypes: () => unknown;
  readonly getActionInputs: () => unknown;
  readonly getBooleanResultChecks: () => unknown;
  readonly getOverrideOnlyChecks: () => unknown;
}

export interface TriggerSettingsEvolveAdapter {
  read(): TriggerSettingsReadModel;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string")
    throw new TypeError(`${path} must be a string`);
  return value;
}

function readCatalog(
  value: unknown,
  path: string,
): Record<string, TriggerSettingsCheck> {
  const record = requireRecord(value, path);
  const result: Record<string, TriggerSettingsCheck> = {};
  for (const [id, raw] of Object.entries(record)) {
    const entry = requireRecord(raw, `${path}.${id}`);
    result[id] = Object.freeze({
      arg: requireString(entry["arg"], `${path}.${id}.arg`),
      options: entry["options"] ?? null,
      description: requireString(entry["desc"], `${path}.${id}.desc`),
    });
  }
  return result;
}

function readActionInputs(
  value: unknown,
  path: string,
): Record<string, TriggerSettingsActionInput> {
  const record = requireRecord(value, path);
  const result: Record<string, TriggerSettingsActionInput> = {};
  for (const [id, raw] of Object.entries(record)) {
    const entry = requireRecord(raw, `${path}.${id}`);
    result[id] = Object.freeze({
      arg: requireString(entry["arg"], `${path}.${id}.arg`),
      options: entry["options"] ?? null,
    });
  }
  return result;
}

function readRows(value: unknown): readonly TriggerSettingsRow[] {
  if (!Array.isArray(value))
    throw new TypeError("TriggerManager.priorityList must be an array");
  return value.map((raw, index) => {
    const trigger = requireRecord(raw, `TriggerManager.priorityList[${index}]`);
    return Object.freeze({
      seq: typeof trigger["seq"] === "number" ? trigger["seq"] : index,
      requirementType: requireString(
        trigger["requirementType"],
        `TriggerManager.priorityList[${index}].requirementType`,
      ),
      requirementId: normalizeTriggerValue(
        trigger["requirementId"],
        `TriggerManager.priorityList[${index}].requirementId`,
      ),
      requirementCount: normalizeTriggerValue(
        trigger["requirementCount"],
        `TriggerManager.priorityList[${index}].requirementCount`,
      ),
      actionType: requireString(
        trigger["actionType"],
        `TriggerManager.priorityList[${index}].actionType`,
      ),
      actionId: normalizeTriggerValue(
        trigger["actionId"],
        `TriggerManager.priorityList[${index}].actionId`,
      ),
      actionCount: normalizeTriggerValue(
        trigger["actionCount"],
        `TriggerManager.priorityList[${index}].actionCount`,
      ),
    });
  });
}

function readStringList(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return Object.freeze(
    value.map((item, index) => requireString(item, `${path}[${index}]`)),
  );
}

/** Validates the volatile TriggerManager catalogs and rows once per render. */
export function createTriggerSettingsEvolveAdapter({
  getTriggerManager,
  getCheckTypes,
  getActionInputs,
  getBooleanResultChecks,
  getOverrideOnlyChecks,
}: TriggerSettingsEvolveDependencies): TriggerSettingsEvolveAdapter {
  return Object.freeze({
    read(): TriggerSettingsReadModel {
      const manager = requireRecord(getTriggerManager(), "TriggerManager");
      const overrideOnly = new Set(
        readStringList(getOverrideOnlyChecks(), "overrideOnlyChecks"),
      );
      const checks = readCatalog(getCheckTypes(), "checkTypes");
      const visibleChecks: Record<string, TriggerSettingsCheck> = {};
      for (const [id, check] of Object.entries(checks)) {
        if (!overrideOnly.has(id)) visibleChecks[id] = check;
      }
      return createTriggerSettingsReadModel({
        rows: readRows(manager["priorityList"]),
        checks: visibleChecks,
        actionInputs: readActionInputs(getActionInputs(), "argType"),
        booleanResultChecks: getBooleanResultChecks() as readonly string[],
      });
    },
  });
}
