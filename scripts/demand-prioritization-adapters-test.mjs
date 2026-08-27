import assert from "node:assert/strict";

import { readDemandPrioritizationInput } from "../src/adapters/evolve/economy/resources/demand-prioritization.ts";

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

function baseDeps(overrides = {}) {
  const resources = overrides.resources ?? {
    Titanium: { id: "Titanium", maxQuantity: 100 },
    Coal: { id: "Coal", maxQuantity: 1000 },
  };
  const deps = {
    getSettings: () => overrides.settings ?? baseSettings,
    getState: () =>
      overrides.state ?? {
        queuedTargets: [],
        triggerTargets: [],
        missionBuildingList: [],
        unlockedTechs: [],
      },
    getGame: () =>
      overrides.game ?? { global: { race: { truepath: false }, tech: {} } },
    getResources: () => resources,
    getBuildings: () =>
      overrides.buildings ?? {
        BlackholeJumpShip: null,
        Alien1VitreloyPlant: {
          autoStateEnabled: true,
          count: 2,
          stateOnCount: 1,
        },
      },
    getCrafter: () => overrides.crafter ?? {},
    getSpyManager: () => overrides.spy ?? { purchaseMoney: 0 },
    getFleetManagerOuter: () =>
      overrides.fleet ?? { nextShipAffordable: false, nextShipCost: {} },
    getJobManager: () =>
      overrides.jobs ?? {
        craftingMax: () => 3,
        skilledServantsMax: () => 4,
      },
    getFactoryManager: () =>
      overrides.factory ?? { maxOperating: () => 0, Productions: {} },
    getIsEarlyGame: () => overrides.isEarlyGame ?? true,
    isProject: overrides.isProject ?? ((o) => Boolean(o && o.__project)),
    isInflationAssistActive: () => overrides.inflationActive ?? false,
    isRetirementAssistActive: () => overrides.retirementActive ?? false,
    getInflationChallengeMoney: () => overrides.inflationMoney ?? 250,
    getRetirementGraphene: () => overrides.retirementGraphene ?? 200,
    consumptionBalanceTarget: overrides.cbt ?? 120,
  };
  return deps;
}

// Assist gating: null unless active.
{
  const off = readDemandPrioritizationInput(baseDeps());
  assert.equal(off.inflationMoney, null);
  assert.equal(off.retirementGraphene, null);
  const on = readDemandPrioritizationInput(
    baseDeps({ inflationActive: true, retirementActive: true }),
  );
  assert.equal(on.inflationMoney, 250);
  assert.equal(on.retirementGraphene, 200);
}

// After the third AI core upgrade, the demand reader reserves the next
// powered hardware stage, including costs that are not currently affordable.
{
  const input = readDemandPrioritizationInput(
    baseDeps({
      game: {
        global: { race: { truepath: true }, tech: { titan_ai_core: 3 } },
      },
      buildings: {
        BlackholeJumpShip: null,
        Alien1VitreloyPlant: {
          autoStateEnabled: false,
          count: 0,
          stateOnCount: 0,
        },
        TitanDecoder: { count: 4, stateOnCount: 4, isUnlocked: () => true },
        TitanAIColonist: {
          count: 0,
          stateOnCount: 0,
          cost: { Cipher: 10_000, Money: 112_000_000 },
          isUnlocked: () => true,
        },
        ErisTrooper: { stateOnCount: 13 },
        ErisTank: { stateOnCount: 7 },
      },
    }),
  );
  assert.deepEqual(input.truepathAiBuildingTarget?.costs, [
    { resourceId: "Cipher", amount: 10_000 },
    { resourceId: "Money", amount: 112_000_000 },
  ]);
}

// availableCrafters is the sum of the two job caps.
{
  const input = readDemandPrioritizationInput(baseDeps());
  assert.equal(input.availableCrafters, 7);
}

// Technology ids are optional on the compatibility surface so an older
// uninitialized fixture remains valid, but the live game id is preserved for
// True Path AI research targeting.
{
  const input = readDemandPrioritizationInput(
    baseDeps({
      state: {
        queuedTargets: [],
        triggerTargets: [],
        missionBuildingList: [],
        unlockedTechs: [
          {
            id: "tech-ai_optimizations",
            cost: { Coal: 1 },
            isAffordable: () => false,
          },
        ],
      },
    }),
  );
  assert.equal(input.unlockedTechs[0].id, "tech-ai_optimizations");
}

// progress: finite number kept; absent/non-finite -> null.
{
  const input = readDemandPrioritizationInput(
    baseDeps({
      state: {
        queuedTargets: [
          { __project: true, cost: { Coal: 1 }, progress: 50 },
          { __project: true, cost: { Coal: 1 } },
          { __project: true, cost: { Coal: 1 }, progress: Number.NaN },
          { cost: { Coal: 1 } },
        ],
        triggerTargets: [],
        missionBuildingList: [],
        unlockedTechs: [],
      },
    }),
  );
  assert.deepEqual(
    input.queuedTargets.map((t) => [t.isProject, t.progress]),
    [
      [true, 50],
      [true, null],
      [true, null],
      [false, null],
    ],
  );
}

