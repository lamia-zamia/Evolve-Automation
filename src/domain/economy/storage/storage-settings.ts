/** Immutable description of the Storage settings panel. */
export interface StorageSettingsControl {
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export interface StorageSettingsRow {
  readonly id: string;
  readonly label: string;
  readonly enabledSettingName: string;
  readonly overflowSettingName: string;
  readonly minimumSettingName: string;
  readonly maximumSettingName: string;
}

export interface StorageSettingsReadModel {
  readonly sectionId: "storage";
  readonly sectionName: "Storage";
  readonly controls: readonly StorageSettingsControl[];
  readonly rows: readonly StorageSettingsRow[];
}

export type StorageSettingsIntent =
  | Readonly<{
      type: "reset-storage-settings";
    }>
  | Readonly<{
      type: "reorder-storage-resources";
      resourceIds: readonly string[];
    }>;

function freezeRow(row: StorageSettingsRow): StorageSettingsRow {
  return Object.freeze({ ...row });
}

/** Build the storage panel model from the current Evolve priority list. */
export function createStorageSettingsReadModel(
  rows: readonly StorageSettingsRow[],
): StorageSettingsReadModel {
  return Object.freeze({
    sectionId: "storage",
    sectionName: "Storage",
    controls: Object.freeze([
      Object.freeze({
        settingName: "storageLimitPreMad",
        label: "Limit Pre-MAD Storage",
        hint: "Saves resources and shortens run time by limiting storage pre-MAD",
      }),
      Object.freeze({
        settingName: "storageSafeReassign",
        label: "Reassign only empty storages",
        hint: "Wait until storage is empty before reassigning containers to another resource, to prevent overflowing and wasting resources",
      }),
      Object.freeze({
        settingName: "storageAssignExtra",
        label: "Assign buffer storage",
        hint: "Assigns 3% extra strorage above required amounts, ensuring that required quantity will be actually reached, even if other part of script trying to sell\\eject\\switch production, etc. When manual trades enabled applies additional adjust derieved from selling threshold.",
      }),
      Object.freeze({
        settingName: "storageAssignPart",
        label: "Assign partial storage",
        hint: "When enabled script will be allowed to assign some crates and containers even if resulting storage space won't be enough to build new building. It allows to pre-build stock of resources for further use, but can be potentially dungerous.\nIf script not allowed to reassign non-empty storage it can lock storage in position when stored resources can't be used.\nIf script is allowed to reassign non-empty storage it might waste time producing materials which might need to be disposed.",
      }),
    ]),
    rows: Object.freeze(rows.map(freezeRow)),
  });
}
