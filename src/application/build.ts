import {
  applyBuildClickResult,
  candidateSampleNeeds,
  competitionSampleRequest,
  initialBuildLoopState,
  planBuildCompetition,
  planBuildConflict,
  planBuildGate,
  type BuildCandidateSample,
} from "../domain/progression/build/build.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type { BuildExecutor, BuildReader } from "../ports/build.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import { createPhaseMeasure } from "../utils/performance.ts";

export interface BuildAutomationDependencies {
  readonly reader: BuildReader;
  readonly executor: BuildExecutor;
  readonly diagnostics?: TickDiagnostics | undefined;
  readonly onDiagnostic?: (message: string) => void;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

const EMPTY_SAMPLE: BuildCandidateSample = Object.freeze({});

/**
 * Runs one autoBuild cycle. Each candidate is a separate phase so later
 * decisions can observe the results of earlier clicks (affordability,
 * resource levels, cost conflicts) without putting live reads in the
 * planners, matching the legacy sequential loop.
 */
export function runBuildAutomation(
  dependencies: BuildAutomationDependencies,
): CommandExecutionOutcome {
  const { reader, executor, diagnostics } = dependencies;
  const reportDiagnostic = dependencies.onDiagnostic ?? (() => {});
  const measure = createPhaseMeasure(diagnostics);

  const setup = measure("autoBuild.beginCycle", () => reader.beginCycle());
  reportDiagnostic(`autoBuild.candidates ${setup.candidates.length}`);
  let state = initialBuildLoopState();
  for (let index = 0; index < setup.candidates.length; index++) {
    const candidate = setup.candidates[index];
    if (candidate === undefined) continue;
    const needs = measure("autoBuild.sampleNeeds", () =>
      candidateSampleNeeds(setup, state, index),
    );
    if (needs.kind === "skip") {
      continue;
    }
    const request = needs.request;
    const sample =
      request.needAffordability || request.needConsumption
        ? measure("autoBuild.sampleCandidate", () =>
            reader.sampleCandidate(index, request),
          )
        : EMPTY_SAMPLE;
    const gate = measure("autoBuild.planGate", () =>
      planBuildGate(setup, index, sample, state),
    );
    state = gate.state;
    if (state.affordable[candidate.key] === true) {
      reportDiagnostic(`autoBuild.affordable ${candidate.key}`);
    }
    if (gate.kind === "skip") {
      continue;
    }

    const conflict = measure("autoBuild.planConflict", () =>
      planBuildConflict(
        setup,
        index,
        measure("autoBuild.sampleConflict", () => reader.sampleConflict(index)),
      ),
    );
    if (conflict.kind === "skip") {
      const outcome = measure("autoBuild.annotate", () =>
        executor.annotate(conflict.annotation),
      );
      if (outcome.status !== "succeeded") {
        return outcome;
      }
      continue;
    }

    const competitionRequest = measure("autoBuild.sampleRequest", () =>
      competitionSampleRequest(setup, state, index),
    );
    const competition = measure("autoBuild.planCompetition", () =>
      planBuildCompetition(
        setup,
        index,
        measure("autoBuild.sampleCompetition", () =>
          reader.sampleCompetition(index, competitionRequest),
        ),
        state,
      ),
    );
    state = competition.state;
    if (competition.kind === "delay") {
      const outcome = measure("autoBuild.annotate", () =>
        executor.annotate(competition.annotation),
      );
      if (outcome.status !== "succeeded") {
        return outcome;
      }
      continue;
    }

    reportDiagnostic(`autoBuild.decision ${competition.decision.key}`);
    const result = measure("autoBuild.executeClick", () =>
      executor.executeClick(competition.decision),
    );
    reportDiagnostic(`autoBuild.outcome ${result.outcome.status}`);
    if (result.outcome.status !== "succeeded") {
      return result.outcome;
    }
    if (result.disposition === "candidate-rejected") {
      continue;
    }
    if (result.disposition !== "verified-success") {
      return result.outcome;
    }
    const application = measure("autoBuild.applyClickResult", () =>
      applyBuildClickResult(setup, index, result, state),
    );
    state = application.state;
    if (application.stop) {
      break;
    }
  }
  return SUCCEEDED;
}
