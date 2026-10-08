import type { JobsCycleInput, JobsDecision } from "../domain/civic/jobs.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

export interface JobsReader {
  readCycle(craftOnly: boolean): JobsCycleInput;
}

export type JobsExecutor = DecisionExecutor<JobsDecision>;

/** One-shot command capability bound by an adapter to the cycle that produced its decision. */
export interface PreparedJobsExecution {
  readonly decision: Readonly<JobsDecision> | null;
  execute(): CommandExecutionOutcome;
}
