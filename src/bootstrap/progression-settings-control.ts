import { createEvolutionSettingsControl } from "./settings/evolution-settings-control.ts";
import { createPlanetSettingsControl } from "./settings/government-planet-settings-controls.ts";
import { createResearchSettingsControl } from "./settings/research-settings-control.ts";
import { createTriggerSettingsControl } from "./settings/trigger-settings-control.ts";
import { createWarSettingsControl } from "./settings/war-settings-control.ts";

type EvolutionDependencies = Parameters<
  typeof createEvolutionSettingsControl
>[0];
type PlanetDependencies = Parameters<typeof createPlanetSettingsControl>[0];
type TriggerDependencies = Parameters<typeof createTriggerSettingsControl>[0];
type ResearchDependencies = Parameters<typeof createResearchSettingsControl>[0];
type WarDependencies = Parameters<typeof createWarSettingsControl>[0];

export interface ProgressionSettingsControlDependencies {
  evolution: EvolutionDependencies;
  planet: PlanetDependencies;
  trigger: TriggerDependencies;
  research: ResearchDependencies;
  war: WarDependencies;
}

export function createProgressionSettingsControl({
  evolution,
  planet,
  trigger,
  research,
  war,
}: ProgressionSettingsControlDependencies) {
  return {
    evolutionSettingsControl: createEvolutionSettingsControl(evolution),
    planetSettingsBrowserAdapter: createPlanetSettingsControl(planet),
    triggerSettingsBrowserAdapter: createTriggerSettingsControl(trigger),
    researchSettingsBrowserAdapter: createResearchSettingsControl(research),
    warSettingsBrowserAdapter: createWarSettingsControl(war),
  };
}
