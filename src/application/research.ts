import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planResearch } from "../domain/progression/research/research.ts";
import type {
  ResearchCommandExecutor,
  ResearchReader,
} from "../ports/research.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import { createPhaseMeasure } from "../utils/performance.ts";

export interface ResearchAutomationDependencies {
  readonly reader: ResearchReader;
  readonly executor: ResearchCommandExecutor;
  readonly diagnostics?: TickDiagnostics | undefined;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

/**
 * Runs ordered research attempts. Only an exact candidate-specific safe-click
 * rejection starts another read phase; every other result stops this cycle.
 */
export function runResearchAutomation(
  dependencies: ResearchAutomationDependencies,
): CommandExecutionOutcome {
  const measure = createPhaseMeasure(dependencies.diagnostics);
  let startIndex = 0;
  while (true) {
    const observation = measure("autoResearch.read", () =>
      dependencies.reader.read(startIndex),
    );
    const decision = measure("autoResearch.plan", () =>
      planResearch(observation),
    );
    if (decision === null) {
      return SUCCEEDED;
    }

    const result = measure("autoResearch.execute", () =>
      dependencies.executor.execute(decision),
    );
    if (
      result.outcome.status !== "succeeded" ||
      result.disposition !== "candidate-rejected"
    ) {
      return result.outcome;
    }
    startIndex = decision.index + 1;
  }
}
