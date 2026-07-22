type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

interface OverrideCatalogDependencies {
  readSettings: () => AnyRecord;
  readSettingsRaw: () => AnyRecord;
  readState: () => AnyRecord;
  readGame: () => AnyRecord;
  readBuildingIds: () => AnyRecord;
  readBuildings: () => AnyRecord;
  readResources: () => AnyRecord;
  readTechIds: () => AnyRecord;
  readArpaIds: () => AnyRecord;
  readJobIds: () => AnyRecord;
  readRaces: () => AnyRecord;
  readGovernmentManager: () => AnyRecord;
  readSmelterManager: () => AnyRecord;
  readFactoryManager: () => AnyRecord;
  readWarManager: () => AnyRecord;
  readUniverses: () => AnyRecord;
  readGovernors: () => AnyRecord;
  readChallenges: () => AnyRecord;
  readBiomeList: () => AnyRecord;
  readTraitList: () => AnyRecord;
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
    // @ts-expect-error Preserve the bundled implementation's historical NaN result when charged is absent.
    // eslint-disable-next-line no-constant-binary-expression
    return readGame().global.space.m_relay?.charged / 10000.0 ?? 0;
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
    "==": (a, b) => a == b,
    "!=": (a, b) => a != b,
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
    "===": (a, b) => a === b,
    "!==": (a, b) => a !== b,
    AND: (a, b) => a && b,
    OR: (a, b) => a || b,
    NAND: (a, b) => !(a && b),
    NOR: (a, b) => !(a || b),
    XOR: (a, b) => !a != !b,
    XNOR: (a, b) => !a == !b,
    "AND!": (a, b) => a && !b,
    "OR!": (a, b) => a || !b,
    "A?B": (a, b) => a,
    "!A?B": (a, b) => !a,
  };

  const checkCustom = {
    "A?B": "Special check, uses Var2 as result if Var1 is truthy",
    "!A?B": "Special check, uses Var2 as result if Var1 is falsy",
  };

  const argType = {
    building_cost: {
      def: "city-farm.Money",
      arg: "list_cb",
      options: () =>
        Object.fromEntries(
          Object.keys(readBuildingIds())
            .map((b) =>
              Object.keys(readBuildingIds()[b].cost).map((r) => [
                `${b}.${r}`,
                {
                  name: `${readBuildingIds()[b].name} (${readResources()[r].name})`,
                  id: `${b}.${r}`,
                },
              ]),
            )
            .flat(),
        ),
    },
    building: {
      def: "city-farm",
      arg: "list",
      options: { list: readBuildingIds(), name: "name", id: "_vueBinding" },
    },
    research: {
      def: "tech-mad",
      arg: "list",
      options: { list: readTechIds(), name: "name", id: "_vueBinding" },
    },

    trait: {
      def: "kindling_kindred",
      arg: "list_cb",
      options: () =>
        Object.fromEntries(
          (Object.entries(readGame().traits) as Array<[string, AnyRecord]>).map(
            ([id, trait]) => [id, { name: trait.name, id: id }],
          ),
        ),
    },

    genus: {
      def: "humanoid",
      arg: "select_cb",
      options: () => [
        { val: "organism", label: readGame().loc(`race_protoplasm`) },
        ...(Object.values(readGame().races) as AnyRecord[])
          .map((r) => r.type)
          .filter((g, i, a) => g && g !== "organism" && a.indexOf(g) === i)
          .map((g) => ({
            val: g,
            label: readGame().loc(`genelab_genus_${g}`),
          })),
      ],
    },
    genus_ss: {
      def: "humanoid",
      arg: "select_cb",
      options: () => [
        { val: "none", label: readGame().loc(`genelab_genus_none`) },
        ...(Object.values(readGame().races) as AnyRecord[])
          .map((r) => r.type)
          .filter(
            (g, i, a) =>
              g && g !== "organism" && g !== "synthetic" && a.indexOf(g) === i,
          )
          .map((g) => ({
            val: g,
            label: readGame().loc(`genelab_genus_${g}`),
          })),
      ],
    },
    project: {
      def: "arpalaunch_facility",
      arg: "select_cb",
      options: () =>
        Object.values(readArpaIds()).map((p) => ({
          val: p._vueBinding,
          label: p.name,
        })),
    },
    job: {
      def: "unemployed",
      arg: "select_cb",
      options: () =>
        Object.values(readJobIds()).map((j) => ({
          val: j._originalId,
          label: j._originalName,
        })),
    },
    job_servant: {
      def: "farmer",
      arg: "select_cb",
      options: () =>
        Object.values(readJobIds())
          .filter((j) => j.is.serve)
          .map((j) => ({ val: j._originalId, label: j._originalName })),
    },
    resource: {
      def: "Food",
      arg: "select_cb",
      options: () =>
        Object.values(readResources()).map((r) => ({
          val: r._id,
          label: r.name,
        })),
    },
    race: {
      def: "species",
      arg: "select_cb",
      options: () => [
        { val: "species", label: "Current Race", hint: "Current race" },
        { val: "gods", label: "Fanaticism Race", hint: "Gods race" },
        { val: "old_gods", label: "Deify Race", hint: "Old gods race" },
        { val: "srace", label: "Imitation Race", hint: "Imitation trait race" },
        {
          val: "protoplasm",
          label: "Protoplasm",
          hint: "Race is not chosen yet",
        },
        ...Object.values(readRaces()).map((race) => ({
          val: race.id,
          label: race.name,
          hint: race.desc,
        })),
      ],
    },
    challenge: {
      def: "junker",
      arg: "select_cb",
      options: () =>
        readChallenges()
          .flat()
          .map((c) => ({
            val: c.trait,
            label: readGame().loc(`evo_challenge_${c.id}`),
            hint: readGame().loc(`evo_challenge_${c.id}_effect`),
          })),
    },
    universe: {
      def: "standard",
      arg: "select_cb",
      options: () => [
        {
          val: "bigbang",
          label: "Big Bang",
          hint: "Universe is not chosen yet",
        },
        ...readUniverses().map((u) => ({
          val: u,
          label: readGame().loc(`universe_${u}`),
          hint: readGame().loc(`universe_${u}_desc`),
        })),
      ],
    },
    government: {
      def: "anarchy",
      arg: "select_cb",
      options: () =>
        Object.keys(readGovernmentManager().Types).map((g) => ({
          val: g,
          label: readGame().loc(`govern_${g}`),
          hint: readGame().loc(`govern_${g}_desc`),
        })),
    },
    governor: {
      def: "none",
      arg: "select_cb",
      options: () => [
        { val: "none", label: "None", hint: "No governor selected" },
        ...readGovernors().map((id) => ({
          val: id,
          label: readGame().loc(`governor_${id}`),
          hint: readGame().loc(`governor_${id}_desc`),
        })),
      ],
    },
    queue: {
      def: "queue",
      arg: "select_cb",
      options: () => [
        {
          val: "queue",
          label: "Building",
          hint: "Buildings and projects queue",
        },
        { val: "r_queue", label: "Research", hint: "Research queue" },
        { val: "evo", label: "Evolution", hint: "Evolution queue" },
      ],
    },
    date: {
      def: "day",
      arg: "select_cb",
      options: () => [
        { val: "day", label: "Day (Year)", hint: "Day of year" },
        {
          val: "moon",
          label: "Day (Month)",
          hint: "Day of month (0-27 range)",
        },
        { val: "total", label: "Day (Total)", hint: "Day of run" },
        { val: "year", label: "Year", hint: "Year of run" },
        { val: "orbit", label: "Orbit", hint: "Planet orbit in days" },
        {
          val: "season",
          label: "Season",
          hint: "Current season (0 - Spring, 1 - Summer, 2 - Fall, 3 - Winter)",
        },
        {
          val: "temp",
          label: "Temperature",
          hint: "Current temperature (0 - Cold, 1 - Normal, 2 - Hot)",
        },
        {
          val: "impact",
          label: "Impact",
          hint: "Days remaining before Moon Impact, for Orbit Decay scenario",
        },
      ],
    },
    soldiers: {
      def: "workers",
      arg: "select_cb",
      options: () => [
        { val: "workers", label: "Total Soldiers" },
        { val: "max", label: "Total Soldiers Max" },
        { val: "currentCityGarrison", label: "City Soldiers" },
        { val: "maxCityGarrison", label: "City Soldiers Max" },
        { val: "hellSoldiers", label: "Hell Soldiers" },
        { val: "hellGarrison", label: "Hell Garrison" },
        { val: "hellPatrols", label: "Hell Patrols" },
        { val: "hellPatrolSize", label: "Hell Patrol Size" },
        { val: "wounded", label: "Wounded Soldiers" },
        { val: "deadSoldiers", label: "Dead Soldiers" },
        { val: "crew", label: "Ship Crew" },
        { val: "mercenaryCost", label: "Mercenary Cost" },
      ],
    },
    tab: {
      def: "civTabs1",
      arg: "select_cb",
      options: () => [
        { val: "civTabs0", label: readGame().loc("tab_evolve") },
        { val: "civTabs1", label: readGame().loc("tab_civil") },
        { val: "civTabs2", label: readGame().loc("tab_civics") },
        { val: "civTabs3", label: readGame().loc("tab_research") },
        { val: "civTabs4", label: readGame().loc("tab_resources") },
        { val: "civTabs5", label: readGame().loc("tech_arpa") },
        { val: "civTabs6", label: readGame().loc("mTabStats") },
        { val: "civTabs7", label: readGame().loc("tab_settings") },
      ],
    },
    biome: {
      def: "grassland",
      arg: "select_cb",
      options: () =>
        readBiomeList().map((b) => ({
          val: b,
          label: readGame().loc(`biome_${b}_name`),
        })),
    },
    ptrait: {
      def: "",
      arg: "select_cb",
      options: () => [
        { val: "", label: "None", hint: "Planet have no trait" },
        ...readTraitList()
          .slice(1)
          .map((t) => ({ val: t, label: readGame().loc(`planet_${t}`) })),
      ],
    },
    industry: {
      def: "smelters",
      arg: "select_cb",
      options: () => [
        { val: "smelters", label: "Total Smelter Slot Count" },
        { val: "factories", label: "Total Factory Slot Count" },
      ],
    },
    other: {
      def: "rname",
      arg: "select_cb",
      options: () => [
        {
          val: "rname",
          label: "Race Name",
          hint: "Ingame name of current race as string.",
        },
        {
          val: "tpfleet",
          label: "Fleet Size",
          hint: "Amount of ships in True Path fleet as number.",
        },
        {
          val: "mrelay",
          label: "Mass Relay charge",
          hint: "Charge percentage of the Mass Relay (0 = 0%, 0.5 = 50%, 1 = 100%",
        },
        {
          val: "satcost",
          label: "Satellite Cost",
          hint: "Money cost of next Swarm Satellite",
        },
        {
          val: "bcar",
          label: "Broken Cars",
          hint: "Amount of broken Surveyour Carports",
        },
        {
          val: "alevel",
          label: "Active challenges",
          hint: "Amount of active challenges",
        },
        {
          val: "tknow",
          label: "Tech Knowledge",
          hint: "Knowledge needed for most expensive unlocked research",
        },
      ],
    },
  };
  const argMap = {
    race: (r) =>
      r === "species" || r === "gods" || r === "old_gods"
        ? readGame().global.race[r]
        : r === "srace"
          ? (readGame().global.race.srace ?? "protoplasm")
          : r,
    date: (d) =>
      d === "total"
        ? readGame().global.stats.days
        : d === "impact"
          ? readGame().global.race["orbit_decay"]
            ? readGame().global.race["orbit_decay"] -
              readGame().global.stats.days
            : -1
          : readGame().global.city.calendar[d],
    industry: (b) =>
      b === "smelters"
        ? readSmelterManager().maxOperating()
        : b === "factories"
          ? readFactoryManager().maxOperating()
          : b,
    other: (o) =>
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
      fn: (v) => v,
      arg: "string",
      def: "none",
      desc: "Returns string",
    },
    Number: { fn: (v) => v, arg: "number", def: 0, desc: "Returns number" },
    Boolean: {
      fn: (v) => v,
      arg: "boolean",
      def: false,
      desc: "Returns boolean",
    },
    SettingDefault: {
      fn: (s) => readSettingsRaw()[s],
      arg: "string",
      def: "masterScriptToggle",
      desc: "Returns default value of setting, types varies",
    },
    SettingCurrent: {
      fn: (s) => readSettings()[s],
      arg: "string",
      def: "masterScriptToggle",
      desc: "Returns current value of setting, types varies",
    },
    Eval: {
      fn: (s) => fastEval(s),
      arg: "string",
      def: "Math.PI",
      desc: "Returns result of evaluating code",
    },
    BuildingCost: {
      fn: (id) => {
        let [b, r] = id.split(".");
        return readBuildingIds()[b].cost[r] ?? 0;
      },
      ...argType.building_cost,
      desc: "Return material cost of building as number\n(Due to technical limitations some options might not appear in list until you unlock corresponding building in game)",
    },
    BuildingUnlocked: {
      fn: (b) => readBuildingIds()[b].isUnlocked(),
      ...argType.building,
      desc: "Return true when building is unlocked",
    },
    BuildingClickable: {
      fn: (b) => readBuildingIds()[b].isClickable(),
      ...argType.building,
      desc: "Return true when building have all required resources, and can be purchased",
    },
    BuildingAffordable: {
      fn: (b) => readBuildingIds()[b].isAffordable(true),
      ...argType.building,
      desc: "Return true when building is affordable, i.e. costs of all resources below storage caps",
    },
    BuildingCount: {
      fn: (b) => readBuildingIds()[b].count,
      ...argType.building,
      desc: "Returns amount of buildings as number",
    },
    BuildingEnabled: {
      fn: (b) => readBuildingIds()[b].stateOnCount,
      ...argType.building,
      desc: "Returns amount of powered buildings as number",
    },
    BuildingDisabled: {
      fn: (b) => readBuildingIds()[b].stateOffCount,
      ...argType.building,
      desc: "Returns amount of unpowered buildings as number",
    },
    BuildingQueued: {
      fn: (b) => readState().queuedTargetsAll.includes(readBuildingIds()[b]),
      ...argType.building,
      desc: "Returns true when building in queue",
    },
    ProjectUnlocked: {
      fn: (p) => readArpaIds()[p].isUnlocked(),
      ...argType.project,
      desc: "Return true when project is unlocked",
    },
    ProjectCount: {
      fn: (p) => readArpaIds()[p].count,
      ...argType.project,
      desc: "Returns amount of projects as number",
    },
    ProjectProgress: {
      fn: (p) => readArpaIds()[p].progress,
      ...argType.project,
      desc: "Returns progress of projects as number",
    },
    JobUnlocked: {
      fn: (j) => readJobIds()[j].isUnlocked(),
      ...argType.job,
      desc: "Returns true when job is unlocked",
    },
    JobCount: {
      fn: (j) => readJobIds()[j].count,
      ...argType.job,
      desc: "Returns current amount of employees(both workers, and servants) as number",
    },
    JobMax: {
      fn: (j) => readJobIds()[j].max,
      ...argType.job,
      desc: "Returns maximum amount of assigned workers as number",
    },
    JobWorkers: {
      fn: (j) => readJobIds()[j].workers,
      ...argType.job,
      desc: "Returns current amount of workers as number",
    },
    JobServants: {
      fn: (j) => readJobIds()[j].servants,
      ...argType.job_servant,
      desc: "Returns current amount of servants as number",
    },
    ResearchUnlocked: {
      fn: (r) => readTechIds()[r].isUnlocked(),
      ...argType.research,
      desc: "Returns true when research is unlocked",
    },
    ResearchComplete: {
      fn: (r) => readTechIds()[r].isResearched(),
      ...argType.research,
      desc: "Returns true when research is complete",
    },
    ResourceUnlocked: {
      fn: (r) => readResources()[r].isUnlocked(),
      ...argType.resource,
      desc: "Returns true when resource or support is unlocked",
    },
    ResourceQuantity: {
      fn: (r) => readResources()[r].currentQuantity,
      ...argType.resource,
      desc: "Returns current amount of resource or support as number",
    },
    ResourceStorage: {
      fn: (r) => readResources()[r].maxQuantity,
      ...argType.resource,
      desc: "Returns maximum amount of resource or support as number. Power returns 'Disabled' amount.",
    },
    ResourceMaxCost: {
      fn: (r) => readResources()[r].maxCost,
      ...argType.resource,
      desc: "Returns maximum cost of resource as number.",
    },
    ResourceIncome: {
      fn: (r) => readResources()[r].rateOfChange,
      ...argType.resource,
      desc: "Returns current income of resource or unused support as number",
    }, // rateOfChange holds full diff of resource at the moment when overrides checked
    ResourceRatio: {
      fn: (r) => readResources()[r].storageRatio,
      ...argType.resource,
      desc: "Returns storage ratio of resource as number. Number 0.5 means that storage is 50% full, and such.",
    },
    ResourceSatisfied: {
      fn: (r) => readResources()[r].usefulRatio >= 1,
      ...argType.resource,
      desc: "Returns true when current amount of resource above maximum costs",
    },
    ResourceSatisfyRatio: {
      fn: (r) => readResources()[r].usefulRatio,
      ...argType.resource,
      desc: "Returns satisfy ratio of resource. Number 0.5 means that storead amount equal half of maximum costs",
    },
    ResourceDemanded: {
      fn: (r) => readResources()[r].isDemanded(),
      ...argType.resource,
      desc: "Returns true when resource is demanded, i.e. missed by some prioritized task, such as queue or trigger",
    },
    RaceId: {
      fn: (r) => argMap.race(r),
      ...argType.race,
      desc: "Returns ID of selected race as string",
    },
    RacePillared: {
      fn: (r) =>
        readGame().global.pillars[argMap.race(r)] >= readGame().alevel(),
      ...argType.race,
      desc: "Returns true when selected race pillared at current star level",
    },
    RaceGenus: {
      fn: (g) => readRaces()[readGame().global.race.species]?.genus === g,
      ...argType.genus,
      desc: "Returns true when playing selected genus",
    },
    MimicGenus: {
      fn: (g) => (readGame().global.race.ss_genus ?? "none") === g,
      ...argType.genus_ss,
      desc: "Returns true when mimicking selected genus",
    },
    TraitLevel: {
      fn: (t) => readGame().global.race[t] ?? 0,
      ...argType.trait,
      desc: "Returns trait level as number",
    },
    ResetType: {
      fn: (r) => readSettings().prestigeType === r,
      arg: "select",
      options: prestigeOptions,
      def: "mad",
      desc: "Returns true when selected reset is active",
    },
    Challenge: {
      fn: (c) => (readGame().global.race[c] ? true : false),
      ...argType.challenge,
      desc: "Returns true when selected challenge is active",
    },
    Universe: {
      fn: (u) => readGame().global.race.universe === u,
      ...argType.universe,
      desc: "Returns true when playing in selected universe",
    },
    Government: {
      fn: (g) => readGame().global.civic.govern.type === g,
      ...argType.government,
      desc: "Returns true when selected government is active",
    },
    Governor: {
      fn: (g) => getGovernor() === g,
      ...argType.governor,
      desc: "Returns true when selected governor is active",
    },
    Queue: {
      fn: (q) =>
        q === "evo"
          ? readSettingsRaw().evolutionQueue.length
          : readGame().global[q].queue.length,
      ...argType.queue,
      desc: "Returns amount of items in queue as number",
    },
    Date: {
      fn: (d) => argMap.date(d),
      ...argType.date,
      desc: "Returns ingame date as number",
    },
    Soldiers: {
      fn: (s) => readWarManager()[s],
      ...argType.soldiers,
      desc: "Returns amount of soldiers as number",
    },
    PlanetBiome: {
      fn: (b) => readGame().global.city.biome === b,
      ...argType.biome,
      desc: "Returns true when playing in selected biome",
    },
    PlanetTrait: {
      fn: (t) => readGame().global.city.ptrait.includes(t),
      ...argType.ptrait,
      desc: "Returns true when planet have selected trait",
    },
    Industry: {
      fn: (r) => argMap.industry(r),
      ...argType.industry,
      desc: "Returns information about Industry buildings",
    },
    Other: {
      fn: (o) => argMap.other(o),
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
