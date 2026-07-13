import assert from "node:assert/strict";

import { createDemandPrioritization } from "../src/planning/demand-prioritization.ts";

const requests = [];
const resource = (id) => ({
  maxQuantity: 100,
  requestQuantity: (amount) => requests.push([id, amount]),
});
const resources = {
  Money: resource("Money"),
  Graphene: resource("Graphene"),
  Stanene: resource("Stanene"),
  Iron: resource("Iron"),
};
let state = {
  queuedTargets: [{ cost: { Iron: 10 } }],
  triggerTargets: [],
  missionBuildingList: [],
  unlockedTechs: [],
};
const settings = {
  prioritizeQueue: "req",
  prioritizeTriggers: "none",
  missionRequest: false,
  prestigeBioseedConstruct: false,
  prestigeType: "none",
  researchRequest: false,
  researchRequestSpace: false,
  prioritizeUnify: "none",
  autoFleet: false,
  prioritizeOuterFleet: "none",
  productionFactoryFocusMaterials: false,
  autoPower: false,
  productionFactoryMinIngredients: 0,
};
const prioritization = createDemandPrioritization({
  getSettings: () => settings,
  getState: () => state,
  getResources: () => resources,
  getBuildings: () => ({
    BlackholeJumpShip: {},
    Alien1VitreloyPlant: {
      autoStateEnabled: false,
      count: 0,
      stateOnCount: 0,
    },
  }),
  getCrafter: () => ({}),
  getSpyManager: () => ({ purchaseMoney: 0 }),
  getFleetManagerOuter: () => ({
    nextShipAffordable: false,
    nextShipCost: {},
  }),
  getJobManager: () => ({
    craftingMax: () => 0,
    skilledServantsMax: () => 0,
  }),
  getFactoryManager: () => ({ maxOperating: () => 0, Productions: {} }),
  getIsEarlyGame: () => () => true,
  isProject: () => false,
  getInflationChallengeAssistActive: () => () => false,
  getRetirementChallengeAssistActive: () => () => false,
  getInflationChallengeMoney: () => 1,
  getRetirementGraphene: () => 1,
  consumptionBalanceTarget: 120,
});

prioritization.prioritizeDemandedResources();
assert.deepEqual(requests, [["Iron", 10]]);

state = {
  queuedTargets: [{ cost: { Iron: 20 } }],
  triggerTargets: [],
  missionBuildingList: [],
  unlockedTechs: [],
};
prioritization.prioritizeDemandedResources();
assert.deepEqual(requests.at(-1), ["Iron", 20]);

console.log("Demand prioritization module tests passed");
