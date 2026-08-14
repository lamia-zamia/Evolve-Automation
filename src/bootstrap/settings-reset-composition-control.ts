import { createSettingsResets } from "../application/settings-reset.ts";
import { createEvolveSettingsResetAdapter } from "../adapters/evolve/settings-reset.ts";

type SettingsResetDependencies = Parameters<typeof createSettingsResets>[0];
type EvolveResetDependencies = Parameters<
  typeof createEvolveSettingsResetAdapter
>[0];

export interface SettingsResetCompositionControlDependencies extends Omit<
  SettingsResetDependencies,
  keyof EvolveResetDependencies
> {
  evolve: EvolveResetDependencies;
}

export function createSettingsResetCompositionControl({
  evolve,
  ...settingsReset
}: SettingsResetCompositionControlDependencies) {
  return createSettingsResets({
    ...settingsReset,
    ...createEvolveSettingsResetAdapter(evolve),
  });
}
