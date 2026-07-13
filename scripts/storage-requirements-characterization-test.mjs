import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
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
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setStorageRequirementTestContext, "function");
const requirements = hooks.storageRequirements;
assert.equal(typeof requirements?.requestStorageFor, "function");
assert.equal(typeof requirements?.calculateRequiredStorages, "function");

function resource(maxQuantity, hasStorage = false) {
  return {
    maxQuantity,
    maxCost: 0,
    storageRequired: 0,
    autoSellEnabled: false,
    autoSellRatio: 0,
    hasStorage: () => hasStorage,
  };
}

let settings = { storageAssignExtra: true };
let resources = {
  Iron: resource(50),
  Copper: resource(50, true),
};
hooks.setStorageRequirementTestContext({
  settings,
  state: {},
  resources,
  buildings: {},
  game: {},
  BuildingManager: {},
  ProjectManager: {},
  FleetManagerOuter: {},
  inflationChallengeAssistActive: () => false,
  retirementChallengeAssistActive: () => false,
});
requirements.requestStorageFor([
  { cost: { Iron: 100 } },
  { cost: { Iron: 40 } },
  { cost: { Copper: 100 } },
]);
assert.equal(resources.Iron.maxCost, 100);
assert.equal(resources.Iron.storageRequired, 41.2);
assert.equal(resources.Copper.maxCost, 100);
assert.equal(resources.Copper.storageRequired, 103);

const target = (cost, weighting = 0, extra = {}) => ({
  cost,
  weighting,
  isAutoBuildable: () => true,
  isUnlocked: () => true,
  autoBuildEnabled: true,
  ...extra,
});
const tech100 = target({ Knowledge: 100 });
const tech50 = target({ Knowledge: 50 });
const queuedKnowledge = target({ Knowledge: 80 });
const queuedIron = target({ Iron: 30 });
const triggerKnowledge = target({ Knowledge: 70 });
const lowerBuilding = target({ Knowledge: 200 }, 5);
const topBuilding = target({ Knowledge: 120 }, 10);
const knowledgeBuilding = target({ Knowledge: 500 }, 100, {
  is: { knowledge: true },
});
const topProject = target({ Knowledge: 150 }, 15);

settings = {
  storageAssignExtra: true,
  fleetEmbassyKnowledge: 300,
  autoFleet: true,
  prioritizeOuterFleet: "req",
  autoMarket: true,
};
resources = {
  Knowledge: resource(100),
  Iron: { ...resource(1000), autoSellEnabled: true, autoSellRatio: 0.5 },
  Money: resource(1),
  Graphene: resource(1),
};
const state = {
  unlockedTechs: [tech100, tech50],
  queuedTargetsAll: [queuedKnowledge, queuedIron],
  triggerTargets: [triggerKnowledge],
  knowledgeRequiredByTechs: 0,
  cheapestTechKnowledge: 0,
  knowledgeRequiredByBuildTargets: 0,
};
hooks.setStorageRequirementTestContext({
  settings,
  state,
  resources,
  buildings: { GorddonEmbassy: { isAutoBuildable: () => false } },
  game: { global: { race: {} } },
  BuildingManager: {
    priorityList: [lowerBuilding, topBuilding, knowledgeBuilding],
  },
  ProjectManager: { priorityList: [topProject] },
  FleetManagerOuter: {
    nextShipExpandable: true,
    nextShipCost: { Iron: 500 },
  },
  inflationChallengeAssistActive: () => true,
  retirementChallengeAssistActive: () => true,
});
requirements.calculateRequiredStorages();

assert.deepEqual(
  {
    techKnowledge: state.knowledgeRequiredByTechs,
    cheapestTech: state.cheapestTechKnowledge,
    buildKnowledge: state.knowledgeRequiredByBuildTargets,
    knowledgeMaxCost: resources.Knowledge.maxCost,
    ironMaxCost: resources.Iron.maxCost,
    ironRequired: resources.Iron.storageRequired,
    moneyMaxCost: resources.Money.maxCost,
    moneyRequired: resources.Money.storageRequired,
    grapheneMaxCost: resources.Graphene.maxCost,
    grapheneRequired: resources.Graphene.storageRequired,
  },
  {
    techKnowledge: 100,
    cheapestTech: 50,
    buildKnowledge: 150,
    knowledgeMaxCost: 500,
    ironMaxCost: 500,
    ironRequired: 1030,
    moneyMaxCost: 250_000_000_000,
    moneyRequired: 250_000_000_000,
    grapheneMaxCost: 200_000_000,
    grapheneRequired: 200_000_000,
  },
);

console.log("Storage requirement bundled characterization tests passed");
