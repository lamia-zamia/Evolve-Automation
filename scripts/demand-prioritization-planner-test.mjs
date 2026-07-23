import assert from "node:assert/strict";

import { readDemandPrioritizationInput } from "../src/adapters/evolve/demand-prioritization.ts";
import { planDemandPrioritization } from "../src/domain/economy/resources/demand-prioritization.ts";

// Exact copy of the deleted legacy `prioritizeDemandedResources` algorithm,
// run against identical live fixtures to prove the reader + planner + apply
// path produces a byte-identical request trace and mission-list mutation.
function legacyPrioritize({
  getSettings,
  getState,
  getResources,
  getBuildings,
  getCrafter,
  getSpyManager,
  getFleetManagerOuter,
  getJobManager,
  getFactoryManager,
  getIsEarlyGame,
  isProject,
  getInflationChallengeAssistActive,
  getRetirementChallengeAssistActive,
  getInflationChallengeMoney,
  getRetirementGraphene,
  consumptionBalanceTarget,
}) {
  const settings = getSettings();
  const state = getState();
  const resources = getResources();
  const buildings = getBuildings();
  let prioritizedTasks = [];
  if (getInflationChallengeAssistActive()()) {
    resources.Money.requestQuantity(getInflationChallengeMoney());
  }
  if (getRetirementChallengeAssistActive()()) {
    resources.Graphene.requestQuantity(getRetirementGraphene());
  }
  if (settings.prioritizeQueue.includes("req")) {
    prioritizedTasks.push(...state.queuedTargets);
  }
  if (settings.prioritizeTriggers.includes("req")) {
    prioritizedTasks.push(...state.triggerTargets);
  }
  if (settings.missionRequest) {
    for (let i = state.missionBuildingList.length - 1; i >= 0; i--) {
      const mission = state.missionBuildingList[i];
      if (
        mission.isUnlocked() &&
        mission.autoBuildEnabled &&
        (mission !== buildings.BlackholeJumpShip ||
          !settings.prestigeBioseedConstruct ||
          settings.prestigeType !== "whitehole")
      ) {
        prioritizedTasks.push(mission);
      } else if (mission.isComplete()) {
        state.missionBuildingList.splice(i, 1);
      }
    }
  }

  if (
    prioritizedTasks.length === 0 &&
    (getIsEarlyGame()()
      ? settings.researchRequest
      : settings.researchRequestSpace)
  ) {
    prioritizedTasks = state.unlockedTechs.filter((technology) =>
      technology.isAffordable(true),
    );
  }

  if (prioritizedTasks.length > 0) {
    for (let i = 0; i < prioritizedTasks.length; i++) {
      const demandedObject = prioritizedTasks[i];
      for (const resourceId in demandedObject.cost) {
        const resource = resources[resourceId];
        let quantity = demandedObject.cost[resourceId];
        if (isProject(demandedObject) && demandedObject.progress < 99) {
          quantity *= 2;
        }
        resource.requestQuantity(quantity);
      }
    }
  }

  const spyManager = getSpyManager();
  if (spyManager.purchaseMoney && settings.prioritizeUnify.includes("req")) {
    resources.Money.requestQuantity(spyManager.purchaseMoney);
  }

  const fleetManagerOuter = getFleetManagerOuter();
  if (
    settings.autoFleet &&
    fleetManagerOuter.nextShipAffordable &&
    settings.prioritizeOuterFleet.includes("req")
  ) {
    for (const resourceId in fleetManagerOuter.nextShipCost) {
      resources[resourceId].requestQuantity(
        fleetManagerOuter.nextShipCost[resourceId],
      );
    }
  }

  const jobManager = getJobManager();
  const availableCrafters =
    jobManager.craftingMax() + jobManager.skilledServantsMax();
  const crafter = getCrafter();
  for (const crafterId in crafter) {
    const resource = crafter[crafterId].resource;
    if (
      (settings.productionFactoryFocusMaterials || resource.isDemanded()) &&
      resource.isUnlocked()
    ) {
      for (const resourceId in resource.cost) {
        const material = resources[resourceId];
        const minExpected =
          material.maxQuantity * resource.craftPreserve +
          availableCrafters *
            (1 / 140) *
            consumptionBalanceTarget *
            resource.cost[resourceId];
        material.requestQuantity(minExpected);
      }
    }
  }

  const prioritizeCosts = (costs, multiplier = 1, storageThreshold = 0) => {
    const costList = Array.isArray(costs) ? costs : [costs];
    costList.forEach((cost) => {
      const request =
        cost.quantity * multiplier +
        (cost.minRateOfChange ?? 0) +
        storageThreshold * cost.resource.maxQuantity;
      cost.resource.requestQuantity(request);
    });
  };

  const vitreloyPlant = buildings.Alien1VitreloyPlant;
  const vitPlantCount =
    settings.autoPower && vitreloyPlant.autoStateEnabled
      ? vitreloyPlant.count
      : vitreloyPlant.stateOnCount;
  if (vitPlantCount > 0) {
    resources.Stanene.requestQuantity(
      vitPlantCount * consumptionBalanceTarget * 100,
    );
  }

  const factoryManager = getFactoryManager();
  const factoryCount = factoryManager.maxOperating();
  if (factoryCount > 0) {
    Object.values(factoryManager.Productions).forEach((production) => {
      if (
        (settings.productionFactoryFocusMaterials ||
          production.resource.isDemanded()) &&
        production.unlocked &&
        production.enabled &&
        production.weighting
      ) {
        prioritizeCosts(
          production.cost,
          factoryCount * consumptionBalanceTarget,
          settings.productionFactoryMinIngredients,
        );
      }
    });
  }
}

