import { requireRecord, requireString } from "../../../validation.ts";
import type { EjectToggleItem } from "../../../../domain/economy/resources/eject-toggles.ts";
import type { EjectToggleReader } from "../../../../ports/eject-toggles.ts";

export interface EjectToggleEvolveDependencies {
  readonly getEjectManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

/** Evolve adapter for the ordered EjectManager resources and their persisted toggles. */
export function createEjectToggleEvolveAdapter({
  getEjectManager,
  getSettingsRaw,
}: EjectToggleEvolveDependencies): EjectToggleReader {
  return Object.freeze({
    readItems(): readonly EjectToggleItem[] {
      const manager = requireRecord(getEjectManager(), "EjectManager");
      const priorityList = manager["priorityList"];
      if (!Array.isArray(priorityList)) {
        throw new TypeError("EjectManager.priorityList must be an array");
      }
      const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");

      return Object.freeze(
        priorityList.map((rawResource, index) => {
          const resource = requireRecord(
            rawResource,
            `EjectManager.priorityList[${index}]`,
          );
          const resourceId = requireString(
            resource["id"],
            `EjectManager.priorityList[${index}].id`,
          );
          const settingKey = `res_eject${resourceId}`;
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
