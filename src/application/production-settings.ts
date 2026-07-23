import type { ProductionSettingsIntent } from "../domain/economy/production/production-settings.ts";
import type {
  ProductionSettingsEffects,
  ProductionSettingsIntentHandler,
  ProductionSettingsWriter,
} from "../ports/production-settings.ts";

interface ProductionSettingsIntentDependencies {
  readonly writer: ProductionSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: ProductionSettingsEffects;
}

/** Owns Production settings reset and fuel-priority mutation sequencing. */
export function createProductionSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: ProductionSettingsIntentDependencies): ProductionSettingsIntentHandler {
  return Object.freeze({
    handle(intent: ProductionSettingsIntent): void {
      switch (intent.type) {
        case "reset-production-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckboxes();
          effects.removeCraftToggles();
          return;
        case "reorder-smelter-fuels":
          writer.reorderSmelterFuels(intent.fuelIds);
          writer.persist();
          return;
      }
    },
  });
}
