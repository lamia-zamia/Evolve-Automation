import type { WarSettingsIntent } from "../domain/combat/war-settings.ts";

export interface WarSettingsIntentHandler {
  handle(intent: WarSettingsIntent): void;
}

export interface WarSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}

export interface WarSettingsEffects {
  resetCheckboxes(): void;
}
