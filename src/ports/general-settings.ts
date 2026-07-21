import type { GeneralSettingsIntent } from "../domain/general-settings.ts";

/** Receives user intents emitted by the General settings UI. */
export interface GeneralSettingsIntentHandler {
  handle(intent: GeneralSettingsIntent): void;
}

/** Effects needed to reset and persist the General settings section. */
export interface GeneralSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}

export interface GeneralSettingsEffects {
  resetCheckboxes(): void;
}
