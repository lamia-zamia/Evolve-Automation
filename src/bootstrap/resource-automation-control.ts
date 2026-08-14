import { createAlchemyControl } from "./alchemy-control.ts";
import { createEconomyAutomationControls } from "./economy-automation-controls.ts";
import { createIndustryAutomationControls } from "./industry-automation-controls.ts";
import { createPylonControl } from "./pylon-control.ts";

type AlchemyDependencies = Parameters<typeof createAlchemyControl>[0];
type PylonDependencies = Parameters<typeof createPylonControl>[0];
type IndustryDependencies = Parameters<
  typeof createIndustryAutomationControls
>[0];
type EconomyDependencies = Parameters<
  typeof createEconomyAutomationControls
>[0];

export interface ResourceAutomationControlDependencies {
  alchemy: AlchemyDependencies;
  pylon: PylonDependencies;
  industry: IndustryDependencies;
  economy: EconomyDependencies;
}

export function createResourceAutomationControl({
  alchemy,
  pylon,
  industry,
  economy,
}: ResourceAutomationControlDependencies) {
  return {
    ...createAlchemyControl(alchemy),
    ...createPylonControl(pylon),
    ...createIndustryAutomationControls(industry),
    ...createEconomyAutomationControls(economy),
  };
}
