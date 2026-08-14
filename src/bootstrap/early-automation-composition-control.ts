import { createCombatCivicControls } from "./combat-civic-controls.ts";
import { createCraftJobsControls } from "./craft-jobs-controls.ts";
import { createEspionageControls } from "./espionage-controls.ts";

type CraftJobsDependencies = Parameters<typeof createCraftJobsControls>[0];
type CombatCivicDependencies = Parameters<typeof createCombatCivicControls>[0];
type EspionageDependencies = Parameters<typeof createEspionageControls>[0];

export interface EarlyAutomationCompositionDependencies {
  readonly craftJobs: CraftJobsDependencies;
  readonly combatCivic: CombatCivicDependencies;
  readonly espionage: EspionageDependencies;
}

export function createEarlyAutomationComposition({
  craftJobs,
  combatCivic,
  espionage,
}: EarlyAutomationCompositionDependencies) {
  const craft = createCraftJobsControls(craftJobs);
  const combat = createCombatCivicControls(combatCivic);
  const foreign = createEspionageControls(espionage);

  return Object.freeze({ ...craft, ...combat, ...foreign });
}
