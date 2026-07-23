/** Immutable description of the A.R.P.A. project settings table. */
export interface ProjectSettingsRow {
  readonly id: string;
  readonly label: string;
  readonly enabledSettingName: string;
  readonly maximumSettingName: string;
  readonly weightingSettingName: string;
}

export interface ProjectSettingsReadModel {
  readonly sectionId: "project";
  readonly sectionName: "A.R.P.A.";
  readonly rows: readonly ProjectSettingsRow[];
}

export type ProjectSettingsIntent =
  | Readonly<{
      type: "reset-project-settings";
    }>
  | Readonly<{
      type: "reorder-projects";
      projectIds: readonly string[];
    }>;

function freezeRow(row: ProjectSettingsRow): ProjectSettingsRow {
  return Object.freeze({ ...row });
}

/** Build the project table model from the current Evolve priority list. */
export function createProjectSettingsReadModel(
  rows: readonly ProjectSettingsRow[],
): ProjectSettingsReadModel {
  return Object.freeze({
    sectionId: "project",
    sectionName: "A.R.P.A.",
    rows: Object.freeze(rows.map(freezeRow)),
  });
}
