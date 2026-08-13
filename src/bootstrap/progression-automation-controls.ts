import { createBuildControl } from "./build-control.ts";
import { createResearchControl } from "./research-control.ts";

type BuildDependencies = Parameters<typeof createBuildControl>[0];
type ResearchDependencies = Parameters<typeof createResearchControl>[0];

interface ProgressionAutomationControlDependencies {
  readonly build: BuildDependencies;
  readonly research: ResearchDependencies;
}

// Composition seam for build and research automation. Both controls retain
// their own adapters and diagnostics while the returned entries remain the
// application tick's existing capabilities.
export function createProgressionAutomationControls({
  build,
  research,
}: ProgressionAutomationControlDependencies) {
  const buildControl = createBuildControl(build);
  const researchControl = createResearchControl(research);

  return Object.freeze({
    ...buildControl,
    ...researchControl,
  });
}
