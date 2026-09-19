/** Captured read/write adapter for the A.R.P.A. project settings surface. */

import {
  createProjectSettingsReadModel,
  type ProjectSettingsReadModel,
} from "../../../../domain/progression/research/project-settings.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord } from "../../../validation.ts";
import {
  readCapturedProjectSettingsEntries,
  type CapturedProjectSettingsEntry,
} from "./captured-project-settings-catalog.ts";

import {
  sortByStoredPriority,
  writeDefaultPriorityOrder,
  writeExplicitPriorityOrder,
} from "../../../../domain/settings-priority-order.ts";

export interface CapturedProjectSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedProjectSettingsAdapter {
  readProjectSettingsReadModel(): ProjectSettingsReadModel;
  resetPriorities(): void;
  reorderProjects(projectIds: readonly string[]): void;
}

function readCapturedProjectSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
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
    const entries = sortByStoredPriority(
      readProjectEntriesForSettings(),
      raw,
      (entry) => `arpa_p_${entry.projectId}`,
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
    resetPriorities() {
      writeDefaultPriorityOrder(
        readCapturedProjectSettingsRecord(getSettingsRaw()),
        readProjectEntriesForSettings().map((entry) => entry.projectId),
        (projectId) => `arpa_p_${projectId}`,
      );
    },
    reorderProjects(projectIds: readonly string[]) {
      writeExplicitPriorityOrder(
        readCapturedProjectSettingsRecord(getSettingsRaw()),
        projectIds,
        readProjectEntriesForSettings().map((entry) => entry.projectId),
        (projectId) => `arpa_p_${projectId}`,
      );
    },
  });
}
