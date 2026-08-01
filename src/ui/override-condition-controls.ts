// The controls of one override condition row. Each names the setting and stored position it edits
// and emits a typed intent; none of them writes a setting or persists.

import type { OverrideOperandSlot } from "../domain/override-editing.ts";
import {
  parseOverrideCondition,
  type OverrideCondition,
} from "../domain/override-resolution.ts";
import type { OverrideEditor } from "../ports/override-editing.ts";
import type { EditableInput, JQuery, JQueryNode } from "./jquery.ts";
import type { SettingsInputOptions } from "./settings-inputs.ts";

/** One operand type as the catalog publishes it to the editor. */
export interface OverrideOperandType {
  readonly fn: (argument: unknown) => unknown;
  readonly desc: string;
  readonly arg: string;
  readonly options?: SettingsInputOptions;
  readonly def?: unknown;
}

export type OverrideComparator = (left: unknown, right: unknown) => unknown;

/** The stored settings the editor reads. Migration guarantees the `overrides` bag exists. */
export interface StoredSettings extends Record<string, unknown> {
  readonly overrides: Record<string, readonly unknown[] | undefined>;
}

interface OverrideConditionControlsDependencies {
  /** Every stored change the row makes. This module never writes settings itself. */
  readonly overrideEditor: OverrideEditor;
  readonly getJQuery: () => JQuery;
  readonly getSettingsRaw: () => StoredSettings;
  readonly getWin: () => { prompt(message: string, value: string): unknown };
  readonly getCheckCompare: () => Record<string, OverrideComparator>;
  readonly getCheckCustom: () => Record<string, string | undefined>;
  readonly getCheckTypes: () => Record<string, OverrideOperandType | undefined>;
  readonly buildInputNode: (
    type: string,
    options: SettingsInputOptions,
    value: unknown,
    callback: (value: unknown) => void,
  ) => JQueryNode | string;
}

export interface OverrideConditionControls {
  evaluateCheck(operandType: string, argument: unknown): unknown;
  buildConditionType(
    settingName: string,
    index: number,
    condition: OverrideCondition,
    slot: OverrideOperandSlot,
    rebuild: () => void,
  ): JQueryNode;
  buildConditionArg(
    settingName: string,
    index: number,
    condition: OverrideCondition,
    slot: OverrideOperandSlot,
  ): JQueryNode | string;
  buildConditionComparator(
    settingName: string,
    index: number,
    condition: OverrideCondition,
    rebuild: () => void,
  ): JQueryNode;
  buildConditionRemove(
    settingName: string,
    index: number,
    rebuild: () => void,
  ): JQueryNode;
  buildConditionDuplicate(
    settingName: string,
    index: number,
    rebuild: () => void,
  ): JQueryNode;
  buildConditionEvalize(settingName: string, index: number): JQueryNode;
  buildConditionRet(
    settingName: string,
    index: number,
    condition: OverrideCondition,
    type: string,
    options: SettingsInputOptions,
  ): JQueryNode | string;
}

function readOperandType(
  condition: OverrideCondition,
  slot: OverrideOperandSlot,
): string {
  return slot === 1 ? condition.type1 : condition.type2;
}

function readOperandArgument(
  condition: OverrideCondition,
  slot: OverrideOperandSlot,
): unknown {
  return slot === 1 ? condition.arg1 : condition.arg2;
}

