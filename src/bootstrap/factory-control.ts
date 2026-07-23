import { createFactoryTooltipPublisher } from "../adapters/browser/factory-tooltips.ts";
import {
  createFactoryAdapter,
  type FactoryAdapterDependencies,
} from "../adapters/evolve/economy/production/factory.ts";
import { runFactoryAutomation } from "../application/factory.ts";

// Composition seam for the factory slice: owns the Evolve factory adapter and the
// browser factory-tooltip publisher, and returns the control entry the runtime
// places at its tick position.
export function createFactoryControl(dependencies: {
  adapter: FactoryAdapterDependencies;
  getState: Parameters<typeof createFactoryTooltipPublisher>[0];
}) {
  const adapter = createFactoryAdapter(dependencies.adapter);
  const tooltips = createFactoryTooltipPublisher(dependencies.getState);
  return Object.freeze({
    autoFactory: () =>
      runFactoryAutomation({
        reader: adapter.reader,
        executor: adapter.executor,
        tooltips,
      }),
  });
}
