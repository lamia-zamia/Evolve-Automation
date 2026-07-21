import type { ResearchSettingsIntent } from "../domain/research-settings.ts";
import type {
  ResearchSettingsEffects,
  ResearchSettingsIntentHandler,
  ResearchSettingsWriter,
} from "../ports/research-settings.ts";

interface ResearchSettingsIntentDependencies {
  readonly writer: ResearchSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: ResearchSettingsEffects;
}

/**
 * Owns the Research settings reset sequence. The browser UI emits the intent;
 * it does not mutate settings, persist them, or reset game-facing checkboxes.
 */
export function createResearchSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: ResearchSettingsIntentDependencies): ResearchSettingsIntentHandler {
  return Object.freeze({
    handle(intent: ResearchSettingsIntent): void {
      switch (intent.type) {
        case "reset-research-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckbox();
          return;
      }
    },
  });
}
