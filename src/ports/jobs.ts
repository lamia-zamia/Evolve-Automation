import type { JobsCycleInput, JobsDecision } from "../domain/civic/jobs.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

export interface JobsReader {
  readCycle(craftOnly: boolean): JobsCycleInput;
}

export type JobsExecutor = DecisionExecutor<JobsDecision>;
