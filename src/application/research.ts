import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planResearch,
  type ResearchOwnerSelectionObservation,
  type ResearchOwnerSelectionResult,
  type ResearchInput,
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
  readonly onRead?: ((input: Readonly<ResearchInput>) => void) | undefined;
  readonly onSelection?:
    | ((selection: Readonly<ResearchOwnerSelectionObservation>) => void)
    | undefined;
  readonly onSelectionResult?:
    ((result: Readonly<ResearchOwnerSelectionResult>) => void) | undefined;
  readonly onUncertainMutation?:
    | ((decision: Readonly<{ index: number; techId: string }>) => void)
    | undefined;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

/**
 * Runs ordered research attempts. Only a verified pre-invocation candidate
 * rejection starts another read phase; every other result stops this cycle.
 */
export function runResearchAutomation(
  dependencies: ResearchAutomationDependencies,
): CommandExecutionOutcome {
  const measure = createPhaseMeasure(dependencies.diagnostics);
  let startIndex = 0;
  let madPriorityAttempted = false;
  while (true) {
    const observation = measure("autoResearch.read", () =>
      dependencies.reader.read(startIndex),
    );
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true
    )
      dependencies.onRead?.(observation);
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
    if (observation.available === false) return SUCCEEDED;
    let decision = measure("autoResearch.plan", () =>
      planResearch(observation),
    );
    if (decision === null) return SUCCEEDED;

    let madPriorityDecision = false;
    let madGoalCandidate: ResearchInput["madGoalCandidate"] = undefined;
    if (
      startIndex === 0 &&
      !madPriorityAttempted &&
      decision.techId !== "tech-mad" &&
      dependencies.reader.readMadGoalCandidate !== undefined
    ) {
      madPriorityAttempted = true;
      madGoalCandidate = dependencies.reader.readMadGoalCandidate();
      const candidate = madGoalCandidate;
      if (candidate !== undefined) {
        const prioritized = measure("autoResearch.plan", () =>
          planResearch({ ...observation, madGoalCandidate: candidate }),
        );
        if (prioritized?.techId === "tech-mad") {
          decision = prioritized;
          madPriorityDecision = true;
        }
      }
    }

    dependencies.onSelection?.(
      Object.freeze({
        decision,
        observed:
          madGoalCandidate === undefined ||
          observation.techs.some(
            (candidate) => candidate.index === madGoalCandidate?.index,
          )
            ? observation.techs
            : Object.freeze(
                [...observation.techs, madGoalCandidate].sort(
                  (left, right) => left.index - right.index,
                ),
              ),
      }),
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
      result.disposition === "no-observed-research" ||
      (result.outcome.status === "rejected" &&
        result.outcome.failure.code === "research-click-failed")
    )
      dependencies.onUncertainMutation?.(decision);
    if (
      result.outcome.status !== "succeeded" ||
      result.disposition !== "candidate-rejected"
    ) {
      return result.outcome;
    }
    if (madPriorityDecision) {
      // A native safe-click rejection is pre-invocation, so resume the existing order once.
      startIndex = 0;
      madPriorityAttempted = true;
    } else startIndex = decision.index + 1;
  }
}
