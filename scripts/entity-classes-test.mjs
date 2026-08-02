import assert from "node:assert/strict";
import { createEntityClasses } from "../src/game/entities.ts";

const dependencyNames = [
  "$",
  "arpaIds",
  "buildingIds",
  "buildings",
  "checkAffordableCustom",
  "checkTypes",
  "conflictingTraits",
  "document",
  "fanatAchievements",
  "Fibonacci",
  "game",
  "GameLog",
  "getAchievementStar",
  "getCitadelConsumption",
  "getStarLevel",
  "getVueById",
  "haveTask",
  "haveTech",
  "jobs",
  "KeyManager",
  "logIgnore",
  "logPrestige",
  "mainVue",
  "MutableTraitManager",
  "mutationCostMultipliers",
  "mutationCostMultipliersGenus",
  "normalizeProperties",
  "poly",
  "races",
  "resources",
  "retBools",
  "settings",
  "settingsRaw",
  "specialRaceTraits",
  "state",
  "techIds",
  "ticksPerSecond",
  "traitVal",
  "TriggerManager",
  "WarManager",
  "featureVisibility",
  "gameModal",
];

const context = Object.fromEntries(dependencyNames.map((name) => [name, {}]));
Object.assign(context, {
  $: () => ({}),
  checkAffordableCustom: () => true,
  Fibonacci: (value) => value,
  getAchievementStar: () => 0,
  getCitadelConsumption: () => 0,
  getStarLevel: () => 0,
  getVueById: () => undefined,
  haveTask: () => false,
  haveTech: () => false,
  logPrestige: () => {},
  normalizeProperties: (flags) => flags,
  ticksPerSecond: () => 10,
  traitVal: (_name, fallback) => fallback,
  settings: { craftIron: true },
  settingsRaw: {},
  game: {
    global: {
      civic: { farmer: { job: "farmer", name: "Farmer", display: true } },
      resource: { Iron: {} },
    },
  },
});

const classes = createEntityClasses({
  readJQuery: () => context.$,
  readArpaIds: () => context.arpaIds,
  readBuildingIds: () => context.buildingIds,
  readBuildings: () => context.buildings,
  readCheckAffordableCustom: () => context.checkAffordableCustom,
  readCheckTypes: () => context.checkTypes,
  readConflictingTraits: () => context.conflictingTraits,
  readDocument: () => context.document,
  readFanatAchievements: () => context.fanatAchievements,
  readFibonacci: () => context.Fibonacci,
  readGame: () => context.game,
  readGameLog: () => context.GameLog,
  readAchievementStar: () => context.getAchievementStar,
  readCitadelConsumption: () => context.getCitadelConsumption,
  readStarLevel: () => context.getStarLevel,
  readVueById: () => context.getVueById,
  readHaveTask: () => context.haveTask,
  readHaveTech: () => context.haveTech,
  readJobs: () => context.jobs,
  readKeyManager: () => context.KeyManager,
  readLogIgnore: () => context.logIgnore,
  readLogPrestige: () => context.logPrestige,
  readMainVue: () => context.mainVue,
  readMutableTraitManager: () => context.MutableTraitManager,
  readMutationCostMultipliers: () => context.mutationCostMultipliers,
  readMutationCostMultipliersGenus: () => context.mutationCostMultipliersGenus,
  readNormalizeProperties: () => context.normalizeProperties,
  readPoly: () => context.poly,
  readRaces: () => context.races,
  readResources: () => context.resources,
  readRetBools: () => context.retBools,
  readSettings: () => context.settings,
  readSettingsRaw: () => context.settingsRaw,
  readSpecialRaceTraits: () => context.specialRaceTraits,
  readState: () => context.state,
  readTechIds: () => context.techIds,
  readTicksPerSecond: () => context.ticksPerSecond,
  readTraitVal: () => context.traitVal,
  readTriggerManager: () => context.TriggerManager,
  readWarManager: () => context.WarManager,
  readFeatureVisibility: () => context.featureVisibility,
  readGameModal: () => context.gameModal,
});

assert.equal(Object.keys(classes).length, 32);
assert.equal(classes.BasicJob.prototype instanceof classes.Job, true);
assert.equal(classes.SoulGem.prototype instanceof classes.Resource, true);
assert.equal(classes.CityAction.prototype instanceof classes.Action, true);

// An evolution action is offered whenever the page shows its own element.
const visibleEvolutionSelectors = new Set();
context.featureVisibility = {
  isVisible: (selector) => visibleEvolutionSelectors.has(selector),
};
const bilateralSymmetry = new classes.EvolutionAction("bilateral_symmetry");
assert.equal(bilateralSymmetry.isUnlocked(), false);
visibleEvolutionSelectors.add("#evolution-bilateral_symmetry");
assert.equal(bilateralSymmetry.isUnlocked(), true);

const technologyActions = [];
const observedTabLoads = [];
context.document = { querySelector: () => ({}) };
context.getVueById = () => ({
  action: () => {
    technologyActions.push("action");
    observedTabLoads.push(context.mainVue.s.tabLoad);
  },
});
context.game = {
  global: {
    settings: { civTabs: 2 },
    resource: { Knowledge: { currentQuantity: 100 } },
    tech: {},
    race: {},
  },
  actions: { tech: { mad: { title: "Mad" } } },
  checkAffordable: () => true,
};
context.resources = context.game.global.resource;
context.settings = { performanceHackAvoidDrawTech: true };
context.mainVue = { s: { civTabs: 2, tabLoad: true } };
context.poly = { loc: () => "researched" };
context.GameLog = { logSuccess: () => {} };
const technology = new classes.Technology("mad");
technology.cost = { Knowledge: 1 };
assert.equal(technology.click(), true);
assert.deepEqual(technologyActions, ["action"]);
assert.deepEqual(
  observedTabLoads,
  [true],
  "off-tab research keeps preloaded Vue content available for drawTech",
);
assert.equal(context.mainVue.s.tabLoad, true);

