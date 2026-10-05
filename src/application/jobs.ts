import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planJobs, type JobsDecision } from "../domain/civic/jobs.ts";
import type { JobsExecutor, JobsReader } from "../ports/jobs.ts";

export interface JobsAutomationDependencies {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
  readonly onCoherentPlan?: (decision: Readonly<JobsDecision>) => void;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runJobsAutomation(
  dependencies: JobsAutomationDependencies,
  craftOnly = false,
): CommandExecutionOutcome {
  const decision = planJobs(dependencies.reader.readCycle(craftOnly));
  if (decision === null) return SUCCEEDED;
  const outcome = dependencies.executor.execute(decision);
  if (outcome.status === "succeeded" && !craftOnly)
    dependencies.onCoherentPlan?.(decision);
  return outcome;
}
