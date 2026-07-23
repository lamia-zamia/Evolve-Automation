import {
  createJobsAdapter,
  type JobsAdapterDependencies,
} from "../adapters/evolve/civic/jobs.ts";
import { runJobsAutomation } from "../application/jobs.ts";

// Composition seam for the jobs slice: owns the Evolve jobs adapter construction
// and returns the control entry the runtime places at its tick position. The
// control forwards the runtime's `craftOnly` argument to the automation.
export function createJobsControl(dependencies: JobsAdapterDependencies) {
  const adapter = createJobsAdapter(dependencies);
  return Object.freeze({
    autoJobs: (craftOnly = false) => runJobsAutomation(adapter, craftOnly),
  });
}