const CBT = 120;
const isProject = (object) => object?.__project === true;

// Build a fresh, fully-live fixture whose requestQuantity calls append to the
// supplied trace array. Produced twice per scenario so the two runs never share
// the mutable missionBuildingList.
function buildFixture(scenario, requests) {
  const resources = {};
  const resource = (id, maxQuantity) => {
    const r = {
      id,
      maxQuantity,
      requestQuantity: (amount) => requests.push([id, amount]),
    };
    resources[id] = r;
    return r;
  };
  for (const [id, maxQuantity] of Object.entries(scenario.resources)) {
    resource(id, maxQuantity);
  }

  const buildings = {
    BlackholeJumpShip: null,
    Alien1VitreloyPlant: scenario.vitreloy,
  };
  const missionBuildingList = scenario.missions.map((m) => {
    const mission = {
      id: m.id,
      cost: m.cost,
      autoBuildEnabled: m.autoBuildEnabled,
      isUnlocked: () => m.isUnlocked,
      isComplete: () => m.isComplete,
    };
    if (m.isBlackhole) buildings.BlackholeJumpShip = mission;
    return mission;
  });

  const crafter = {};
  for (const c of scenario.crafters) {
    crafter[c.id] = {
      resource: {
        isDemanded: () => c.isDemanded,
        isUnlocked: () => c.isUnlocked,
        craftPreserve: c.craftPreserve,
        cost: c.cost,
      },
    };
  }

  const Productions = {};
  for (const p of scenario.productions) {
    Productions[p.id] = {
      resource: { isDemanded: () => p.isDemanded },
      unlocked: p.unlocked,
      enabled: p.enabled,
      weighting: p.weighting,
      cost: p.cost.map((c) => ({
        quantity: c.quantity,
        minRateOfChange: c.minRateOfChange,
        resource: resources[c.resourceId],
      })),
    };
  }

  return {
    settings: scenario.settings,
    state: {
      queuedTargets: scenario.queuedTargets,
      triggerTargets: scenario.triggerTargets,
      missionBuildingList,
      unlockedTechs: scenario.unlockedTechs,
    },
    resources,
    buildings,
    crafter,
    SpyManager: { purchaseMoney: scenario.spyPurchaseMoney },
    FleetManagerOuter: scenario.fleet,
    JobManager: {
      craftingMax: () => scenario.craftingMax,
      skilledServantsMax: () => scenario.skilledServantsMax,
    },
    FactoryManager: {
      maxOperating: () => scenario.factoryCount,
      Productions,
    },
  };
}

