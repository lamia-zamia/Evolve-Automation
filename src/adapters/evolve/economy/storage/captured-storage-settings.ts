/** Captured read/write adapter for the Storage settings surface. */

import {
  createStorageSettingsReadModel,
  type StorageSettingsReadModel,
} from "../../../../domain/economy/storage/storage-settings.ts";
import type { StorageResetContext } from "../../../../domain/settings-defaults.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readStorageResetContext } from "../../captured-settings-defaults.ts";
import { isRecord } from "../../../validation.ts";
import {
  readCapturedStorageSettingsEntries,
  type CapturedStorageSettingsEntry,
} from "./captured-storage-settings-catalog.ts";

import {
  sortByStoredPriority,
  writeDefaultPriorityOrder,
  writeExplicitPriorityOrder,
} from "../../../../domain/settings-priority-order.ts";

export interface CapturedStorageSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedStorageSettingsAdapter {
  readStorageSettingsReadModel(): StorageSettingsReadModel;
  resetPriorities(): void;
  reorderResources(resourceIds: readonly string[]): void;
}

function readCapturedStorageSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
}

function readStorageContext(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
): StorageResetContext {
  return readStorageResetContext(rootState.readRoot(), controls);
}

export function createCapturedStorageSettingsAdapter({
  rootState,
  controls,
  getSettingsRaw,
}: CapturedStorageSettingsDependencies): CapturedStorageSettingsAdapter {
  const readStorageEntriesForSettings =
    (): readonly Readonly<CapturedStorageSettingsEntry>[] =>
      readCapturedStorageSettingsEntries(rootState.readRoot(), controls);

  const readModel = (): StorageSettingsReadModel => {
    const raw = readCapturedStorageSettingsRecord(getSettingsRaw());
    const entries = sortByStoredPriority(
      readStorageEntriesForSettings(),
      raw,
      (entry) => `res_storage_p_${entry.resourceId}`,
    );
    return createStorageSettingsReadModel(
      entries.map((entry) => ({
        id: entry.resourceId,
        label: entry.label,
        enabledSettingName: `res_storage${entry.resourceId}`,
        overflowSettingName: `res_storage_o_${entry.resourceId}`,
        minimumSettingName: `res_min_store${entry.resourceId}`,
        maximumSettingName: `res_max_store${entry.resourceId}`,
      })),
    );
  };

  return Object.freeze({
    readStorageSettingsReadModel: readModel,
    resetPriorities() {
      const raw = readCapturedStorageSettingsRecord(getSettingsRaw());
      const { storableResourceIds } = readStorageContext(rootState, controls);
      writeDefaultPriorityOrder(
        raw,
        storableResourceIds,
        (resourceId) => `res_storage_p_${resourceId}`,
      );
    },
    reorderResources(resourceIds: readonly string[]) {
      writeExplicitPriorityOrder(
        readCapturedStorageSettingsRecord(getSettingsRaw()),
        resourceIds,
        readStorageEntriesForSettings().map((entry) => entry.resourceId),
        (resourceId) => `res_storage_p_${resourceId}`,
      );
    },
  });
}
