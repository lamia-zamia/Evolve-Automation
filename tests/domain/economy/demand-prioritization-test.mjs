import assert from "node:assert/strict";
import {
  evaluateDemandPrioritizationVariants,
  planDemandPrioritization,
  prepareDemandPrioritization,
} from "../../../src/domain/economy/resources/demand-prioritization.ts";

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
  mechCosts: [],
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

// Test-only copy of the prior evaluator. The batch evaluator must preserve its request order,
// max-combination inputs and saving reservation across the feature matrix below.
function previousVariantRequests(prepared, variant) {
  const requests = [...prepared.requests];
  const request = (resourceId, amount) => requests.push({ resourceId, amount });
  const savingCost = {};
  if (variant.savingTarget !== null) {
    for (const cost of variant.savingTarget.costs) {
      request(cost.resourceId, cost.amount);
      savingCost[cost.resourceId] = cost.amount;
    }
  }
  for (const cost of variant.mechCosts) request(cost.resourceId, cost.amount);
  if (
    prepared.spyPurchaseMoney &&
    prepared.settings.prioritizeUnify.includes("req")
  )
    request("Money", prepared.spyPurchaseMoney);
  if (
    prepared.settings.autoFleet &&
    prepared.fleet.nextShipAffordable &&
    prepared.settings.prioritizeOuterFleet.includes("req")
  ) {
    for (const cost of prepared.fleet.nextShipCost)
      request(cost.resourceId, cost.amount);
  }
  for (const crafter of prepared.crafters) {
    if (
      (prepared.settings.productionFactoryFocusMaterials ||
        crafter.isDemanded) &&
      crafter.isUnlocked
    ) {
      for (const cost of crafter.costs) {
        request(
          cost.resourceId,
          cost.materialMaxQuantity * crafter.craftPreserve +
            prepared.availableCrafters *
              (1 / 140) *
              prepared.balance *
              cost.amount,
        );
      }
    }
  }
  const plant = prepared.vitreloyPlant;
  const plantCount =
    prepared.settings.autoPower && plant.autoStateEnabled
      ? plant.count
      : plant.stateOnCount;
  if (plantCount > 0) request("Stanene", plantCount * prepared.balance * 100);
  if (variant.factoryCount > 0) {
    for (const production of variant.factoryProductions) {
      if (
        (prepared.settings.productionFactoryFocusMaterials ||
          production.isDemanded) &&
        production.unlocked &&
        production.enabled &&
        production.weighting
      ) {
        for (const cost of production.costs) {
          request(
            cost.resourceId,
            cost.quantity * variant.factoryCount * prepared.balance +
              cost.minRateOfChange +
              prepared.settings.productionFactoryMinIngredients *
                cost.resourceMaxQuantity,
          );
        }
      }
    }
  }
  return {
    requests,
    savingConflict:
      variant.savingTarget === null
        ? null
        : { name: variant.savingTarget.name, cost: savingCost },
  };
}

function requestedByResource(requests, capacities) {
  const requested = new Map();
  for (const { resourceId, amount } of requests) {
    const maximum = capacities[resourceId];
    const target = requested.get(resourceId) ?? 0;
    if (amount <= target) continue;
    requested.set(
      resourceId,
      maximum === undefined || !Number.isFinite(maximum) || maximum < 0
        ? amount
        : Math.min(amount, maximum),
    );
  }
  return requested;
}

