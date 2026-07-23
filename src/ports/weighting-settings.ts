import type { WeightingSettingsIntent } from "../domain/economy/resources/weighting-settings.ts";

/** Receives user intents emitted by the AutoBuild Weighting settings UI. */
export interface WeightingSettingsIntentHandler {
  handle(intent: WeightingSettingsIntent): void;
}

/** Writes AutoBuild Weighting defaults and persists them. */
export interface WeightingSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}
