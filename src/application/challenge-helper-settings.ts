import type { ChallengeHelperSettingsIntent } from "../domain/challenge-helper-settings.ts";
import type {
  ChallengeHelperSettingsIntentHandler,
  ChallengeHelperSettingsWriter,
} from "../ports/challenge-helper-settings.ts";

interface ChallengeHelperSettingsIntentDependencies {
  readonly writer: ChallengeHelperSettingsWriter;
  readonly renderSettingsContent: () => void;
}

/**
 * Owns the Challenge Helper settings reset sequence. The browser UI emits the
 * intent but does not mutate settings or persist them directly.
 */
export function createChallengeHelperSettingsIntentHandler({
  writer,
  renderSettingsContent,
}: ChallengeHelperSettingsIntentDependencies): ChallengeHelperSettingsIntentHandler {
  return Object.freeze({
    handle(intent: ChallengeHelperSettingsIntent): void {
      switch (intent.type) {
        case "reset-challenge-helper-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          return;
      }
    },
  });
}
