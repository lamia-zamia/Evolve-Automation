import {
  createOverrideOperandInputs,
  type OverrideOperandBuilding,
  type OverrideOperandChallenge,
  type OverrideOperandGame,
  type OverrideOperandJob,
  type OverrideOperandProject,
  type OverrideOperandRace,
  type OverrideOperandResource,
} from "./override-operand-inputs.ts";
import {
  createOverrideOperandReaders,
  type OverrideReadBuilding,
  type OverrideReadBuildingCatalog,
  type OverrideReadGame,
  type OverrideReadIndustry,
  type OverrideReadJob,
  type OverrideReadProject,
  type OverrideReadRace,
  type OverrideReadResearch,
  type OverrideReadResource,
  type OverrideReadScriptState,
  type OverrideReadSettingsRaw,
} from "./override-operand-readers.ts";

/** One prestige the script can be configured to aim for, as the settings select renders it. */
interface PrestigeType {
  readonly val: string;
  readonly label: string;
  readonly short_label?: string;
  readonly hint: string;
}

/**
 * A live game bag as the whole catalog sees it: what the editor's operand inputs read, and what the
 * operand readers read. Both halves describe the same object from opposite sides.
 */
interface OverrideCatalogDependencies {
  readSettings: () => Record<string, unknown>;
  readSettingsRaw: () => OverrideReadSettingsRaw;
  readState: () => OverrideReadScriptState;
  readGame: () => OverrideOperandGame & OverrideReadGame;
  readBuildingIds: () => Record<
    string,
    OverrideOperandBuilding & OverrideReadBuilding
  >;
  readBuildings: () => OverrideReadBuildingCatalog;
  readResources: () => Record<
    string,
    OverrideOperandResource & OverrideReadResource
  >;
  readTechIds: () => Record<string, OverrideReadResearch>;
  readArpaIds: () => Record<
    string,
    OverrideOperandProject & OverrideReadProject
  >;
  readJobIds: () => Record<string, OverrideOperandJob & OverrideReadJob>;
  readRaces: () => Record<string, OverrideOperandRace & OverrideReadRace>;
  readGovernmentManager: () => { Types: Record<string, unknown> };
  readSmelterManager: () => OverrideReadIndustry;
  readFactoryManager: () => OverrideReadIndustry;
  readWarManager: () => Record<string, unknown>;
  readUniverses: () => string[];
  readGovernors: () => string[];
  readChallenges: () => OverrideOperandChallenge[][];
  readBiomeList: () => string[];
  readTraitList: () => string[];
  readBuildSelectOptions: () => (options: readonly PrestigeType[]) => string;
  readFastEval: () => (source: string) => unknown;
  readGovernor: () => () => string;
}

