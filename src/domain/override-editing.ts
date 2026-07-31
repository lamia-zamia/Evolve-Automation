// Every edit the override editor can make to a setting's stored conditions, applied purely. The
// editor sends an intent; nothing here knows about the DOM, the catalog, or persistence.

import type { StoredOverrideCondition } from "./override-resolution.ts";

/** Which of a condition's two operands an edit targets. */
export type OverrideOperandSlot = 1 | 2;

interface SettingEdit {
  readonly settingKey: string;
}

interface ConditionEdit extends SettingEdit {
  /** 0-based position in the setting's stored condition list. */
  readonly index: number;
}

export type OverrideEdit =
  | (SettingEdit & {
      readonly kind: "add-condition";
      /** The result a new condition starts with: the setting's current stored value. */
      readonly result: unknown;
    })
  | (ConditionEdit & { readonly kind: "remove-condition" })
  | (ConditionEdit & { readonly kind: "duplicate-condition" })
  | (SettingEdit & {
      readonly kind: "reorder-conditions";
      /** The new order as stored positions, one entry per existing condition. */
      readonly order: readonly number[];
    })
  | (ConditionEdit & {
      readonly kind: "set-operand";
      readonly slot: OverrideOperandSlot;
      readonly operandType: string;
      /** The new operand type's default argument. */
      readonly argument: unknown;
    })
  | (ConditionEdit & {
      readonly kind: "set-operand-argument";
      readonly slot: OverrideOperandSlot;
      readonly argument: unknown;
    })
  | (ConditionEdit & {
      readonly kind: "set-comparator";
      readonly comparator: string;
    })
  | (ConditionEdit & { readonly kind: "set-result"; readonly result: unknown });

export interface OverrideEditResult {
  readonly overrides: Record<string, StoredOverrideCondition[]>;
  /** Conditions the edited setting has afterwards. Zero means the setting no longer has an entry. */
  readonly conditionCount: number;
  /** False when the edit named a setting, condition, or order that does not exist. */
  readonly applied: boolean;
}

function newCondition(result: unknown): StoredOverrideCondition {
  return {
    type1: "Boolean",
    arg1: true,
    type2: "Boolean",
    arg2: false,
    cmp: "==",
    ret: result,
  };
}

function isPermutation(order: readonly number[], length: number): boolean {
  return (
    order.length === length &&
    new Set(order).size === length &&
    order.every(
      (index) => Number.isInteger(index) && index >= 0 && index < length,
    )
  );
}

/**
 * Applies one editor intent to the stored overrides. The input is never mutated: the edited
 * setting's list is rebuilt and every changed condition is replaced by a copy.
 */
export function applyOverrideEdit(
  overrides: Readonly<Record<string, readonly StoredOverrideCondition[]>>,
  edit: OverrideEdit,
): OverrideEditResult {
  const current = overrides[edit.settingKey] ?? [];
  const conditions = [...current];

  const unchanged = (): OverrideEditResult => ({
    overrides: copyOverrides(overrides),
    conditionCount: current.length,
    applied: false,
  });

  if (edit.kind === "add-condition") {
    conditions.push(newCondition(edit.result));
    return replaced(overrides, edit.settingKey, conditions);
  }

  if (edit.kind === "reorder-conditions") {
    if (!isPermutation(edit.order, conditions.length)) return unchanged();
    return replaced(
      overrides,
      edit.settingKey,
      edit.order.map((index) => conditions[index] as StoredOverrideCondition),
    );
  }

  const condition = conditions[edit.index];
  if (condition === undefined) return unchanged();

  switch (edit.kind) {
    case "remove-condition":
      conditions.splice(edit.index, 1);
      break;
    case "duplicate-condition":
      conditions.splice(edit.index, 0, { ...condition });
      break;
    case "set-operand":
      conditions[edit.index] = {
        ...condition,
        [`type${edit.slot}`]: edit.operandType,
        [`arg${edit.slot}`]: edit.argument,
      };
      break;
    case "set-operand-argument":
      conditions[edit.index] = {
        ...condition,
        [`arg${edit.slot}`]: edit.argument,
      };
      break;
    case "set-comparator":
      conditions[edit.index] = { ...condition, cmp: edit.comparator };
      break;
    case "set-result":
      conditions[edit.index] = { ...condition, ret: edit.result };
      break;
  }
  return replaced(overrides, edit.settingKey, conditions);
}

function copyOverrides(
  overrides: Readonly<Record<string, readonly StoredOverrideCondition[]>>,
): Record<string, StoredOverrideCondition[]> {
  const copy: Record<string, StoredOverrideCondition[]> = {};
  for (const [settingKey, conditions] of Object.entries(overrides)) {
    copy[settingKey] = [...conditions];
  }
  return copy;
}

/** A setting with no conditions left loses its entry, so an empty list is never stored. */
function replaced(
  overrides: Readonly<Record<string, readonly StoredOverrideCondition[]>>,
  settingKey: string,
  conditions: StoredOverrideCondition[],
): OverrideEditResult {
  const next = copyOverrides(overrides);
  if (conditions.length === 0) {
    delete next[settingKey];
  } else {
    next[settingKey] = conditions;
  }
  return { overrides: next, conditionCount: conditions.length, applied: true };
}
