import {
  createMiningDroidCommandExecutor,
  createMiningDroidReader,
} from "../adapters/evolve/economy/production/mining-droid.ts";
import { runMiningDroidAutomation } from "../application/mining-droid.ts";

// Composition seam for the mining-droid slice: owns the Evolve reader/executor
// construction and returns the control entry the runtime places at its tick
// position. Reader and executor share the single droid-manager accessor, and
// are constructed per call to preserve the runtime's prior behavior.
export function createMiningDroidControl(
  getManager: Parameters<typeof createMiningDroidReader>[0],
) {
  return Object.freeze({
    autoMiningDroid: () =>
      runMiningDroidAutomation({
        reader: createMiningDroidReader(getManager),
        executor: createMiningDroidCommandExecutor(getManager),
      }),
  });
}
