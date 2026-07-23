import { createGovernmentControls } from "../adapters/browser/government-controls.ts";
import {
  createGovernmentCommandExecutor,
  readGovernmentInput,
  type GovernmentReaderDependencies,
} from "../adapters/evolve/civic/government.ts";
import { runGovernmentAutomation } from "../application/government.ts";

// Composition seam for the government slice: owns the Evolve government reader
// and command executor (including the browser government controls) and returns
// the control entry the runtime places at its tick position.
export function createGovernmentControl(dependencies: {
  reader: GovernmentReaderDependencies;
  executor: {
    getGovernmentManager: () => unknown;
    getGame: () => unknown;
    getGovernor: () => string;
    getVueById: Parameters<typeof createGovernmentControls>[0];
  };
}) {
  const reader = {
    read: () => readGovernmentInput(dependencies.reader),
  };
  const executor = createGovernmentCommandExecutor({
    getGovernmentManager: dependencies.executor.getGovernmentManager,
    getGame: dependencies.executor.getGame,
    getGovernor: dependencies.executor.getGovernor,
    controls: createGovernmentControls(dependencies.executor.getVueById),
  });
  return Object.freeze({
    autoGovernment: () => runGovernmentAutomation({ reader, executor }),
  });
}
