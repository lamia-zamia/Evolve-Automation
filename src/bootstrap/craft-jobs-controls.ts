import { createCraftControl } from "./craft-control.ts";
import { createJobsControl } from "./jobs-control.ts";

type CraftDependencies = Parameters<typeof createCraftControl>[0];
type JobsDependencies = Parameters<typeof createJobsControl>[0];

interface CraftJobsControlDependencies {
  readonly craft: CraftDependencies;
  readonly jobs: JobsDependencies;
}

// Composition seam for crafting and jobs automation. Their adapter-owned
// readers and effects remain separate while the returned entries preserve the
// existing tick capabilities.
export function createCraftJobsControls({
  craft,
  jobs,
}: CraftJobsControlDependencies) {
  const craftControl = createCraftControl(craft);
  const jobsControl = createJobsControl(jobs);

  return Object.freeze({
    ...craftControl,
    ...jobsControl,
  });
}
