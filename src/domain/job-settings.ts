/** Immutable description of the Jobs settings panel. */
export type JobSettingsControl = Readonly<{
  kind: "number" | "toggle";
  settingName: string;
  label: string;
  hint: string;
}>;

export type JobSettingsBreakpoint =
  | Readonly<{ kind: "managed" }>
  | Readonly<{ kind: "weighted" }>
  | Readonly<{ kind: "input"; settingName: string }>;

export interface JobSettingsRow {
  readonly id: string;
  readonly label: string;
  readonly color: "warning" | "danger" | "info" | "advanced";
  readonly enabledSettingName: string;
  readonly enabled: boolean;
  readonly hasOverride: boolean;
  readonly breakpoints: readonly [
    JobSettingsBreakpoint,
    JobSettingsBreakpoint,
    JobSettingsBreakpoint,
  ];
  readonly smartSettingName?: string;
}

export interface JobSettingsReadModel {
  readonly sectionId: "job";
  readonly sectionName: "Job";
  readonly controls: readonly JobSettingsControl[];
  readonly rows: readonly JobSettingsRow[];
}

export type JobSettingsIntent =
  | Readonly<{ type: "reset-job-settings" }>
  | Readonly<{ type: "reset-job-priorities" }>
  | Readonly<{ type: "reorder-jobs"; jobIds: readonly string[] }>;

function freezeBreakpoint(
  breakpoint: JobSettingsBreakpoint,
): JobSettingsBreakpoint {
  return Object.freeze({ ...breakpoint });
}

function freezeRow(row: JobSettingsRow): JobSettingsRow {
  return Object.freeze({
    ...row,
    breakpoints: Object.freeze(
      row.breakpoints.map(freezeBreakpoint) as [
        JobSettingsBreakpoint,
        JobSettingsBreakpoint,
        JobSettingsBreakpoint,
      ],
    ),
  });
}

/** Build the Jobs panel model from the current validated manager order. */
export function createJobSettingsReadModel({
  rows,
}: {
  readonly rows: readonly JobSettingsRow[];
}): JobSettingsReadModel {
  return Object.freeze({
    sectionId: "job",
    sectionName: "Job",
    controls: Object.freeze([
      Object.freeze({
        kind: "toggle",
        settingName: "jobSetDefault",
        label: "Set default job",
        hint: "Automatically sets the default job in order of Quarry Worker -> Lumberjack -> Crystal Miner -> Scavenger -> Hunter -> Farmer -> Unemployed",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "jobManageServants",
        label: "Manage Servants",
        hint: "Automatically manage servants, they will be used as substitute of regular workers, sharing same breakpoints and priorities, i.e. for breakpoint 10 script might assign 8 workers and 2 servants, and such.",
      }),
      Object.freeze({
        kind: "number",
        settingName: "jobLumberWeighting",
        label: "Final Lumberjack Weighting",
        hint: "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
      }),
      Object.freeze({
        kind: "number",
        settingName: "jobQuarryWeighting",
        label: "Final Quarry Worker Weighting",
        hint: "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
      }),
      Object.freeze({
        kind: "number",
        settingName: "jobCrystalWeighting",
        label: "Final Crystal Miner Weighting",
        hint: "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
      }),
      Object.freeze({
        kind: "number",
        settingName: "jobScavengerWeighting",
        label: "Final Scavenger Weighting",
        hint: "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
      }),
      Object.freeze({
        kind: "number",
        settingName: "jobRaiderWeighting",
        label: "Final Raider Weighting",
        hint: "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
      }),
      Object.freeze({
        kind: "number",
        settingName: "jobForagerWeighting",
        label: "Final Forager Weighting",
        hint: "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "jobDisableMiners",
        label: "Disable miners in Andromeda",
        hint: "Disable Miners and Coal Miners after reaching Andromeda",
      }),
    ]),
    rows: Object.freeze(rows.map(freezeRow)),
  });
}
