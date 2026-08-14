import { createPrestigeAutomationControls } from "./prestige-automation-controls.ts";
import { createPrestigeEligibilityControl } from "./prestige-eligibility-control.ts";

type PrestigeAutomationDependencies = Parameters<
  typeof createPrestigeAutomationControls
>[0];
type PrestigeEligibilityDependencies = Parameters<
  typeof createPrestigeEligibilityControl
>[0];

export interface PrestigeAutomationCompositionControlDependencies {
  automation: PrestigeAutomationDependencies;
  eligibility: PrestigeEligibilityDependencies;
}

export function createPrestigeAutomationCompositionControl({
  automation,
  eligibility,
}: PrestigeAutomationCompositionControlDependencies) {
  return {
    ...createPrestigeAutomationControls(automation),
    ...createPrestigeEligibilityControl(eligibility),
  };
}
