import type {
  ForcedTaskState,
  OverrideConditionEvaluator,
} from "../../domain/override-resolution.ts";
import type { OverrideEvaluationSource } from "../../ports/override-settings.ts";

/** One entry of the override catalog: the operand reader for a condition type. */
interface CheckType {
  fn: (arg: unknown) => unknown;
}

export interface OverrideEvaluationSourceDependencies {
  getCheckTypes: () => Record<string, CheckType>;
  getCheckCompare: () => Record<string, (a: unknown, b: unknown) => boolean>;
  getCheckCustom: () => Record<string, unknown>;
  getHaveTask: () => (task: string) => boolean;
}

export function createOverrideEvaluationSource({
  getCheckTypes,
  getCheckCompare,
  getCheckCustom,
  getHaveTask,
}: OverrideEvaluationSourceDependencies): OverrideEvaluationSource {
  return {
    sampleEvaluator(): OverrideConditionEvaluator {
      const checkTypes = getCheckTypes();
      const checkCompare = getCheckCompare();
      const checkCustom = getCheckCustom();
      return {
        hasOperandType: (operandType) => Boolean(checkTypes[operandType]),
        readOperand: (operandType, argument) => {
          const checkType = checkTypes[operandType];
          if (!checkType) {
            throw new Error(`${operandType} variable not found`);
          }
          return checkType.fn(argument);
        },
        hasComparator: (comparator) => Boolean(checkCompare[comparator]),
        compare: (comparator, left, right) => {
          const compare = checkCompare[comparator];
          if (!compare) {
            throw new Error(`${comparator} comparator not found`);
          }
          return compare(left, right);
        },
        comparatorReturnsRightOperand: (comparator) =>
          Boolean(checkCustom[comparator]),
      };
    },

    readForcedTasks(): ForcedTaskState {
      const haveTask = getHaveTask();
      return {
        storageTaskActive: haveTask("bal_storage") || haveTask("combo_storage"),
        trashTaskActive: haveTask("trash"),
        taxTaskActive: haveTask("tax"),
      };
    },
  };
}
