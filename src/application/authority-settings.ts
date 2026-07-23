import type { AuthoritySettingsIntent } from "../domain/civic/authority-settings.ts";
import type {
  AuthoritySettingsIntentHandler,
  AuthoritySettingsWriter,
} from "../ports/authority-settings.ts";

interface AuthoritySettingsIntentDependencies {
  readonly writer: AuthoritySettingsWriter;
  readonly renderSettingsContent: () => void;
}

/**
 * Owns the Authority settings reset sequence. The browser UI emits the intent
 * but does not mutate settings or persist them directly.
 */
export function createAuthoritySettingsIntentHandler({
  writer,
  renderSettingsContent,
}: AuthoritySettingsIntentDependencies): AuthoritySettingsIntentHandler {
  return Object.freeze({
    handle(intent: AuthoritySettingsIntent): void {
      switch (intent.type) {
        case "reset-authority-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          return;
      }
    },
  });
}
