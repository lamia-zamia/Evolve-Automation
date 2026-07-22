import type { FleetSettingsIntent } from "../domain/fleet-settings.ts";

export interface FleetSettingsIntentHandler {
  handle(intent: FleetSettingsIntent): void;
}

export interface FleetSettingsWriter {
  resetToDefaults(): void;
  reorderAndromeda(regionIds: readonly string[]): void;
  persist(): void;
}

export interface FleetSettingsEffects {
  resetCheckbox(): void;
}
