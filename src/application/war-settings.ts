import type { WarSettingsIntent } from "../domain/war-settings.ts";
import type {
  WarSettingsEffects,
  WarSettingsIntentHandler,
  WarSettingsWriter,
} from "../ports/war-settings.ts";

interface WarSettingsIntentDependencies {
  readonly writer: WarSettingsWriter;
  readonly renderSettingsContent: (secondaryPrefix: string) => void;
  readonly effects: WarSettingsEffects;
}

export function createWarSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: WarSettingsIntentDependencies): WarSettingsIntentHandler {
  return Object.freeze({
    handle(intent: WarSettingsIntent): void {
      writer.resetToDefaults();
      writer.persist();
      renderSettingsContent(intent.secondaryPrefix);
      effects.resetCheckboxes();
    },
  });
}
