import type { MagicSettingsIntent } from "../domain/economy/production/magic-settings.ts";

/** Receives user intents emitted by the Magic settings UI. */
export interface MagicSettingsIntentHandler {
  handle(intent: MagicSettingsIntent): void;
}

/** Writes Magic settings defaults and persists them. */
export interface MagicSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}

export interface MagicSettingsEffects {
  resetCheckboxes(): void;
}
