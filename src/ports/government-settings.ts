import type { GovernmentSettingsIntent } from "../domain/government-settings.ts";

/** Receives user intents emitted by the Government settings UI. */
export interface GovernmentSettingsIntentHandler {
  handle(intent: GovernmentSettingsIntent): void;
}

/** Effects needed to reset and persist the Government settings section. */
export interface GovernmentSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}

export interface GovernmentSettingsEffects {
  resetCheckboxes(): void;
}
