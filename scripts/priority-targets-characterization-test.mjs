import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};

// The `#tech .action` sweep at the end of updatePriorityTargets is driven through
// jQuery; this stub lets each scenario decide which tech elements exist.
let techElements = [];
function jquery(selector) {
  return {
    ready() {},
    each(callback) {
      if (selector === "#tech .action") {
        techElements.forEach((element, index) =>
          callback.call(element, index, element),
        );
      }
      return this;
    },
  };
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.updatePriorityTargets, "function");
assert.equal(typeof hooks.setPriorityTargetsTestContext, "function");

const updateCalls = [];

function makeTarget(id, { title, cost = {}, affordable = true } = {}) {
  return {
    id,
    // getTechConflict keys research policy off _vueBinding, not id.
    _vueBinding: id,
    title: title ?? id,
    cost,
    isAffordable: () => affordable,
    updateResourceRequirements() {
      updateCalls.push(id);
    },
  };
}

function makeBuilding(
  id,
  { autoBuildable = false, count = 0, cost = {} } = {},
) {
  return {
    id,
    title: id,
    count,
    cost,
    isAutoBuildable: () => autoBuildable,
  };
}

// The Inflation "Wheelbarrow" conflict depends on the live challenge guard, which
// stays inert here (inflationChallengeAssist false); the focused module test drives
// that branch through an injected guard instead.
function baseSettings(overrides = {}) {
  return {
    prioritizeQueue: ["save"],
    prioritizeUnify: ["save"],
    prioritizeTriggers: ["save"],
    prioritizeOuterFleet: ["save"],
    autoFleet: true,
    autoMech: true,
    autoTrigger: true,
    autoPrestige: true,
    prestigeWaitAT: false,
    prestigeType: "eden",
    mechBuild: "random",
    fleetEmbassyKnowledge: 1_000_000,
    inflationChallengeAssist: false,
    inflationChallengeSaveMinutes: -1,
    // getTechConflict runs for real against these settings.
    researchIgnore: [
      "tech-ignored_example",
      "tech-ignored_but_queued",
      "tech-ignored_but_triggered",
    ],
    prestigeWhiteholeSaveGems: false,
    prestigeVaxStrat: "strat1",
    prestigeDemonicBomb: false,
    foreignUnification: false,
    prestigeWhiteholeStabiliseMass: false,
    prestigeWhiteholeStabiliseCooldown: 0,
    userResearchTheology_1: "auto",
    userResearchTheology_2: "auto",
    fleetAlienGiftKnowledge: 1_000_000,
    achievementGuards: false,
    retirementChallengeAssist: false,
    ...overrides,
  };
}

function runScenario({
  settings,
  queue = { display: false, queue: [] },
  rQueue = { display: false, queue: [] },
  qAny = true,
  qAnyRes = true,
  race = { species: "human", gods: "none" },
  buildings,
  techIds,
  buildingIds = {},
  arpaIds = {},
  spyPurchaseMoney = 0,
  fleetOuter = { nextShipAffordable: false },
  mechbay = { max: 0, bay: 0, blueprint: { size: "small" } },
  mechCost = [0, 0, 0],
  preferredSize = ["small"],
  triggers = [],
  knowledgeMax = 0,
  elements = [],
}) {
  updateCalls.length = 0;
  techElements = elements;

  const managerCalls = [];
  const state = { whiteholeLastStabilise: 0 };
  const game = {
    global: {
      queue: { display: queue.display, queue: queue.queue },
      r_queue: { display: rQueue.display, queue: rQueue.queue },
      settings: { qAny, qAny_res: qAnyRes, at: 0 },
      race,
      tech: {},
      stats: {},
      portal: { mechbay },
    },
    alevel: () => 1,
  };

  hooks.setPriorityTargetsTestContext({
    settings,
    state,
    game,
    resources: {
      Knowledge: {
        name: "Knowledge",
        currentQuantity: 0,
        maxQuantity: knowledgeMax,
      },
      Soul_Gem: { name: "Soul Gem", currentQuantity: 100, maxQuantity: 100 },
      Money: {
        name: "Money",
        currentQuantity: 0,
        maxQuantity: 0,
        rateOfChange: 0,
      },
    },
    buildings,
    techIds,
    buildingIds,
    arpaIds,
    SpyManager: { purchaseMoney: spyPurchaseMoney },
    FleetManagerOuter: fleetOuter,
    MechManager: {
      initLab: () => true,
      getPreferredSize: () => preferredSize,
      getMechCost: (blueprint) => {
        managerCalls.push(["getMechCost", blueprint.size]);
        return mechCost;
      },
    },
    TriggerManager: {
      targetTriggers: triggers,
      resetTargetTriggers() {
        managerCalls.push(["resetTargetTriggers"]);
      },
    },
  });

  hooks.updatePriorityTargets();

  return {
    managerCalls,
    updateCalls: [...updateCalls],
    // The state arrays are created inside the userscript realm, so normalize them
    // into this realm before asserting.
    conflicts: JSON.parse(JSON.stringify(state.conflictTargets)),
    queued: Array.from(state.queuedTargets, (target) => target.id),
    queuedAll: Array.from(state.queuedTargetsAll, (target) => target.id),
    triggered: Array.from(state.triggerTargets, (target) => target.id),
    unlockedTechs: Array.from(state.unlockedTechs, (tech) => tech.id),
  };
}

