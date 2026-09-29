import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planShapeshift } from "../domain/traits/shapeshift.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { ShapeshiftReader } from "../ports/shapeshift.ts";

export interface ShapeshiftAutomationResult {
  readonly outcome: CommandExecutionOutcome;
  /** True only after the adapter confirms the game's `race.ss_genus` postcondition. */
  readonly changed: boolean;
}

export function runShapeshiftAutomation(dependencies: {
  readonly reader: ShapeshiftReader;
  readonly executor: DecisionExecutor<string | null>;
}): ShapeshiftAutomationResult {
  const input = dependencies.reader.read();
  const target = planShapeshift(input);
  const outcome = dependencies.executor.execute(target);
  return Object.freeze({
    outcome,
    changed:
      outcome.status === "succeeded" &&
      target !== null &&
      input.currentGenus !== target,
  });
}