// isProject receives the raw object.
{
  const seen = [];
  const input = readDemandPrioritizationInput(
    baseDeps({
      isProject: (o) => {
        seen.push(o);
        return o.__project === true;
      },
      state: {
        queuedTargets: [{ __project: true, cost: {} }],
        triggerTargets: [],
        missionBuildingList: [],
        unlockedTechs: [],
      },
    }),
  );
  assert.equal(input.queuedTargets[0].isProject, true);
  assert.equal(seen[0].__project, true);
}

// Missions: identity match for blackhole, boolean sampling, target extraction.
{
  const blackhole = {
    cost: { Coal: 5 },
    autoBuildEnabled: true,
    isUnlocked: () => true,
    isComplete: () => false,
  };
  const input = readDemandPrioritizationInput(
    baseDeps({
      buildings: {
        BlackholeJumpShip: blackhole,
        Alien1VitreloyPlant: {
          autoStateEnabled: false,
          count: 0,
          stateOnCount: 0,
        },
      },
      state: {
        queuedTargets: [],
        triggerTargets: [],
        missionBuildingList: [
          blackhole,
          {
            cost: { Coal: 2 },
            autoBuildEnabled: false,
            isUnlocked: () => false,
            isComplete: () => true,
          },
        ],
        unlockedTechs: [],
      },
    }),
  );
  assert.deepEqual(
    input.missions.map((m) => [
      m.isBlackholeJumpShip,
      m.isUnlocked,
      m.autoBuildEnabled,
      m.isComplete,
    ]),
    [
      [true, true, true, false],
      [false, false, false, true],
    ],
  );
}

// Vitreloy fields sampled raw (resolution happens in the planner).
{
  const input = readDemandPrioritizationInput(baseDeps());
  assert.deepEqual(input.vitreloyPlant, {
    autoStateEnabled: true,
    count: 2,
    stateOnCount: 1,
  });
}

// Crafter: materialMaxQuantity comes from the resources map; predicates sampled.
{
  const input = readDemandPrioritizationInput(
    baseDeps({
      crafter: {
        Sheet: {
          resource: {
            isDemanded: () => false,
            isUnlocked: () => true,
            craftPreserve: 0.1,
            cost: { Coal: 2 },
          },
        },
      },
    }),
  );
  assert.deepEqual(input.crafters, [
    {
      isDemanded: false,
      isUnlocked: true,
      craftPreserve: 0.1,
      costs: [{ resourceId: "Coal", amount: 2, materialMaxQuantity: 1000 }],
    },
  ]);
}

// Factory: single (non-array) cost normalized; weighting/minRateOfChange lenient.
{
  const input = readDemandPrioritizationInput(
    baseDeps({
      factory: {
        maxOperating: () => 4,
        Productions: {
          Single: {
            resource: { isDemanded: () => true },
            unlocked: true,
            enabled: true,
            weighting: undefined,
            cost: {
              quantity: 5,
              resource: { id: "Titanium", maxQuantity: 100 },
            },
          },
        },
      },
    }),
  );
  assert.equal(input.factoryCount, 4);
  assert.deepEqual(input.factoryProductions, [
    {
      isDemanded: true,
      unlocked: true,
      enabled: true,
      weighting: 0,
      costs: [
        {
          quantity: 5,
          minRateOfChange: 0,
          resourceId: "Titanium",
          resourceMaxQuantity: 100,
        },
      ],
    },
  ]);
}

// Result and nested entries are frozen.
{
  const input = readDemandPrioritizationInput(baseDeps());
  assert.ok(Object.isFrozen(input));
  assert.ok(Object.isFrozen(input.settings));
  assert.ok(Object.isFrozen(input.vitreloyPlant));
  assert.ok(Object.isFrozen(input.fleet));
}

// Malformed inputs throw at the boundary.
{
  const cases = [
    [
      "non-array missionBuildingList",
      {
        state: {
          queuedTargets: [],
          triggerTargets: [],
          missionBuildingList: {},
          unlockedTechs: [],
        },
      },
    ],
    [
      "missing crafter material",
      {
        crafter: {
          X: {
            resource: {
              isDemanded: () => true,
              isUnlocked: () => true,
              craftPreserve: 0.1,
              cost: { Missing: 1 },
            },
          },
        },
      },
    ],
    ["non-number purchaseMoney", { spy: { purchaseMoney: "lots" } }],
    ["missing craftingMax", { jobs: { skilledServantsMax: () => 1 } }],
    [
      "non-string factory resource id",
      {
        factory: {
          maxOperating: () => 1,
          Productions: {
            P: {
              resource: { isDemanded: () => true },
              unlocked: true,
              enabled: true,
              weighting: 1,
              cost: { quantity: 1, resource: { id: 7, maxQuantity: 1 } },
            },
          },
        },
      },
    ],
    [
      "non-string setting",
      { settings: { ...baseSettings, prioritizeQueue: 5 } },
    ],
  ];
  for (const [label, overrides] of cases) {
    assert.throws(
      () => readDemandPrioritizationInput(baseDeps(overrides)),
      `expected throw: ${label}`,
    );
  }
}

console.log("Demand prioritization adapter contract tests passed");
