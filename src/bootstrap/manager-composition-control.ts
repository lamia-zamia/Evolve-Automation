import { createEconomyManagerControl } from "./economy-manager-control.ts";
import { createForeignAffairsManagerControl } from "./foreign-affairs-manager-control.ts";
import { createIndustryManagerControls } from "./industry-manager-controls.ts";

type IndustryDependencies = Parameters<typeof createIndustryManagerControls>[0];
type EconomyDependencies = Parameters<typeof createEconomyManagerControl>[0];
type ForeignDependencies = Parameters<
  typeof createForeignAffairsManagerControl
>[0];
export interface ManagerCompositionControlDependencies {
  industry: IndustryDependencies;
  economy: EconomyDependencies;
  foreign: ForeignDependencies;
}

export function createManagerCompositionControl({
  industry,
  economy,
  foreign,
}: ManagerCompositionControlDependencies) {
  return {
    ...createIndustryManagerControls(industry),
    ...createEconomyManagerControl(economy),
    ...createForeignAffairsManagerControl(foreign),
  };
}
