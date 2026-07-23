import {
  createGalaxyMarketAdapter,
  type GalaxyMarketAdapterDependencies,
} from "../adapters/evolve/economy/market/galaxy-market.ts";
import { runGalaxyMarketAutomation } from "../application/galaxy-market.ts";

// Composition seam for the galaxy-market slice: owns the Evolve galaxy-market
// adapter construction and returns the control entry the runtime places at its
// tick position.
export function createGalaxyMarketControl(
  dependencies: GalaxyMarketAdapterDependencies,
) {
  const adapter = createGalaxyMarketAdapter(dependencies);
  return Object.freeze({
    autoGalaxyMarket: () =>
      runGalaxyMarketAutomation({
        reader: adapter.reader,
        executor: adapter.executor,
      }),
  });
}
