/** Immutable data needed to render the Trigger settings panel. */
export type TriggerValue = string | number | boolean;

export interface TriggerSettingsInput {
  readonly arg: string;
  readonly options: unknown;
}

export interface TriggerSettingsCheck extends TriggerSettingsInput {
  readonly description: string;
}

export type TriggerSettingsActionInput = TriggerSettingsInput;

export interface TriggerSettingsRow {
  readonly seq: number;
  readonly requirementType: string;
  readonly requirementId: TriggerValue;
  readonly requirementCount: TriggerValue;
  readonly actionType: string;
  readonly actionId: TriggerValue;
  readonly actionCount: TriggerValue;
}

export interface TriggerSettingsReadModel {
  readonly sectionId: "trigger";
  readonly sectionName: "Trigger";
  readonly rows: readonly TriggerSettingsRow[];
  readonly checks: Readonly<Record<string, TriggerSettingsCheck>>;
  readonly actionInputs: Readonly<Record<string, TriggerSettingsActionInput>>;
  readonly booleanResultChecks: readonly string[];
}

export type TriggerSettingsIntent =
  | Readonly<{ type: "reset-trigger-settings" }>
  | Readonly<{ type: "add-trigger" }>
  | Readonly<{
      type: "update-trigger";
      seq: number;
      field:
        | "requirementType"
        | "requirementId"
        | "requirementCount"
        | "actionType"
        | "actionId"
        | "actionCount";
      value: TriggerValue;
    }>
  | Readonly<{ type: "remove-trigger"; seq: number }>
  | Readonly<{ type: "duplicate-trigger"; seq: number }>
  | Readonly<{ type: "evalize-trigger"; seq: number }>
  | Readonly<{ type: "reorder-triggers"; seqs: readonly number[] }>;

export function normalizeTriggerValue(
  value: unknown,
  path: string,
): TriggerValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new TypeError(`${path} must be a string, number, or boolean`);
}

export function createTriggerSettingsReadModel(input: {
  readonly rows: readonly TriggerSettingsRow[];
  readonly checks: Readonly<Record<string, TriggerSettingsCheck>>;
  readonly actionInputs: Readonly<Record<string, TriggerSettingsActionInput>>;
  readonly booleanResultChecks: readonly string[];
}): TriggerSettingsReadModel {
  return Object.freeze({
    sectionId: "trigger",
    sectionName: "Trigger",
    rows: Object.freeze(input.rows.map((row) => Object.freeze({ ...row }))),
    checks: Object.freeze({ ...input.checks }),
    actionInputs: Object.freeze({ ...input.actionInputs }),
    booleanResultChecks: Object.freeze([...input.booleanResultChecks]),
  });
}
