import type {
  MarketSettingsIntent,
  MarketSettingsReadModel,
} from "../domain/market-settings.ts";

export interface MarketSettingsReader {
  read(): MarketSettingsReadModel;
}

export interface MarketSettingsIntentHandler {
  handle(intent: MarketSettingsIntent): void;
}

export interface MarketSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
  reorderResources(resourceIds: readonly string[]): void;
}

export interface MarketSettingsEffects {
  resetCheckboxes(): void;
  removeMarketToggles(): void;
}
