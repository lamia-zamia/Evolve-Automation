import assert from "node:assert/strict";

import { createEvolveSettingsResetAdapter } from "../src/adapters/evolve/settings-reset.ts";
import { createSettingsResets } from "../src/application/settings-reset.ts";
import {
  computeEjectorDefaults,
  computeJobDefaults,
  computeMarketDefaults,
  computeMutableTraitDefaults,
} from "../src/domain/settings-defaults.ts";
import { applySettings } from "../src/domain/settings-migration.ts";
import { createResetSettings as createLegacyResetSettings } from "./test-support/legacy-reset-settings.ts";

// The 38 dependency names the legacy getter-bag expected.
const DEP_NAMES = [
  "AlchemyManager",
  "applySettings",
  "biomeList",
  "BuildingManager",
  "buildings",
  "challenges",
  "DroidManager",
  "EjectManager",
  "extraList",
  "FactoryManager",
  "game",
  "GameLog",
  "GenusTrait",
  "GovernmentManager",
  "initBuildingState",
  "JobManager",
  "jobs",
  "MajorTrait",
  "MarketManager",
  "MinorTrait",
  "MinorTraitManager",
  "MutableTraitManager",
  "NaniteManager",
  "ocularPowerData",
  "planetBiomes",
  "planetTraits",
  "poly",
  "ProjectManager",
  "projects",
  "ReplicatorManager",
  "resources",
  "RitualManager",
  "settingsRaw",
  "SmelterManager",
  "StorageManager",
  "SupplyManager",
  "traitList",
  "TriggerManager",
];

// defaultResets order from the composition root.
const RESET_ORDER = [
  "resetEvolutionSettings",
  "resetWarSettings",
  "resetHellSettings",
  "resetMechSettings",
  "resetFleetSettings",
  "resetGovernmentSettings",
  "resetAuthoritySettings",
  "resetBuildingSettings",
  "resetWeightingSettings",
  "resetMarketSettings",
  "resetResearchSettings",
  "resetProjectSettings",
  "resetJobSettings",
  "resetMagicSettings",
  "resetProductionSettings",
  "resetStorageSettings",
  "resetGeneralSettings",
  "resetInterfaceSettings",
  "resetStateLogSettings",
  "resetAchievementGuardSettings",
  "resetChallengeHelperSettings",
  "resetPrestigeSettings",
  "resetEjectorSettings",
  "resetPlanetSettings",
  "resetLoggingSettings",
  "resetTriggerSettings",
  "resetMinorTraitSettings",
  "resetMutableTraitSettings",
];

const JOB_KEYS = [
  "Colonist",
  "Teamster",
  "Meditator",
  "Hunter",
  "Farmer",
  "Forager",
  "Lumberjack",
  "QuarryWorker",
  "CrystalMiner",
  "Scavenger",
  "TitanColonist",
  "PitMiner",
  "Miner",
  "CoalMiner",
  "CementWorker",
  "Professor",
  "Scientist",
  "Entertainer",
  "HellSurveyor",
  "SpaceMiner",
  "Torturer",
  "Archaeologist",
  "GhostTrapper",
  "ElysiumMiner",
  "Banker",
  "Priest",
  "Unemployed",
];

const BUILDING_KEYS = [
  "RedVrCenter",
  "NeutronCitadel",
  "PortalWarDroid",
  "BadlandsPredatorDrone",
  "PortalRepairDroid",
  "SpireWaygate",
  "TauRedContact",
  "TauRedIntroduce",
  "TauRedSubjugate",
  "TauGasName1",
  "TauGasName2",
  "TauGasName3",
  "TauGasName4",
  "TauGasName5",
  "TauGasName6",
  "TauGasName7",
  "TauGasName8",
  "TauGas2Name1",
  "TauGas2Name2",
  "TauGas2Name3",
  "TauGas2Name4",
  "TauGas2Name5",
  "TauGas2Name6",
  "TauGas2Name7",
  "TauGas2Name8",
  "ForgeHorseshoe",
  "RedForgeHorseshoe",
  "TauForgeHorseshoe",
  "BeltEleriumShip",
  "BeltIridiumShip",
  "CityHouse",
  "SpaceMine",
];

