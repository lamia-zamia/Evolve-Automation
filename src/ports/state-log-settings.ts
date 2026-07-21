import type { StateLogSettingsIntent } from "../domain/state-log-settings.ts";

/** Receives user intents emitted by the State Log settings UI. */
export interface StateLogSettingsIntentHandler {
  handle(intent: StateLogSettingsIntent): void;
}

/** Effects needed to reset and persist the State Log settings section. */
export interface StateLogSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}
