import type { LoggingSettingsIntent } from "../domain/logging-settings.ts";
import type {
  LoggingSettingsEffects,
  LoggingSettingsIntentHandler,
  LoggingSettingsWriter,
} from "../ports/logging-settings.ts";

interface LoggingSettingsIntentDependencies {
  readonly writer: LoggingSettingsWriter;
  readonly renderSettingsContent: (secondaryPrefix: string) => void;
  readonly effects: LoggingSettingsEffects;
}

/** Owns Logging reset and filter-change ordering outside the browser adapter. */
export function createLoggingSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: LoggingSettingsIntentDependencies): LoggingSettingsIntentHandler {
  return Object.freeze({
    handle(intent: LoggingSettingsIntent): void {
      switch (intent.type) {
        case "reset-logging-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent(intent.secondaryPrefix);
          effects.buildFilterRegExp();
          return;
        case "set-log-filter":
          writer.setLogFilter(intent.value);
          effects.buildFilterRegExp();
          writer.persist();
          return;
      }
    },
  });
}
