import type { InterfaceSettingsIntent } from "../domain/interface-settings.ts";
import type {
  InterfaceSettingsEffects,
  InterfaceSettingsIntentHandler,
  InterfaceSettingsReader,
  InterfaceSettingsWriter,
} from "../ports/interface-settings.ts";

interface InterfaceSettingsIntentDependencies {
  readonly writer: InterfaceSettingsWriter;
  readonly reader: InterfaceSettingsReader;
  readonly effects: InterfaceSettingsEffects;
}

/**
 * Owns the Interface settings reset sequence. The browser UI emits the intent;
 * it does not mutate settings, persist them, or coordinate dependent widgets.
 */
export function createInterfaceSettingsIntentHandler({
  writer,
  reader,
  effects,
}: InterfaceSettingsIntentDependencies): InterfaceSettingsIntentHandler {
  return Object.freeze({
    handle(intent: InterfaceSettingsIntent): void {
      switch (intent.type) {
        case "reset-interface-settings": {
          writer.resetToDefaults();
          writer.persist();
          effects.renderSettingsContent();

          const state = reader.read();
          effects.syncActiveTargetsUI(state.activeTargetsUI);
          effects.syncBuildPlannerUI(state.buildPlannerUI);
          effects.updatePrestigeInTopBar();
          effects.updateTotalDaysInTopBar();
          return;
        }
      }
    },
  });
}
