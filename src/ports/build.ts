import type {
  BuildAnnotation,
  BuildCandidateSample,
  BuildClickDecision,
  BuildClickReport,
  BuildCompetitionRequest,
  BuildCompetitionSample,
  BuildConflictSample,
  BuildCycleSetup,
  BuildSampleRequest,
} from "../domain/build.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";

/**
 * Phased reads for one autoBuild cycle. beginCycle refreshes weightings and
 * captures the sorted candidate list; the per-candidate samplers read live
 * game state at the same moments the legacy loop did, so later candidates
 * observe the effects of earlier clicks.
 */
export interface BuildReader {
  beginCycle(): BuildCycleSetup;
  sampleCandidate(
    index: number,
    request: Readonly<BuildSampleRequest>,
  ): BuildCandidateSample;
  sampleConflict(index: number): BuildConflictSample;
  sampleCompetition(
    index: number,
    request: Readonly<BuildCompetitionRequest>,
  ): BuildCompetitionSample;
}

export interface BuildClickResult extends BuildClickReport {
  readonly outcome: CommandExecutionOutcome;
}

export interface BuildExecutor {
  /** Append a tooltip note to the candidate's extra description. */
  annotate(annotation: Readonly<BuildAnnotation>): CommandExecutionOutcome;
  executeClick(decision: Readonly<BuildClickDecision>): BuildClickResult;
}
