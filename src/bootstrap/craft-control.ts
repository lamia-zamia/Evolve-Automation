import {
  createCraftCommandExecutor,
  createCraftReader,
  type CraftExecutorDependencies,
  type CraftReaderDependencies,
} from "../adapters/evolve/economy/production/craft.ts";
import { runCraftAutomation } from "../application/craft.ts";

// Composition seam for the craft slice: owns the Evolve reader/executor
// construction and returns the control entry the runtime places at its tick
// position. The Evolve craft reader carries a per-run session (see
// createCraftReader), so the reader/executor are built on each call exactly as
// the runtime closure did — keeping behavior byte-identical — while the
// construction now lives in this typed seam.
export function createCraftControl(dependencies: {
  reader: CraftReaderDependencies;
  executor: CraftExecutorDependencies;
}) {
  return Object.freeze({
    autoCraft: () =>
      runCraftAutomation({
        reader: createCraftReader(dependencies.reader),
        executor: createCraftCommandExecutor(dependencies.executor),
      }),
  });
}
