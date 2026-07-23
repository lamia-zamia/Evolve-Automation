import type {
  WarSettingsIntent,
  WarSettingsReadModel,
} from "../domain/combat/war-settings.ts";

export interface WarSettingsReader {
  read(): WarSettingsReadModel;
}

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