export function createOverrideCatalog({
  readSettings,
  readSettingsRaw,
  readState,
  readGame,
  readBuildingIds,
  readBuildings,
  readResources,
  readTechIds,
  readArpaIds,
  readJobIds,
  readRaces,
  readGovernmentManager,
  readSmelterManager,
  readFactoryManager,
  readWarManager,
  readUniverses,
  readGovernors,
  readChallenges,
  readBiomeList,
  readTraitList,
  readBuildSelectOptions,
  readFastEval,
  readGovernor,
}: OverrideCatalogDependencies) {
  const prestigeTypes = [
    { val: "none", label: "None", hint: "Endless game" },
    {
      val: "mad",
      short_label: "MAD",
      label: "Mutual Assured Destruction",
      hint: "MAD prestige once MAD has been researched and all soldiers are home",
    },
    {
      val: "bioseed",
      label: "Bioseed",
      hint: "Launches the bioseeder ship to perform prestige when required probes have been constructed",
    },
    {
      val: "cataclysm",
      label: "Cataclysm",
      hint: "Perform cataclysm reset by researching Dial It To 11 once available",
    },
    {
      val: "whitehole",
      label: "Whitehole",
      hint: "Infuses the blackhole with exotic materials to perform prestige",
    },
    {
      val: "vacuum",
      short_label: "Vacuum",
      label: "Vacuum Collapse",
      hint: "Build Mana Syphons until the end",
    },
    {
      val: "apocalypse",
      label: "AI Apocalypse",
      hint: "Perform AI Apocalypse reset by researching Protocol 66 once available",
    },
    {
      val: "ascension",
      label: "Ascension",
      hint: "Allows research of Incorporeal Existence and Ascension. Ascension Machine is managed by autoPower. Use Custom race handling in Prestige settings to reuse, pause for editing, or automatically import a race at the post-reset lab.",
    },
    {
      val: "demonic",
      short_label: "DI",
      label: "Demonic Infusion",
      hint: "Sacrifice your entire civilization to absorb the essence of a greater demon lord",
    },
    {
      val: "terraform",
      label: "Terraform",
      hint: "Create new planet by building and powering Terraformer. Atmosphere Terraformer is managed by autoPower. Disable autoPrestige if you want to change custom planet. Otherwise current one will be used , or default one if there's no current. ",
    },
    {
      val: "matrix",
      label: "Matrix",
      hint: "Build a computer simulation and trap your entire civilization in it",
    },
    {
      val: "retire",
      label: "Retirement",
      hint: "Retire and enjoy the easy life.",
    },
    { val: "eden", label: "Eden", hint: "Build Garden Of Eden." },
    { val: "apotheosis", label: "Apotheosis", hint: "Kill the God." },
  ] satisfies PrestigeType[];

  const prestigeOptions = readBuildSelectOptions()(prestigeTypes);

  const checkCompare = {
    "==": (a: any, b: any) => a == b,
    "!=": (a: any, b: any) => a != b,
    ">": (a: any, b: any) => a > b,
    "<": (a: any, b: any) => a < b,
    ">=": (a: any, b: any) => a >= b,
    "<=": (a: any, b: any) => a <= b,
    "===": (a: any, b: any) => a === b,
    "!==": (a: any, b: any) => a !== b,
    AND: (a: any, b: any) => a && b,
    OR: (a: any, b: any) => a || b,
    NAND: (a: any, b: any) => !(a && b),
    NOR: (a: any, b: any) => !(a || b),
    XOR: (a: any, b: any) => !a != !b,
    XNOR: (a: any, b: any) => !a == !b,
    "AND!": (a: any, b: any) => a && !b,
    "OR!": (a: any, b: any) => a || !b,
    "A?B": (a: any, b: any) => a,
    "!A?B": (a: any, b: any) => !a,
  };

  const checkCustom = {
    "A?B": "Special check, uses Var2 as result if Var1 is truthy",
    "!A?B": "Special check, uses Var2 as result if Var1 is falsy",
  };

  const argType = createOverrideOperandInputs({
    readGame,
    readBuildingIds,
    readResources,
    readTechIds,
    readArpaIds,
    readJobIds,
    readRaces,
    readGovernmentManager,
    readUniverses,
    readGovernors,
    readChallenges,
    readBiomeList,
    readTraitList,
  });
  const read = createOverrideOperandReaders({
    readSettings,
    readSettingsRaw,
    readState,
    readGame,
    readBuildingIds,
    readBuildings,
    readResources,
    readTechIds,
    readArpaIds,
    readJobIds,
    readRaces,
    readSmelterManager,
    readFactoryManager,
    readWarManager,
    readFastEval,
    readGovernor,
  });

  // TODO: Add TabUnlocked, with showCity, showTau, showMarket, etc.
  const checkTypes = {
    String: {
      fn: read.String,
      arg: "string",
      def: "none",
      desc: "Returns string",
    },
    Number: {
      fn: read.Number,
      arg: "number",
      def: 0,
      desc: "Returns number",
    },
    Boolean: {
      fn: read.Boolean,
      arg: "boolean",
      def: false,
      desc: "Returns boolean",
    },
    SettingDefault: {
      fn: read.SettingDefault,
      arg: "string",
      def: "masterScriptToggle",
      desc: "Returns default value of setting, types varies",
    },
    SettingCurrent: {
      fn: read.SettingCurrent,
      arg: "string",
      def: "masterScriptToggle",
      desc: "Returns current value of setting, types varies",
    },
    Eval: {
      fn: read.Eval,
      arg: "string",
      def: "Math.PI",
      desc: "Returns result of evaluating code",
    },
    BuildingCost: {
      fn: read.BuildingCost,
      ...argType.building_cost,
      desc: "Return material cost of building as number\n(Due to technical limitations some options might not appear in list until you unlock corresponding building in game)",
    },
    BuildingUnlocked: {
      fn: read.BuildingUnlocked,
      ...argType.building,
      desc: "Return true when building is unlocked",
    },
    BuildingClickable: {
      fn: read.BuildingClickable,
      ...argType.building,
      desc: "Return true when building have all required resources, and can be purchased",
    },
    BuildingAffordable: {
      fn: read.BuildingAffordable,
      ...argType.building,
      desc: "Return true when building is affordable, i.e. costs of all resources below storage caps",
    },
    BuildingCount: {
      fn: read.BuildingCount,
      ...argType.building,
      desc: "Returns amount of buildings as number",
    },
    BuildingEnabled: {
      fn: read.BuildingEnabled,
      ...argType.building,
      desc: "Returns amount of powered buildings as number",
    },
    BuildingDisabled: {
      fn: read.BuildingDisabled,
      ...argType.building,
      desc: "Returns amount of unpowered buildings as number",
    },
    BuildingQueued: {
      fn: read.BuildingQueued,
      ...argType.building,
      desc: "Returns true when building in queue",
    },
    ProjectUnlocked: {
      fn: read.ProjectUnlocked,
      ...argType.project,
      desc: "Return true when project is unlocked",
    },
    ProjectCount: {
      fn: read.ProjectCount,
      ...argType.project,
      desc: "Returns amount of projects as number",
    },
    ProjectProgress: {
      fn: read.ProjectProgress,
      ...argType.project,
      desc: "Returns progress of projects as number",
    },
    JobUnlocked: {
      fn: read.JobUnlocked,
      ...argType.job,
      desc: "Returns true when job is unlocked",
    },
    JobCount: {
      fn: read.JobCount,
      ...argType.job,
      desc: "Returns current amount of employees(both workers, and servants) as number",
    },
    JobMax: {
      fn: read.JobMax,
      ...argType.job,
      desc: "Returns maximum amount of assigned workers as number",
    },
    JobWorkers: {
      fn: read.JobWorkers,
      ...argType.job,
      desc: "Returns current amount of workers as number",
    },
    JobServants: {
      fn: read.JobServants,
      ...argType.job_servant,
      desc: "Returns current amount of servants as number",
    },
    ResearchUnlocked: {
      fn: read.ResearchUnlocked,
      ...argType.research,
      desc: "Returns true when research is unlocked",
    },
    ResearchComplete: {
      fn: read.ResearchComplete,
      ...argType.research,
      desc: "Returns true when research is complete",
    },
    ResourceUnlocked: {
      fn: read.ResourceUnlocked,
      ...argType.resource,
      desc: "Returns true when resource or support is unlocked",
    },
    ResourceQuantity: {
      fn: read.ResourceQuantity,
      ...argType.resource,
      desc: "Returns current amount of resource or support as number",
    },
    ResourceStorage: {
      fn: read.ResourceStorage,
      ...argType.resource,
      desc: "Returns maximum amount of resource or support as number. Power returns 'Disabled' amount.",
    },
    ResourceMaxCost: {
      fn: read.ResourceMaxCost,
      ...argType.resource,
      desc: "Returns maximum cost of resource as number.",
    },
    ResourceIncome: {
      fn: read.ResourceIncome,
      ...argType.resource,
      desc: "Returns current income of resource or unused support as number",
    },
    ResourceRatio: {
      fn: read.ResourceRatio,
      ...argType.resource,
      desc: "Returns storage ratio of resource as number. Number 0.5 means that storage is 50% full, and such.",
    },
    ResourceSatisfied: {
      fn: read.ResourceSatisfied,
      ...argType.resource,
      desc: "Returns true when current amount of resource above maximum costs",
    },
    ResourceSatisfyRatio: {
      fn: read.ResourceSatisfyRatio,
      ...argType.resource,
      desc: "Returns satisfy ratio of resource. Number 0.5 means that storead amount equal half of maximum costs",
    },
    ResourceDemanded: {
      fn: read.ResourceDemanded,
      ...argType.resource,
      desc: "Returns true when resource is demanded, i.e. missed by some prioritized task, such as queue or trigger",
    },
    RaceId: {
      fn: read.RaceId,
      ...argType.race,
      desc: "Returns ID of selected race as string",
    },
    RacePillared: {
      fn: read.RacePillared,
      ...argType.race,
      desc: "Returns true when selected race pillared at current star level",
    },
    RaceGenus: {
      fn: read.RaceGenus,
      ...argType.genus,
      desc: "Returns true when playing selected genus",
    },
    MimicGenus: {
      fn: read.MimicGenus,
      ...argType.genus_ss,
      desc: "Returns true when mimicking selected genus",
    },
    TraitLevel: {
      fn: read.TraitLevel,
      ...argType.trait,
      desc: "Returns trait level as number",
    },
    ResetType: {
      fn: read.ResetType,
      arg: "select",
      options: prestigeOptions,
      def: "mad",
      desc: "Returns true when selected reset is active",
    },
    Challenge: {
      fn: read.Challenge,
      ...argType.challenge,
      desc: "Returns true when selected challenge is active",
    },
    Universe: {
      fn: read.Universe,
      ...argType.universe,
      desc: "Returns true when playing in selected universe",
    },
    Government: {
      fn: read.Government,
      ...argType.government,
      desc: "Returns true when selected government is active",
    },
    Governor: {
      fn: read.Governor,
      ...argType.governor,
      desc: "Returns true when selected governor is active",
    },
    Queue: {
      fn: read.Queue,
      ...argType.queue,
      desc: "Returns amount of items in queue as number",
    },
    Date: {
      fn: read.Date,
      ...argType.date,
      desc: "Returns ingame date as number",
    },
    Soldiers: {
      fn: read.Soldiers,
      ...argType.soldiers,
      desc: "Returns amount of soldiers as number",
    },
    PlanetBiome: {
      fn: read.PlanetBiome,
      ...argType.biome,
      desc: "Returns true when playing in selected biome",
    },
    PlanetTrait: {
      fn: read.PlanetTrait,
      ...argType.ptrait,
      desc: "Returns true when planet have selected trait",
    },
    Industry: {
      fn: read.Industry,
      ...argType.industry,
      desc: "Returns information about Industry buildings",
    },
    Other: {
      fn: read.Other,
      ...argType.other,
      desc: "Other uncategorized variables",
    },
  };

  // TODO: This thing isn't very nice. Ideally each check should declare return type, not only input type. But for now it's only used with triggers which only works with numbers and booleans, so it's fine for now.
  const retBools = [
    "Boolean",
    "BuildingUnlocked",
    "BuildingClickable",
    "BuildingAffordable",
    "BuildingQueued",
    "ProjectUnlocked",
    "JobUnlocked",
    "ResearchUnlocked",
    "ResearchComplete",
    "ResourceUnlocked",
    "ResourceSatisfied",
    "ResourceDemanded",
    "RacePillared",
    "RaceGenus",
    "MimicGenus",
    "ResetType",
    "Challenge",
    "Universe",
    "Government",
    "Governor",
    "PlanetBiome",
    "PlanetTrait",
  ];
  // No need to show primitives and string function in triggers UI.
  const overrideOnlyChecks = ["String", "Number", "RaceId"];

  return {
    prestigeTypes,
    prestigeOptions,
    checkCompare,
    checkCustom,
    argType,
    checkTypes,
    retBools,
    overrideOnlyChecks,
  };
}
