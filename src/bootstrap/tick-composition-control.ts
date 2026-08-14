import { createTickRunner } from "./tick-runner.ts";

type TickRunnerDependencies = Parameters<typeof createTickRunner>[0];

export type TickCompositionControlDependencies = TickRunnerDependencies;

export function createTickCompositionControl(
  dependencies: TickCompositionControlDependencies,
) {
  return createTickRunner(dependencies);
}
