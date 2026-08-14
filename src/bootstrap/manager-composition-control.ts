import { createEconomyManagers } from "../game/economy-managers.ts";
import { createForeignAffairsManagers } from "../game/foreign-affairs-managers.ts";
import { createIndustryManagerControls } from "./industry-manager-controls.ts";

type IndustryDependencies = Parameters<typeof createIndustryManagerControls>[0];
type EconomyDependencies = Parameters<typeof createEconomyManagers>[0];
type ForeignDependencies = Parameters<typeof createForeignAffairsManagers>[0];
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
    ...createEconomyManagers(economy),
    ...createForeignAffairsManagers(foreign),
  };
}
