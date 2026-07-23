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

export interface BuildAutomationDependencies {
  readonly reader: BuildReader;
  readonly executor: BuildExecutor;
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
  const { reader, executor } = dependencies;
  const setup = reader.beginCycle();
  let state = initialBuildLoopState();
  for (let index = 0; index < setup.candidates.length; index++) {
    const needs = candidateSampleNeeds(setup, state, index);
    if (needs.kind === "skip") {
      continue;
    }
    const request = needs.request;
    const sample =
      request.needAffordability || request.needConsumption
        ? reader.sampleCandidate(index, request)
        : EMPTY_SAMPLE;
    const gate = planBuildGate(setup, index, sample, state);
    state = gate.state;
    if (gate.kind === "skip") {
      continue;
    }

    const conflict = planBuildConflict(
      setup,
      index,
      reader.sampleConflict(index),
    );
    if (conflict.kind === "skip") {
      const outcome = executor.annotate(conflict.annotation);
      if (outcome.status !== "succeeded") {
        return outcome;
      }
      continue;
    }

    const competition = planBuildCompetition(
      setup,
      index,
      reader.sampleCompetition(
        index,
        competitionSampleRequest(setup, state, index),
      ),
      state,
    );
    state = competition.state;
    if (competition.kind === "delay") {
      const outcome = executor.annotate(competition.annotation);
      if (outcome.status !== "succeeded") {
        return outcome;
      }
      continue;
    }

    const result = executor.executeClick(competition.decision);
    if (result.outcome.status !== "succeeded") {
      return result.outcome;
    }
    const application = applyBuildClickResult(setup, index, result, state);
    state = application.state;
    if (application.stop) {
      break;
    }
  }
  return SUCCEEDED;
}
