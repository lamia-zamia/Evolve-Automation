import assert from "node:assert/strict";

import { readStorageRequirementsInput } from "../src/adapters/evolve/storage-requirements.ts";
import { calculateKnowledgeRequirements } from "../src/domain/knowledge-requirements.ts";
import { planStorageRequirements } from "../src/domain/storage-requirements.ts";

// Exact copy of the deleted src/planning/storage-requirements.ts logic.
function legacyRequestStorageFor(ctx, list) {
  const { settings, resources } = ctx;
  const bufferMult = settings.storageAssignExtra ? 1.03 : 1;
  listLoop: for (let i = 0; i < list.length; i++) {
    const object = list[i];
    let storageSuffient = true;
    for (const resourceId in object.cost) {
      resources[resourceId].maxCost = Math.max(
        object.cost[resourceId],
        resources[resourceId].maxCost,
      );
      if (
        resources[resourceId].maxQuantity < object.cost[resourceId] &&
        !resources[resourceId].hasStorage()
      ) {
        storageSuffient = false;
      }
    }
    if (!storageSuffient) {
      continue listLoop;
    }
    for (const resourceId in object.cost) {
      let assumeCost = object.cost[resourceId] * bufferMult;
      if (
        resources[resourceId].maxQuantity < assumeCost &&
        !resources[resourceId].hasStorage()
      ) {
        assumeCost =
          (object.cost[resourceId] + resources[resourceId].maxQuantity) / 2;
      }
      resources[resourceId].storageRequired = Math.max(
        assumeCost,
        resources[resourceId].storageRequired,
      );
    }
  }
}

function legacyCalculate(ctx) {
  const { settings, state, resources, buildings } = ctx;
  const knowledge = calculateKnowledgeRequirements({
    techKnowledgeCosts: [
      ...state.unlockedTechs.map((tech) => tech.cost["Knowledge"] ?? 0),
      ...(buildings.GorddonEmbassy.isAutoBuildable()
        ? [settings.fleetEmbassyKnowledge]
        : []),
    ],
    reservedTargets: [...state.queuedTargetsAll, ...state.triggerTargets].map(
      (target) => ({
        knowledgeCost: target.cost?.Knowledge ?? 0,
        isTechnology: ctx.isTechnology(target),
        isKnowledge: Boolean(target.is?.knowledge),
      }),
    ),
    buildCandidates: [
      ...ctx.BuildingManager.priorityList,
      ...ctx.ProjectManager.priorityList,
    ].map((object) => ({
      knowledgeCost: object.cost?.Knowledge ?? 0,
      isKnowledge: Boolean(object.is?.knowledge),
      weighting: object.weighting ?? 0,
      autoBuildable: Boolean(object.isAutoBuildable?.()),
    })),
  });
  state.knowledgeRequiredByTechs = knowledge.knowledgeRequiredByTechs;
  state.cheapestTechKnowledge = knowledge.cheapestTechKnowledge;
  state.knowledgeRequiredByBuildTargets =
    knowledge.knowledgeRequiredByBuildTargets;

  if (
    settings.autoFleet &&
    ctx.FleetManagerOuter.nextShipExpandable &&
    settings.prioritizeOuterFleet !== "ignore"
  ) {
    legacyRequestStorageFor(ctx, [
      { cost: ctx.FleetManagerOuter.nextShipCost },
    ]);
  }
  legacyRequestStorageFor(ctx, state.unlockedTechs);
  legacyRequestStorageFor(ctx, state.queuedTargetsAll);
  legacyRequestStorageFor(
    ctx,
    ctx.BuildingManager.priorityList.filter(
      (building) => building.isUnlocked?.() && building.autoBuildEnabled,
    ),
  );
  legacyRequestStorageFor(
    ctx,
    ctx.ProjectManager.priorityList.filter(
      (project) => project.isUnlocked?.() && project.autoBuildEnabled,
    ),
  );
  if (ctx.inflationAssist()) {
    resources.Money.maxCost = Math.max(
      resources.Money.maxCost,
      ctx.inflationMoney,
    );
    resources.Money.storageRequired = Math.max(
      resources.Money.storageRequired,
      ctx.inflationMoney,
    );
  }
  if (ctx.retirementAssist()) {
    resources.Graphene.maxCost = Math.max(
      resources.Graphene.maxCost,
      ctx.retirementGraphene,
    );
    resources.Graphene.storageRequired = Math.max(
      resources.Graphene.storageRequired,
      ctx.retirementGraphene,
    );
  }
  if (
    settings.storageAssignExtra &&
    !ctx.game.global.race["no_trade"] &&
    settings.autoMarket
  ) {
    for (const resourceId in resources) {
      if (
        resources[resourceId].autoSellEnabled &&
        resources[resourceId].autoSellRatio > 0
      ) {
        resources[resourceId].storageRequired /=
          resources[resourceId].autoSellRatio;
      }
    }
  }
}

function newCalculate(ctx) {
  const input = readStorageRequirementsInput({
    getSettings: () => ctx.settings,
    getState: () => ctx.state,
    getResources: () => ctx.resources,
    getBuildings: () => ctx.buildings,
    getGame: () => ctx.game,
    getBuildingManager: () => ctx.BuildingManager,
    getProjectManager: () => ctx.ProjectManager,
    getFleetManagerOuter: () => ctx.FleetManagerOuter,
    isTechnology: ctx.isTechnology,
    isInflationAssistActive: ctx.inflationAssist,
    isRetirementAssistActive: ctx.retirementAssist,
    getInflationChallengeMoney: () => ctx.inflationMoney,
    getRetirementGraphene: () => ctx.retirementGraphene,
  });
  const result = planStorageRequirements(input);
  for (const requirement of result.resources) {
    ctx.resources[requirement.id].maxCost = requirement.maxCost;
    ctx.resources[requirement.id].storageRequired = requirement.storageRequired;
  }
  ctx.state.knowledgeRequiredByTechs =
    result.knowledge.knowledgeRequiredByTechs;
  ctx.state.cheapestTechKnowledge = result.knowledge.cheapestTechKnowledge;
  ctx.state.knowledgeRequiredByBuildTargets =
    result.knowledge.knowledgeRequiredByBuildTargets;
}

