import {
  createPrestigeCommandExecutor,
  createPrestigeReader,
} from "../adapters/evolve/progression/prestige/prestige.ts";
import { runPrestige } from "../application/prestige.ts";

// Composition seam for the prestige slice: owns the Evolve reader/executor
// construction and returns the control entry the runtime places at its tick
// position. The prestige-eligibility view readers stay in the closure and are
// passed in through the reader's `eligibility` accessors.
export function createPrestigeControl(dependencies: {
  reader: Parameters<typeof createPrestigeReader>[0];
  executor: Parameters<typeof createPrestigeCommandExecutor>[0];
}) {
  const reader = createPrestigeReader(dependencies.reader);
  const executor = createPrestigeCommandExecutor(dependencies.executor);
  return Object.freeze({
    autoPrestige: () => runPrestige({ reader, executor }),
  });
}
