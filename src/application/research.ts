import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planResearch,
  type ResearchOwnerSelectionObservation,
  type ResearchOwnerSelectionResult,
} from "../domain/progression/research/research.ts";
import type {
  ResearchCommandExecutor,
  ResearchReader,
} from "../ports/research.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import { createPhaseMeasure } from "../utils/performance.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;

export interface ResearchAutomationDependencies {
  readonly reader: ResearchReader;
  readonly executor: ResearchCommandExecutor;
  readonly diagnostics?: TickDiagnostics | undefined;
  readonly onSelection?:
    | ((selection: Readonly<ResearchOwnerSelectionObservation>) => void)
    | undefined;
  readonly onSelectionResult?:
    ((result: Readonly<ResearchOwnerSelectionResult>) => void) | undefined;
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
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true &&
      observation.interventionResult !== undefined
    ) {
      const { actionId, disposition, reason } = observation.interventionResult;
      dependencies.onSelectionResult?.(
        Object.freeze({
          decision: Object.freeze({
            index: observation.interventionResult.index,
            techId: actionId,
          }),
          disposition,
        }),
      );
      return disposition === "experiment-deferred"
        ? SUCCEEDED
        : Object.freeze({
            status: "rejected",
            failure: Object.freeze({
              code: "research-experiment-target-unavailable",
              message: reason,
            }),
          });
    }
    const decision = measure("autoResearch.plan", () =>
      planResearch(observation),
    );
    if (decision === null) {
      return SUCCEEDED;
    }

    dependencies.onSelection?.(
      Object.freeze({ decision, observed: observation.techs }),
    );

    const result = measure("autoResearch.execute", () =>
      dependencies.executor.execute(decision),
    );
    dependencies.onSelectionResult?.(
      Object.freeze({
        decision,
        disposition: result.disposition,
      }),
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
