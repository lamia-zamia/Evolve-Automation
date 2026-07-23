import {
  createTriggerCommandExecutor,
  createTriggerReader,
  type TriggerExecutorDependencies,
  type TriggerReaderDependencies,
} from "../adapters/evolve/progression/build/trigger.ts";
import {
  runTriggerAutomation,
  triggerPhaseActive,
} from "../application/trigger.ts";

// Composition seam for the trigger slice: owns the Evolve reader/executor
// construction and returns the control entry the runtime places at its tick
// position. The control reports whether the trigger phase is active so the tick
// can guard research/build spending.
export function createTriggerControl(dependencies: {
  reader: TriggerReaderDependencies;
  executor: TriggerExecutorDependencies;
}) {
  const reader = createTriggerReader(dependencies.reader);
  const executor = createTriggerCommandExecutor(dependencies.executor);
  return Object.freeze({
    autoTrigger: () =>
      triggerPhaseActive(runTriggerAutomation({ reader, executor })),
  });
}
