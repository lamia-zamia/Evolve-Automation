import assert from "node:assert/strict";
import { createGameActionControls } from "../src/adapters/browser/game-action-controls.ts";
import { createGameCraftingControls } from "../src/adapters/browser/game-crafting-controls.ts";
import { createGameJobControls } from "../src/adapters/browser/game-job-controls.ts";
import { createGameResearchControls } from "../src/adapters/browser/game-research-controls.ts";
import { createEntityClasses } from "../src/game/entities.ts";

const dependencyNames = [
  "arpaIds",
  "buildingIds",
  "buildings",
  "checkAffordableCustom",
  "checkTypes",
  "conflictingTraits",
  "fanatAchievements",
  "Fibonacci",
  "game",
  "GameLog",
  "getAchievementStar",
  "getCitadelConsumption",
  "getStarLevel",
  "haveTask",
  "haveTech",
  "jobs",
  "logIgnore",
  "logPrestige",
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
  "actionControls",
  "clickMultipliers",
  "craftingControls",
  "featureVisibility",
  "jobControls",
  "gameModal",
  "projectControls",
  "researchControls",
];

const context = Object.fromEntries(dependencyNames.map((name) => [name, {}]));
Object.assign(context, {
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
  readArpaIds: () => context.arpaIds,
  readBuildingIds: () => context.buildingIds,
  readBuildings: () => context.buildings,
  readCheckAffordableCustom: () => context.checkAffordableCustom,
  readCheckTypes: () => context.checkTypes,
  readConflictingTraits: () => context.conflictingTraits,
  readFanatAchievements: () => context.fanatAchievements,
  readFibonacci: () => context.Fibonacci,
  readGame: () => context.game,
  readGameLog: () => context.GameLog,
  readAchievementStar: () => context.getAchievementStar,
  readCitadelConsumption: () => context.getCitadelConsumption,
  readStarLevel: () => context.getStarLevel,
  readHaveTask: () => context.haveTask,
  readHaveTech: () => context.haveTech,
  readJobs: () => context.jobs,
  readLogIgnore: () => context.logIgnore,
  readLogPrestige: () => context.logPrestige,
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
  readActionControls: () => context.actionControls,
  readClickMultipliers: () => context.clickMultipliers,
  readCraftingControls: () => context.craftingControls,
  readFeatureVisibility: () => context.featureVisibility,
  readJobControls: () => context.jobControls,
  readGameModal: () => context.gameModal,
  readProjectControls: () => context.projectControls,
  readResearchControls: () => context.researchControls,
});