const PROJECT_KEYS = [
  "LaunchFacility",
  "SuperCollider",
  "StockExchange",
  "Monument",
  "Railway",
  "Nexus",
  "RoidEject",
  "ManaSyphon",
  "Depot",
  "Extra",
];

function makeResource(id, opts = {}) {
  return {
    id,
    is: { tradable: opts.tradable ?? false },
    atomicMass: opts.mass ?? 0,
    _storage: opts.storage ?? false,
    hasStorage() {
      return this._storage;
    },
    eject: opts.eject ?? false,
    supply: opts.supply ?? false,
    nanite: opts.nanite ?? false,
    supplyInVal: opts.supplyIn ?? 0,
    transmute: opts.transmute ?? false,
  };
}

function makeWorld(universe = "standard") {
  const trace = [];
  const managed = (label) => ({
    priorityList: [],
    sortByPriority() {
      trace.push(label + ":sort");
    },
  });

  const resources = {
    Food: makeResource("Food", {
      tradable: true,
      storage: true,
      mass: 1,
      eject: true,
      supply: true,
      nanite: true,
      supplyIn: 5,
      transmute: true,
    }),
    Copper: makeResource("Copper", {
      tradable: true,
      storage: true,
      mass: 63,
      eject: true,
      supply: true,
      supplyIn: 3,
    }),
    Iron: makeResource("Iron", {
      tradable: true,
      storage: true,
      mass: 56,
      eject: true,
      nanite: true,
    }),
    Crystal: makeResource("Crystal", {
      tradable: true,
      storage: true,
      mass: 10,
    }),
    Hidden: makeResource("Hidden", { tradable: false, mass: 99, eject: true }),
    Elerium: makeResource("Elerium", {
      tradable: true,
      mass: 300,
      eject: true,
      supply: true,
      nanite: true,
      supplyIn: 9,
    }),
    Infernite: makeResource("Infernite", {
      tradable: false,
      mass: 250,
      eject: true,
      supply: true,
      nanite: true,
      supplyIn: 7,
    }),
    Orichalcum: makeResource("Orichalcum", {
      tradable: true,
      storage: true,
      mass: 200,
    }),
    Vitreloy: makeResource("Vitreloy", {
      tradable: true,
      storage: true,
      mass: 150,
    }),
    Bolognium: makeResource("Bolognium", {
      tradable: true,
      storage: true,
      mass: 180,
    }),
    // Foundry ingredients referenced by resources[key].id; excluded from every list.
    Plywood: makeResource("Plywood"),
    Brick: makeResource("Brick"),
    Wrought_Iron: makeResource("Wrought_Iron"),
    Sheet_Metal: makeResource("Sheet_Metal"),
    Mythril: makeResource("Mythril"),
    Aerogel: makeResource("Aerogel"),
    Nanoweave: makeResource("Nanoweave"),
    Scarletite: makeResource("Scarletite"),
    Quantium: makeResource("Quantium"),
  };
  const resById = Object.fromEntries(
    Object.values(resources).map((r) => [r.id, r]),
  );

  const jobs = {};
  JOB_KEYS.forEach((key, i) => {
    jobs[key] = { _originalId: "o_" + key, is: { smart: i % 3 === 0 } };
  });

  const buildings = {};
  BUILDING_KEYS.forEach((key, i) => {
    buildings[key] = {
      _vueBinding: "v_" + key,
      _switchable: i % 2 === 0,
      isSwitchable() {
        return this._switchable;
      },
      is: { smart: i % 4 === 0 },
    };
  });

  const projects = {};
  PROJECT_KEYS.forEach((key) => {
    projects[key] = { id: "p_" + key };
  });

  class MinorTrait {
    constructor(id) {
      this.traitName = id;
      this.source = "minor";
    }
  }
  const MAJOR_GENUS = { smart: "herbivore", dumb: "carnivore" };
  class MajorTrait {
    constructor(id) {
      this.traitName = id;
      this.type = "major";
      this.genus = MAJOR_GENUS[id] ?? "generic";
    }
    isGainable() {
      return this.traitName !== "frail" && this.traitName !== "ooze";
    }
  }
  const GENUS_GENUS = { herbivore_g: "herbivore", carnivore_g: "carnivore" };
  class GenusTrait {
    constructor(id) {
      this.traitName = id;
      this.type = "genus";
      this.genus = GENUS_GENUS[id] ?? "unknown";
    }
    isGainable() {
      return false;
    }
  }

  const world = {
    trace,
    settingsRaw: { overrides: {}, triggers: [] },

    AlchemyManager: {
      ...managed("alchemy"),
      transmuteTier(r) {
        return r.transmute ? 1 : 0;
      },
    },
    biomeList: ["forest", "desert"],
    BuildingManager: managed("building"),
    buildings,
    challenges: [[{ id: "junker" }], [{ id: "joyless" }]],
    DroidManager: {
      Productions: {
        Adamantite: { resource: { id: "Adam" } },
        Aluminium: { resource: { id: "Alum" } },
        Uranium: { resource: { id: "Uran" } },
        Coal: { resource: { id: "DCoal" } },
      },
    },
    EjectManager: {
      priorityList: [],
      isConsumable(r) {
        return r.eject;
      },
    },
    extraList: ["Unicorn"],
    FactoryManager: {
      Productions: {
        LuxuryGoods: { resource: { id: "Lux" } },
        Furs: { resource: { id: "FFurs" } },
        Alloy: { resource: { id: "FAlloy" } },
        Polymer: { resource: { id: "FPoly" } },
        NanoTube: { resource: { id: "FNano" } },
        Stanene: { resource: { id: "FStan" } },
      },
    },
    game: {
      global: { race: { universe } },
      traits: {
        mastery: { type: "minor", val: 1 },
        fortify: { type: "special", val: 1 },
        hardy: { type: "minor", val: 2 },
        smart: { type: "major", val: 3 },
        dumb: { type: "major", val: -2 },
        herbivore_g: { type: "genus", val: 1 },
        carnivore_g: { type: "genus", val: 1 },
        xenophobic: { type: "major", val: 1 },
        rigid: { type: "genus", val: 1 },
      },
    },
    GameLog: {
      Types: { construction: {}, mercenary: {}, prestige: {}, spy: {} },
    },
    GenusTrait,
    GovernmentManager: {
      Types: {
        democracy: { id: "gov-dem" },
        technocracy: { id: "gov-tech" },
        corpocracy: { id: "gov-corp" },
      },
    },
    initBuildingState() {
      trace.push("initBuildingState");
      world.BuildingManager.priorityList = Object.values(buildings);
    },
    JobManager: managed("job"),
    jobs,
    MajorTrait,
    MarketManager: managed("market"),
    MinorTrait,
    MinorTraitManager: managed("minorTrait"),
    MutableTraitManager: managed("mutableTrait"),
    NaniteManager: {
      priorityList: [],
      isConsumable(r) {
        return r.nanite;
      },
    },
    ocularPowerData: { p1: { id: "op1" }, p2: { id: "op2" } },
    planetBiomes: ["forest", "desert", "oceanic"],
    planetTraits: ["toxic", "mellow"],
    poly: {
      galaxyOffers: [{ buy: { res: "Copper" } }, { buy: { res: "Iron" } }],
      genus_traits: { herbivore: {}, carnivore: {} },
      neg_roll_traits: ["dumb"],
    },
    ProjectManager: managed("project"),
    projects,
    ReplicatorManager: {
      Productions: { Stone: { id: "Stone" }, BrickR: { id: "BrickR" } },
    },
    resources,
    RitualManager: {
      Productions: {
        farmer: { id: "farmer" },
        hunting: { id: "hunting" },
        misc: { id: "misc" },
      },
    },
    SmelterManager: {
      Fuels: { Oil: { id: "Oil" }, Coal: { id: "Coal" }, Wood: { id: "Wood" } },
    },
    StorageManager: managed("storage"),
    SupplyManager: {
      priorityList: [],
      isConsumable(r) {
        return r.supply;
      },
      supplyIn(id) {
        return resById[id]?.supplyInVal ?? 0;
      },
    },
    traitList: ["toxic"],
    TriggerManager: {
      priorityList: [],
      AddTrigger(reqType, reqId, reqCount, actType, actId, actCount) {
        trace.push([
          "AddTrigger",
          reqType,
          reqId,
          reqCount,
          actType,
          actId,
          actCount,
        ]);
        this.priorityList.push({
          requirementType: reqType,
          requirementId: reqId,
          requirementCount: reqCount,
          actionType: actType,
          actionId: actId,
          actionCount: actCount,
        });
      },
    },
  };

  return world;
}

