import type { TraitSettingsIntent } from "../domain/traits/trait-settings.ts";

export interface TraitSettingsIntentHandler {
  handle(intent: TraitSettingsIntent): void;
}

export interface TraitSettingsWriter {
  resetMinorTraits(): void;
  resetMutableTraits(): void;
  persist(): void;
  clearEvolutionTarget(): void;
  reorderMinorTraits(traitIds: readonly string[]): void;
  reorderMutableTraits(traitIds: readonly string[]): void;
  setBoolean(settingName: string, value: boolean): void;
}

export interface TraitSettingsEffects {
  resetCheckboxes(): void;
}