export function createOverrideConditionControls({
  overrideEditor,
  getJQuery,
  getSettingsRaw,
  getWin,
  getCheckCompare,
  getCheckCustom,
  getCheckTypes,
  buildInputNode,
}: OverrideConditionControlsDependencies): OverrideConditionControls {
  const $ = getJQuery();

  function evaluateCheck(operandTypeId: string, argument: unknown): unknown {
    return getCheckTypes()[operandTypeId]?.fn(argument);
  }

  function buildConditionType(
    settingName: string,
    index: number,
    condition: OverrideCondition,
    slot: OverrideOperandSlot,
    rebuild: () => void,
  ): JQueryNode {
    const types = Object.entries(getCheckTypes())
      .map(
        ([id, type]) =>
          `<option value="${id}" title="${type?.desc}">${id
            .replace(/([A-Z])/g, " $1")
            .trim()}</option>`,
      )
      .join();
    return $(`<select style="width: 100%">${types}</select>`)
      .val(readOperandType(condition, slot))
      .on("change", function (this: EditableInput) {
        overrideEditor.applyEdit({
          kind: "set-operand",
          settingKey: settingName,
          index,
          slot,
          operandType: this.value,
          argument: getCheckTypes()[this.value]?.def,
        });
        rebuild();
      });
  }

  function buildConditionArg(
    settingName: string,
    index: number,
    condition: OverrideCondition,
    slot: OverrideOperandSlot,
  ): JQueryNode | string {
    const check = getCheckTypes()[readOperandType(condition, slot)];
    return check
      ? buildInputNode(
          check.arg,
          check.options,
          readOperandArgument(condition, slot),
          (result) => {
            overrideEditor.applyEdit({
              kind: "set-operand-argument",
              settingKey: settingName,
              index,
              slot,
              argument: result,
            });
          },
        )
      : "";
  }

  function buildConditionComparator(
    settingName: string,
    index: number,
    condition: OverrideCondition,
    rebuild: () => void,
  ): JQueryNode {
    const types = Object.entries(getCheckCompare())
      .map(
        ([id, fn]) =>
          `<option value="${id}" title="${
            getCheckCustom()[id] ?? fn.toString().substr(10)
          }">${id}</option>`,
      )
      .join();
    return $(`<select style="width: 100%">${types}</select>`)
      .val(condition.comparator)
      .on("change", function (this: EditableInput) {
        overrideEditor.applyEdit({
          kind: "set-comparator",
          settingKey: settingName,
          index,
          comparator: this.value,
        });
        rebuild();
      });
  }

  function buildConditionRemove(
    settingName: string,
    index: number,
    rebuild: () => void,
  ): JQueryNode {
    return $(
      `<a class="button is-small" style="width: 26px; height: 26px"><span>-</span></a>`,
    ).on("click", () => {
      const outcome = overrideEditor.applyEdit({
        kind: "remove-condition",
        settingKey: settingName,
        index,
      });
      if (outcome.conditionCount === 0) {
        $(".script_bg_" + settingName).removeClass("inactive-row");
      }
      rebuild();
    });
  }

  function buildConditionDuplicate(
    settingName: string,
    index: number,
    rebuild: () => void,
  ): JQueryNode {
    return $(
      `<a class="button is-small" style="width: 26px; height: 26px"><span style="font-size: 1.2rem;">&#9282;</span></a>`,
    ).on("click", () => {
      overrideEditor.applyEdit({
        kind: "duplicate-condition",
        settingKey: settingName,
        index,
      });
      rebuild();
    });
  }

  /**
   * Renders the condition as the custom expression that would evaluate it. The stored condition is
   * re-read on click because an argument edit does not re-render the row.
   */
  function buildConditionEvalize(
    settingName: string,
    index: number,
  ): JQueryNode {
    return $(
      `<a class="button is-small" style="width: 26px; height: 26px"><span style="font-size: 0.9rem;">E</span></a>`,
    ).on("click", () => {
      const condition = parseOverrideCondition(
        getSettingsRaw().overrides[settingName]?.[index],
      );
      const comparator =
        condition && getCheckCompare()[condition.comparator]?.toString();
      if (condition === undefined || comparator === undefined) {
        return;
      }
      const check = comparator
        .substr(10)
        .replace(/([ab])/g, (_match: string, operand: string) => {
          const slot: OverrideOperandSlot = operand === "a" ? 1 : 2;
          const argument = readOperandArgument(condition, slot);
          switch (readOperandType(condition, slot)) {
            case "Number":
            case "Boolean":
              return String(argument);
            case "Eval":
              return `(${argument})`;
            case "String":
              return JSON.stringify(argument);
            default:
              return `_("${readOperandType(condition, slot)}",${JSON.stringify(
                argument,
              )})`;
          }
        });
      getWin().prompt("Eval of this condition:", check);
    });
  }

  function buildConditionRet(
    settingName: string,
    index: number,
    condition: OverrideCondition,
    type: string,
    options: SettingsInputOptions,
  ): JQueryNode | string {
    return buildInputNode(type, options, condition.result, (result) => {
      overrideEditor.applyEdit({
        kind: "set-result",
        settingKey: settingName,
        index,
        result,
      });
    });
  }

  return {
    evaluateCheck,
    buildConditionType,
    buildConditionArg,
    buildConditionComparator,
    buildConditionRemove,
    buildConditionDuplicate,
    buildConditionEvalize,
    buildConditionRet,
  };
}
