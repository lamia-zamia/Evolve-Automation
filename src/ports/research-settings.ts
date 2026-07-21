import type { ResearchSettingsIntent } from "../domain/research-settings.ts";

/** Receives user intents emitted by the Research settings UI. */
export interface ResearchSettingsIntentHandler {
  handle(intent: ResearchSettingsIntent): void;
}

/** Effects needed to reset and persist the Research settings section. */
export interface ResearchSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}

export interface ResearchSettingsEffects {
  resetCheckbox(): void;
}
