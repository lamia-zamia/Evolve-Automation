import type { GovernmentSettingsIntent } from "../domain/civic/government-settings.ts";
import type {
  GovernmentSettingsEffects,
  GovernmentSettingsIntentHandler,
  GovernmentSettingsWriter,
} from "../ports/government-settings.ts";

interface GovernmentSettingsIntentDependencies {
  readonly writer: GovernmentSettingsWriter;
  readonly renderSettingsContent: (secondaryPrefix: string) => void;
  readonly effects: GovernmentSettingsEffects;
}

/** Owns the Government settings reset sequence outside the browser adapter. */
export function createGovernmentSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: GovernmentSettingsIntentDependencies): GovernmentSettingsIntentHandler {
  return Object.freeze({
    handle(intent: GovernmentSettingsIntent): void {
      switch (intent.type) {
        case "reset-government-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent(intent.secondaryPrefix);
          effects.resetCheckboxes();
          return;
      }
    },
  });
}
