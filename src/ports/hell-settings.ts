import type {
  HellSettingsIntent,
  HellSettingsReadModel,
} from "../domain/hell-settings.ts";

export interface HellSettingsReader {
  read(): HellSettingsReadModel;
}
export interface HellSettingsIntentHandler {
  handle(intent: HellSettingsIntent): void;
}
export interface HellSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}
export interface HellSettingsEffects {
  resetCheckboxes(): void;
}
