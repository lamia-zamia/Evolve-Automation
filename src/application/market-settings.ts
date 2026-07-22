import type { MarketSettingsIntent } from "../domain/market-settings.ts";
import type {
  MarketSettingsEffects,
  MarketSettingsIntentHandler,
  MarketSettingsWriter,
} from "../ports/market-settings.ts";

interface MarketSettingsIntentDependencies {
  readonly writer: MarketSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: MarketSettingsEffects;
}

/** Owns Market reset and reorder sequencing outside the browser adapter. */
export function createMarketSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: MarketSettingsIntentDependencies): MarketSettingsIntentHandler {
  return Object.freeze({
    handle(intent: MarketSettingsIntent): void {
      switch (intent.type) {
        case "reset-market-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckboxes();
          effects.removeMarketToggles();
          return;
        case "reorder-market-resources":
          writer.reorderResources(intent.resourceIds);
          writer.persist();
          return;
      }
    },
  });
}
