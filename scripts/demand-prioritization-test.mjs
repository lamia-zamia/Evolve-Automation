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
  savingTarget: null,
  currentDay: 30_000,
  savingCommitment: null,
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

// A saving target - the build target the automation wants and cannot yet
// afford - contributes its costs as demand and as a cost reservation. Without
// it only queued and trigger targets can express that the run is accumulating.
{
  const result = planDemandPrioritization({
    ...empty,
    settings,
    isEarlyGame: false,
    unlockedTechs: [],
    savingTarget: {
      name: "Dwarf Shipyard",
      costs: [
        {
          resourceId: "Titanium",
          amount: 650_000,
          currentQuantity: 50_000,
          ratePerDay: 500,
        },
        {
          resourceId: "Mythril",
          amount: 500_000,
          currentQuantity: 400_000,
          ratePerDay: 200,
        },
      ],
    },
  });
  // Demand still asks for the whole cost: telling crafting and market to work
  // toward it is free, unlike withholding it from every other build.
  assert.deepEqual(result.requests, [
    { resourceId: "Titanium", amount: 650_000 },
    { resourceId: "Mythril", amount: 500_000 },
  ]);
  // The reservation holds only what the target's schedule needs today, not the
  // whole cost. Titanium is 1,200 days out and sets the deadline, so its floor
  // is the 50,000 already accumulated. Mythril still carries a floor because
  // 1,200 days of production only yields 240,000 of its 500,000 cost - but that
  // floor is 260,000 rather than the full 500,000 a flat reservation would take.
  assert.deepEqual(result.savingConflict, {
    name: "Dwarf Shipyard",
    cost: { Titanium: 50_000, Mythril: 260_000 },
  });
  assert.deepEqual(result.savingCommitment, {
    name: "Dwarf Shipyard",
    deadlineDay: 31_200,
  });
}

// It is additive, not a replacement: an explicit queue still decides what the
// research fallback does, and both sets of costs are requested.
assert.deepEqual(
  planDemandPrioritization({
    ...empty,
    settings: { ...settings, prioritizeQueue: "req" },
    isEarlyGame: false,
    unlockedTechs: [],
    queuedTargets: [
      {
        costs: [{ resourceId: "Coal", amount: 10 }],
        isProject: false,
        progress: null,
      },
    ],
    savingTarget: {
      name: "Dwarf Shipyard",
      costs: [
        {
          resourceId: "Titanium",
          amount: 650_000,
          currentQuantity: 50_000,
          ratePerDay: 500,
        },
      ],
    },
  }).requests,
  [
    { resourceId: "Coal", amount: 10 },
    { resourceId: "Titanium", amount: 650_000 },
  ],
);

// Nothing to save for reserves nothing.
assert.equal(
  planDemandPrioritization({
    ...empty,
    settings,
    isEarlyGame: false,
    unlockedTechs: [],
  }).savingConflict,
  null,
);
