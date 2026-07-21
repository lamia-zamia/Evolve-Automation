import type { MagicSettingsIntent } from "../domain/magic-settings.ts";
import type {
  MagicSettingsEffects,
  MagicSettingsIntentHandler,
  MagicSettingsWriter,
} from "../ports/magic-settings.ts";

interface MagicSettingsIntentDependencies {
  readonly writer: MagicSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: MagicSettingsEffects;
}

/** Owns Magic settings reset sequencing outside the browser adapter. */
export function createMagicSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: MagicSettingsIntentDependencies): MagicSettingsIntentHandler {
  return Object.freeze({
    handle(intent: MagicSettingsIntent): void {
      switch (intent.type) {
        case "reset-magic-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckboxes();
          return;
      }
    },
  });
}
