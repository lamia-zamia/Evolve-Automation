import { requireRecord } from "../../../validation.ts";
import type { ArpaToggleItem } from "../../../../domain/progression/research/arpa-toggles.ts";
import type { ArpaToggleReader } from "../../../../ports/arpa-toggles.ts";

export interface ArpaToggleEvolveDependencies {
  readonly getProjectManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

/** Evolve adapter for the ordered ProjectManager projects and their persisted toggles. */
export function createArpaToggleEvolveAdapter({
  getProjectManager,
  getSettingsRaw,
}: ArpaToggleEvolveDependencies): ArpaToggleReader {
  return Object.freeze({
    readItems(): readonly ArpaToggleItem[] {
      const manager = requireRecord(getProjectManager(), "ProjectManager");
      const priorityList = manager["priorityList"];
      if (!Array.isArray(priorityList)) {
        throw new TypeError("ProjectManager.priorityList must be an array");
      }
      const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");

      return Object.freeze(
        priorityList.map((rawProject, index) => {
          const project = requireRecord(
            rawProject,
            `ProjectManager.priorityList[${index}]`,
          );
          const projectId = requireString(
            project["id"],
            `ProjectManager.priorityList[${index}].id`,
          );
          const settingKey = `arpa_${projectId}`;
          return Object.freeze({
            projectId,
            settingKey,
            // Evolve leaves per-project toggles absent until first written; legacy treated absence as disabled.
            enabled: Boolean(settingsRaw[settingKey]),
          });
        }),
      );
    },
  });
}
