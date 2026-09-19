/**
 * Projects the captured settings record into the Trigger settings rows and catalogs.
 *
 * Trigger rows are player data stored in the settings record itself (`triggers`), so no game,
 * manager, or compatibility object is consulted for them: rows are read in the stored order,
 * malformed entries are dropped rather than breaking the panel, and every mutation below
 * operates on the raw array directly. The runtime (`./captured-triggers.ts`) reads the same
 * array, so what the panel shows and what the tick evaluates are the same rows.
 *
 * The check catalog lists exactly the condition operands the captured evaluator answers
 * (`CAPTURED_OVERRIDE_OPERAND_TYPES`), minus nothing: the legacy override-only checks
 * (`String`, `Number`, `RaceId`) are not captured-answered and so are absent. Values stay
 * free text — the captured path has no live option lists — except `Boolean`, which keeps
 * its checkbox so an edited value cannot decay into the string `"false"`. The boolean list
 * mirrors the legacy `retBools` subset the captured evaluator answers as equality checks;
 * it owns the requirement-count widget (boolean switch versus number input).
 *
 * Descriptions are short captured-path copy: they name the expected value shape, not the
 * legacy option behavior. Richer per-operand dropdowns are a follow-up, not a gap: every
 * id shape below is already what the runtime accepts.
 */

import { CAPTURED_OVERRIDE_OPERAND_TYPES } from "../../captured-override-evaluation.ts";
import {
  normalizeTriggerValue,
  type TriggerSettingsActionInput,
  type TriggerSettingsCheck,
  type TriggerSettingsRow,
  type TriggerValue,
} from "../../../../domain/progression/build/trigger-settings.ts";
import { isRecord } from "../../../validation.ts";

