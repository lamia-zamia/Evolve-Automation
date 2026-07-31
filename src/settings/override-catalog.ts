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

type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

/**
 * A live game bag: whatever the operand readers still poke at, plus the fields the operand inputs
 * declare. Only the second half is typed, because only it has been separated out so far.
 */
type Live<T> = AnyRecord & T;

interface OverrideCatalogDependencies {
  readSettings: () => AnyRecord;
  readSettingsRaw: () => AnyRecord;
  readState: () => AnyRecord;
  readGame: () => Live<OverrideOperandGame>;
  readBuildingIds: () => Record<string, Live<OverrideOperandBuilding>>;
  readBuildings: () => AnyRecord;
  readResources: () => Record<string, Live<OverrideOperandResource>>;
  readTechIds: () => AnyRecord;
  readArpaIds: () => Record<string, Live<OverrideOperandProject>>;
  readJobIds: () => Record<string, Live<OverrideOperandJob>>;
  readRaces: () => Record<string, Live<OverrideOperandRace>>;
  readGovernmentManager: () => Live<{ Types: AnyRecord }>;
  readSmelterManager: () => AnyRecord;
  readFactoryManager: () => AnyRecord;
  readWarManager: () => AnyRecord;
  readUniverses: () => string[];
  readGovernors: () => string[];
  readChallenges: () => OverrideOperandChallenge[][];
  readBiomeList: () => string[];
  readTraitList: () => string[];
  readBuildSelectOptions: () => AnyFunction;
  readFastEval: () => AnyFunction;
  readGovernor: () => AnyFunction;
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
  const buildSelectOptions: AnyFunction = (...args) =>
    readBuildSelectOptions()(...args);
  const fastEval: AnyFunction = (...args) => readFastEval()(...args);
  const getGovernor: AnyFunction = (...args) => readGovernor()(...args);
  const historicalRelayChargeRatio = () => {
    // Preserve the bundled implementation's historical NaN result when charged is absent.
    return readGame().global.space.m_relay?.charged / 10000.0;
  };
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
  ];

  const prestigeOptions = buildSelectOptions(prestigeTypes);

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
  const argMap = {
    race: (r: any) =>
      r === "species" || r === "gods" || r === "old_gods"
        ? readGame().global.race[r]
        : r === "srace"
          ? (readGame().global.race.srace ?? "protoplasm")
          : r,
    date: (d: any) =>
      d === "total"
        ? readGame().global.stats.days
        : d === "impact"
          ? readGame().global.race["orbit_decay"]
            ? readGame().global.race["orbit_decay"] -
              readGame().global.stats.days
            : -1
          : readGame().global.city.calendar[d],
    industry: (b: any) =>
      b === "smelters"
        ? readSmelterManager().maxOperating()
        : b === "factories"
          ? readFactoryManager().maxOperating()
          : b,
    other: (o: any) =>
      o === "rname"
        ? readGame().races[
            readGame().global.race.species === "protoplasm" &&
            readGame().global.race.evoFinalMenu
              ? readGame().global.race.evoFinalMenu
              : readGame().global.race.species
          ].name
        : o === "tpfleet"
          ? (readGame().global.space.shipyard?.ships?.length ?? 0)
          : o === "mrelay"
            ? historicalRelayChargeRatio()
            : o === "satcost"
              ? (readBuildings().SunSwarmSatellite.cost.Money ?? 0)
              : o === "bcar"
                ? (readGame().global.portal.carport?.damaged ?? 0)
                : o === "alevel"
                  ? readGame().alevel() - 1
                  : o === "tknow"
                    ? readState().knowledgeRequiredByTechs
                    : o,
  };

  // TODO: Add TabUnlocked, with showCity, showTau, showMarket, etc.
  const checkTypes = {
    String: {
      fn: (v: any) => v,
      arg: "string",
      def: "none",
      desc: "Returns string",
    },
    Number: {
      fn: (v: any) => v,
      arg: "number",
      def: 0,
      desc: "Returns number",
    },
    Boolean: {
      fn: (v: any) => v,
      arg: "boolean",
      def: false,
      desc: "Returns boolean",
    },
    SettingDefault: {
      fn: (s: any) => readSettingsRaw()[s],
      arg: "string",
      def: "masterScriptToggle",
      desc: "Returns default value of setting, types varies",
    },
    SettingCurrent: {
      fn: (s: any) => readSettings()[s],
      arg: "string",
      def: "masterScriptToggle",
      desc: "Returns current value of setting, types varies",
    },
    Eval: {
      fn: (s: any) => fastEval(s),
      arg: "string",
      def: "Math.PI",
      desc: "Returns result of evaluating code",
    },
    BuildingCost: {
      fn: (id: any) => {
        let [b, r] = id.split(".");
        return readBuildingIds()[b].cost[r] ?? 0;
      },
      ...argType.building_cost,
      desc: "Return material cost of building as number\n(Due to technical limitations some options might not appear in list until you unlock corresponding building in game)",
    },
    BuildingUnlocked: {
      fn: (b: any) => readBuildingIds()[b].isUnlocked(),
      ...argType.building,
      desc: "Return true when building is unlocked",
    },
    BuildingClickable: {
      fn: (b: any) => readBuildingIds()[b].isClickable(),
      ...argType.building,
      desc: "Return true when building have all required resources, and can be purchased",
    },
    BuildingAffordable: {
      fn: (b: any) => readBuildingIds()[b].isAffordable(true),
      ...argType.building,
      desc: "Return true when building is affordable, i.e. costs of all resources below storage caps",
    },
    BuildingCount: {
      fn: (b: any) => readBuildingIds()[b].count,
      ...argType.building,
      desc: "Returns amount of buildings as number",
    },
    BuildingEnabled: {
      fn: (b: any) => readBuildingIds()[b].stateOnCount,
      ...argType.building,
      desc: "Returns amount of powered buildings as number",
    },
    BuildingDisabled: {
      fn: (b: any) => readBuildingIds()[b].stateOffCount,
      ...argType.building,
      desc: "Returns amount of unpowered buildings as number",
    },
    BuildingQueued: {
      fn: (b: any) =>
        readState().queuedTargetsAll.includes(readBuildingIds()[b]),
      ...argType.building,
      desc: "Returns true when building in queue",
    },
    ProjectUnlocked: {
      fn: (p: any) => readArpaIds()[p].isUnlocked(),
      ...argType.project,
      desc: "Return true when project is unlocked",
    },
    ProjectCount: {
      fn: (p: any) => readArpaIds()[p].count,
      ...argType.project,
      desc: "Returns amount of projects as number",
    },
    ProjectProgress: {
      fn: (p: any) => readArpaIds()[p].progress,
      ...argType.project,
      desc: "Returns progress of projects as number",
    },
    JobUnlocked: {
      fn: (j: any) => readJobIds()[j].isUnlocked(),
      ...argType.job,
      desc: "Returns true when job is unlocked",
    },
    JobCount: {
      fn: (j: any) => readJobIds()[j].count,
      ...argType.job,
      desc: "Returns current amount of employees(both workers, and servants) as number",
    },
    JobMax: {
      fn: (j: any) => readJobIds()[j].max,
      ...argType.job,
      desc: "Returns maximum amount of assigned workers as number",
    },
    JobWorkers: {
      fn: (j: any) => readJobIds()[j].workers,
      ...argType.job,
      desc: "Returns current amount of workers as number",
    },
    JobServants: {
      fn: (j: any) => readJobIds()[j].servants,
      ...argType.job_servant,
      desc: "Returns current amount of servants as number",
    },
    ResearchUnlocked: {
      fn: (r: any) => readTechIds()[r].isUnlocked(),
      ...argType.research,
      desc: "Returns true when research is unlocked",
    },
    ResearchComplete: {
      fn: (r: any) => readTechIds()[r].isResearched(),
      ...argType.research,
      desc: "Returns true when research is complete",
    },
    ResourceUnlocked: {
      fn: (r: any) => readResources()[r].isUnlocked(),
      ...argType.resource,
      desc: "Returns true when resource or support is unlocked",
    },
    ResourceQuantity: {
      fn: (r: any) => readResources()[r].currentQuantity,
      ...argType.resource,
      desc: "Returns current amount of resource or support as number",
    },
    ResourceStorage: {
      fn: (r: any) => readResources()[r].maxQuantity,
      ...argType.resource,
      desc: "Returns maximum amount of resource or support as number. Power returns 'Disabled' amount.",
    },
    ResourceMaxCost: {
      fn: (r: any) => readResources()[r].maxCost,
      ...argType.resource,
      desc: "Returns maximum cost of resource as number.",
    },
    ResourceIncome: {
      fn: (r: any) => readResources()[r].rateOfChange,
      ...argType.resource,
      desc: "Returns current income of resource or unused support as number",
    }, // rateOfChange holds full diff of resource at the moment when overrides checked
    ResourceRatio: {
      fn: (r: any) => readResources()[r].storageRatio,
      ...argType.resource,
      desc: "Returns storage ratio of resource as number. Number 0.5 means that storage is 50% full, and such.",
    },
    ResourceSatisfied: {
      fn: (r: any) => readResources()[r].usefulRatio >= 1,
      ...argType.resource,
      desc: "Returns true when current amount of resource above maximum costs",
    },
    ResourceSatisfyRatio: {
      fn: (r: any) => readResources()[r].usefulRatio,
      ...argType.resource,
      desc: "Returns satisfy ratio of resource. Number 0.5 means that storead amount equal half of maximum costs",
    },
    ResourceDemanded: {
      fn: (r: any) => readResources()[r].isDemanded(),
      ...argType.resource,
      desc: "Returns true when resource is demanded, i.e. missed by some prioritized task, such as queue or trigger",
    },
    RaceId: {
      fn: (r: any) => argMap.race(r),
      ...argType.race,
      desc: "Returns ID of selected race as string",
    },
    RacePillared: {
      fn: (r: any) =>
        readGame().global.pillars[argMap.race(r)] >= readGame().alevel(),
      ...argType.race,
      desc: "Returns true when selected race pillared at current star level",
    },
    RaceGenus: {
      fn: (g: any) => readRaces()[readGame().global.race.species]?.genus === g,
      ...argType.genus,
      desc: "Returns true when playing selected genus",
    },
    MimicGenus: {
      fn: (g: any) => (readGame().global.race.ss_genus ?? "none") === g,
      ...argType.genus_ss,
      desc: "Returns true when mimicking selected genus",
    },
    TraitLevel: {
      fn: (t: any) => readGame().global.race[t] ?? 0,
      ...argType.trait,
      desc: "Returns trait level as number",
    },
    ResetType: {
      fn: (r: any) => readSettings().prestigeType === r,
      arg: "select",
      options: prestigeOptions,
      def: "mad",
      desc: "Returns true when selected reset is active",
    },
    Challenge: {
      fn: (c: any) => (readGame().global.race[c] ? true : false),
      ...argType.challenge,
      desc: "Returns true when selected challenge is active",
    },
    Universe: {
      fn: (u: any) => readGame().global.race.universe === u,
      ...argType.universe,
      desc: "Returns true when playing in selected universe",
    },
    Government: {
      fn: (g: any) => readGame().global.civic.govern?.type === g,
      ...argType.government,
      desc: "Returns true when selected government is active",
    },
    Governor: {
      fn: (g: any) => getGovernor() === g,
      ...argType.governor,
      desc: "Returns true when selected governor is active",
    },
    Queue: {
      fn: (q: any) =>
        q === "evo"
          ? readSettingsRaw().evolutionQueue.length
          : readGame().global[q].queue.length,
      ...argType.queue,
      desc: "Returns amount of items in queue as number",
    },
    Date: {
      fn: (d: any) => argMap.date(d),
      ...argType.date,
      desc: "Returns ingame date as number",
    },
    Soldiers: {
      fn: (s: any) => readWarManager()[s],
      ...argType.soldiers,
      desc: "Returns amount of soldiers as number",
    },
    PlanetBiome: {
      fn: (b: any) => readGame().global.city.biome === b,
      ...argType.biome,
      desc: "Returns true when playing in selected biome",
    },
    PlanetTrait: {
      fn: (t: any) => readGame().global.city.ptrait.includes(t),
      ...argType.ptrait,
      desc: "Returns true when planet have selected trait",
    },
    Industry: {
      fn: (r: any) => argMap.industry(r),
      ...argType.industry,
      desc: "Returns information about Industry buildings",
    },
    Other: {
      fn: (o: any) => argMap.other(o),
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

  // Eval shortener

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
