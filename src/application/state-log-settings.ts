import type { StateLogSettingsIntent } from "../domain/state-log-settings.ts";
import type {
  StateLogSettingsIntentHandler,
  StateLogSettingsWriter,
} from "../ports/state-log-settings.ts";

/**
 * Owns the State Log settings reset sequence. The UI can request this intent but
 * cannot mutate settings or persistence directly.
 */
export function createStateLogSettingsIntentHandler(
  writer: StateLogSettingsWriter,
): StateLogSettingsIntentHandler {
  return Object.freeze({
    handle(intent: StateLogSettingsIntent): void {
      switch (intent.type) {
        case "reset-state-log-settings":
          writer.resetToDefaults();
          writer.persist();
          return;
      }
    },
  });
}
