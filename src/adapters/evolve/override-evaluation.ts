import type {
  ForcedTaskState,
  OverrideConditionEvaluator,
} from "../../domain/override-resolution.ts";
import type { OverrideEvaluationSource } from "../../ports/override-settings.ts";

/** One entry of the override catalog: the operand reader for a condition type. */
interface CheckType {
  fn: (arg: unknown) => unknown;
}

/** One operand read of a sample, kept so a repeat of the same read answers the same way. */
type OperandRead =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: unknown };

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
      /**
       * The pass's sample of the game, filled in as it is asked for: one pass reads the same
       * operand many times — the same resource across several overridden settings, the same custom
       * expression in several conditions — and each read otherwise traverses a live game bag again.
       * Keyed by argument identity, so a numeric `0` and the string `"0"` stay distinct reads.
       */
      const sampled = new Map<string, Map<unknown, OperandRead>>();
      return {
        hasOperandType: (operandType) => Boolean(checkTypes[operandType]),
        readOperand: (operandType, argument) => {
          const checkType = checkTypes[operandType];
          if (!checkType) {
            throw new Error(`${operandType} variable not found`);
          }
          let reads = sampled.get(operandType);
          if (!reads) {
            reads = new Map<unknown, OperandRead>();
            sampled.set(operandType, reads);
          }
          let read = reads.get(argument);
          if (!read) {
            try {
              read = { ok: true, value: checkType.fn(argument) };
            } catch (error) {
              // A broken condition repeated across settings reports the same failure each time
              // without re-running the read that produced it.
              read = { ok: false, error };
            }
            reads.set(argument, read);
          }
          if (!read.ok) {
            throw read.error;
          }
          return read.value;
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
