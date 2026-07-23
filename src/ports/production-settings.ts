import type { ProductionSettingsIntent } from "../domain/economy/production/production-settings.ts";

export interface ProductionSettingsIntentHandler {
  handle(intent: ProductionSettingsIntent): void;
}

export interface ProductionSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
  reorderSmelterFuels(fuelIds: readonly string[]): void;
}

export interface ProductionSettingsEffects {
  resetCheckboxes(): void;
  removeCraftToggles(): void;
}
