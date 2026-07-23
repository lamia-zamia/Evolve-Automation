import type { BuildingSettingsIntent } from "../domain/progression/build/building-settings.ts";
import type {
  BuildingSettingsEffects,
  BuildingSettingsIntentHandler,
  BuildingSettingsWriter,
} from "../ports/building-settings.ts";

interface BuildingSettingsIntentDependencies {
  readonly writer: BuildingSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: BuildingSettingsEffects;
}

/** Owns Building settings reset, priority, and bulk-toggle sequencing. */
export function createBuildingSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: BuildingSettingsIntentDependencies): BuildingSettingsIntentHandler {
  return Object.freeze({
    handle(intent: BuildingSettingsIntent): void {
      switch (intent.type) {
        case "reset-building-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckboxes();
          effects.removeBuildingToggles();
          return;
        case "reset-building-priorities":
          writer.resetPriorities();
          writer.persist();
          renderSettingsContent();
          return;
        case "reorder-buildings":
          writer.reorderBuildings(intent.buildingIds);
          writer.persist();
          return;
        case "set-all-autobuild":
          writer.setAllAutoBuild(intent.enabled);
          writer.persist();
          return;
        case "set-all-autopower":
          writer.setAllAutoPower(intent.enabled);
          writer.persist();
          return;
        case "set-linked-smart-state":
          writer.setLinkedSmartState(intent.buildingIds, intent.enabled);
          writer.persist();
          return;
      }
    },
  });
}
