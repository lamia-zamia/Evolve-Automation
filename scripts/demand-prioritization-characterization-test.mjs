import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const { hooks } = await loadCharacterizationBundle({
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
});

assert.equal(typeof hooks.prioritizeDemandedResources, "function");
assert.equal(typeof hooks.setDemandPrioritizationTestContext, "function");

const requests = [];
function resource(id, maxQuantity = 1000) {
  return {
    id,
    maxQuantity,
    requestQuantity: (amount) => requests.push([id, amount]),
  };
}
const resources = {
  Money: resource("Money"),
  Graphene: resource("Graphene"),
  Iron: resource("Iron"),
  Copper: resource("Copper"),
  Alloy: resource("Alloy"),
  Coal: resource("Coal", 1000),
  Stanene: resource("Stanene"),
  Titanium: resource("Titanium", 100),
  Cipher: resource("Cipher"),
};

const queued = { cost: { Iron: 10 } };
const project = hooks.makeDemandProject({ Copper: 20 }, 50);
const activeMission = {
  cost: { Alloy: 30 },
  autoBuildEnabled: true,
  isUnlocked: () => true,
  isComplete: () => false,
};
const completedMission = {
  cost: {},
  autoBuildEnabled: true,
  isUnlocked: () => false,
  isComplete: () => true,
};
const blackholeMission = {
  cost: { Iron: 999 },
  autoBuildEnabled: true,
  isUnlocked: () => true,
  isComplete: () => false,
};
const crafterResource = {
  isDemanded: () => true,
  isUnlocked: () => true,
  craftPreserve: 0.1,
  cost: { Coal: 2 },
};
const factoryProduct = {
  resource: { isDemanded: () => true },
  unlocked: true,
  enabled: true,
  weighting: 1,
  cost: [
    {
      quantity: 2,
      minRateOfChange: 1,
      resource: resources.Titanium,
    },
  ],
};
const state = {
  queuedTargets: [queued],
  triggerTargets: [project],
  missionBuildingList: [activeMission, completedMission, blackholeMission],
  unlockedTechs: [],
};
const settings = {
  prioritizeQueue: "req",
  prioritizeTriggers: "req",
  missionRequest: true,
  prestigeBioseedConstruct: true,
  prestigeType: "whitehole",
  researchRequest: true,
  researchRequestSpace: true,
  prioritizeUnify: "req",
  autoFleet: true,
  prioritizeOuterFleet: "req",
  productionFactoryFocusMaterials: false,
  autoPower: true,
  productionFactoryMinIngredients: 0.2,
};
const buildings = {
  BlackholeJumpShip: blackholeMission,
  Alien1VitreloyPlant: {
    autoStateEnabled: true,
    count: 2,
    stateOnCount: 0,
  },
};
hooks.setDemandPrioritizationTestContext({
  settings,
  state,
  resources,
  buildings,
  game: { global: { race: { species: "human" }, tech: {} } },
  crafter: { Sheet: { resource: crafterResource } },
  SpyManager: { purchaseMoney: 500 },
  FleetManagerOuter: {
    nextShipAffordable: true,
    nextShipCost: { Iron: 60 },
  },
  JobManager: { craftingMax: () => 5, skilledServantsMax: () => 2 },
  FactoryManager: {
    maxOperating: () => 3,
    Productions: { Alloy: factoryProduct },
  },
  inflationChallengeAssistActive: () => true,
  retirementChallengeAssistActive: () => true,
});

hooks.prioritizeDemandedResources();
assert.deepEqual(requests, [
  ["Money", 250_000_000_000],
  ["Graphene", 200_000_000],
  ["Iron", 10],
  ["Copper", 40],
  ["Alloy", 30],
  ["Money", 500],
  ["Iron", 60],
  ["Coal", 112],
  ["Stanene", 24_000],
  ["Titanium", 741],
]);
assert.deepEqual(state.missionBuildingList, [activeMission, blackholeMission]);

requests.length = 0;
const affordableTech = { cost: { Iron: 15 }, isAffordable: () => true };
const expensiveTech = { cost: { Copper: 15 }, isAffordable: () => false };
hooks.setDemandPrioritizationTestContext({
  settings: {
    ...settings,
    prioritizeQueue: "none",
    prioritizeTriggers: "none",
    missionRequest: false,
    autoFleet: false,
    productionFactoryFocusMaterials: false,
    autoPower: false,
  },
  state: {
    queuedTargets: [],
    triggerTargets: [],
    missionBuildingList: [],
    unlockedTechs: [affordableTech, expensiveTech],
  },
  resources,
  buildings: {
    BlackholeJumpShip: blackholeMission,
    Alien1VitreloyPlant: {
      autoStateEnabled: false,
      count: 0,
      stateOnCount: 0,
    },
  },
  game: { global: { race: { species: "human" }, tech: {} } },
  crafter: {},
  SpyManager: { purchaseMoney: 0 },
  FleetManagerOuter: { nextShipAffordable: false, nextShipCost: {} },
  JobManager: { craftingMax: () => 0, skilledServantsMax: () => 0 },
  FactoryManager: { maxOperating: () => 0, Productions: {} },
  inflationChallengeAssistActive: () => false,
  retirementChallengeAssistActive: () => false,
});
hooks.prioritizeDemandedResources();
assert.deepEqual(requests, [["Iron", 15]]);

requests.length = 0;
hooks.setDemandPrioritizationTestContext({
  settings: {
    ...settings,
    prestigeType: "apocalypse",
    prioritizeQueue: "none",
    prioritizeTriggers: "none",
    missionRequest: false,
    autoFleet: false,
    productionFactoryFocusMaterials: false,
    autoPower: false,
    researchRequestSpace: false,
  },
  state: {
    queuedTargets: [],
    triggerTargets: [],
    missionBuildingList: [],
    unlockedTechs: [
      {
        id: "tech-ai_optimizations",
        cost: { Cipher: 75_000 },
        isAffordable: () => false,
      },
    ],
  },
  resources,
  buildings: {
    BlackholeJumpShip: blackholeMission,
    Alien1VitreloyPlant: {
      autoStateEnabled: false,
      count: 0,
      stateOnCount: 0,
    },
  },
  game: { global: { race: { truepath: true }, tech: { titan_ai_core: 1 } } },
  crafter: {},
  SpyManager: { purchaseMoney: 0 },
  FleetManagerOuter: { nextShipAffordable: false, nextShipCost: {} },
  JobManager: { craftingMax: () => 0, skilledServantsMax: () => 0 },
  FactoryManager: { maxOperating: () => 0, Productions: {} },
  inflationChallengeAssistActive: () => false,
  retirementChallengeAssistActive: () => false,
});
hooks.prioritizeDemandedResources();
assert.deepEqual(requests, [["Cipher", 75_000]]);

console.log("Demand prioritization bundled characterization tests passed");
