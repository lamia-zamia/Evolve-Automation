import {
  createProjectSettingsReadModel,
  type ProjectSettingsReadModel,
  type ProjectSettingsRow,
} from "../../domain/project-settings.ts";
import {
  requireFunction,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

interface ProjectSettingsEvolveDependencies {
  readonly getProjectManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

export interface ProjectSettingsEvolveAdapter {
  readProjectSettingsReadModel(): ProjectSettingsReadModel;
  reorderProjects(projectIds: readonly string[]): void;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function readPriorityList(manager: UnknownRecord): readonly UnknownRecord[] {
  const priorityList = manager["priorityList"];
  if (!Array.isArray(priorityList)) {
    throw new TypeError("ProjectManager.priorityList must be an array");
  }
  return priorityList.map((project, index) =>
    requireRecord(project, `ProjectManager.priorityList[${index}]`),
  );
}

/** Maps the volatile Evolve project manager and priority settings. */
export function createProjectSettingsEvolveAdapter({
  getProjectManager,
  getSettingsRaw,
}: ProjectSettingsEvolveDependencies): ProjectSettingsEvolveAdapter {
  function readProjectSettingsReadModel(): ProjectSettingsReadModel {
    const manager = requireRecord(getProjectManager(), "ProjectManager");
    const rows: ProjectSettingsRow[] = readPriorityList(manager).map(
      (project, index) => {
        const id = requireString(
          project["id"],
          `ProjectManager.priorityList[${index}].id`,
        );
        return {
          id,
          label: requireString(
            project["name"],
            `ProjectManager.priorityList[${index}].name`,
          ),
          enabledSettingName: `arpa_${id}`,
          maximumSettingName: `arpa_m_${id}`,
          weightingSettingName: `arpa_w_${id}`,
        };
      },
    );

    return createProjectSettingsReadModel(rows);
  }

  function reorderProjects(projectIds: readonly string[]): void {
    const manager = requireRecord(getProjectManager(), "ProjectManager");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const sortByPriority = requireFunction(
      manager["sortByPriority"],
      "ProjectManager.sortByPriority",
    );

    projectIds.forEach((projectId, index) => {
      const id = requireString(projectId, `projectIds[${index}]`);
      settingsRaw[`arpa_p_${id}`] = index;
    });
    Reflect.apply(sortByPriority, manager, []);
  }

  return Object.freeze({ readProjectSettingsReadModel, reorderProjects });
}
