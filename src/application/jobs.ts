import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planJobs } from "../domain/civic/jobs.ts";
import type { JobsExecutor, JobsReader } from "../ports/jobs.ts";

export interface JobsAutomationDependencies {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runJobsAutomation(
  dependencies: JobsAutomationDependencies,
  craftOnly = false,
): CommandExecutionOutcome {
  const decision = planJobs(dependencies.reader.readCycle(craftOnly));
  return decision === null
    ? SUCCEEDED
    : dependencies.executor.execute(decision);
}
