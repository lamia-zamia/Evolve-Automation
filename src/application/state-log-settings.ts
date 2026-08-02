import type { StateLogSettingsIntent } from "../domain/state-log-settings.ts";
import type {
  StateLogSettingsIntentHandler,
  StateLogSettingsWriter,
} from "../ports/state-log-settings.ts";

interface StateLogSettingsIntentDependencies {
  readonly writer: StateLogSettingsWriter;
  readonly renderSettingsContent: () => void;
}

/**
 * Owns the State Log settings reset sequence. The UI can request this intent but
 * cannot mutate settings or persistence directly, and does not decide when the
 * reset becomes visible: this handler renders it, as every other settings reset
 * handler does.
 */
export function createStateLogSettingsIntentHandler({
  writer,
  renderSettingsContent,
}: StateLogSettingsIntentDependencies): StateLogSettingsIntentHandler {
  return Object.freeze({
    handle(intent: StateLogSettingsIntent): void {
      switch (intent.type) {
        case "reset-state-log-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          return;
      }
    },
  });
}