function makeLegacy(world) {
  const dependencies = Object.fromEntries(
    DEP_NAMES.map((name) => [name, () => world[name]]),
  );
  dependencies.applySettings = () => (def, reset) =>
    applySettings(world.settingsRaw, def, reset);
  return createLegacyResetSettings({ dependencies });
}

function makeNew(world) {
  const deps = {};
  for (const name of DEP_NAMES) {
    if (name === "applySettings" || name === "settingsRaw") continue;
    deps[name] = () => world[name];
  }
  const adapter = createEvolveSettingsResetAdapter(deps);
  return createSettingsResets({
    getSettingsRaw: () => world.settingsRaw,
    reader: adapter.reader,
    effects: adapter.effects,
  });
}

const PRIORITY_MANAGERS = [
  "MarketManager",
  "StorageManager",
  "JobManager",
  "BuildingManager",
  "MinorTraitManager",
  "MutableTraitManager",
  "ProjectManager",
  "AlchemyManager",
  "EjectManager",
  "SupplyManager",
  "NaniteManager",
];

function keyOf(item) {
  return item?.id ?? item?._originalId ?? item?.traitName ?? item?._vueBinding;
}

function priorityIds(world) {
  return Object.fromEntries(
    PRIORITY_MANAGERS.map((name) => [
      name,
      world[name].priorityList.map(keyOf),
    ]),
  );
}

