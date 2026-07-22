import type {
  EjectorSettingsIntent,
  EjectorSettingsReadModel,
} from "../domain/ejector-settings.ts";

export interface EjectorSettingsReader {
  read(): EjectorSettingsReadModel;
}

export interface EjectorSettingsIntentHandler {
  handle(intent: EjectorSettingsIntent): void;
}

export interface EjectorSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}

export interface EjectorSettingsEffects {
  resetCheckboxes(): void;
  removeEjectToggles(): void;
  removeSupplyToggles(): void;
}
