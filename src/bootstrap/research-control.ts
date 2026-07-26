import {
  createResearchCommandExecutor,
  createResearchReader,
  type ResearchExecutorDependencies,
  type ResearchReaderDependencies,
} from "../adapters/evolve/progression/research/research.ts";
import { runResearchAutomation } from "../application/research.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

// Composition seam for the research slice: owns the Evolve reader/executor
// construction and returns the control entry the runtime places at its tick
// position.
export function createResearchControl(dependencies: {
  reader: ResearchReaderDependencies;
  executor: ResearchExecutorDependencies;
  diagnostics?: TickDiagnostics | undefined;
}) {
  const reader = createResearchReader(dependencies.reader);
  const executor = createResearchCommandExecutor(dependencies.executor);
  return Object.freeze({
    autoResearch: () =>
      runResearchAutomation({
        reader,
        executor,
        diagnostics: dependencies.diagnostics,
      }),
  });
}
