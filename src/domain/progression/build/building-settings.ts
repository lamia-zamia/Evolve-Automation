/** Immutable description of the Building settings panel. */
export type BuildingSettingsControl =
  | Readonly<{
      kind: "toggle" | "number";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "select";
      settingName: string;
      label: string;
      hint: string;
      options: readonly BuildingSettingsSelectOption[];
    }>;

export interface BuildingSettingsSelectOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

export interface BuildingSettingsRow {
  readonly id: string;
  readonly label: string;
  readonly color:
    | "has-text-danger"
    | "has-text-advanced"
    | "has-text-special"
    | "has-text-warning"
    | "has-text-info";
  readonly autoBuildSettingName: string;
  readonly maximumSettingName: string;
  readonly weightingSettingName: string;
  readonly stateSettingName?: string;
  readonly stateEnabled?: boolean;
  readonly smartSettingName?: string;
  readonly smartEnabled?: boolean;
  readonly smartLinkedIds?: readonly string[];
  readonly hasStateOverride: boolean;
  readonly hasSmartOverride: boolean;
}

export interface BuildingSettingsReadModel {
  readonly sectionId: "building";
  readonly sectionName: "Building";
  readonly controls: readonly BuildingSettingsControl[];
  readonly rows: readonly BuildingSettingsRow[];
  readonly allEnabled: boolean;
  readonly allState: boolean;
  readonly overrideKey: string;
}

export type BuildingSettingsIntent =
  | Readonly<{ type: "reset-building-settings" }>
  | Readonly<{ type: "reset-building-priorities" }>
  | Readonly<{ type: "reorder-buildings"; buildingIds: readonly string[] }>
  | Readonly<{ type: "set-all-autobuild"; enabled: boolean }>
  | Readonly<{ type: "set-all-autopower"; enabled: boolean }>
  | Readonly<{
      type: "set-linked-smart-state";
      buildingIds: readonly string[];
      enabled: boolean;
    }>;

function freezeRow(row: BuildingSettingsRow): BuildingSettingsRow {
  return Object.freeze({
    ...row,
    ...(row.smartLinkedIds
      ? { smartLinkedIds: Object.freeze([...row.smartLinkedIds]) }
      : {}),
  });
}

const buildingSettingsControls: readonly BuildingSettingsControl[] =
  Object.freeze([
    Object.freeze({
      kind: "toggle",
      settingName: "buildingsIgnoreZeroRate",
      label: "Do not wait for resources without income",
      hint: "Weighting checks will ignore resources without positive income(craftables, inactive factory goods, etc), buildings with such resources will not delay other buildings.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "buildingsLimitPowered",
      label: "Limit amount of powered buildings",
      hint: "With this option enabled Max Build will prevent powering extra building. Can be useful to disable buildings with overrided settings.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "buildingsTransportGem",
      label: "Build cheapest Supplies transport",
      hint: "By default script chooses between Lake Transport and Lake Bireme Warship comparing their 'Supplies Per Support', with this option enabled it will compare 'Supplies Per Soulgems' instead.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "buildingsBestFreighter",
      label: "Build most efficient freighters",
      hint: "With this option enabled the script will compare 'Money Storage per Crew' of Freighter and Super Freighter, and only build the best one. Without this option no restrictions will be applied. Works only when both ships are buildable.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "buildingsUseMultiClick",
      label: "Bulk build multi-segmented buildings",
      hint: "With this option enabled, the script will build as many segments as are affordable at once, instead of one per tick.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "buildingTowerSuppression",
      label: "Minimum suppression for Towers",
      hint: "East Tower and West Tower won't be built until minimum suppression is reached",
    }),
    Object.freeze({
      kind: "select",
      settingName: "buildingConsumptionCheck",
      label: "Behavior when building support/upkeep-using building",
      hint: "By default, the script only buys one building with support or upkeep requirement per tick, to allow automatic weightings to work optimally.",
      options: Object.freeze([
        Object.freeze({
          val: "onePerTick",
          label: "Default",
          hint: "Script will stop building buildings for one tick after buying building with support/upkeep. (Example: 1 Living Quarters stops processing of all buildings until next script tick.)",
        }),
        Object.freeze({
          val: "perResource",
          label: "Non-conflicting only",
          hint: "During a tick, the script will only buy at most one building using a given support/upkeep type, but non-conflicting ones are allowed. Should be safe in most cases. (Example: 1 Living Quarters stops building the other buildings using Red Planet support for that tick, but it can still build on other planets.)",
        }),
        Object.freeze({
          val: "unlimited",
          label: "Unlimited",
          hint: "Do not pay attention to support/upkeep requirements. This will cause bugs and undesirable behavior as it can easily exceed the maximum support. But, at extremely high prestige levels, this may be required. (Example: Can buy 1 Living Quarters + 1 Mine + 1 Fabrication + 1 Biodome in a single tick even if there is only 2 support left.)",
        }),
      ]),
    }),
  ]);

/** Build the Building panel model from the current validated manager order. */
export function createBuildingSettingsReadModel({
  rows,
  allEnabled,
  allState,
  overrideKey,
}: {
  readonly rows: readonly BuildingSettingsRow[];
  readonly allEnabled: boolean;
  readonly allState: boolean;
  readonly overrideKey: string;
}): BuildingSettingsReadModel {
  return Object.freeze({
    sectionId: "building",
    sectionName: "Building",
    controls: buildingSettingsControls,
    rows: Object.freeze(rows.map(freezeRow)),
    allEnabled,
    allState,
    overrideKey,
  });
}