function finitePriority(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readRowValue(value: unknown, path: string): TriggerValue | undefined {
  try {
    return normalizeTriggerValue(value, path);
  } catch {
    return undefined;
  }
}

interface RawRowOrder {
  readonly row: TriggerSettingsRow;
  readonly priority: number;
  readonly index: number;
}

/**
 * Validates one stored trigger row. The editor writes every field, so a row missing one is a
 * broken setting rather than a state this has to tolerate: it is dropped from the view (the
 * raw entry is left in place for the other mutations to keep).
 */
function readStoredRow(raw: unknown, index: number): RawRowOrder | undefined {
  if (!isRecord(raw)) return undefined;
  const requirementType = raw["requirementType"];
  const actionType = raw["actionType"];
  if (typeof requirementType !== "string" || typeof actionType !== "string") {
    return undefined;
  }
  const requirementId = readRowValue(
    raw["requirementId"],
    `triggers[${index}].requirementId`,
  );
  const requirementCount = readRowValue(
    raw["requirementCount"],
    `triggers[${index}].requirementCount`,
  );
  const actionId = readRowValue(raw["actionId"], `triggers[${index}].actionId`);
  const actionCount = readRowValue(
    raw["actionCount"],
    `triggers[${index}].actionCount`,
  );
  if (
    requirementId === undefined ||
    requirementCount === undefined ||
    actionId === undefined ||
    actionCount === undefined
  ) {
    return undefined;
  }
  const seq = typeof raw["seq"] === "number" ? raw["seq"] : index;
  return {
    row: Object.freeze({
      seq,
      requirementType,
      requirementId,
      requirementCount,
      actionType,
      actionId,
      actionCount,
    }),
    priority: finitePriority(raw["priority"], index),
    index,
  };
}

export function readCapturedTriggerRows(
  getSettingsRaw: () => unknown,
): readonly Readonly<TriggerSettingsRow>[] {
  const value = getSettingsRaw();
  const raw = isRecord(value) ? value : {};
  const stored = raw["triggers"];
  if (!Array.isArray(stored)) return Object.freeze([]);
  const ordered: RawRowOrder[] = [];
  stored.forEach((entry, index) => {
    const row = readStoredRow(entry, index);
    if (row !== undefined) ordered.push(row);
  });
  ordered.sort(
    (left, right) => left.priority - right.priority || left.index - right.index,
  );
  return Object.freeze(ordered.map(({ row }) => row));
}

const BOOLEAN_CHECK = "Boolean";

/** Short captured-path copy per answered operand: what the check means and what value it takes. */
const CAPTURED_CHECK_DESCRIPTIONS: Readonly<Record<string, string>> =
  Object.freeze({
    Boolean: "A fixed boolean value.",
    BuildingAffordable:
      "True when the building is affordable: every cost below its storage cap. Value: <region>-<id>.",
    BuildingClickable:
      "True when the building can be purchased right now. Value: <region>-<id>.",
    BuildingCost:
      "Material cost of the building as a number. Value: <region>-<id>.<Resource>.",
    BuildingCount: "Number of buildings. Value: <region>-<id>.",
    BuildingDisabled: "Number of unpowered buildings. Value: <region>-<id>.",
    BuildingEnabled: "Number of powered buildings. Value: <region>-<id>.",
    BuildingQueued:
      "True when the building is in the game build queue. Value: <region>-<id>.",
    BuildingUnlocked:
      "True when the building is unlocked. Value: <region>-<id>.",
    Challenge: "True when the challenge is active. Value: challenge id.",
    Date: "In-game date as a number. Value: date selector.",
    Government: "True when the government is active. Value: government id.",
    Governor: "True when the governor is active. Value: governor id.",
    Industry: "Information about Industry buildings. Value: industry selector.",
    JobCount: "Assigned employees (workers and servants). Value: job id.",
    JobMax: "Maximum assignable workers. Value: job id.",
    JobServants: "Assigned servants. Value: servant job id.",
    JobUnlocked: "True when the job is unlocked. Value: job id.",
    JobWorkers: "Assigned workers. Value: job id.",
    MimicGenus: "True when mimicking the genus. Value: genus id.",
    Other: "Other uncategorized variables. Value: variable name.",
    PlanetBiome: "True when playing in the biome. Value: biome id.",
    PlanetTrait: "True when the planet has the trait. Value: trait id.",
    ProjectCount: "Completed rank of the project. Value: project element id.",
    ProjectProgress:
      "Completion percent of the project. Value: project element id.",
    ProjectUnlocked:
      "True when the project is offered. Value: project element id.",
    Queue: "Number of items in the queue. Value: queue selector.",
    RacePillared:
      "True when the race pillared at the current star level. Value: race id.",
    ResearchComplete:
      "True when the research is complete. Value: technology id.",
    ResearchUnlocked:
      "True when the research is offered. Value: technology id.",
    ResetType: "True when the prestige type is active. Value: prestige id.",
    ResourceDemanded:
      "True when something else is accumulating the resource. Value: resource id.",
    ResourceIncome: "Current income of the resource. Value: resource id.",
    ResourceMaxCost: "Maximum cost of the resource. Value: resource id.",
    ResourceQuantity: "Current amount of the resource. Value: resource id.",
    ResourceRatio:
      "Storage ratio of the resource: 0.5 means half full. Value: resource id.",
    ResourceSatisfied:
      "True when the stored amount covers the maximum costs. Value: resource id.",
    ResourceSatisfyRatio:
      "Stored amount over maximum costs as a ratio. Value: resource id.",
    ResourceStorage: "Maximum amount of the resource. Value: resource id.",
    ResourceUnlocked: "True when the resource is unlocked. Value: resource id.",
    SettingCurrent: "Current value of the setting. Value: setting name.",
    SettingDefault: "Default value of the setting. Value: setting name.",
    Soldiers: "Number of soldiers. Value: soldier selector.",
    TraitLevel: "Trait level as a number. Value: trait id.",
    Universe: "True when playing in the universe. Value: universe id.",
  });

function readCapturedTriggerChecks(): Readonly<
  Record<string, TriggerSettingsCheck>
> {
  const checks: Record<string, TriggerSettingsCheck> = {};
  for (const type of CAPTURED_OVERRIDE_OPERAND_TYPES) {
    const description = CAPTURED_CHECK_DESCRIPTIONS[type];
    if (description === undefined) continue;
    checks[type] = Object.freeze({
      arg: type === BOOLEAN_CHECK ? "boolean" : "string",
      options: null,
      description,
    });
  }
  return Object.freeze(checks);
}

const CAPTURED_TRIGGER_CHECKS: Readonly<Record<string, TriggerSettingsCheck>> =
  readCapturedTriggerChecks();

/**
 * The boolean operands: compared for equality against the stored count, so the panel renders
 * a switch for the count instead of a number input. This is the legacy `retBools`
 * (`src/settings/override-catalog.ts`) subset the captured evaluator answers; keep the two
 * in agreement when either changes.
 */
const CAPTURED_TRIGGER_BOOLEAN_CHECKS: readonly string[] = Object.freeze([
  "Boolean",
  "BuildingUnlocked",
  "BuildingClickable",
  "BuildingAffordable",
  "BuildingQueued",
  "ProjectUnlocked",
  "JobUnlocked",
  "ResearchUnlocked",
  "ResearchComplete",
  "ResourceUnlocked",
  "ResourceSatisfied",
  "ResourceDemanded",
  "RacePillared",
  "MimicGenus",
  "ResetType",
  "Challenge",
  "Universe",
  "Government",
  "Governor",
  "PlanetBiome",
  "PlanetTrait",
]);

/**
 * Action id inputs keyed the way the panel looks them up: `research` for technology actions,
 * `building` for build actions, `project` for A.R.P.A. actions. Free text on the captured
 * path: technology id, `<region>-<id>`, or project element id respectively.
 */
const CAPTURED_TRIGGER_ACTION_INPUTS: Readonly<
  Record<string, TriggerSettingsActionInput>
> = Object.freeze({
  research: Object.freeze({ arg: "string", options: null }),
  building: Object.freeze({ arg: "string", options: null }),
  project: Object.freeze({ arg: "string", options: null }),
});

export function readCapturedTriggerChecksCatalog(): Readonly<
  Record<string, TriggerSettingsCheck>
> {
  return CAPTURED_TRIGGER_CHECKS;
}

export function readCapturedTriggerActionInputs(): Readonly<
  Record<string, TriggerSettingsActionInput>
> {
  return CAPTURED_TRIGGER_ACTION_INPUTS;
}

export function readCapturedTriggerBooleanChecks(): readonly string[] {
  return CAPTURED_TRIGGER_BOOLEAN_CHECKS;
}
