import assert from "node:assert/strict";
import { createResetSettings } from "../src/settings/reset-settings.ts";

const dependencyNames = [
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

const trace = [];
const applied = [];
const context = Object.fromEntries(dependencyNames.map((name) => [name, {}]));
Object.assign(context, {
  applySettings: (defaults, reset) => applied.push({ defaults, reset }),
  biomeList: ["forest", "desert"],
  challenges: [],
  extraList: ["Unicorn"],
  game: {
    global: { race: { universe: "standard" } },
    traits: {
      mastery: { type: "minor" },
      smart: { type: "major" },
    },
  },
  initBuildingState: () => trace.push("initBuildingState"),
  ocularPowerData: {},
  planetBiomes: ["forest", "desert"],
  planetTraits: ["high_gravity"],
  poly: { galaxyOffers: [], genus_traits: {} },
  resources: {
    Iron: { id: "Iron", is: { tradable: true } },
    Copper: { id: "Copper", is: { tradable: true } },
    Hidden: { id: "Hidden", is: { tradable: false } },
  },
  traitList: ["high_gravity"],
  MarketManager: {
    priorityList: [],
    sortByPriority: () => trace.push("market:sort"),
  },
  MinorTraitManager: {
    priorityList: [],
    sortByPriority: () => trace.push("minor:sort"),
  },
  GovernmentManager: {
    Types: {
      democracy: { id: "democracy" },
      technocracy: { id: "technocracy" },
      corpocracy: { id: "corpocracy" },
    },
  },
});

class MinorTraitA {
  constructor(id) {
    this.traitName = id;
    this.source = "A";
  }
}
context.MinorTrait = MinorTraitA;
context.MajorTrait = class {};
context.GenusTrait = class {};

const dependencies = Object.fromEntries(
  dependencyNames.map((name) => [name, () => context[name]]),
);
const resets = createResetSettings({ dependencies });

resets.resetGeneralSettings(true);
assert.equal(applied.at(-1).reset, true);
assert.equal(applied.at(-1).defaults.tickRate, 4);
assert.equal(applied.at(-1).defaults.masterScriptToggle, true);

context.applySettings = (defaults, reset) =>
  trace.push(`live:${reset}:${defaults.activeTargetsUI}`);
resets.resetInterfaceSettings(false);
assert.equal(trace.at(-1), "live:false:false");

context.applySettings = (defaults, reset) => applied.push({ defaults, reset });
resets.resetMarketSettings(false);
assert.deepEqual(
  context.MarketManager.priorityList.map((resource) => resource.id),
  ["Copper", "Iron"],
);
assert.equal(applied.at(-1).defaults.res_buy_p_Copper, 0);
assert.equal(applied.at(-1).defaults.res_trade_p_Iron, 4);
assert.equal(trace.at(-1), "market:sort");

resets.resetMinorTraitSettings(false);
assert.equal(context.MinorTraitManager.priorityList[0].traitName, "mastery");
assert.equal(context.MinorTraitManager.priorityList[0].source, "A");
assert.equal(trace.at(-1), "minor:sort");

context.MinorTrait = class {
  constructor(id) {
    this.traitName = id;
    this.source = "B";
  }
};
resets.resetMinorTraitSettings(false);
assert.equal(context.MinorTraitManager.priorityList[0].source, "B");

resets.resetPlanetSettings(false);
assert.equal(applied.at(-1).defaults.biome_w_forest, 20);
assert.equal(applied.at(-1).defaults.trait_w_high_gravity, 10);
assert.equal(applied.at(-1).defaults.extra_w_Achievement, 1000);

console.log("Reset settings module tests passed");
