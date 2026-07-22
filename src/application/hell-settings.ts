import type { HellSettingsIntent } from "../domain/hell-settings.ts";
import type {
  HellSettingsEffects,
  HellSettingsIntentHandler,
  HellSettingsWriter,
} from "../ports/hell-settings.ts";

interface HellSettingsIntentDependencies {
  readonly writer: HellSettingsWriter;
  readonly renderSettingsContent: (secondaryPrefix: string) => void;
  readonly effects: HellSettingsEffects;
}

export function createHellSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: HellSettingsIntentDependencies): HellSettingsIntentHandler {
  return Object.freeze({
    handle(intent: HellSettingsIntent): void {
      writer.resetToDefaults();
      writer.persist();
      renderSettingsContent(intent.secondaryPrefix);
      effects.resetCheckboxes();
    },
  });
}
