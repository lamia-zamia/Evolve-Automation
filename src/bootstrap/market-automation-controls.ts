import { createMarketControl } from "./market-control.ts";
import { createGalaxyMarketControl } from "./galaxy-market-control.ts";
import { createGatherResourcesControl } from "./gather-resources-control.ts";

type MarketDependencies = Parameters<typeof createMarketControl>[0];
type GalaxyMarketDependencies = Parameters<typeof createGalaxyMarketControl>[0];
type GatherResourcesDependencies = Parameters<
  typeof createGatherResourcesControl
>[0];

interface MarketAutomationControlDependencies {
  readonly market: MarketDependencies;
  readonly galaxyMarket: GalaxyMarketDependencies;
  readonly gatherResources: GatherResourcesDependencies;
}

// Composition seam for market, galaxy-market, and gathering automation. The
// individual controls retain their adapter-owned effects and returned entries
// preserve the runtime's tick order.
export function createMarketAutomationControls({
  market,
  galaxyMarket,
  gatherResources,
}: MarketAutomationControlDependencies) {
  const marketControl = createMarketControl(market);
  const galaxyMarketControl = createGalaxyMarketControl(galaxyMarket);
  const gatherResourcesControl = createGatherResourcesControl(gatherResources);

  return Object.freeze({
    ...marketControl,
    ...galaxyMarketControl,
    ...gatherResourcesControl,
  });
}
