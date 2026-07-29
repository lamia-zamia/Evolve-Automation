import { requireRecord, requireString } from "../../../validation.ts";
import type { BuildingToggleItem } from "../../../../domain/progression/build/building-toggles.ts";
import type { BuildingToggleReader } from "../../../../ports/building-toggles.ts";

export interface BuildingToggleEvolveDependencies {
  readonly getBuildingManager: () => unknown;
  readonly getSettings: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

/** Evolve adapter for the visible building catalog and its persisted toggles. */
export function createBuildingToggleEvolveAdapter({
  getBuildingManager,
  getSettings,
  getSettingsRaw,
}: BuildingToggleEvolveDependencies): BuildingToggleReader {
  return Object.freeze({
    readVisible(): boolean {
      const settings = requireRecord(getSettings(), "settings");
      // Evolve initializes this gate after startup; legacy treated an absent value as hidden.
      return Boolean(settings["showSettings"]);
    },

    readItems(): readonly BuildingToggleItem[] {
      const manager = requireRecord(getBuildingManager(), "BuildingManager");
      const priorityList = manager["priorityList"];
      if (!Array.isArray(priorityList)) {
        throw new TypeError("BuildingManager.priorityList must be an array");
      }
      const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");

      return Object.freeze(
        priorityList.map((rawBuilding, index) => {
          const building = requireRecord(
            rawBuilding,
            `BuildingManager.priorityList[${index}]`,
          );
          const binding = requireString(
            building["_vueBinding"],
            `BuildingManager.priorityList[${index}]._vueBinding`,
          );
          const settingKey = `bat${binding}`;
          return Object.freeze({
            binding,
            settingKey,
            // Evolve leaves per-building toggles absent until first written; legacy treated absence as disabled.
            enabled: Boolean(settingsRaw[settingKey]),
          });
        }),
      );
    },
  });
}
