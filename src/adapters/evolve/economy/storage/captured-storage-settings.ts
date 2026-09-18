/** Captured read/write adapter for the Storage settings surface. */

import {
  createStorageSettingsReadModel,
  type StorageSettingsReadModel,
} from "../../../../domain/economy/storage/storage-settings.ts";
import { computeStorageDefaults } from "../../../../domain/settings-defaults.ts";
import type { StorageResetContext } from "../../../../domain/settings-defaults.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readStorageResetContext } from "../../captured-settings-defaults.ts";
import { isRecord } from "../../../validation.ts";
import {
  readCapturedStorageSettingsEntries,
  type CapturedStorageSettingsEntry,
} from "./captured-storage-settings-catalog.ts";

export interface CapturedStorageSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedStorageSettingsAdapter {
  readStorageSettingsReadModel(): StorageSettingsReadModel;
  resetToDefaults(): void;
  resetPriorities(): void;
  reorderResources(resourceIds: readonly string[]): void;
}

/** The dynamic override prefixes the lifecycle owns for the storage section. */
const STORAGE_OVERRIDE_PREFIXES: readonly string[] = Object.freeze([
  "res_storage",
  "res_min_store",
  "res_max_store",
  "res_containers_m_",
  "res_crates_m_",
]);

function readCapturedStorageSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
}

function finiteStoragePriority(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sortCapturedStorageEntries(
  entries: readonly Readonly<CapturedStorageSettingsEntry>[],
  raw: Record<string, unknown>,
): readonly Readonly<CapturedStorageSettingsEntry>[] {
  return Object.freeze(
    entries
      .map((entry, index) => ({
        entry,
        index,
        priority: finiteStoragePriority(
          raw[`res_storage_p_${entry.resourceId}`],
          index,
        ),
      }))
      .sort(
        (left, right) =>
          left.priority - right.priority || left.index - right.index,
      )
      .map(({ entry }) => entry),
  );
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
    const entries = sortCapturedStorageEntries(
      readStorageEntriesForSettings(),
      raw,
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
    resetToDefaults() {
      const raw = readCapturedStorageSettingsRecord(getSettingsRaw());
      const defaults = computeStorageDefaults(
        readStorageContext(rootState, controls),
      ).def;
      const overrides = raw["overrides"];
      if (isRecord(overrides) && !Array.isArray(overrides)) {
        for (const key of Object.keys(overrides)) {
          if (
            STORAGE_OVERRIDE_PREFIXES.some((prefix) => key.startsWith(prefix))
          ) {
            delete overrides[key];
          }
        }
      }
      Object.assign(raw, defaults);
    },
    resetPriorities() {
      const raw = readCapturedStorageSettingsRecord(getSettingsRaw());
      const { storableResourceIds } = readStorageContext(rootState, controls);
      storableResourceIds.forEach((resourceId, index) => {
        raw[`res_storage_p_${resourceId}`] = index;
      });
    },
    reorderResources(resourceIds: readonly string[]) {
      const known = new Set(
        readStorageEntriesForSettings().map((entry) => entry.resourceId),
      );
      const raw = readCapturedStorageSettingsRecord(getSettingsRaw());
      resourceIds.forEach((resourceId: string, index: number) => {
        if (known.has(resourceId)) raw[`res_storage_p_${resourceId}`] = index;
      });
    },
  });
}
