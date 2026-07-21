import type { BuildingSettingsIntent } from "../domain/building-settings.ts";

/** Receives user intents emitted by the Building settings UI. */
export interface BuildingSettingsIntentHandler {
  handle(intent: BuildingSettingsIntent): void;
}

/** Writes Building settings and manager state through the Evolve adapter. */
export interface BuildingSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
  resetPriorities(): void;
  reorderBuildings(buildingIds: readonly string[]): void;
  setAllAutoBuild(enabled: boolean): void;
  setAllAutoPower(enabled: boolean): void;
  setLinkedSmartState(buildingIds: readonly string[], enabled: boolean): void;
}

export interface BuildingSettingsEffects {
  resetCheckboxes(): void;
  removeBuildingToggles(): void;
}