function runLegacy(scenario) {
  const requests = [];
  const f = buildFixture(scenario, requests);
  legacyPrioritize({
    getSettings: () => f.settings,
    getState: () => f.state,
    getResources: () => f.resources,
    getBuildings: () => f.buildings,
    getCrafter: () => f.crafter,
    getSpyManager: () => f.SpyManager,
    getFleetManagerOuter: () => f.FleetManagerOuter,
    getJobManager: () => f.JobManager,
    getFactoryManager: () => f.FactoryManager,
    getIsEarlyGame: () => () => scenario.isEarlyGame,
    isProject,
    getInflationChallengeAssistActive: () => () => scenario.inflationActive,
    getRetirementChallengeAssistActive: () => () => scenario.retirementActive,
    getInflationChallengeMoney: () => scenario.inflationMoney,
    getRetirementGraphene: () => scenario.retirementGraphene,
    consumptionBalanceTarget: CBT,
  });
  return { requests, missionIds: f.state.missionBuildingList.map((m) => m.id) };
}

function runNew(scenario) {
  const requests = [];
  const f = buildFixture(scenario, requests);
  const result = planDemandPrioritization(
    readDemandPrioritizationInput({
      getSettings: () => f.settings,
      getState: () => f.state,
      getResources: () => f.resources,
      getBuildings: () => f.buildings,
      getCrafter: () => f.crafter,
      getSpyManager: () => f.SpyManager,
      getFleetManagerOuter: () => f.FleetManagerOuter,
      getJobManager: () => f.JobManager,
      getFactoryManager: () => f.FactoryManager,
      getIsEarlyGame: () => scenario.isEarlyGame,
      isProject,
      isInflationAssistActive: () => scenario.inflationActive,
      isRetirementAssistActive: () => scenario.retirementActive,
      getInflationChallengeMoney: () => scenario.inflationMoney,
      getRetirementGraphene: () => scenario.retirementGraphene,
      consumptionBalanceTarget: CBT,
    }),
  );
  for (const request of result.requests) {
    f.resources[request.resourceId].requestQuantity(request.amount);
  }
  for (const index of result.removedMissionIndices) {
    f.state.missionBuildingList.splice(index, 1);
  }
  return { requests, missionIds: f.state.missionBuildingList.map((m) => m.id) };
}

const baseSettings = {
  prioritizeQueue: "req",
  prioritizeTriggers: "req",
  missionRequest: true,
  prestigeBioseedConstruct: false,
  prestigeType: "none",
  researchRequest: true,
  researchRequestSpace: true,
  prioritizeUnify: "req",
  autoFleet: true,
  prioritizeOuterFleet: "req",
  productionFactoryFocusMaterials: false,
  autoPower: true,
  productionFactoryMinIngredients: 0.2,
};

const empty = {
  settings: baseSettings,
  isEarlyGame: true,
  inflationActive: false,
  retirementActive: false,
  inflationMoney: 250,
  retirementGraphene: 200,
  resources: {
    Money: 1000,
    Graphene: 1000,
    Iron: 1000,
    Copper: 1000,
    Alloy: 1000,
    Coal: 1000,
    Stanene: 1000,
    Titanium: 100,
  },
  queuedTargets: [],
  triggerTargets: [],
  missions: [],
  unlockedTechs: [],
  spyPurchaseMoney: 0,
  fleet: { nextShipAffordable: false, nextShipCost: {} },
  craftingMax: 0,
  skilledServantsMax: 0,
  crafters: [],
  vitreloy: { autoStateEnabled: false, count: 0, stateOnCount: 0 },
  factoryCount: 0,
  productions: [],
};

