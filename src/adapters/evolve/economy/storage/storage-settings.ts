import {
  createStorageSettingsReadModel,
  type StorageSettingsReadModel,
  type StorageSettingsRow,
} from "../../../../domain/economy/storage/storage-settings.ts";
import {
  requireFunction,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../../validation.ts";

interface StorageSettingsEvolveDependencies {
  readonly getStorageManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

export interface StorageSettingsEvolveAdapter {
  readStorageSettingsReadModel(): StorageSettingsReadModel;
  reorderResources(resourceIds: readonly string[]): void;
}

function readPriorityList(manager: UnknownRecord): readonly UnknownRecord[] {
  const priorityList = manager["priorityList"];
  if (!Array.isArray(priorityList)) {
    throw new TypeError("StorageManager.priorityList must be an array");
  }
  return priorityList.map((resource, index) =>
    requireRecord(resource, `StorageManager.priorityList[${index}]`),
  );
}

/** Maps the volatile Evolve storage manager and priority settings. */
export function createStorageSettingsEvolveAdapter({
  getStorageManager,
  getSettingsRaw,
}: StorageSettingsEvolveDependencies): StorageSettingsEvolveAdapter {
  function readStorageSettingsReadModel(): StorageSettingsReadModel {
    const manager = requireRecord(getStorageManager(), "StorageManager");
    const rows: StorageSettingsRow[] = readPriorityList(manager).map(
      (resource, index) => {
        const id = requireString(
          resource["id"],
          `StorageManager.priorityList[${index}].id`,
        );
        return {
          id,
          label: requireString(
            resource["name"],
            `StorageManager.priorityList[${index}].name`,
          ),
          enabledSettingName: `res_storage${id}`,
          overflowSettingName: `res_storage_o_${id}`,
          minimumSettingName: `res_min_store${id}`,
          maximumSettingName: `res_max_store${id}`,
        };
      },
    );

    return createStorageSettingsReadModel(rows);
  }

  function reorderResources(resourceIds: readonly string[]): void {
    const manager = requireRecord(getStorageManager(), "StorageManager");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const sortByPriority = requireFunction(
      manager["sortByPriority"],
      "StorageManager.sortByPriority",
    );

    resourceIds.forEach((resourceId, index) => {
      const id = requireString(resourceId, `resourceIds[${index}]`);
      settingsRaw[`res_storage_p_${id}`] = index;
    });
    Reflect.apply(sortByPriority, manager, []);
  }

  return Object.freeze({
    readStorageSettingsReadModel,
    reorderResources,
  });
}