for (let mask = 0; mask < 256; mask += 1) {
  const enabled = (bit) => (mask & (1 << bit)) !== 0;
  const variant = {
    savingTarget: enabled(0)
      ? { name: "regional build", costs: [{ resourceId: "Stone", amount: 25 }] }
      : null,
    mechCosts: enabled(1) ? [{ resourceId: "Supply", amount: 7 }] : [],
    factoryCount: enabled(2) ? 2 : 0,
    factoryProductions: enabled(2)
      ? [
          {
            isDemanded: enabled(3),
            unlocked: true,
            enabled: true,
            weighting: 1,
            costs: [
              {
                resourceId: "Alloy",
                quantity: 3,
                minRateOfChange: 2,
                resourceMaxQuantity: 50,
              },
            ],
          },
        ]
      : [],
  };
  const input = {
    ...empty,
    settings: {
      ...settings,
      prioritizeQueue: enabled(4) ? "req" : "none",
      prioritizeTriggers: enabled(5) ? "req" : "none",
      prioritizeUnify: enabled(6) ? "req" : "none",
      autoFleet: enabled(7),
      prioritizeOuterFleet: enabled(7) ? "req" : "none",
      productionFactoryFocusMaterials: enabled(3),
    },
    isEarlyGame: false,
    queuedTargets: enabled(4)
      ? [
          {
            costs: [{ resourceId: "Stone", amount: 10 }],
            isProject: enabled(0),
            progress: enabled(0) ? 40 : null,
          },
        ]
      : [],
    triggerTargets: enabled(5)
      ? [
          {
            costs: [{ resourceId: "Stone", amount: 15 }],
            isProject: false,
            progress: null,
          },
        ]
      : [],
    unlockedTechs: enabled(5)
      ? [
          {
            id: "tech-ai_optimizations",
            isAffordable: true,
            target: aiTech.target,
          },
        ]
      : [],
    savingTarget: variant.savingTarget,
    mechCosts: variant.mechCosts,
    factoryCount: variant.factoryCount,
    factoryProductions: variant.factoryProductions,
    spyPurchaseMoney: enabled(6) ? 12 : 0,
    fleet: enabled(7)
      ? {
          nextShipAffordable: true,
          nextShipCost: [{ resourceId: "Alloy", amount: 20 }],
        }
      : { nextShipAffordable: false, nextShipCost: [] },
    inflationMoney: enabled(6) ? 11 : null,
    retirementGraphene: enabled(1) ? 9 : null,
    crafters: enabled(3)
      ? [
          {
            isDemanded: true,
            isUnlocked: true,
            costs: [
              {
                resourceId: "Alloy",
                materialMaxQuantity: 20,
                craftPreserve: 0.5,
                amount: 4,
              },
            ],
          },
        ]
      : [],
    availableCrafters: enabled(3) ? 3 : 0,
  };
  const prepared = prepareDemandPrioritization(input);
  const variants = [
    variant,
    { ...variant, mechCosts: [] },
    { ...variant, savingTarget: null, mechCosts: [] },
  ];
  const deltas = evaluateDemandPrioritizationVariants(prepared, variants);
  const capacities = {
    Stone: 100,
    Supply: 5,
    Alloy: enabled(2) ? Infinity : 30,
  };
  variants.forEach((candidate, index) => {
    const delta = deltas[index];
    const optimizedRequests = [
      ...prepared.requests,
      ...(delta?.requests ?? []),
    ];
    const previous = previousVariantRequests(prepared, candidate);
    assert.deepEqual(
      optimizedRequests,
      previous.requests,
      `request list differs for demand matrix ${mask}, view ${index}`,
    );
    assert.deepEqual(
      delta?.savingConflict ?? null,
      previous.savingConflict,
      `saving conflict differs for demand matrix ${mask}, view ${index}`,
    );
    assert.deepEqual(
      [...requestedByResource(optimizedRequests, capacities)],
      [...requestedByResource(previous.requests, capacities)],
      `requested quantity differs for demand matrix ${mask}, view ${index}`,
    );
  });
}

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
        { resourceId: "Titanium", amount: 650_000 },
        { resourceId: "Mythril", amount: 500_000 },
      ],
    },
  });
  assert.deepEqual(result.requests, [
    { resourceId: "Titanium", amount: 650_000 },
    { resourceId: "Mythril", amount: 500_000 },
  ]);
  // The reservation is the half that stops other builds spending the cost;
  // requesting a quantity alone only reaches crafting, market and storage.
  assert.deepEqual(result.savingConflict, {
    name: "Dwarf Shipyard",
    cost: { Titanium: 650_000, Mythril: 500_000 },
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
      costs: [{ resourceId: "Titanium", amount: 650_000 }],
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

// A pursued Mech build requests its Supply and Soul Gems unconditionally,
// like the saving target and without any queue-priority toggle.
assert.deepEqual(
  planDemandPrioritization({
    ...empty,
    settings,
    isEarlyGame: false,
    unlockedTechs: [],
    mechCosts: [
      { resourceId: "Supply", amount: 180_000 },
      { resourceId: "Soul_Gem", amount: 4 },
    ],
  }).requests,
  [
    { resourceId: "Supply", amount: 180_000 },
    { resourceId: "Soul_Gem", amount: 4 },
  ],
);
