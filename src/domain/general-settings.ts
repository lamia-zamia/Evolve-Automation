/** Immutable description of the General settings panel. */
export interface GeneralSettingsOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

interface GeneralSettingsControlBase {
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export type GeneralSettingsControl =
  | (GeneralSettingsControlBase & { readonly kind: "toggle" })
  | (GeneralSettingsControlBase & { readonly kind: "number" })
  | (GeneralSettingsControlBase & { readonly kind: "string" })
  | (GeneralSettingsControlBase & {
      readonly kind: "select";
      readonly options: readonly GeneralSettingsOption[];
    })
  | Readonly<{ kind: "header"; label: string }>;

export interface GeneralSettingsReadModel {
  readonly sectionId: "general";
  readonly sectionName: "General";
  readonly controls: readonly GeneralSettingsControl[];
}

export type GeneralSettingsIntent = Readonly<{
  type: "reset-general-settings";
}>;

const priorityOptions: readonly GeneralSettingsOption[] = Object.freeze([
  Object.freeze({ val: "ignore", label: "Ignore", hint: "Does nothing" }),
  Object.freeze({
    val: "save",
    label: "Save",
    hint: "Missing resources preserved from using.",
  }),
  Object.freeze({
    val: "req",
    label: "Request",
    hint: "Production and buying of missing resources will be prioritized.",
  }),
  Object.freeze({
    val: "savereq",
    label: "Request & Save",
    hint: "Missing resources will be prioritized, and preserved from using.",
  }),
]);

const generalSettingsReadModel: GeneralSettingsReadModel = Object.freeze({
  sectionId: "general",
  sectionName: "General",
  controls: Object.freeze([
    Object.freeze({
      kind: "number",
      settingName: "tickRate",
      label: "Script tick rate",
      hint: "Script runs once per this amount of game ticks. Game tick every 250ms, thus with rate 4 script will run once per second. You can set it lower to make script act faster, or increase it if you have performance issues. Tick rate should be a positive integer.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "tickSchedule",
      label: "Schedule script ticks",
      hint: "When enabled script will schedule its ticks to run after game ticks, instead of executing both at once. Splitting of long task allows browser to update UI in between of game and script ticks, making game run smoother, but less throttling-proof - that can make tick rate float inconsistently.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "exposeGating",
      label: "Skip the game's debug refresh between script ticks",
      hint: "The game deep-copies its whole state every game tick so the script can read it, which the script only needs on the ticks it actually works. When enabled the copy is skipped on the other ticks, saving a few percent of the game's main-thread time at a higher tick rate. Anything else reading the game's debug data - another script, or the browser console - sees data up to one script tick old.",
    }),
    Object.freeze({ kind: "header", label: "Prioritization" }),
    Object.freeze({
      kind: "toggle",
      settingName: "useDemanded",
      label: "Allow using prioritized resources for crafting",
      hint: "When disabled script won't make craftables out of prioritized resources in foundry and factory.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "researchRequest",
      label: "Prioritize resources for Pre-MAD researches",
      hint: "Readjust trade routes and production to resources required for unlocked and affordable researches. Works only with no active triggers, or queue. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoMine, autoExtractor, autoSmelter).",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "researchRequestSpace",
      label: "Prioritize resources for Space+ researches",
      hint: "Readjust trade routes and production to resources required for unlocked and affordable researches. Works only with no active triggers, or queue. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoMine, autoExtractor, autoSmelter).",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "missionRequest",
      label: "Prioritize resources for missions",
      hint: "Readjust trade routes and production to resources required for unlocked and affordable missions. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoMine, autoExtractor, autoSmelter).",
    }),
    Object.freeze({
      kind: "select",
      settingName: "prioritizeQueue",
      label: "Queue",
      hint: "Alter script behaviour to speed up queued items, prioritizing missing resources.",
      options: priorityOptions,
    }),
    Object.freeze({
      kind: "select",
      settingName: "prioritizeTriggers",
      label: "Triggers",
      hint: "Alter script behaviour to speed up triggers, prioritizing missing resources.",
      options: priorityOptions,
    }),
    Object.freeze({
      kind: "select",
      settingName: "prioritizeUnify",
      label: "Unification",
      hint: "Alter script behaviour to speed up unification, prioritizing money required to purchase foreign cities.",
      options: priorityOptions,
    }),
    Object.freeze({
      kind: "select",
      settingName: "prioritizeOuterFleet",
      label: "Ship Yard Blueprint (The True Path)",
      hint: "Alter script behaviour to assist fleet building, prioritizing resources required for current design of ship.",
      options: priorityOptions,
    }),
    Object.freeze({ kind: "header", label: "Auto clicker" }),
    Object.freeze({
      kind: "toggle",
      settingName: "buildingAlwaysClick",
      label: "Always autoclick resources",
      hint: "By default script will click only during early stage of autoBuild, to bootstrap production. With this toggled on it will continue clicking forever",
    }),
    Object.freeze({
      kind: "number",
      settingName: "buildingClickPerTick",
      label: "Maximum clicks per tick",
      hint: "Number of clicks performed at once, each script tick. Will not ever click more than needed to fill storage.",
    }),
    Object.freeze({ kind: "header", label: "Misc" }),
    Object.freeze({
      kind: "string",
      settingName: "scriptSettingsExportFilename",
      label: "Export Filename",
      hint: "Configures the filename used when using the 'Script Settings as File' button. This is useful if you keep multiple different profiles around.",
    }),
  ]),
});

export function getGeneralSettingsReadModel(): GeneralSettingsReadModel {
  return generalSettingsReadModel;
}