const scenarios = [
  // 1. Everything active.
  {
    ...empty,
    inflationActive: true,
    retirementActive: true,
    queuedTargets: [{ cost: { Iron: 10 } }],
    triggerTargets: [{ __project: true, cost: { Copper: 20 }, progress: 50 }],
    missions: [
      {
        id: "active",
        cost: { Alloy: 30 },
        autoBuildEnabled: true,
        isUnlocked: true,
        isComplete: false,
      },
      {
        id: "done",
        cost: {},
        autoBuildEnabled: true,
        isUnlocked: false,
        isComplete: true,
      },
      {
        id: "bh",
        cost: { Iron: 999 },
        autoBuildEnabled: true,
        isUnlocked: true,
        isComplete: false,
        isBlackhole: true,
      },
    ],
    spyPurchaseMoney: 500,
    fleet: { nextShipAffordable: true, nextShipCost: { Iron: 60 } },
    craftingMax: 5,
    skilledServantsMax: 2,
    crafters: [
      {
        id: "Sheet",
        isDemanded: true,
        isUnlocked: true,
        craftPreserve: 0.1,
        cost: { Coal: 2 },
      },
    ],
    vitreloy: { autoStateEnabled: true, count: 2, stateOnCount: 0 },
    factoryCount: 3,
    productions: [
      {
        id: "Alloy",
        isDemanded: true,
        unlocked: true,
        enabled: true,
        weighting: 1,
        cost: [{ quantity: 2, minRateOfChange: 1, resourceId: "Titanium" }],
      },
    ],
  },
  // 2. Blackhole excluded by bioseed+whitehole; multiple splices in reverse.
  {
    ...empty,
    settings: {
      ...baseSettings,
      prestigeBioseedConstruct: true,
      prestigeType: "whitehole",
    },
    missions: [
      {
        id: "done1",
        cost: {},
        autoBuildEnabled: true,
        isUnlocked: false,
        isComplete: true,
      },
      {
        id: "bh",
        cost: { Iron: 5 },
        autoBuildEnabled: true,
        isUnlocked: true,
        isComplete: false,
        isBlackhole: true,
      },
      {
        id: "done2",
        cost: {},
        autoBuildEnabled: false,
        isUnlocked: true,
        isComplete: true,
      },
    ],
  },
  // 3. Tech branch, early game, affordability filter.
  {
    ...empty,
    settings: {
      ...baseSettings,
      prioritizeQueue: "ignore",
      prioritizeTriggers: "ignore",
      missionRequest: false,
    },
    unlockedTechs: [
      { cost: { Iron: 15 }, __affordable: true },
      { cost: { Copper: 15 }, __affordable: false },
    ].map((t) => ({ ...t })),
    isEarlyGame: true,
  },
  // 4. Tech branch, space game path disabled -> no requests.
  {
    ...empty,
    settings: {
      ...baseSettings,
      prioritizeQueue: "ignore",
      prioritizeTriggers: "ignore",
      missionRequest: false,
      researchRequestSpace: false,
    },
    unlockedTechs: [{ cost: { Iron: 15 }, __affordable: true }],
    isEarlyGame: false,
  },
  // 5. Project progress >= 99 (no doubling) and null progress (no doubling).
  {
    ...empty,
    queuedTargets: [
      { __project: true, cost: { Iron: 10 }, progress: 99 },
      { __project: true, cost: { Copper: 7 } },
    ],
    missions: [],
  },
  // 6. focusMaterials true: crafter/factory include even when isDemanded false.
  {
    ...empty,
    settings: { ...baseSettings, productionFactoryFocusMaterials: true },
    craftingMax: 5,
    skilledServantsMax: 2,
    crafters: [
      {
        id: "Sheet",
        isDemanded: false,
        isUnlocked: true,
        craftPreserve: 0.1,
        cost: { Coal: 2 },
      },
    ],
    factoryCount: 3,
    productions: [
      {
        id: "Alloy",
        isDemanded: false,
        unlocked: true,
        enabled: true,
        weighting: 1,
        cost: [{ quantity: 2, minRateOfChange: 1, resourceId: "Titanium" }],
      },
    ],
  },
  // 7. Gated off: fleet not affordable, spy zero, crafter not unlocked, factory disabled/zero weighting, vit off.
  {
    ...empty,
    settings: { ...baseSettings, autoPower: false },
    queuedTargets: [{ cost: { Iron: 10 } }],
    spyPurchaseMoney: 0,
    fleet: { nextShipAffordable: false, nextShipCost: { Iron: 60 } },
    craftingMax: 5,
    skilledServantsMax: 2,
    crafters: [
      {
        id: "A",
        isDemanded: false,
        isUnlocked: true,
        craftPreserve: 0.1,
        cost: { Coal: 2 },
      },
      {
        id: "B",
        isDemanded: true,
        isUnlocked: false,
        craftPreserve: 0.1,
        cost: { Coal: 2 },
      },
    ],
    vitreloy: { autoStateEnabled: true, count: 4, stateOnCount: 0 },
    factoryCount: 3,
    productions: [
      {
        id: "Off",
        isDemanded: true,
        unlocked: true,
        enabled: false,
        weighting: 1,
        cost: [{ quantity: 2, minRateOfChange: 1, resourceId: "Titanium" }],
      },
      {
        id: "NoWeight",
        isDemanded: true,
        unlocked: true,
        enabled: true,
        weighting: 0,
        cost: [{ quantity: 2, minRateOfChange: 1, resourceId: "Titanium" }],
      },
    ],
  },
  // 8. autoPower off uses stateOnCount; factory single (non-array) cost, missing minRateOfChange.
  {
    ...empty,
    settings: { ...baseSettings, autoPower: false },
    vitreloy: { autoStateEnabled: true, count: 9, stateOnCount: 2 },
    factoryCount: 4,
    productions: [
      {
        id: "Single",
        isDemanded: true,
        unlocked: true,
        enabled: true,
        weighting: 3,
        cost: [{ quantity: 5, resourceId: "Titanium" }],
      },
    ],
  },
  // 9. Prioritize flags without "req" skip queued/triggers; unify without req skips spy.
  {
    ...empty,
    settings: {
      ...baseSettings,
      prioritizeQueue: "ignore",
      prioritizeTriggers: "req",
      prioritizeUnify: "ignore",
      missionRequest: false,
    },
    queuedTargets: [{ cost: { Iron: 111 } }],
    triggerTargets: [{ cost: { Copper: 22 } }],
    spyPurchaseMoney: 500,
  },
];

// Normalize the factory single-cost fixture: production #8 has no minRateOfChange key.
for (const scenario of scenarios) {
  for (const p of scenario.productions) {
    for (const c of p.cost) {
      if (!("minRateOfChange" in c)) delete c.minRateOfChange;
    }
  }
}

// Techs use isAffordable(true) in both paths; wire it from __affordable.
function withAffordable(scenario) {
  return {
    ...scenario,
    unlockedTechs: scenario.unlockedTechs.map((t) => ({
      ...t,
      isAffordable: () => t.__affordable,
    })),
  };
}

let index = 0;
for (const rawScenario of scenarios) {
  index += 1;
  const scenario = withAffordable(rawScenario);
  const legacy = runLegacy(scenario);
  const next = runNew(scenario);
  assert.deepEqual(
    next.requests,
    legacy.requests,
    `scenario ${index} request trace mismatch`,
  );
  assert.deepEqual(
    next.missionIds,
    legacy.missionIds,
    `scenario ${index} mission list mismatch`,
  );
}

console.log(
  `Demand prioritization dual-run parity tests passed (${scenarios.length} scenarios)`,
);
