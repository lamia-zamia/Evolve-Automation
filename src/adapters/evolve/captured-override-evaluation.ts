/**
 * Override operands and forced-task state for the captured runtime.
 *
 * The resolver remains the shared pure policy. This adapter supplies a single root/settings sample
 * and uses the existing captured-condition reader; it never asks the compatibility managers for
 * checkTypes, checkCompare, custom evaluators, or task state.
 */

import {
  readCapturedOperand,
  type CapturedConditionContext,
} from "./captured-conditions.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import type {
  ForcedTaskState,
  OverrideConditionEvaluator,
} from "../../domain/override-resolution.ts";
import type {
  OverrideComparatorSource,
  OverrideEvaluationSource,
} from "../../ports/override-settings.ts";
import { isRecord, readProperty } from "../validation.ts";

const CAPTURED_OPERAND_TYPES = new Set([
  "Boolean",
  "BuildingAffordable",
  "BuildingClickable",
  "BuildingCost",
  "BuildingCount",
  "BuildingDisabled",
  "BuildingEnabled",
  "BuildingQueued",
  "BuildingUnlocked",
  "Challenge",
  "Date",
  "Government",
  "Governor",
  "Industry",
  "JobCount",
  "JobMax",
  "JobServants",
  "JobUnlocked",
  "JobWorkers",
  "MimicGenus",
  "Other",
  "PlanetBiome",
  "PlanetTrait",
  "ProjectCount",
  "ProjectProgress",
  "ProjectUnlocked",
  "Queue",
  "RacePillared",
  "ResearchComplete",
  "ResearchUnlocked",
  "ResetType",
  "ResourceDemanded",
  "ResourceIncome",
  "ResourceMaxCost",
  "ResourceQuantity",
  "ResourceRatio",
  "ResourceSatisfied",
  "ResourceSatisfyRatio",
  "ResourceStorage",
  "ResourceUnlocked",
  "SettingCurrent",
  "SettingDefault",
  "Soldiers",
  "TraitLevel",
  "Universe",
]);

function readRootSafely(rootState: GameRootStateSource): unknown {
  try {
    return rootState.readRoot();
  } catch {
    return {};
  }
}

function readSetting(
  settings: Readonly<Record<string, unknown>>,
  argument: unknown,
): unknown {
  return typeof argument === "string" ? settings[argument] : undefined;
}

function readTasks(
  root: unknown,
): Readonly<Record<string, unknown>> | undefined {
  const tasks = readProperty(
    readProperty(readProperty(root, "race"), "governor"),
    "tasks",
  );
  return isRecord(tasks) ? tasks : undefined;
}

function taskIsActive(
  tasks: Readonly<Record<string, unknown>> | undefined,
  ids: readonly string[],
): boolean {
  if (tasks === undefined) return false;
  return Object.values(tasks).some(
    (task) => typeof task === "string" && ids.includes(task),
  );
}

export interface CapturedOverrideEvaluationDependencies {
  readonly rootState: GameRootStateSource;
  readonly readSettings: () => Readonly<Record<string, unknown>>;
  readonly comparatorSource: OverrideComparatorSource;
  readonly readConditionContext?: () => Readonly<CapturedConditionContext>;
}

export function createCapturedOverrideEvaluation({
  rootState,
  readSettings,
  comparatorSource,
  readConditionContext,
}: CapturedOverrideEvaluationDependencies): OverrideEvaluationSource {
  return Object.freeze({
    sampleEvaluator(): OverrideConditionEvaluator {
      const root = readRootSafely(rootState);
      const settings = readSettings();
      const context = readConditionContext?.();
      return {
        hasOperandType: (operandType) =>
          CAPTURED_OPERAND_TYPES.has(operandType) ||
          operandType === "String" ||
          operandType === "Number",
        readOperand: (operandType, argument) => {
          if (
            operandType === "SettingCurrent" ||
            operandType === "SettingDefault"
          ) {
            return readSetting(settings, argument);
          }
          if (operandType === "String") {
            if (typeof argument !== "string")
              throw new Error("String operand is not text");
            return argument;
          }
          if (operandType === "Number") {
            const value = Number(argument);
            if (!Number.isFinite(value))
              throw new Error("Number operand is not finite");
            return value;
          }
          const value = readCapturedOperand(root, operandType, argument, {
            ...context,
            settings,
          });
          if (value === undefined) {
            throw new Error(`captured operand ${operandType} is unavailable`);
          }
          return value;
        },
        hasComparator: (comparator) =>
          Object.prototype.hasOwnProperty.call(
            comparatorSource.comparisons,
            comparator,
          ),
        compare: (comparator, left, right) => {
          const compare = comparatorSource.comparisons[comparator];
          if (compare === undefined)
            throw new Error(`unknown comparator ${comparator}`);
          return compare(left, right);
        },
        comparatorReturnsRightOperand: (comparator) =>
          comparatorSource.rightOperandComparators.includes(comparator),
      };
    },
    readForcedTasks(): ForcedTaskState {
      const tasks = readTasks(readRootSafely(rootState));
      return {
        storageTaskActive: taskIsActive(tasks, [
          "storage",
          "bal_storage",
          "combo_storage",
        ]),
        trashTaskActive: taskIsActive(tasks, ["trash"]),
        taxTaskActive: taskIsActive(tasks, ["tax"]),
      };
    },
  });
}
