import { createMarketAutomationControls } from "./market-automation-controls.ts";
import { createProgressionAutomationControls } from "./progression-automation-controls.ts";

type MarketDependencies = Parameters<typeof createMarketAutomationControls>[0];
type ProgressionDependencies = Parameters<
  typeof createProgressionAutomationControls
>[0];

export interface MarketProgressionAutomationControlDependencies {
  market: MarketDependencies;
  progression: ProgressionDependencies;
}

export function createMarketProgressionAutomationControl({
  market,
  progression,
}: MarketProgressionAutomationControlDependencies) {
  return {
    ...createMarketAutomationControls(market),
    ...createProgressionAutomationControls(progression),
  };
}
