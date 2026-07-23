import type {
  TriggerClickDecision,
  TriggerTargetView,
} from "../../domain/progression/build/trigger.ts";
import type {
  TriggerCommandExecutor,
  TriggerExecutionResult,
  TriggerReader,
} from "../../ports/trigger.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface TriggerReaderDependencies {
  readonly getState: () => unknown;
  readonly shouldSaveInflationMoney: () => boolean;
}

export interface TriggerExecutorDependencies {
  readonly getState: () => unknown;
}

function readTriggerTargets(getState: () => unknown): unknown[] {
  const state = requireRecord(getState(), "state");
  const targets = state["triggerTargets"];
  if (!Array.isArray(targets)) {
    throw new TypeError("state.triggerTargets must be an array");
  }
  return targets;
}

function readTargetId(target: UnknownRecord, path: string): string {
  const id = target["id"];
  if (typeof id !== "string") {
    throw new TypeError(`${path}.id must be a string`);
  }
  return id;
}

function hasPositiveMoneyCost(target: UnknownRecord, path: string): boolean {
  const rawCost = target["cost"];
  if (rawCost === undefined || rawCost === null) {
    return false;
  }
  const cost = requireRecord(rawCost, `${path}.cost`);
  const rawMoney = cost["Money"];
  if (rawMoney === undefined || rawMoney === null) {
    return false;
  }
  return requireNumber(rawMoney, `${path}.cost.Money`) > 0;
}

export function createTriggerReader(
  dependencies: TriggerReaderDependencies,
): TriggerReader {
  return Object.freeze({
    read(index: number) {
      if (!Number.isSafeInteger(index) || index < 0) {
        throw new TypeError("trigger index must be a non-negative integer");
      }
      const targets = readTriggerTargets(dependencies.getState);
      if (index >= targets.length) {
        return Object.freeze({ target: null });
      }

      const path = `state.triggerTargets[${index}]`;
      const target = requireRecord(targets[index], path);
      // Preserve the legacy && gate: cost is not read when Inflation saving is
      // inactive, while the saving decision is recomputed for every target.
      const shouldSaveMoney = dependencies.shouldSaveInflationMoney();
      const view: TriggerTargetView = Object.freeze({
        index,
        id: readTargetId(target, path),
        shouldSaveMoney,
        hasPositiveMoneyCost: shouldSaveMoney
          ? hasPositiveMoneyCost(target, path)
          : false,
      });
      return Object.freeze({ target: view });
    },
  });
}

function executionResult(
  outcome: TriggerExecutionResult["outcome"],
  clicked: boolean,
): TriggerExecutionResult {
  return Object.freeze({ outcome, clicked });
}

export function createTriggerCommandExecutor(
  dependencies: TriggerExecutorDependencies,
): TriggerCommandExecutor {
  return Object.freeze({
    execute(decision: Readonly<TriggerClickDecision>) {
      if (!Number.isSafeInteger(decision.index) || decision.index < 0) {
        return executionResult(
          rejected(
            "invalid-trigger-index",
            "trigger index must be a non-negative integer",
          ),
          false,
        );
      }

      const targets = readTriggerTargets(dependencies.getState);
      const value = targets[decision.index];
      const target =
        typeof value === "object" && value !== null
          ? (value as UnknownRecord)
          : null;
      const actualId =
        target !== null && typeof target["id"] === "string"
          ? target["id"]
          : null;
      if (target === null || actualId !== decision.targetId) {
        return executionResult(
          stale("stale-trigger-target", "trigger target list changed", {
            targetId: decision.targetId,
            index: decision.index,
            actualTargetId: actualId,
          }),
          false,
        );
      }

      const click = requireFunction(
        target["click"],
        `state.triggerTargets[${decision.index}].click`,
      );
      return executionResult(
        SUCCEEDED,
        Boolean(Reflect.apply(click, target, [])),
      );
    },
  });
}
