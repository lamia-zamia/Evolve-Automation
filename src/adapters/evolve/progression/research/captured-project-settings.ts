/** Captured read/write adapter for the A.R.P.A. project settings surface. */

import {
  createProjectSettingsReadModel,
  type ProjectSettingsReadModel,
} from "../../../../domain/progression/research/project-settings.ts";
import { computeProjectDefaults } from "../../../../domain/settings-defaults.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { projectIdByKey } from "../../captured-settings-defaults.ts";
import { isRecord } from "../../../validation.ts";
import {
  readCapturedProjectSettingsEntries,
  type CapturedProjectSettingsEntry,
} from "./captured-project-settings-catalog.ts";

export interface CapturedProjectSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedProjectSettingsAdapter {
  readProjectSettingsReadModel(): ProjectSettingsReadModel;
  resetToDefaults(): void;
  resetPriorities(): void;
  reorderProjects(projectIds: readonly string[]): void;
}

function readCapturedProjectSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
}

function finiteProjectPriority(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sortCapturedProjectEntries(
  entries: readonly Readonly<CapturedProjectSettingsEntry>[],
  raw: Record<string, unknown>,
): readonly Readonly<CapturedProjectSettingsEntry>[] {
  return Object.freeze(
    entries
      .map((entry, index) => ({
        entry,
        index,
        priority: finiteProjectPriority(
          raw[`arpa_p_${entry.projectId}`],
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

export function createCapturedProjectSettingsAdapter({
  rootState,
  controls,
  getSettingsRaw,
}: CapturedProjectSettingsDependencies): CapturedProjectSettingsAdapter {
  const readProjectEntriesForSettings =
    (): readonly Readonly<CapturedProjectSettingsEntry>[] =>
      readCapturedProjectSettingsEntries(rootState.readRoot(), controls);

  const readModel = (): ProjectSettingsReadModel => {
    const raw = readCapturedProjectSettingsRecord(getSettingsRaw());
    const entries = sortCapturedProjectEntries(
      readProjectEntriesForSettings(),
      raw,
    );
    return createProjectSettingsReadModel(
      entries.map((entry) => ({
        id: entry.projectId,
        label: entry.label,
        enabledSettingName: `arpa_${entry.projectId}`,
        maximumSettingName: `arpa_m_${entry.projectId}`,
        weightingSettingName: `arpa_w_${entry.projectId}`,
      })),
    );
  };

  return Object.freeze({
    readProjectSettingsReadModel: readModel,
    resetToDefaults() {
      const raw = readCapturedProjectSettingsRecord(getSettingsRaw());
      const entries = readProjectEntriesForSettings();
      const defaults = computeProjectDefaults({
        projectIds: entries.map((entry) => entry.projectId),
        idByKey: projectIdByKey(entries.map((entry) => entry.projectId)),
      }).def;
      const overrides = raw["overrides"];
      if (isRecord(overrides) && !Array.isArray(overrides)) {
        for (const key of Object.keys(overrides)) {
          if (key.startsWith("arpa_")) delete overrides[key];
        }
      }
      Object.assign(raw, defaults);
    },
    resetPriorities() {
      const raw = readCapturedProjectSettingsRecord(getSettingsRaw());
      readProjectEntriesForSettings().forEach((entry, index) => {
        raw[`arpa_p_${entry.projectId}`] = index;
      });
    },
    reorderProjects(projectIds: readonly string[]) {
      const known = new Set(
        readProjectEntriesForSettings().map((entry) => entry.projectId),
      );
      const raw = readCapturedProjectSettingsRecord(getSettingsRaw());
      projectIds.forEach((projectId: string, index: number) => {
        if (known.has(projectId)) raw[`arpa_p_${projectId}`] = index;
      });
    },
  });
}
