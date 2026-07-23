import {
  createMinorTraitCommandExecutor,
  createMinorTraitReader,
  type MinorTraitReaderDependencies,
} from "../adapters/evolve/traits/minor-trait.ts";
import { runMinorTraitAutomation } from "../application/minor-trait.ts";

// Composition seam for the minor-trait slice: owns the Evolve reader/executor
// construction and returns the control entry the runtime places at its tick
// position.
export function createMinorTraitControl(dependencies: {
  reader: MinorTraitReaderDependencies;
  executor: Parameters<typeof createMinorTraitCommandExecutor>[0];
}) {
  const reader = createMinorTraitReader(dependencies.reader);
  const executor = createMinorTraitCommandExecutor(dependencies.executor);
  return Object.freeze({
    autoMinorTrait: () => runMinorTraitAutomation({ reader, executor }),
  });
}