// Scenario A: every conflict source active. The building queue walks both entries
// (qAny), the research queue stops after the first (qAny_res false), an ignored
// research that is queued or triggered survives the final tech sweep, and the
// Eden fake trigger fires because the chosen prestige matches.
const unification = makeTarget("tech-unification", { title: "Unification" });
const lumberYard = makeTarget("city-lumber_yard", {
  title: "Lumber Yard",
  cost: { Lumber: 100 },
});
const mine = makeTarget("city-mine", {
  title: "Mine",
  cost: { Lumber: 500 },
  affordable: false,
});
const ignoredQueued = makeTarget("tech-ignored_but_queued", {
  title: "Ignored But Queued",
  cost: { Knowledge: 50 },
});
const mining = makeTarget("tech-mining", {
  title: "Mining",
  cost: { Knowledge: 90 },
});
const ignoredExample = makeTarget("tech-ignored_example", {
  title: "Ignored Example",
});
const ignoredTriggered = makeTarget("tech-ignored_but_triggered", {
  title: "Ignored But Triggered",
  cost: { Knowledge: 30 },
});

const embassy = makeBuilding("GorddonEmbassy", {
  autoBuildable: true,
  cost: { Money: 10 },
});
const eden = makeBuilding("TauStarEden", {
  autoBuildable: true,
  cost: { Money: 20 },
});
const ignition = makeBuilding("TauGas2IgniteGasGiant", {
  autoBuildable: true,
  cost: { Money: 30 },
});

const scenarioA = runScenario({
  settings: baseSettings(),
  queue: {
    display: true,
    queue: [{ id: "city-lumber_yard" }, { id: "city-mine" }],
  },
  rQueue: {
    display: true,
    queue: [{ id: "tech-ignored_but_queued" }, { id: "tech-mining" }],
  },
  qAny: true,
  qAnyRes: false,
  buildings: {
    AsphodelEncampment: makeBuilding("AsphodelEncampment"),
    GorddonEmbassy: embassy,
    TauStarEden: eden,
    TauGas2MatrioshkaBrain: makeBuilding("TauGas2MatrioshkaBrain", {
      count: 999,
    }),
    TauGas2IgniteGasGiant: ignition,
  },
  techIds: {
    "tech-unification": unification,
    "tech-mining": mining,
    "tech-ignored_example": ignoredExample,
    "tech-ignored_but_queued": ignoredQueued,
    "tech-ignored_but_triggered": ignoredTriggered,
  },
  buildingIds: { "city-lumber_yard": lumberYard, "city-mine": mine },
  spyPurchaseMoney: 5000,
  fleetOuter: {
    nextShipAffordable: true,
    nextShipName: "Dreadnought",
    nextShipCost: { Money: 777 },
  },
  mechbay: { max: 5, bay: 1, blueprint: { size: "large" } },
  mechCost: [10, 5, 2],
  preferredSize: ["collector"],
  triggers: [
    { actionId: "tech-ignored_but_triggered" },
    { actionId: "city-lumber_yard" },
    { actionId: "does-not-exist" },
  ],
  knowledgeMax: 2_000_000,
  elements: [
    { id: "tech-mining" },
    { id: "tech-ignored_example" },
    { id: "tech-ignored_but_queued" },
    { id: "tech-ignored_but_triggered" },
  ],
});

