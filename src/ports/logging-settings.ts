import type { LoggingSettingsIntent } from "../domain/logging-settings.ts";

/** Receives user intents emitted by the Logging settings UI. */
export interface LoggingSettingsIntentHandler {
  handle(intent: LoggingSettingsIntent): void;
}

/** Mutations needed by the Logging settings application handler. */
export interface LoggingSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
  setLogFilter(value: string): void;
}

export interface LoggingSettingsEffects {
  buildFilterRegExp(): void;
}
