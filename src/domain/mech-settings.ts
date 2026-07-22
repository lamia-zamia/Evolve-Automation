/** Immutable description of the Mech & Spire settings panel. */
export interface MechSettingsOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}
export type MechSettingsControl =
  | Readonly<{ kind: "header"; label: string }>
  | Readonly<{
      kind: "select";
      settingName: string;
      label: string;
      hint: string;
      options: readonly MechSettingsOption[];
    }>
  | Readonly<{
      kind: "number";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>;
export interface MechSettingsReadModel {
  readonly sectionId: "mech";
  readonly sectionName: "Mech & Spire";
  readonly controls: readonly MechSettingsControl[];
}
export type MechSettingsIntent = Readonly<{ type: "reset-mech-settings" }>;

const scrapOptions: readonly MechSettingsOption[] = Object.freeze([
  Object.freeze({
    val: "none",
    label: "None",
    hint: "Nothing will be scrapped automatically",
  }),
  Object.freeze({
    val: "single",
    label: "Full bay",
    hint: "Scrap mechs only when mech bay is full, and script need more room to build mechs",
  }),
  Object.freeze({
    val: "all",
    label: "All inefficient",
    hint: "Scrap all inefficient mechs immediately, using refounded resources to build better ones",
  }),
  Object.freeze({
    val: "mixed",
    label: "Excess inefficient",
    hint: "Scrap as much inefficient mechs as possible, trying to preserve just enough of old mechs to fill bay to max by the time when next floor will be reached, calculating threshold based on progress speed and resources incomes",
  }),
]);
const buildOptions: readonly MechSettingsOption[] = Object.freeze([
  Object.freeze({
    val: "none",
    label: "None",
    hint: "Nothing will be build automatically",
  }),
  Object.freeze({
    val: "random",
    label: "Random good",
    hint: "Build random mech with size chosen below, and best possible efficiency",
  }),
  Object.freeze({
    val: "user",
    label: "Current design",
    hint: "Build whatever currently set in Mech Lab",
  }),
]);
const specialOptions: readonly MechSettingsOption[] = Object.freeze([
  Object.freeze({
    val: "always",
    label: "Always",
    hint: "Add special equipment to all mechs",
  }),
  Object.freeze({
    val: "prefered",
    label: "Preferred",
    hint: "Add special equipment when it doesn't reduce efficiency for current floor",
  }),
  Object.freeze({
    val: "random",
    label: "Random",
    hint: "Special equipment will have same chance to be added as all others",
  }),
  Object.freeze({
    val: "never",
    label: "Never",
    hint: "Never add special equipment",
  }),
]);

export function createMechSettingsReadModel(
  sizeOptions: readonly MechSettingsOption[],
): MechSettingsReadModel {
  const controls: readonly MechSettingsControl[] = Object.freeze([
    Object.freeze({
      kind: "select",
      settingName: "mechScrap",
      label: "Scrap mechs",
      hint: "Configures what will be scrapped. Infernal mechs won't ever be scrapped.",
      options: scrapOptions,
    }),
    Object.freeze({
      kind: "number",
      settingName: "mechScrapEfficiency",
      label: "Scrap efficiency",
      hint: "Scrap mechs only when '((OldMechRefund / NewMechCost) / (OldMechDamage / NewMechDamage))' more than given number.\u000aFor the cases when exchanged mechs have same size(1/3 refund) it means that with 1 eff. script allowed to scrap mechs under 33.3%. 1.5 eff. - under 22.2%, 2 eff. - under 16.6%, 0.5 eff. - under 66.6%, 0 eff. - under 100%, etc.\u000aEfficiency below '1' is not recommended, unless scrap set to 'Full bay', as it's a breakpoint when refunded resources can immidiately compensate lost damage, resulting with best damage growth rate.\u000aEfficiency above '1' is useful to save resources for more desperate times, or to compensate low soul gems income.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "mechCollectorValue",
      label: "Collector value",
      hint: "Collectors can't be directly compared with combat mechs, having no firepower. Script will assume that one collector/size is equal to this amount of scout/size. If you feel that script is too reluctant to scrap old collectors - you can decrease this value. Or increase, to make them more persistant. 1 value - 50% collector equial to 50% scout, 0.5 value - 50% collector equial to 25% scout, 2 value - 50% collector equial to 100% scout, etc.",
    }),
    Object.freeze({
      kind: "select",
      settingName: "mechBuild",
      label: "Build mechs",
      hint: "Configures what will be built. Infernal mechs won't ever be built.",
      options: buildOptions,
    }),
    Object.freeze({
      kind: "select",
      settingName: "mechSize",
      label: "Preferred mech size",
      hint: "Size of random mechs",
      options: sizeOptions,
    }),
    Object.freeze({
      kind: "select",
      settingName: "mechSizeGravity",
      label: "Gravity mech size",
      hint: "Override preferred size with this on floors with high gravity",
      options: sizeOptions,
    }),
    Object.freeze({
      kind: "select",
      settingName: "mechSpecial",
      label: "Special mechs",
      hint: "Configures special equip",
      options: specialOptions,
    }),
    Object.freeze({
      kind: "number",
      settingName: "mechWaygatePotential",
      label: "Maximum mech potential for Waygate",
      hint: "Fight Demon Lord only when current mech team potential below given amount. Full bay of best mechs will have `1` potential. Damage against Demon Lord does not affected by floor modifiers, all mechs always does 100% damage to him. Thus it's most time-efficient to fight him at times when mechs can't make good progress against regular monsters, and waiting for rebuilding. Auto Power needs to be on for this to work.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "mechMinSupply",
      label: "Minimum supply income",
      hint: "Build collectors if current supply income below given number",
    }),
    Object.freeze({
      kind: "number",
      settingName: "mechMaxCollectors",
      label: "Maximum collectors ratio",
      hint: "Limiter for above option, maximum space used by collectors. 0.5 means up to 50% of total bay capacity will be dedicated to collectors, and such.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "mechSaveSupplyRatio",
      label: "Save up supplies for next floor",
      hint: "Ratio of supplies to save up for next floor. Script will stop spending supplies on new mechs when it estimates that by the time when floor will be cleared you'll be under this supply ratio. That allows build bunch of new mechs suited for next enemy right after entering new floor. With 1 value script will try to start new floors with full supplies, 0.5 - with half, 0 - any, effectively disabling this option, etc.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "mechScouts",
      label: "Minimum scouts ratio",
      hint: "Scouts compensate terrain penalty of suboptimal mechs. Build them up to this ratio.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "mechInfernalCollector",
      label: "Build infernal collectors",
      hint: "Infernal collectors have incresed supply cost, and payback time, but becomes more profitable after ~30 minutes of uptime.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "mechScoutsRebuild",
      label: "Rebuild scouts",
      hint: "Scouts provides full bonus to other mechs even being infficient, this option prevent rebuilding them saving resources.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "mechFillBay",
      label: "Build smaller mechs when preferred not available",
      hint: "Build smaller mechs when preferred size can't be used due to low remaining bay space, or supplies cap",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "buildingMechsFirst",
      label: "Build spire buildings only with full bay",
      hint: "Fill mech bays up to current limit before spending resources on additional spire buildings",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "mechBaysFirst",
      label: "Scrap mechs only after building maximum bays",
      hint: "Scrap old mechs only when no new bays and purifiers can be builded",
    }),
    Object.freeze({ kind: "header", label: "Mech Stats" }),
  ]);
  return Object.freeze({
    sectionId: "mech",
    sectionName: "Mech & Spire",
    controls,
  });
}
