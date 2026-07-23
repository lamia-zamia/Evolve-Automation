import {
  createMutationCommandExecutor,
  createMutationReader,
  type MutationExecutorDependencies,
  type MutationReaderDependencies,
} from "../adapters/evolve/traits/mutation.ts";
import { runMutationAutomation } from "../application/mutation.ts";

// Composition seam for the mutation slice: owns the Evolve reader/executor
// construction and returns the control entry the runtime places at its tick
// position.
export function createMutationControl(dependencies: {
  reader: MutationReaderDependencies;
  executor: MutationExecutorDependencies;
}) {
  const reader = createMutationReader(dependencies.reader);
  const executor = createMutationCommandExecutor(dependencies.executor);
  return Object.freeze({
    autoMutateTrait: () => runMutationAutomation({ reader, executor }),
  });
}