context.mainVue.s.civTabs = 3;
assert.equal(technology.click(), true);
assert.deepEqual(observedTabLoads, [true, true]);

context.game = {
  global: {
    civic: {
      farmer: { job: "farmer", name: "Farmer", display: true },
    },
    resource: { Iron: {} },
  },
};
context.settings = { craftIron: true };
const job = new classes.Job("farmer", "fallback", { basic: true });
assert.equal(job.name, "Farmer");
assert.equal(job.is.basic, true);

context.game = {
  global: {
    civic: {
      farmer: { job: "farmer", name: "Live Farmer", display: true },
    },
    resource: { Iron: {} },
  },
};
assert.equal(job.name, "Live Farmer");

const resource = new classes.Resource("Iron", "Iron", { tradable: true });
assert.equal(resource.autoCraftEnabled, true);
context.settings = { craftIron: false };
assert.equal(resource.autoCraftEnabled, false);

context.normalizeProperties = (flags) => ({ wrapped: flags });
const nextJob = new classes.Job("farmer", "fallback", { basic: true });
assert.equal(nextJob.is.wrapped.basic, true);

// Hybrid-race habitability accounts for biome via the constituent genera.
// Regression: Nephilim (demonic+angelic) was scored reachable on any planet
// with godslayer, so the automation committed to it and stalled forever when
// neither genus action could render. Its genera only render on hellscape/eden
// (or unbound blood >= 3); beholder (eldritch+giant) stays reachable anywhere
// because giant has no biome gate.
context.game = {
  global: {
    stats: { achieve: { godslayer: { e: 5 } } },
    blood: { unbound: 0 },
    city: { biome: "grassland" },
  },
  races: {
    nephilim: { type: "hybrid", hybrid: ["demonic", "angelic"] },
    beholder: { type: "hybrid", hybrid: ["eldritch", "giant"] },
  },
};
const nephilim = new classes.Race("nephilim");
const beholder = new classes.Race("beholder");

// Wrong biome, no unbound blood: Nephilim unevolvable -> unreachable.
assert.equal(nephilim.getHabitability(), 0);
// giant hits the default habitability, so beholder is reachable anywhere.
assert.equal(beholder.getHabitability(), 1);

// Correct biomes render one of Nephilim's genus actions.
context.game.global.city.biome = "hellscape";
assert.equal(nephilim.getHabitability(), 1);
context.game.global.city.biome = "eden";
assert.equal(nephilim.getHabitability(), 1);

// Unbound blood >= 3 lets shadow genera evolve off-biome.
context.game.global.city.biome = "grassland";
context.game.global.blood.unbound = 3;
assert.equal(nephilim.getHabitability(), 0.9);

// No godslayer: no hybrid is reachable.
context.game.global.stats.achieve = {};
assert.equal(nephilim.getHabitability(), 0);
assert.equal(beholder.getHabitability(), 0);

// Purge gating tolerates the lazily absent race bags. `iTraits` and `ss_traits`
// only exist once the game has granted an inherited or subspecies trait.
context.game = {
  global: { race: { species: "human", hardy: 1 } },
  traits: { hardy: { val: 1 } },
  races: { human: { type: "humanoid" } },
};
context.settings = { mutableTrait_purge_hardy: true };
context.resources = { Plasmid: { currentQuantity: 100 } };
context.MutableTraitManager = { minimumPlasmidsToPreserve: 0 };
context.mutationCostMultipliers = {};
context.mutationCostMultipliersGenus = {};

const hardy = new classes.MutableTrait("hardy");
assert.equal(hardy.canPurge(), true);

// An inherited trait of the same name blocks the purge; another one does not.
context.game.global.race.iTraits = { hardy: 1 };
assert.equal(hardy.canPurge(), false);
context.game.global.race.iTraits = { rugged: 1 };
assert.equal(hardy.canPurge(), true);
context.game.global.race.ss_traits = ["hardy"];
assert.equal(hardy.canPurge(), false);

// Busy-worker accounting for a draining resource. Regression: when the production
// breakdown listed nothing for the worker source, the per-worker rate was zero and the
// count came back Infinity, which the jobs adapter rejects as a non-finite number.
context.state = { globalProductionModifier: 1 };
context.poly = { loc: (source) => source };
context.game = { global: {}, breakdown: { p: { Aluminium: {} } } };

const aluminium = new classes.Resource("Aluminium", "Aluminium");
aluminium.calculateRateOfChange = () => -5;
assert.equal(aluminium.getBusyWorkers("job_miner", 4), 1);
assert.equal(aluminium.getBusyWorkers("job_miner", 0), 1);

// A source that does produce reports the workers covering production plus the deficit:
// four workers at 2/s each, 8 produced and 5 consumed beyond that, so ceil(13 / 2).
context.game.breakdown.p.Aluminium = { job_miner: "8" };
assert.equal(aluminium.getBusyWorkers("job_miner", 4), 7);

// Nothing is busy while the resource is accumulating, with or without a breakdown entry.
aluminium.calculateRateOfChange = () => 8;
assert.equal(aluminium.getBusyWorkers("job_miner", 4), 0);
context.game.breakdown.p.Aluminium = {};
assert.equal(aluminium.getBusyWorkers("job_miner", 4), 0);

console.log("Entity classes module tests passed");
