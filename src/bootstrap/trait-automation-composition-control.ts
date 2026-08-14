import { createTraitAutomationControls } from "./trait-automation-controls.ts";
import { createTraitAutomationCatalogs } from "../adapters/evolve/runtime-catalogs.ts";

type TraitAutomationDependencies = Parameters<
  typeof createTraitAutomationControls
>[0];

export interface TraitAutomationCompositionControlDependencies extends TraitAutomationDependencies {
  getStoneName: () => string;
}

export function createTraitAutomationCompositionControl({
  getStoneName,
  ...automation
}: TraitAutomationCompositionControlDependencies) {
  return {
    ...createTraitAutomationCatalogs(getStoneName),
    ...createTraitAutomationControls(automation),
  };
}
