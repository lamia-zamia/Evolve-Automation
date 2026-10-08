import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planJobs, type JobsDecision } from "../domain/civic/jobs.ts";
import type {
  JobsExecutor,
  JobsReader,
  PreparedJobsExecution,
} from "../ports/jobs.ts";

export interface JobsAutomationDependencies {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
  readonly onCoherentPlan?: (decision: Readonly<JobsDecision>) => void;
  readonly diagnostics?: {
    readPerformanceEnabled(): boolean;
    nowMs(): number;
    recordPerformance(phase: string, durationMs: number): void;
    recordCount(name: string, amount: number): void;
  };
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runJobsAutomation(
  dependencies: JobsAutomationDependencies,
  craftOnly = false,
): CommandExecutionOutcome {
  const diagnostics = dependencies.diagnostics;
  const measuring = diagnostics?.readPerformanceEnabled() === true;
  const startedAt = measuring ? diagnostics!.nowMs() : 0;
  if (measuring) diagnostics!.recordCount("jobs.full.planCalls", 1);
  const decision = planJobs(dependencies.reader.readCycle(craftOnly));
  if (measuring)
    diagnostics!.recordPerformance(
      "jobs.full.plan",
      diagnostics!.nowMs() - startedAt,
    );
  if (decision === null) return SUCCEEDED;
  const outcome = dependencies.executor.execute(decision);
  if (outcome.status === "succeeded" && !craftOnly)
    dependencies.onCoherentPlan?.(decision);
  return outcome;
}

/** Executes a decision prepared from the same captured cycle, without reading or planning again. */
export function runPreparedJobsAutomation(
  prepared: Readonly<PreparedJobsExecution>,
  onCoherentPlan?: (decision: Readonly<JobsDecision>) => void,
): CommandExecutionOutcome {
  const outcome = prepared.execute();
  if (outcome.status === "succeeded" && prepared.decision !== null)
    onCoherentPlan?.(prepared.decision);
  return outcome;
}