assert.deepEqual(scenarioA.queuedAll, [
  "city-lumber_yard",
  "city-mine",
  "tech-ignored_but_queued",
]);
assert.deepEqual(scenarioA.queued, [
  "city-lumber_yard",
  "tech-ignored_but_queued",
]);
// Ignition stays out: 999 Matrioshka Brains is below the 1000 gate (and this run's
// prestige is Eden, not Retirement).
assert.deepEqual(scenarioA.triggered, [
  "tech-ignored_but_triggered",
  "city-lumber_yard",
  "GorddonEmbassy",
  "TauStarEden",
]);
assert.deepEqual(scenarioA.conflicts, [
  { name: "Lumber Yard", cause: "Queue", cost: { Lumber: 100 } },
  { name: "Ignored But Queued", cause: "Queue", cost: { Knowledge: 50 } },
  { name: "Unification", cause: "Purchase", cost: { Money: 5000 } },
  { name: "Dreadnought", cause: "Ship", cost: { Money: 777 } },
  { name: "Next mech (collector)", cause: "Mech", cost: { Soul_Gem: 10 } },
  {
    name: "Ignored But Triggered",
    cause: "Trigger",
    cost: { Knowledge: 30 },
  },
  { name: "Lumber Yard", cause: "Trigger", cost: { Lumber: 100 } },
  { name: "GorddonEmbassy", cause: "Knowledge", cost: { Money: 10 } },
  { name: "TauStarEden", cause: "Prestige", cost: { Money: 20 } },
]);
assert.deepEqual(scenarioA.managerCalls, [
  ["getMechCost", "collector"],
  ["resetTargetTriggers"],
]);
// The tech sweep refreshes every listed tech, but only conflict-free techs (or
// ignored techs rescued by a queue/trigger) become research targets.
assert.deepEqual(scenarioA.updateCalls, [
  "tech-mining",
  "tech-ignored_example",
  "tech-ignored_but_queued",
  "tech-ignored_but_triggered",
]);
assert.deepEqual(scenarioA.unlockedTechs, [
  "tech-mining",
  "tech-ignored_but_queued",
  "tech-ignored_but_triggered",
]);

// Scenario B: triggers disabled, no "save" prioritization, a governor mech task
// (titan blueprint), and the Ignition fake trigger gated behind prestigeType.
const scenarioB = runScenario({
  settings: baseSettings({
    prioritizeQueue: [],
    prioritizeUnify: [],
    prioritizeOuterFleet: [],
    autoTrigger: false,
    prestigeType: "retire",
  }),
  queue: { display: true, queue: [{ id: "city-lumber_yard" }] },
  race: {
    species: "human",
    gods: "none",
    governor: { tasks: { t0: "mech" } },
  },
  buildings: {
    AsphodelEncampment: makeBuilding("AsphodelEncampment"),
    GorddonEmbassy: embassy,
    TauStarEden: eden,
    TauGas2MatrioshkaBrain: makeBuilding("TauGas2MatrioshkaBrain", {
      count: 1000,
    }),
    TauGas2IgniteGasGiant: ignition,
  },
  techIds: {
    "tech-unification": unification,
    "tech-mining": mining,
    "tech-ignored_example": ignoredExample,
  },
  buildingIds: { "city-lumber_yard": lumberYard },
  spyPurchaseMoney: 5000,
  fleetOuter: {
    nextShipAffordable: true,
    nextShipName: "Dreadnought",
    nextShipCost: { Money: 777 },
  },
  mechbay: { max: 5, bay: 1, blueprint: { size: "large" } },
  mechCost: [10, 5, 2],
  knowledgeMax: 0,
  elements: [{ id: "tech-mining" }, { id: "tech-ignored_example" }],
});

assert.deepEqual(scenarioB.queued, ["city-lumber_yard"]);
assert.deepEqual(scenarioB.triggered, []);
// Only the mech reservation survives: the other sources dropped their "save" flag,
// and with autoTrigger off the Embassy/Eden/Ignition fake triggers never run.
assert.deepEqual(scenarioB.conflicts, [
  { name: "Next mech (titan)", cause: "Mech", cost: { Soul_Gem: 10 } },
]);
assert.deepEqual(scenarioB.managerCalls, [["getMechCost", "titan"]]);
assert.deepEqual(scenarioB.unlockedTechs, ["tech-mining"]);

// Scenario C: no bay space suppresses the mech reservation entirely, and a hidden
// queue contributes nothing even while it holds entries.
const scenarioC = runScenario({
  settings: baseSettings({ prestigeType: "retire" }),
  queue: { display: false, queue: [{ id: "city-lumber_yard" }] },
  buildings: {
    AsphodelEncampment: makeBuilding("AsphodelEncampment"),
    GorddonEmbassy: embassy,
    TauStarEden: eden,
    TauGas2MatrioshkaBrain: makeBuilding("TauGas2MatrioshkaBrain", {
      count: 1000,
    }),
    TauGas2IgniteGasGiant: ignition,
  },
  techIds: { "tech-unification": unification, "tech-mining": mining },
  buildingIds: { "city-lumber_yard": lumberYard },
  mechbay: { max: 3, bay: 3, blueprint: { size: "large" } },
  knowledgeMax: 0,
  elements: [{ id: "tech-mining" }],
});

assert.deepEqual(scenarioC.queuedAll, []);
assert.deepEqual(scenarioC.managerCalls, [["resetTargetTriggers"]]);
// Ignition fires (1000 brains, prestigeType retire); Eden does not (wrong prestige);
// the Embassy stays out because Knowledge storage is below the threshold.
assert.deepEqual(scenarioC.triggered, ["TauGas2IgniteGasGiant"]);
assert.deepEqual(scenarioC.conflicts, [
  { name: "TauGas2IgniteGasGiant", cause: "Prestige", cost: { Money: 30 } },
]);

console.log("Priority targets bundled characterization tests passed");
