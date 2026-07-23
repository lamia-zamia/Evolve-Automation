import type { WeightingSettingsIntent } from "../domain/economy/resources/weighting-settings.ts";
import type {
  WeightingSettingsIntentHandler,
  WeightingSettingsWriter,
} from "../ports/weighting-settings.ts";

interface WeightingSettingsIntentDependencies {
  readonly writer: WeightingSettingsWriter;
  readonly renderSettingsContent: () => void;
}

/** Owns AutoBuild Weighting reset sequencing outside the browser adapter. */
export function createWeightingSettingsIntentHandler({
  writer,
  renderSettingsContent,
}: WeightingSettingsIntentDependencies): WeightingSettingsIntentHandler {
  return Object.freeze({
    handle(intent: WeightingSettingsIntent): void {
      switch (intent.type) {
        case "reset-weighting-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          return;
      }
    },
  });
}
