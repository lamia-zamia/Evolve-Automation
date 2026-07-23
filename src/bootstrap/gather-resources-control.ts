import {
  createGatherResourcesAdapter,
  type GatherResourcesAdapterDependencies,
} from "../adapters/evolve/economy/resources/gather-resources.ts";
import { runGatherResourcesAutomation } from "../application/gather-resources.ts";

// Composition seam for the gather-resources slice: owns the Evolve
// gather-resources adapter construction and returns the control entry the
// runtime places at its tick position.
export function createGatherResourcesControl(
  dependencies: GatherResourcesAdapterDependencies,
) {
  const adapter = createGatherResourcesAdapter(dependencies);
  return Object.freeze({
    autoGatherResources: () =>
      runGatherResourcesAutomation({
        reader: adapter.reader,
        executor: adapter.executor,
      }),
  });
}
