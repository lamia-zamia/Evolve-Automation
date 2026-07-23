import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planResearch } from "../domain/progression/research/research.ts";
import type {
  ResearchCommandExecutor,
  ResearchReader,
} from "../ports/research.ts";

export interface ResearchAutomationDependencies {
  readonly reader: ResearchReader;
  readonly executor: ResearchCommandExecutor;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

/**
 * Runs ordered research attempts. A declined safe click is the only event that
 * starts another read phase; successful research and stale/rejected commands
 * stop the use case immediately.
 */
export function runResearchAutomation(
  dependencies: ResearchAutomationDependencies,
): CommandExecutionOutcome {
  let startIndex = 0;
  while (true) {
    const decision = planResearch(dependencies.reader.read(startIndex));
    if (decision === null) {
      return SUCCEEDED;
    }

    const result = dependencies.executor.execute(decision);
    if (result.outcome.status !== "succeeded" || result.researched) {
      return result.outcome;
    }
    startIndex = decision.index + 1;
  }
}