// ---- Dual run: legacy getter-bag vs. pure defaults + adapter, reset=false ----
function dualRun(reset, universe) {
  const legacyWorld = makeWorld(universe);
  const newWorld = makeWorld(universe);
  const legacy = makeLegacy(legacyWorld);
  const neu = makeNew(newWorld);

  for (const name of RESET_ORDER) {
    legacy[name](reset);
    neu[name](reset);
  }

  assert.deepEqual(
    newWorld.settingsRaw,
    legacyWorld.settingsRaw,
    `settingsRaw parity (reset=${reset}, ${universe})`,
  );
  assert.deepEqual(
    newWorld.trace,
    legacyWorld.trace,
    `manager-call trace parity (reset=${reset}, ${universe})`,
  );
  assert.deepEqual(
    priorityIds(newWorld),
    priorityIds(legacyWorld),
    `priority-list parity (reset=${reset}, ${universe})`,
  );
  return { legacyWorld, newWorld };
}

const { newWorld } = dualRun(false, "standard");
dualRun(true, "standard");
dualRun(false, "magic");
dualRun(true, "magic");

// Spot-check that the dual run actually populated meaningful state.
assert.equal(newWorld.settingsRaw.scriptName, undefined); // resets don't set scriptName
assert.equal(newWorld.settingsRaw.autoFight, false);
assert.equal(newWorld.settingsRaw.govInterim, "gov-dem");
assert.equal(newWorld.settingsRaw.challenge_junker, false);
assert.equal(newWorld.settingsRaw.biome_w_forest, 30);
assert.equal(newWorld.settingsRaw.extra_w_Achievement, 1000);
assert.deepEqual(newWorld.settingsRaw.triggers.length, 3);
assert.deepEqual(
  newWorld.MarketManager.priorityList.map((r) => r.id),
  [
    "Bolognium",
    "Vitreloy",
    "Orichalcum",
    "Elerium",
    "Crystal",
    "Iron",
    "Copper",
    "Food",
  ],
);

// ---- Focused pure-function tests ----

// Market reverses the tradable order and pins trade priorities.
{
  const plan = computeMarketDefaults({
    tradableResourceIds: ["Food", "Copper", "Iron"],
    galaxyOfferResourceIds: ["Copper"],
  });
  assert.deepEqual(plan.priorityOrders, [
    { manager: "market", ids: ["Iron", "Copper", "Food"], sort: true },
  ]);
  assert.equal(plan.def.res_buy_p_Iron, 0); // first in reversed order
  assert.equal(plan.def.res_buy_p_Food, 2);
  assert.equal(plan.def.res_trade_p_Food, 1); // pinned
  assert.equal(plan.def.res_trade_p_Copper, 4); // pinned (Aluminium/Iron/Copper group)
  assert.equal(plan.def.res_galaxy_p_Copper, 1);
}

