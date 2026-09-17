import { overrideComparatorExpressions } from "../settings/override-comparators.ts";
import { CAPTURED_OVERRIDE_OPERAND_TYPES } from "../adapters/evolve/captured-override-evaluation.ts";
import type { OverrideOperandType } from "../ui/override-condition-controls.ts";

const BOOLEAN_OPERAND = {
  fn: (argument: unknown) => argument,
  arg: "boolean",
  def: false,
  desc: "Returns a boolean",
} satisfies OverrideOperandType;

const NUMBER_OPERAND = {
  fn: (argument: unknown) => argument,
  arg: "number",
  def: 0,
  desc: "Returns a number",
} satisfies OverrideOperandType;

const STRING_OPERAND = {
  fn: (argument: unknown) => argument,
  arg: "string",
  def: "",
  desc: "Reads a captured operand by its game or setting id",
} satisfies OverrideOperandType;

/** The condition language exposed by the captured evaluator, without legacy-only live catalogs. */
export function createCapturedOverrideEditorCatalog() {
  const checkTypes: Record<string, OverrideOperandType> = {
    String: STRING_OPERAND,
    Number: NUMBER_OPERAND,
    Boolean: BOOLEAN_OPERAND,
  };
  for (const operandType of CAPTURED_OVERRIDE_OPERAND_TYPES) {
    if (checkTypes[operandType] !== undefined) continue;
    checkTypes[operandType] = STRING_OPERAND;
  }

  return Object.freeze({
    checkTypes: Object.freeze(checkTypes),
    checkCompareExpressions: overrideComparatorExpressions,
    checkCustom: Object.freeze({
      "A?B": "Special check, uses Var2 as result if Var1 is truthy",
      "!A?B": "Special check, uses Var2 as result if Var1 is falsy",
    }),
  });
}
