import { requireRecord, requireString } from "../../../validation.ts";
import type { SupplyToggleItem } from "../../../../domain/economy/resources/supply-toggles.ts";
import type { SupplyToggleReader } from "../../../../ports/supply-toggles.ts";

export interface SupplyToggleEvolveDependencies {
  readonly getSupplyManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

/** Evolve adapter for the ordered SupplyManager resources and their persisted toggles. */
export function createSupplyToggleEvolveAdapter({
  getSupplyManager,
  getSettingsRaw,
}: SupplyToggleEvolveDependencies): SupplyToggleReader {
  return Object.freeze({
    readItems(): readonly SupplyToggleItem[] {
      const manager = requireRecord(getSupplyManager(), "SupplyManager");
      const priorityList = manager["priorityList"];
      if (!Array.isArray(priorityList)) {
        throw new TypeError("SupplyManager.priorityList must be an array");
      }
      const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");

      return Object.freeze(
        priorityList.map((rawResource, index) => {
          const resource = requireRecord(
            rawResource,
            `SupplyManager.priorityList[${index}]`,
          );
          const resourceId = requireString(
            resource["id"],
            `SupplyManager.priorityList[${index}].id`,
          );
          const settingKey = `res_supply${resourceId}`;
          return Object.freeze({
            resourceId,
            settingKey,
            // Evolve leaves per-resource toggles absent until first written; legacy treated absence as disabled.
            enabled: Boolean(settingsRaw[settingKey]),
          });
        }),
      );
    },
  });
}
