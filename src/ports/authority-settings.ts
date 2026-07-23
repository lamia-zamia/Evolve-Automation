import type { AuthoritySettingsIntent } from "../domain/civic/authority-settings.ts";

/** Receives user intents emitted by the Authority settings UI. */
export interface AuthoritySettingsIntentHandler {
  handle(intent: AuthoritySettingsIntent): void;
}

/** Effects needed to reset and persist the Authority settings section. */
export interface AuthoritySettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}
