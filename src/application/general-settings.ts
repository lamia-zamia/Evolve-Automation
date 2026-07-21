import type { GeneralSettingsIntent } from "../domain/general-settings.ts";
import type {
  GeneralSettingsEffects,
  GeneralSettingsIntentHandler,
  GeneralSettingsWriter,
} from "../ports/general-settings.ts";

interface GeneralSettingsIntentDependencies {
  readonly writer: GeneralSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: GeneralSettingsEffects;
}

/**
 * Owns the General settings reset sequence. The browser UI emits the intent;
 * it does not mutate settings, persist them, or reset game-facing checkboxes.
 */
export function createGeneralSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: GeneralSettingsIntentDependencies): GeneralSettingsIntentHandler {
  return Object.freeze({
    handle(intent: GeneralSettingsIntent): void {
      switch (intent.type) {
        case "reset-general-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckboxes();
          return;
      }
    },
  });
}