// Ejector: standard universe forces Elerium then Infernite to the front of the eject list.
{
  const resources = [
    {
      id: "A",
      isTradable: true,
      atomicMass: 10,
      ejectConsumable: true,
      supplyConsumable: false,
      naniteConsumable: false,
      supplyIn: 0,
    },
    {
      id: "B",
      isTradable: false,
      atomicMass: 99,
      ejectConsumable: true,
      supplyConsumable: true,
      naniteConsumable: false,
      supplyIn: 4,
    },
    {
      id: "Elerium",
      isTradable: true,
      atomicMass: 300,
      ejectConsumable: true,
      supplyConsumable: false,
      naniteConsumable: false,
      supplyIn: 0,
    },
    {
      id: "Infernite",
      isTradable: false,
      atomicMass: 250,
      ejectConsumable: true,
      supplyConsumable: false,
      naniteConsumable: false,
      supplyIn: 0,
    },
  ];
  const std = computeEjectorDefaults({
    universe: "standard",
    resources,
    eleriumId: "Elerium",
    inferniteId: "Infernite",
  });
  const eject = std.priorityOrders.find((o) => o.manager === "eject");
  assert.deepEqual(eject.ids, ["Elerium", "Infernite", "B", "A"]); // unshifted, rest by mass desc
  assert.equal(std.def.res_ejectElerium, true); // forced
  assert.equal(std.def.res_ejectInfernite, true); // forced
  assert.equal(std.def.res_ejectA, true); // tradable

  const magic = computeEjectorDefaults({
    universe: "magic",
    resources,
    eleriumId: "Elerium",
    inferniteId: "Infernite",
  });
  const magicEject = magic.priorityOrders.find((o) => o.manager === "eject");
  assert.deepEqual(magicEject.ids, ["Elerium", "Infernite", "B", "A"]); // pure mass desc, no unshift
}

// Mutable trait: genus-index primary sort, major before genus within a genus (stable).
{
  const plan = computeMutableTraitDefaults({
    genusOrder: ["herbivore", "carnivore"],
    traits: [
      {
        traitName: "smart",
        type: "major",
        genus: "herbivore",
        isGainable: true,
        isNegRoll: false,
      },
      {
        traitName: "dumb",
        type: "major",
        genus: "carnivore",
        isGainable: true,
        isNegRoll: true,
      },
      {
        traitName: "herbivore_g",
        type: "genus",
        genus: "herbivore",
        isGainable: false,
        isNegRoll: false,
      },
      {
        traitName: "carnivore_g",
        type: "genus",
        genus: "carnivore",
        isGainable: false,
        isNegRoll: false,
      },
    ],
  });
  assert.deepEqual(plan.priorityOrders[0].ids, [
    "smart",
    "herbivore_g",
    "dumb",
    "carnivore_g",
  ]);
  assert.equal(plan.def.mutableTrait_p_smart, 0);
  assert.equal(plan.def.mutableTrait_p_dumb, 2);
  assert.equal(plan.def.mutableTrait_gain_smart, false); // gainable
  assert.ok(!("mutableTrait_gain_herbivore_g" in plan.def)); // not gainable
  assert.equal(plan.def.mutableTrait_reset_dumb, false); // neg-roll
  assert.ok(!("mutableTrait_reset_smart" in plan.def));
}

// Job: breakpoints resolve through the key -> originalId map.
{
  const plan = computeJobDefaults({
    jobs: [
      { key: "Colonist", originalId: "o_col", isSmart: false },
      { key: "Miner", originalId: "o_min", isSmart: true },
    ],
  });
  assert.deepEqual(plan.priorityOrders[0].ids, ["o_col", "o_min"]);
  assert.equal(plan.def.job_p_o_col, 0);
  assert.equal(plan.def.job_s_o_min, true); // smart
  assert.ok(!("job_s_o_col" in plan.def)); // not smart
  assert.equal(plan.def.job_b1_o_col, -1); // Colonist breakpoints
  assert.equal(plan.def.job_b2_o_min, 5); // Miner breakpoints
}

console.log("Reset settings module tests passed");