// Action controls go through the port, over the real adapter, so every building
// read and click below exercises it end to end.
const noTooltip = {
  length: 0,
  is: () => false,
  data: () => undefined,
  attr: () => {},
};
let actionTooltip = noTooltip;
context.actionControls = createGameActionControls({
  getVueById: (elementId) => context.getVueById(elementId),
  selectTooltip: () => actionTooltip,
  clickSteps: (count) =>
    Array.from({ length: count }, (_value, index) => index),
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
const researchElements = { "#tech-mad > .button:not(.precog)": {} };
const researchView = {
  action: () => {
    technologyActions.push("action");
    observedTabLoads.push(context.mainVue.s.tabLoad);
  },
};
const researchViews = { "tech-mad": researchView };
// Set to let the entry answer the availability check and then disappear.
let vanishAfterCheck = false;
let checksSinceVanish = 0;
context.researchControls = createGameResearchControls({
  getDocument: () => ({
    querySelector: (selector) => researchElements[selector] ?? null,
  }),
  getVueById: (elementId) => {
    if (!vanishAfterCheck) return researchViews[elementId];
    checksSinceVanish += 1;
    return checksSinceVanish > 1 ? undefined : researchViews[elementId];
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
assert.equal(context.resources.Knowledge.currentQuantity, 98);

// A researched entry stays mounted and is recognized by its `.oldTech` marker.
assert.equal(technology.isResearched(), false);
researchElements["#tech-mad .oldTech"] = {};
assert.equal(technology.isResearched(), true);
delete researchElements["#tech-mad .oldTech"];

// The game withdrew the entry between the availability check and the click:
// nothing is spent and nothing is logged as researched.
vanishAfterCheck = true;
assert.equal(technology.click(), false);
assert.deepEqual(technologyActions, ["action", "action"]);
assert.equal(context.resources.Knowledge.currentQuantity, 98);
vanishAfterCheck = false;

// An entry the game has not rendered a buy control for is not unlocked.
delete researchElements["#tech-mad > .button:not(.precog)"];
assert.equal(technology.isUnlocked(), false);
assert.equal(technology.click(), false);
researchElements["#tech-mad > .button:not(.precog)"] = {};
assert.equal(technology.isUnlocked(), true);

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

// Job assignment goes through the job controls port, over the real adapter.
const jobCalls = [];
const jobSteps = [];
const jobViews = {};
for (const elementId of [
  "civ-farmer",
  "servant-farmer",
  "foundry",
  "skilledServants",
]) {
  jobViews[elementId] = {
    add: (...args) => jobCalls.push({ elementId, method: "add", args }),
    sub: (...args) => jobCalls.push({ elementId, method: "sub", args }),
    setDefault: (...args) =>
      jobCalls.push({ elementId, method: "setDefault", args }),
  };
}
context.jobControls = createGameJobControls({
  getVueById: (elementId) => jobViews[elementId],
  clickSteps: (count) => {
    jobSteps.push(count);
    return count > 0 ? [count] : [];
  },
});
context.game.global.civic.craftsman = { max: 10 };
context.game.global.race = {};
context.game.global.resource = { Iron: { display: true } };

assert.equal(job.addWorkers(2), true);
assert.equal(job.removeWorkers(3), true);
assert.deepEqual(jobCalls, [
  { elementId: "civ-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "sub", args: [] },
]);
assert.deepEqual(jobSteps, [2, 3]);

// A negative count is the opposite request, and does not also reach its own
// control with a count that would move nobody.
jobCalls.length = 0;
jobSteps.length = 0;
assert.equal(job.addWorkers(-4), true);
assert.deepEqual(jobCalls, [
  { elementId: "civ-farmer", method: "sub", args: [] },
]);
assert.deepEqual(jobSteps, [4]);

// A basic job has its own servant control, and is made default through the
// worker control. The game refuses to staff the default job by hand.
jobCalls.length = 0;
const farmer = new classes.BasicJob("farmer", "fallback", { basic: true });
assert.equal(farmer.addServants(1), true);
assert.equal(farmer.setAsDefault(), true);
assert.deepEqual(jobCalls, [
  { elementId: "servant-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "setDefault", args: ["farmer"] },
]);

jobCalls.length = 0;
context.game.global.civic.d_job = "farmer";
assert.equal(farmer.addWorkers(1), false);
assert.equal(farmer.removeWorkers(1), false);
assert.deepEqual(jobCalls, []);
delete context.game.global.civic.d_job;

// Crafting jobs share one control per kind, so the crafted resource travels
// with the request.
const craftsman = new classes.CraftingJob("Iron", "Iron", { id: "Iron" });
assert.equal(craftsman.addWorkers(1), true);
assert.equal(craftsman.removeWorkers(1), true);
assert.equal(craftsman.addServants(1), true);
assert.equal(craftsman.removeServants(1), true);
assert.deepEqual(jobCalls, [
  { elementId: "foundry", method: "add", args: ["Iron"] },
  { elementId: "foundry", method: "sub", args: ["Iron"] },
  { elementId: "skilledServants", method: "add", args: ["Iron"] },
  { elementId: "skilledServants", method: "sub", args: ["Iron"] },
]);

// A crafted resource the game is not showing has no control to reach.
jobCalls.length = 0;
context.game.global.resource.Iron.display = false;
assert.equal(craftsman.addWorkers(1), false);
assert.equal(craftsman.removeWorkers(1), false);
assert.deepEqual(jobCalls, []);
context.game.global.resource.Iron.display = true;

// An unmounted control reports the refusal rather than throwing.
jobCalls.length = 0;
delete jobViews["civ-farmer"];
assert.equal(job.addWorkers(1), false);
assert.equal(farmer.setAsDefault(), false);
assert.deepEqual(jobCalls, []);

context.game = {
  global: {
    civic: {
      farmer: { job: "farmer", name: "Live Farmer", display: true },
    },
    resource: { Iron: {} },
  },
};

const resource = new classes.Resource("Iron", "Iron", { tradable: true });
assert.equal(resource.autoCraftEnabled, true);
context.settings = { craftIron: false };
assert.equal(resource.autoCraftEnabled, false);

// Manual crafting goes through the real adapter over stubbed rows.
const craftViews = {};
const craftCalls = [];
let craftMultipliersCleared = 0;
context.craftingControls = createGameCraftingControls({
  getVueById: (elementId) => craftViews[elementId],
  clearClickMultipliers: () => (craftMultipliersCleared += 1),
});

// The row the resource names is "res" plus its id, and the count reaches the
// game unscaled.
craftViews["resIron"] = {
  craft: (...args) => craftCalls.push(args),
};
assert.equal(resource.tryCraftX(12), true);
assert.deepEqual(craftCalls, [["Iron", 12]]);
assert.equal(craftMultipliersCleared, 1);

// A resource whose id is not the one its row is named after — the population
// node renames itself to the species — crafts under both.
context.game.global.race = { species: "human" };
const population = new classes.Population("Population", "Population");
craftViews["resPopulation"] = {
  craft: (...args) => craftCalls.push(args),
};
craftCalls.length = 0;
assert.equal(population.tryCraftX(1), true);
assert.deepEqual(craftCalls, [["human", 1]]);

// An unrendered row refuses rather than throwing, and leaves the click
// multipliers alone.
delete craftViews["resIron"];
craftCalls.length = 0;
craftMultipliersCleared = 0;
assert.equal(resource.tryCraftX(12), false);
assert.deepEqual(craftCalls, []);
assert.equal(craftMultipliersCleared, 0);

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

// A project is bought in steps, and the purchase advances both its rank and its
// completion percentage, so the log has to be written from values read before it.
const projectPurchases = [];
let projectAvailable = true;
context.projectControls = {
  build: (request) => {
    if (!projectAvailable) return false;
    projectPurchases.push(request);
    context.game.global.arpa.lhc.rank += 1;
    context.game.global.arpa.lhc.complete = 0;
    return true;
  },
};
const projectLogs = [];
context.GameLog = {
  logSuccess: (kind, message) => projectLogs.push([kind, message]),
};
context.poly = { loc: (_key, [subject]) => subject };
context.featureVisibility = { isVisible: () => true };
const multiplierCalls = [];
context.clickMultipliers = {
  holdMaximum: () => multiplierCalls.push("hold"),
  clear: () => multiplierCalls.push("clear"),
};
context.checkAffordableCustom = () => true;
context.settings = { performanceHackAvoidDrawTech: true };
context.game = {
  global: { arpa: { lhc: { rank: 4, complete: 90 } } },
  actions: { arpa: { lhc: { title: "Launch Facility" } } },
};
context.resources = { Money: { currentQuantity: 500 } };
// Action.isUnlocked still asks for the mounted component; only the purchase moved.
context.getVueById = (id) => (id === "arpalhc" ? {} : undefined);

const project = new classes.Project("Launch Facility", "lhc");
project.currentStep = 5;
project.cost = { Money: 120 };
assert.equal(project.click(), true);
assert.deepEqual(projectPurchases, [
  { elementId: "arpalhc", projectId: "lhc", steps: 5, skipTabRedraw: false },
]);
assert.equal(context.resources.Money.currentQuantity, 380);
assert.deepEqual(
  multiplierCalls,
  ["clear"],
  "a project buys its own steps, so no multiplier key may be left held",
);
assert.deepEqual(
  projectLogs,
  [["arpa", "Launch Facility (95%)"]],
  "the percentage is the one the purchase reached, not the one it left behind",
);

// The redraw suppression is asked for once the project is past its tenth rank,
// and a purchase that finishes the project logs the completion instead.
context.game.global.arpa.lhc.rank = 10;
context.game.global.arpa.lhc.complete = 96;
projectLogs.length = 0;
assert.equal(project.click(), true);
assert.equal(projectPurchases.at(-1).skipTabRedraw, true);
assert.deepEqual(projectLogs, [["construction", "Launch Facility"]]);

// A control the game withdrew spends nothing and logs nothing.
projectAvailable = false;
projectLogs.length = 0;
assert.equal(project.click(), false);
assert.equal(context.resources.Money.currentQuantity, 260);
assert.deepEqual(projectLogs, []);

// A building action runs the game's own control, and spends and logs only once
// the control has actually run.
const actionCalls = [];
const powerCalls = [];
let mineView = {
  action: () => actionCalls.push("action"),
  power_on: () => powerCalls.push("on"),
  power_off: () => powerCalls.push("off"),
};
const definitionCalls = [];
const mineDefinition = {
  title: "Mine",
  switchable: () => true,
  action: () => definitionCalls.push("definition"),
};
const actionLogs = [];
context.GameLog = {
  logSuccess: (kind, message) => actionLogs.push([kind, message]),
};
context.buildings = {};
context.logIgnore = [];
context.settings = { performanceHackAvoidDrawTech: false };
context.resources = { Money: { currentQuantity: 500 } };
context.game = {
  global: {
    race: { species: "human" },
    settings: { showCity: true, showSpace: true },
    city: { mine: { count: 2, on: 1 } },
  },
  actions: { city: { mine: mineDefinition } },
  checkAffordable: () => true,
};
context.getVueById = (id) => (id === "city-mine" ? mineView : undefined);

const mine = new classes.Action("Mine", "city", "mine", "");
mine.cost = { Money: 120 };
assert.equal(mine.isUnlocked(), true);
assert.equal(mine.click(), true);
assert.deepEqual(actionCalls, ["action"]);
assert.equal(context.resources.Money.currentQuantity, 380);
assert.deepEqual(actionLogs, [["construction", "Mine"]]);

// isAutoBuildable() opens with isUnlocked() and autoBuildEnabled, so a caller
// that has already answered those two may skip the call outright. The storage
// requirements reader depends on that prefix to spare three quarters of the
// priority list a document lookup, three settings reads and a count getter.
context.settings["batcity-mine"] = true;
context.settings["bld_w_city-mine"] = 5;
context.settings["bld_m_city-mine"] = -1;
assert.equal(mine.isAutoBuildable(), true);
context.settings["batcity-mine"] = false;
assert.equal(mine.isAutoBuildable(), false, "not auto-build enabled");
context.settings["batcity-mine"] = true;
context.game.global.settings.showCity = false;
assert.equal(mine.isAutoBuildable(), false, "not unlocked");
context.game.global.settings.showCity = true;

// The game withdrew the control between the clickability check and the click:
// nothing is spent and nothing is logged as built.
mineView = {};
actionLogs.length = 0;
assert.equal(mine.click(), false);
assert.equal(context.resources.Money.currentQuantity, 380);
assert.deepEqual(actionLogs, []);

// The redraw-skipping shortcut calls the game's own definition action rather
// than the control, and gives up on it while a tooltip is on screen because the
// skipped postBuild hook is what would have redrawn it.
mineView = { action: () => actionCalls.push("action") };
mineDefinition.refresh = true;
context.settings.performanceHackAvoidDrawTech = true;
actionCalls.length = 0;
assert.equal(mine.click(), true);
assert.deepEqual(definitionCalls, ["definition"]);
assert.deepEqual(actionCalls, []);

actionTooltip = {
  length: 1,
  is: (selector) => selector === ":visible",
  data: () => "popper-city-farm",
  attr: () => {},
};
definitionCalls.length = 0;
assert.equal(mine.click(), true);
assert.deepEqual(definitionCalls, []);
assert.deepEqual(actionCalls, ["action"]);
actionTooltip = noTooltip;

// A multi-segmented building holds every multiplier key for its one click, so
// the game itself covers as many segments as the click can afford. Every other
// building releases them, and the setting alone decides which happens.
mineView = { action: () => actionCalls.push("action") };
mineDefinition.refresh = false;
context.settings.performanceHackAvoidDrawTech = false;
context.normalizeProperties = (flags) => flags;
const terraformer = new classes.Action(
  "Terraformer",
  "space",
  "terraformer",
  "",
  {
    multiSegmented: true,
  },
);
terraformer.cost = { Money: 120 };
context.game.global.space = { terraformer: { count: 2, on: 1 } };
context.game.actions.space = { terraformer: mineDefinition };
context.getVueById = (id) =>
  id === "space-terraformer" ? mineView : undefined;

multiplierCalls.length = 0;
context.settings.buildingsUseMultiClick = true;
assert.equal(terraformer.click(), true);
assert.deepEqual(multiplierCalls, ["hold"]);

multiplierCalls.length = 0;
context.settings.buildingsUseMultiClick = false;
assert.equal(terraformer.click(), true);
assert.deepEqual(multiplierCalls, ["clear"]);

multiplierCalls.length = 0;
context.getVueById = (id) => (id === "city-mine" ? mineView : undefined);
context.settings.buildingsUseMultiClick = true;
assert.equal(mine.click(), true);
assert.deepEqual(multiplierCalls, ["clear"]);

// Bulk building repeats the plain click up to its cap, and reads back what the
// game actually charged rather than predicting a price that rises per unit.
const bulkMoney = { currentQuantity: 1000, instance: { amount: 1000 } };
context.resources = { Money: bulkMoney };
context.settings.buildingsBulkBuild = true;
context.settings.buildingsBulkBuildMax = 4;
context.game.global.city.mine = { count: 2, on: 1 };
mineView = {
  action: () => {
    context.game.global.city.mine.count += 1;
    bulkMoney.instance.amount -= 130;
  },
};
context.getVueById = (id) => (id === "city-mine" ? mineView : undefined);
actionLogs.length = 0;
assert.equal(mine.click(true), true);
assert.equal(context.game.global.city.mine.count, 6);
assert.equal(bulkMoney.currentQuantity, 480, "charged 4 x 130, not 4 x 120");
assert.deepEqual(actionLogs, [["multi_construction", "Mine (6)"]]);

// A caller that wants exactly one building still gets exactly one.
context.game.global.city.mine.count = 2;
bulkMoney.currentQuantity = 1000;
bulkMoney.instance.amount = 1000;
actionLogs.length = 0;
assert.equal(mine.click(), true);
assert.equal(context.game.global.city.mine.count, 3);
assert.equal(
  bulkMoney.currentQuantity,
  880,
  "one building at the sampled cost",
);
assert.deepEqual(actionLogs, [["construction", "Mine"]]);

// Max Build bounds the purchase.
context.settings["bld_m_city-mine"] = 5;
context.game.global.city.mine.count = 4;
assert.equal(mine.click(true), true);
assert.equal(context.game.global.city.mine.count, 5, "stopped at Max Build");
delete context.settings["bld_m_city-mine"];

// So does the spare support of everything the building needs to operate.
const sunSupport = new classes.Support(
  "Sun Support",
  "Sun_Support",
  "space",
  "swarm_control",
);
sunSupport.rateOfChange = 2;
mine.consumption = [{ resource: sunSupport, rate: 1 }];
context.game.global.city.mine.count = 2;
assert.equal(mine.click(true), true);
assert.equal(context.game.global.city.mine.count, 4, "two spare support slots");
mine.consumption = [];

// Switching power is one request per direction, carrying the count as a
// magnitude, and a request for no change never reaches the control.
mineView = {
  power_on: () => powerCalls.push("on"),
  power_off: () => powerCalls.push("off"),
};
assert.equal(mine.tryAdjustState(0), false);
assert.deepEqual(powerCalls, []);
assert.equal(mine.tryAdjustState(2), true);
assert.deepEqual(powerCalls, ["on", "on"]);
assert.equal(mine.tryAdjustState(-1), true);
assert.deepEqual(powerCalls, ["on", "on", "off"]);

// A control that only exists while its modal is open is captured while it is
// rendered, and keeps working once the modal has closed.
const probeCalls = [];
let probeView = undefined;
context.getVueById = (id) => (id === "starDock-probes" ? probeView : undefined);

const probes = new classes.ModalAction("Probes", "starDock", "probes", "");
assert.equal(probes.isOptionsCached(), false);
assert.equal(probes.isUnlocked(), false);
probes.cacheOptions();
assert.equal(probes.isOptionsCached(), false, "there was nothing to capture");

probeView = { action: () => probeCalls.push("action") };
probes.cacheOptions();
assert.equal(probes.isOptionsCached(), true);
assert.equal(probes.isUnlocked(), true);

probeView = undefined;
assert.equal(probes.isUnlocked(), true, "the modal closed, the capture holds");
assert.equal(probes.activate(), true);
assert.deepEqual(probeCalls, ["action"]);

// Pricing an action evaluates its adjusted cost entries, and the game's
// checkAffordable used to evaluate all of them a second time. The snapshot must
// carry those values forward without changing a single answer.
const costEvaluations = [];
const affordabilityCalls = [];
context.game = {
  global: {
    settings: { showCity: true, civTabs: 0 },
    tech: {},
    race: {},
    resource: {},
  },
  actions: { city: { factory: { title: "Factory", cost: {} } } },
  checkAffordable: (action, max, preAdjusted) => {
    affordabilityCalls.push({
      max,
      preAdjusted: preAdjusted === true,
      prices: Object.fromEntries(
        Object.entries(action.cost).map(([name, read]) => [name, read()]),
      ),
    });
    return true;
  },
};
context.resources = { Money: {}, Brick: {} };
context.poly = {
  adjustCosts: () => ({
    Money: () => {
      costEvaluations.push("Money");
      return 250;
    },
    Brick: () => {
      costEvaluations.push("Brick");
      return 12;
    },
    // Not a resource the script models, so it never reaches `cost` — but the
    // game still prices it, so the snapshot has to carry it.
    Structs: () => {
      costEvaluations.push("Structs");
      return { city: { factory: { count: 1 } } };
    },
  }),
};
context.getVueById = () => ({});

const priced = new classes.Action("Factory", "city", "factory", "");
priced.updateResourceRequirements();
assert.deepEqual(priced.cost, { Money: 250, Brick: 12 });
assert.deepEqual(costEvaluations, ["Money", "Brick", "Structs"]);

costEvaluations.length = 0;
assert.equal(priced.isAffordable(true), true);
assert.equal(priced.isAffordable(), true);
assert.deepEqual(
  costEvaluations,
  [],
  "a priced action re-reads no cost function to answer affordability",
);
assert.deepEqual(affordabilityCalls, [
  {
    max: true,
    preAdjusted: true,
    prices: {
      Money: 250,
      Brick: 12,
      Structs: { city: { factory: { count: 1 } } },
    },
  },
  {
    max: false,
    preAdjusted: true,
    prices: {
      Money: 250,
      Brick: 12,
      Structs: { city: { factory: { count: 1 } } },
    },
  },
]);

// A purchase raises this action's own price, so the snapshot must not survive
// it: the bulk loop re-checks clickability between presses.
affordabilityCalls.length = 0;
priced.priceRose();
assert.equal(priced.isAffordable(true), true);
assert.deepEqual(
  affordabilityCalls.map(({ preAdjusted }) => preAdjusted),
  [false],
  "after a purchase the game prices the action itself again",
);

// A locked action keeps the live path, exactly as before: it has no snapshot.
affordabilityCalls.length = 0;
context.getVueById = () => undefined;
priced.updateResourceRequirements();
assert.equal(priced.isAffordable(true), true);
assert.deepEqual(
  affordabilityCalls.map(({ preAdjusted }) => preAdjusted),
  [false],
);

console.log("Entity classes module tests passed");
