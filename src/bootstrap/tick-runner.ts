import {
  createTickControls,
  createTickReader,
  type TickControllerBag,
  type TickControlsDependencies,
  type TickReaderDependencies,
} from "../adapters/evolve/tick.ts";
import { createApplicationRunner } from "../application/application-runner.ts";

// Composition seam for the tick runner: assembles the typed tick reader, tick
// controls, and application runner, returning the `automate` entry point. The
// controller bag and the live test-controller override stay in the closure and
// are passed in; the seam owns the typed runner wiring, reproducing the closure's
// prior `tickTestControllers ?? tickControllers` selection and the runner's
// updateState override exactly. `controllers.updateState` is the same function the
// closure passed as its updateState fallback.
export function createTickRunner(dependencies: {
  reader: TickReaderDependencies;
  controls: Omit<TickControlsDependencies, "getControllers">;
  controllers: TickControllerBag;
  getTestControllers: () => TickControllerBag | undefined;
}) {
  const reader = createTickReader(dependencies.reader);
  const controls = createTickControls({
    ...dependencies.controls,
    getControllers: () =>
      dependencies.getTestControllers() ?? dependencies.controllers,
  });
  const applicationRunner = createApplicationRunner({
    reader,
    controls,
    updateState: () => {
      const testControllers = dependencies.getTestControllers();
      if (testControllers?.updateState) {
        testControllers.updateState();
      } else {
        dependencies.controllers.updateState();
      }
    },
  });
  return Object.freeze({ automate: () => applicationRunner.runCycle() });
}
