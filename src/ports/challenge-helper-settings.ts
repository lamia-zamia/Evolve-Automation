import type { ChallengeHelperSettingsIntent } from "../domain/challenge-helper-settings.ts";

/** Receives user intents emitted by the Challenge Helper settings UI. */
export interface ChallengeHelperSettingsIntentHandler {
  handle(intent: ChallengeHelperSettingsIntent): void;
}

/** Effects needed to reset and persist the Challenge Helper settings section. */
export interface ChallengeHelperSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}
