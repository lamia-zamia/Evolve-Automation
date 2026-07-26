import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planResearch } from "../domain/progression/research/research.ts";
import type {
  ResearchCommandExecutor,
  ResearchReader,
} from "../ports/research.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

export interface ResearchAutomationDependencies {
  readonly reader: ResearchReader;
  readonly executor: ResearchCommandExecutor;
  readonly diagnostics?: TickDiagnostics | undefined;
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
  const profiling = dependencies.diagnostics;
  const measure = <T>(phase: string, action: () => T): T => {
    if (profiling === undefined || !profiling.readPerformanceEnabled()) {
      return action();
    }
    const startedAtMs = profiling.nowMs();
    try {
      return action();
    } finally {
      profiling.recordPerformance(phase, profiling.nowMs() - startedAtMs);
    }
  };
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
    if (result.outcome.status !== "succeeded" || result.researched) {
      return result.outcome;
    }
    startIndex = decision.index + 1;
  }
}
