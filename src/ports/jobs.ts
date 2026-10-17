import type { JobsCycleInput, JobsDecision } from "../domain/civic/jobs.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";

export interface JobsReader {
  readCycle(craftOnly: boolean): JobsCycleInput;
}

export type JobsExecutionOutcome =
  | CommandExecutionOutcome
  | { readonly status: "deferred"; readonly reason: string };

export interface JobsExecutor {
  execute(decision: Readonly<JobsDecision>): JobsExecutionOutcome;
}

/** One-shot command capability bound by an adapter to the cycle that produced its decision. */
export interface PreparedJobsExecution {
  readonly decision: Readonly<JobsDecision> | null;
  execute(): JobsExecutionOutcome;
}
