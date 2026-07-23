import type { AchievementGuardSettingsIntent } from "../domain/progression/prestige/achievement-guard-settings.ts";
import type {
  AchievementGuardSettingsIntentHandler,
  AchievementGuardSettingsWriter,
} from "../ports/achievement-guard-settings.ts";

interface AchievementGuardSettingsIntentDependencies {
  readonly writer: AchievementGuardSettingsWriter;
  readonly renderSettingsContent: () => void;
}

/**
 * Owns the Achievement Guard settings reset sequence. The browser UI emits the
 * intent but does not mutate settings or persist them directly.
 */
export function createAchievementGuardSettingsIntentHandler({
  writer,
  renderSettingsContent,
}: AchievementGuardSettingsIntentDependencies): AchievementGuardSettingsIntentHandler {
  return Object.freeze({
    handle(intent: AchievementGuardSettingsIntent): void {
      switch (intent.type) {
        case "reset-achievement-guard-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          return;
      }
    },
  });
}
