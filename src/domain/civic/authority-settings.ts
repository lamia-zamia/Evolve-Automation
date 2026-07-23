/** Immutable description of the Authority settings panel. */
export interface AuthoritySettingsControl {
  readonly kind: "toggle" | "number";
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export interface AuthoritySettingsReadModel {
  readonly sectionId: "authority";
  readonly sectionName: "Authority";
  readonly controls: readonly AuthoritySettingsControl[];
}

export type AuthoritySettingsIntent = Readonly<{
  type: "reset-authority-settings";
}>;

const authoritySettingsReadModel: AuthoritySettingsReadModel = Object.freeze({
  sectionId: "authority",
  sectionName: "Authority",
  controls: Object.freeze([
    Object.freeze({
      kind: "toggle",
      settingName: "authorityManage",
      label: "Manage Authority",
      hint: "Global switch for Authority automation. Controls morale capping, home and Hell soldier reserves, outer-fleet crew protection, and Authority-cap building weighting.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "generalMinimumAuthority",
      label: "Target Authority",
      hint: "Evil universe only. Authority below 100 causes a global production penalty of 0.35% per point. Set to -1 to target the current Authority maximum, or 0 to disable target-based management while leaving the global switch on.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "generalAuthorityMinPatrolPercent",
      label: "Minimum Hell patrol percentage",
      hint: "Only applies when Target Authority is -1. Reserves at least this percentage of available Hell soldiers for patrols and Soul Gem income before stationing the rest for Authority.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "buildingWeightingAuthority",
      label: "Authority-cap building multiplier",
      hint: "AutoBuild weighting multiplier for buildings that raise the Authority cap while it is below the configured target.",
    }),
  ]),
});

export function getAuthoritySettingsReadModel(): AuthoritySettingsReadModel {
  return authoritySettingsReadModel;
}
