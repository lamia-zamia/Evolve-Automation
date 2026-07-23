import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planWishes,
  type WishSelectionDecision,
} from "../domain/traits/wish.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { WishReader } from "../ports/wish.ts";

export interface WishAutomationDependencies {
  readonly reader: WishReader;
  readonly executor: DecisionExecutor<WishSelectionDecision>;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runWishAutomation(
  dependencies: WishAutomationDependencies,
): CommandExecutionOutcome {
  for (const decision of planWishes(dependencies.reader.read())) {
    const outcome = dependencies.executor.execute(decision);
    if (outcome.status !== "succeeded") return outcome;
  }
  return SUCCEEDED;
}
