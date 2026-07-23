import type { AchievementGuardSettingsIntent } from "../domain/progression/prestige/achievement-guard-settings.ts";

/** Receives user intents emitted by the Achievement Guard settings UI. */
export interface AchievementGuardSettingsIntentHandler {
  handle(intent: AchievementGuardSettingsIntent): void;
}

/** Effects needed to reset and persist the Achievement Guard settings section. */
export interface AchievementGuardSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}
