import assert from "node:assert/strict";
import { planDemandPrioritization } from "../src/domain/economy/resources/demand-prioritization.ts";

const settings = {
  prioritizeQueue: "none",
  prioritizeTriggers: "none",
  missionRequest: false,
  prestigeBioseedConstruct: false,
  prestigeType: "apocalypse",
  researchRequest: true,
  researchRequestSpace: false,
  prioritizeUnify: "none",
  autoFleet: false,
  prioritizeOuterFleet: "none",
  productionFactoryFocusMaterials: false,
  autoPower: false,
  productionFactoryMinIngredients: 0,
};

const empty = {
  queuedTargets: [],
  triggerTargets: [],
  missions: [],
  spyPurchaseMoney: 0,
  fleet: { nextShipAffordable: false, nextShipCost: [] },
  availableCrafters: 0,
  crafters: [],
  vitreloyPlant: { autoStateEnabled: false, count: 0, stateOnCount: 0 },
  factoryCount: 0,
  factoryProductions: [],
  inflationMoney: null,
  retirementGraphene: null,
  consumptionBalanceTarget: 120,
  truepathAiBuildingTarget: null,
};

const aiTech = {
  id: "tech-ai_optimizations",
  isAffordable: false,
  target: {
    costs: [{ resourceId: "Cipher", amount: 75_000 }],
    isProject: false,
    progress: null,
  },
};

assert.deepEqual(
  planDemandPrioritization({
    ...empty,
    settings,
    isEarlyGame: false,
    unlockedTechs: [aiTech],
  }).requests,
  [{ resourceId: "Cipher", amount: 75_000 }],
);

assert.deepEqual(
  planDemandPrioritization({
    ...empty,
    settings: { ...settings, prestigeType: "none" },
    isEarlyGame: false,
    unlockedTechs: [],
    truepathAiBuildingTarget: {
      costs: [{ resourceId: "Cipher", amount: 10_000 }],
      isProject: false,
      progress: null,
    },
  }).requests,
  [],
);

assert.deepEqual(
  planDemandPrioritization({
    ...empty,
    settings: { ...settings, prestigeType: "none" },
    isEarlyGame: false,
    unlockedTechs: [
      {
        id: "tech-unrelated",
        isAffordable: false,
        target: aiTech.target,
      },
    ],
  }).requests,
  [],
);

console.log("Demand prioritization tests passed");
