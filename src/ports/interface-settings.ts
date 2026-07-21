import type {
  InterfaceSettingsIntent,
  InterfaceSettingsState,
} from "../domain/interface-settings.ts";

/** Receives user intents emitted by the Interface settings UI. */
export interface InterfaceSettingsIntentHandler {
  handle(intent: InterfaceSettingsIntent): void;
}

/** Effects needed to reset, persist, and refresh the Interface settings section. */
export interface InterfaceSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}

export interface InterfaceSettingsReader {
  read(): InterfaceSettingsState;
}

export interface InterfaceSettingsEffects {
  renderSettingsContent(): void;
  syncActiveTargetsUI(enabled: boolean): void;
  syncBuildPlannerUI(enabled: boolean): void;
  updatePrestigeInTopBar(): void;
  updateTotalDaysInTopBar(): void;
}
