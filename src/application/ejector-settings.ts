import type { EjectorSettingsIntent } from "../domain/ejector-settings.ts";
import type {
  EjectorSettingsEffects,
  EjectorSettingsIntentHandler,
  EjectorSettingsWriter,
} from "../ports/ejector-settings.ts";

interface EjectorSettingsIntentDependencies {
  readonly writer: EjectorSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: EjectorSettingsEffects;
}

/** Owns the Ejector panel reset sequence outside the browser adapter. */
export function createEjectorSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: EjectorSettingsIntentDependencies): EjectorSettingsIntentHandler {
  return Object.freeze({
    handle(intent: EjectorSettingsIntent): void {
      switch (intent.type) {
        case "reset-ejector-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckboxes();
          effects.removeEjectToggles();
          effects.removeSupplyToggles();
          return;
      }
    },
  });
}