function resource(maxQuantity, extra = {}) {
  return {
    maxQuantity,
    maxCost: 0,
    storageRequired: 1,
    autoSellEnabled: false,
    autoSellRatio: 0,
    _hasStorage: false,
    hasStorage() {
      return this._hasStorage;
    },
    ...extra,
  };
}

const target = (cost, weighting = 0, extra = {}) => ({
  cost,
  weighting,
  isAutoBuildable: () => true,
  isUnlocked: () => true,
  autoBuildEnabled: true,
  ...extra,
});

function baseContext() {
  const isTechInstances = new Set();
  const tech100 = target({ Knowledge: 100, Iron: 30 });
  const tech50 = target({ Knowledge: 50 });
  isTechInstances.add(tech100);
  isTechInstances.add(tech50);
  return {
    settings: {
      storageAssignExtra: true,
      fleetEmbassyKnowledge: 300,
      autoFleet: true,
      prioritizeOuterFleet: "req",
      autoMarket: true,
    },
    state: {
      unlockedTechs: [tech100, tech50],
      queuedTargetsAll: [target({ Knowledge: 80 }), target({ Iron: 30 })],
      triggerTargets: [target({ Knowledge: 70 })],
      knowledgeRequiredByTechs: 0,
      cheapestTechKnowledge: 0,
      knowledgeRequiredByBuildTargets: 0,
    },
    resources: {
      Knowledge: resource(100),
      Iron: resource(1000, { autoSellEnabled: true, autoSellRatio: 0.5 }),
      Copper: resource(50, { _hasStorage: true }),
      Money: resource(1),
      Graphene: resource(1),
    },
    buildings: { GorddonEmbassy: { isAutoBuildable: () => false } },
    game: { global: { race: {} } },
    BuildingManager: {
      priorityList: [
        target({ Knowledge: 200 }, 5),
        target({ Knowledge: 120 }, 10),
        target({ Knowledge: 500 }, 100, { is: { knowledge: true } }),
      ],
    },
    ProjectManager: { priorityList: [target({ Knowledge: 150 }, 15)] },
    FleetManagerOuter: {
      nextShipExpandable: true,
      nextShipCost: { Iron: 500 },
    },
    isTechnology: (t) => isTechInstances.has(t),
    inflationAssist: () => true,
    retirementAssist: () => true,
    inflationMoney: 250_000_000_000,
    retirementGraphene: 200_000_000,
  };
}

const scenarios = [
  { name: "rich baseline", mutate: () => {} },
  {
    name: "no fleet request",
    mutate: (c) => {
      c.settings.autoFleet = false;
    },
  },
  {
    name: "no buffer, no autosell",
    mutate: (c) => {
      c.settings.storageAssignExtra = false;
    },
  },
  {
    name: "no_trade blocks autosell division",
    mutate: (c) => {
      c.game.global.race.no_trade = 1;
    },
  },
  {
    name: "assists inactive",
    mutate: (c) => {
      c.inflationAssist = () => false;
      c.retirementAssist = () => false;
    },
  },
  {
    name: "special resource without market getters",
    mutate: (c) => {
      // RNA-like resource: no autoSellEnabled/autoSellRatio getters at all.
      c.resources.RNA = {
        maxQuantity: 100,
        maxCost: 0,
        storageRequired: 1,
        hasStorage() {
          return false;
        },
      };
    },
  },
  {
    name: "insufficient storage, half fallback",
    mutate: (c) => {
      // Iron target above capacity with no dedicated storage triggers half fallback.
      c.resources.Iron = resource(200);
      c.state.queuedTargetsAll = [
        target({ Iron: 1000 }),
        target({ Iron: 150 }),
      ];
    },
  },
  {
    name: "prioritizeOuterFleet ignore",
    mutate: (c) => {
      c.settings.prioritizeOuterFleet = "ignore";
    },
  },
  {
    name: "filtered-out building/project entries",
    mutate: (c) => {
      c.BuildingManager.priorityList[0].isUnlocked = () => false;
      c.ProjectManager.priorityList[0].autoBuildEnabled = false;
    },
  },
];

function snapshot(ctx) {
  const resources = {};
  for (const id in ctx.resources) {
    resources[id] = {
      maxCost: ctx.resources[id].maxCost,
      storageRequired: ctx.resources[id].storageRequired,
    };
  }
  return {
    resources,
    knowledge: {
      techs: ctx.state.knowledgeRequiredByTechs,
      cheapest: ctx.state.cheapestTechKnowledge,
      build: ctx.state.knowledgeRequiredByBuildTargets,
    },
  };
}

for (const scenario of scenarios) {
  const legacyCtx = baseContext();
  scenario.mutate(legacyCtx);
  const newCtx = baseContext();
  scenario.mutate(newCtx);

  legacyCalculate(legacyCtx);
  newCalculate(newCtx);

  assert.deepEqual(snapshot(newCtx), snapshot(legacyCtx), scenario.name);
}

console.log("Storage requirements planner dual-run tests passed");
