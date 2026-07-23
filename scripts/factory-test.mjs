import assert from "node:assert/strict";

import { createFactoryTooltipPublisher } from "../src/adapters/browser/factory-tooltips.ts";
import { createFactoryAdapter } from "../src/adapters/evolve/factory.ts";
import { runFactoryAutomation } from "../src/application/factory.ts";
import { planFactory } from "../src/domain/economy/production/factory.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

const CONSUMPTION_BALANCE_MIN = 60;

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const current = {};
  const productions = {};
  const resources = {
    Neutronium: {
      id: "Neutronium",
      name: "Neutronium",
      currentQuantity: scenario.neutroniumCurrent ?? 1_000,
    },
  };
  for (const definition of scenario.productions ?? []) {
    const outputId = definition.outputId ?? definition.id;
    const output = {
      id: outputId,
      currentQuantity: definition.currentQuantity ?? 0,
      storageRequired: definition.storageRequired ?? 0,
      isDemanded: () => definition.demanded ?? false,
      isUseful: () => definition.useful ?? true,
    };
    resources[outputId] = output;
    const costs = (definition.costs ?? []).map((cost, costIndex) => {
      const resourceId = cost.id ?? `${definition.id}Material${costIndex}`;
      const resource = {
        id: resourceId,
        name: cost.name ?? resourceId,
        currentQuantity: cost.currentQuantity ?? 1_000,
        rateOfChange: cost.rateOfChange ?? 1_000,
        storageRatio: cost.storageRatio ?? 1,
        isDemanded: () => cost.demanded ?? false,
        isUnlocked: () => cost.unlocked ?? true,
      };
      resources[resourceId] = resource;
      return {
        resource,
        quantity: cost.quantity ?? 1,
        minRateOfChange: cost.minRateOfChange ?? 0,
      };
    });
    const production = {
      id: definition.id,
      resource: output,
      unlocked: definition.unlocked ?? true,
      enabled: definition.enabled ?? true,
      weighting: definition.weighting ?? 1,
      priority: definition.priority ?? 1,
      cost: costs,
    };
    productions[definition.key ?? definition.id] = production;
    current[definition.id] = definition.current ?? 0;
  }
  const manager = {
    Productions: productions,
    initIndustry: () => scenario.initialized ?? true,
    maxOperating: () => scenario.maximum ?? 0,
    currentProduction: (production) => current[production.id] ?? 0,
    decreaseProduction(production, count) {
      trace.managerCall("decreaseProduction", {
        productionId: production.id,
        count,
      });
      trace.command("decrease-factory", {
        productionId: production.id,
        count,
      });
      current[production.id] -= count;
      trace.stateChange("factory-allocation", {
        productionId: production.id,
        count: current[production.id],
      });
    },
    increaseProduction(production, count) {
      trace.managerCall("increaseProduction", {
        productionId: production.id,
        count,
      });
      trace.command("increase-factory", {
        productionId: production.id,
        count,
      });
      current[production.id] += count;
      trace.stateChange("factory-allocation", {
        productionId: production.id,
        count: current[production.id],
      });
    },
  };
  return {
    trace,
    current,
    manager,
    resources,
    game: { global: { race: { truepath: scenario.truepath ?? false } } },
    settings: {
      productionFactoryWeighting: scenario.weightingMode ?? "none",
      productionFactoryMinIngredients: scenario.minimumIngredientRatio ?? 0,
      useDemanded: scenario.useDemandedMaterials ?? false,
      prestigeType: scenario.bioseedConstruct ? "bioseed" : "none",
      prestigeBioseedConstruct: scenario.bioseedConstruct ?? false,
    },
    state: {
      tooltips: {},
      unlockedBuildings: scenario.unlockedBuildings ?? [],
    },
  };
}

function requiredResourceWeight(buildings, resource) {
  return buildings.find((building) => {
    const required = building.cost[resource.id];
    return required !== undefined && required > resource.currentQuantity;
  })?.weighting;
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const FactoryManager = fixture.manager;
  const { state, settings, game, resources } = fixture;
  if (!FactoryManager.initIndustry()) {
    return {
      trace: fixture.trace.snapshot(),
      current: fixture.current,
      tooltips: fixture.state.tooltips,
    };
  }
  const allProducts = Object.values(FactoryManager.Productions);
  const priorityGroups = {};
  const factoryAdjustments = {};
  for (const production of allProducts) {
    state.tooltips[`iFactory${production.id}`] = "Disabled<br>";
    if (production.unlocked && production.enabled) {
      if (production.weighting > 0) {
        const priority = production.resource.isDemanded()
          ? Math.max(production.priority, 100)
          : production.priority;
        if (priority !== 0) {
          priorityGroups[priority] = priorityGroups[priority] ?? [];
          priorityGroups[priority].push(production);
          state.tooltips[`iFactory${production.id}`] = "Low priority<br>";
        }
      }
      factoryAdjustments[production.id] = 0;
    }
  }
  const priorityList = Object.keys(priorityGroups)
    .sort((left, right) => right - left)
    .map((key) => priorityGroups[key]);
  if (priorityGroups["-1"] && priorityList.length > 1) {
    priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
    priorityList[0].push(...priorityGroups["-1"]);
  }

  let onDemand = false;
  if (settings.productionFactoryWeighting === "demanded") {
    onDemand = allProducts.some(
      (production) =>
        production.resource.currentQuantity <
        production.resource.storageRequired,
    );
  }
  const scalingFactor =
    settings.productionFactoryWeighting === "buildings" &&
    state.unlockedBuildings.length > 0
      ? (resource) =>
          requiredResourceWeight(state.unlockedBuildings, resource) ?? 100
      : settings.productionFactoryWeighting === "demanded" && onDemand
        ? (resource) =>
            resource.currentQuantity < resource.storageRequired ? 1 : 0
        : () => 1;
  const scaledWeights = Object.fromEntries(
    allProducts.map((production) => [
      production.resource.id,
      production.weighting * scalingFactor(production.resource),
    ]),
  );

  let remainingFactories = FactoryManager.maxOperating();
  for (
    let groupIndex = 0;
    groupIndex < priorityList.length && remainingFactories > 0;
    groupIndex++
  ) {
    const products = priorityList[groupIndex].sort(
      (left, right) =>
        scaledWeights[left.resource.id] - scaledWeights[right.resource.id],
    );
    while (remainingFactories > 0) {
      const factoriesToDistribute = remainingFactories;
      const totalPriorityWeight = products.reduce(
        (sum, production) => sum + scaledWeights[production.resource.id],
        0,
      );
      for (
        let index = products.length - 1;
        index >= 0 && remainingFactories > 0;
        index--
      ) {
        const production = products[index];
        state.tooltips[`iFactory${production.id}`] = "";
        const calculated = Math.min(
          remainingFactories,
          Math.max(
            1,
            Math.floor(
              (factoriesToDistribute / totalPriorityWeight) *
                scaledWeights[production.resource.id],
            ),
          ),
        );
        let actual = calculated;
        if (!production.resource.isUseful()) {
          actual = 0;
          state.tooltips[`iFactory${production.id}`] += "Resource capped<br>";
        }
        for (const resourceCost of production.cost) {
          const usedMaterial = resourceCost.resource;
          if (!usedMaterial.isUnlocked()) continue;
          if (!production.resource.isDemanded()) {
            if (!settings.useDemanded && usedMaterial.isDemanded()) {
              actual = 0;
              state.tooltips[`iFactory${production.id}`] +=
                `${usedMaterial.name} is demanded<br>`;
              break;
            }
            if (
              usedMaterial.storageRatio <
              settings.productionFactoryMinIngredients
            ) {
              actual = 0;
              state.tooltips[`iFactory${production.id}`] +=
                `${usedMaterial.name} under min materials ratio<br>`;
              break;
            }
          }
          if (
            usedMaterial.currentQuantity <
              actual * resourceCost.quantity * CONSUMPTION_BALANCE_MIN +
                resourceCost.minRateOfChange ||
            usedMaterial.isDemanded()
          ) {
            const previousCost =
              FactoryManager.currentProduction(production) *
              resourceCost.quantity;
            const currentCost =
              factoryAdjustments[production.id] * resourceCost.quantity;
            let rate =
              usedMaterial.rateOfChange +
              previousCost -
              currentCost -
              resourceCost.minRateOfChange;
            if (production.resource.isDemanded()) {
              rate += usedMaterial.currentQuantity;
            }
            const affordable = Math.floor(rate / resourceCost.quantity);
            if (affordable < 1) {
              state.tooltips[`iFactory${production.id}`] +=
                `Too low ${usedMaterial.name} income<br>`;
            }
            actual = Math.min(actual, affordable);
          }
        }
        if (
          settings.prestigeType === "bioseed" &&
          settings.prestigeBioseedConstruct &&
          production === FactoryManager.Productions.NanoTube
        ) {
          const reserved = game.global.race.truepath ? 500 : 250;
          if (resources.Neutronium.currentQuantity < reserved) {
            state.tooltips[`iFactory${production.id}`] +=
              `${reserved} ${resources.Neutronium.name} reserved<br>`;
            actual = 0;
          }
        }
        if (actual > 0) {
          remainingFactories -= actual;
          factoryAdjustments[production.id] += actual;
        }
        if (actual < calculated) products.splice(index, 1);
      }
      if (factoriesToDistribute === remainingFactories) break;
    }
  }

  for (const production of allProducts) {
    if (factoryAdjustments[production.id] !== undefined) {
      const delta =
        factoryAdjustments[production.id] -
        FactoryManager.currentProduction(production);
      if (delta < 0) {
        FactoryManager.decreaseProduction(production, delta * -1);
      }
    }
  }
  for (const production of allProducts) {
    if (factoryAdjustments[production.id] !== undefined) {
      const delta =
        factoryAdjustments[production.id] -
        FactoryManager.currentProduction(production);
      if (delta > 0) FactoryManager.increaseProduction(production, delta);
    }
  }
  return {
    trace: fixture.trace.snapshot(),
    current: fixture.current,
    tooltips: fixture.state.tooltips,
  };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const adapter = createFactoryAdapter({
    getManager: () => fixture.manager,
    getState: () => fixture.state,
    getSettings: () => fixture.settings,
    getGame: () => fixture.game,
    getResources: () => fixture.resources,
    consumptionBalanceMinimum: CONSUMPTION_BALANCE_MIN,
  });
  const outcome = runFactoryAutomation({
    reader: adapter.reader,
    executor: adapter.executor,
    tooltips: createFactoryTooltipPublisher(() => fixture.state),
  });
  assert.equal(outcome.status, "succeeded");
  return {
    trace: fixture.trace.snapshot(),
    current: fixture.current,
    tooltips: fixture.state.tooltips,
  };
}

const dualRunScenarios = [
  { name: "locked", initialized: false, maximum: 3, productions: [] },
  {
    name: "weighted production",
    maximum: 3,
    productions: [
      { id: "First", weighting: 1, current: 3 },
      { id: "Second", weighting: 2 },
      { id: "Nano", key: "NanoTube", unlocked: false, enabled: false },
    ],
  },
  {
    name: "inactive products clear only enabled allocations",
    maximum: 2,
    productions: [
      { id: "Disabled", enabled: false, current: 1 },
      { id: "ZeroWeight", weighting: 0, current: 1 },
      { id: "ZeroPriority", priority: 0, current: 1 },
    ],
  },
  {
    name: "demand promotion",
    maximum: 2,
    productions: [
      { id: "Demanded", priority: 1, demanded: true },
      { id: "High", priority: 50 },
    ],
  },
  {
    name: "below minus one splice",
    maximum: 2,
    productions: [
      { id: "Supplementary", priority: -1 },
      { id: "Lower", priority: -2, current: 1 },
    ],
  },
  {
    name: "demanded weighting scales shortages",
    maximum: 2,
    weightingMode: "demanded",
    productions: [
      { id: "Short", currentQuantity: 0, storageRequired: 10 },
      { id: "Stocked", currentQuantity: 10, storageRequired: 10, current: 1 },
    ],
  },
  {
    name: "building weighting selects first shortage",
    maximum: 3,
    weightingMode: "buildings",
    unlockedBuildings: [
      { cost: { A: 10 }, weighting: 3 },
      { cost: { B: 10 }, weighting: 1 },
    ],
    productions: [
      { id: "AProduct", outputId: "A", currentQuantity: 0 },
      { id: "BProduct", outputId: "B", currentQuantity: 0 },
    ],
  },
  {
    name: "capped output falls back",
    maximum: 2,
    productions: [
      { id: "Capped", priority: 10, useful: false, current: 1 },
      { id: "Fallback", priority: 5 },
    ],
  },
  {
    name: "demanded ingredient blocks ordinary output",
    maximum: 1,
    productions: [
      {
        id: "Blocked",
        costs: [{ id: "Input", demanded: true }],
        current: 1,
      },
    ],
  },
  {
    name: "demanded output can consume demanded ingredient",
    maximum: 1,
    productions: [
      {
        id: "Demanded",
        demanded: true,
        costs: [
          {
            id: "Input",
            demanded: true,
            currentQuantity: 0,
            rateOfChange: 0,
          },
        ],
      },
    ],
  },
  {
    name: "minimum ingredient floor",
    maximum: 1,
    minimumIngredientRatio: 0.5,
    productions: [{ id: "Low", costs: [{ id: "Input", storageRatio: 0.49 }] }],
  },
  {
    name: "affordability adds existing consumption back",
    maximum: 3,
    productions: [
      {
        id: "Affordable",
        current: 2,
        costs: [
          { id: "Input", currentQuantity: 0, rateOfChange: 1, quantity: 1 },
        ],
      },
    ],
  },
  {
    name: "bioseed truepath neutronium reserve and locked costs",
    maximum: 2,
    bioseedConstruct: true,
    truepath: true,
    neutroniumCurrent: 499,
    productions: [
      {
        id: "Nano",
        key: "NanoTube",
        current: 1,
        costs: [{ id: "Locked", unlocked: false }],
      },
      { id: "Fallback", priority: 0 },
    ],
  },
  {
    name: "bioseed ordinary neutronium reserve",
    maximum: 1,
    bioseedConstruct: true,
    neutroniumCurrent: 249,
    productions: [{ id: "Nano", key: "NanoTube", current: 1 }],
  },
];

for (const scenario of dualRunScenarios) {
  const legacy = runLegacy(scenario);
  const modern = runModern(scenario);
  assertEquivalentTraces({
    legacy: legacy.trace,
    modern: modern.trace,
    label: `factory ${scenario.name}`,
  });
  assert.deepEqual(modern.current, legacy.current, `${scenario.name}: current`);
  assert.deepEqual(
    modern.tooltips,
    legacy.tooltips,
    `${scenario.name}: tooltips`,
  );
}

const noOp = planFactory({
  initialized: false,
  maximum: 0,
  weightingMode: "",
  hasUnlockedBuildings: false,
  useDemandedMaterials: false,
  minimumIngredientRatio: 0,
  consumptionBalanceMinimum: 60,
  bioseedConstruct: false,
  truepath: false,
  neutroniumCurrent: 0,
  neutroniumName: "",
  productions: [],
});
assert.equal(noOp, null);

const phaseFixture = createFixture({
  maximum: 0,
  productions: [{ id: "A", enabled: false }],
});
const phaseAdapter = createFactoryAdapter({
  getManager: () => phaseFixture.manager,
  getState: () => phaseFixture.state,
  getSettings: () => phaseFixture.settings,
  getGame: () => phaseFixture.game,
  getResources: () => phaseFixture.resources,
  consumptionBalanceMinimum: 60,
});
const phases = [];
assert.equal(
  runFactoryAutomation({
    reader: {
      read() {
        phases.push("read");
        return phaseAdapter.reader.read();
      },
    },
    tooltips: {
      publish() {
        phases.push("tooltips");
      },
    },
    executor: {
      execute() {
        phases.push("execute");
        return { status: "succeeded" };
      },
    },
  }).status,
  "succeeded",
);
assert.deepEqual(phases, ["read", "tooltips", "execute"]);

let stateRead = false;
const lockedAdapter = createFactoryAdapter({
  getManager: () => ({ initIndustry: () => false }),
  getState: () => {
    stateRead = true;
    return {};
  },
  getSettings: () => ({}),
  getGame: () => ({}),
  getResources: () => ({}),
  consumptionBalanceMinimum: 60,
});
assert.equal(lockedAdapter.reader.read().initialized, false);
assert.equal(stateRead, false);

const missingWeightFixture = createFixture({
  maximum: 0,
  productions: [{ id: "A" }],
});
delete missingWeightFixture.manager.Productions.A.weighting;
const missingWeightAdapter = createFactoryAdapter({
  getManager: () => missingWeightFixture.manager,
  getState: () => missingWeightFixture.state,
  getSettings: () => missingWeightFixture.settings,
  getGame: () => missingWeightFixture.game,
  getResources: () => missingWeightFixture.resources,
  consumptionBalanceMinimum: 60,
});
assert.equal(missingWeightAdapter.reader.read().productions[0].weighting, 0);

const staleFixture = createFixture({
  maximum: 1,
  productions: [{ id: "A" }],
});
const staleAdapter = createFactoryAdapter({
  getManager: () => staleFixture.manager,
  getState: () => staleFixture.state,
  getSettings: () => staleFixture.settings,
  getGame: () => staleFixture.game,
  getResources: () => staleFixture.resources,
  consumptionBalanceMinimum: 60,
});
const staleDecision = planFactory(staleAdapter.reader.read());
staleFixture.current.A = 1;
assert.equal(staleAdapter.executor.execute(staleDecision).status, "stale");
assert.deepEqual(staleFixture.trace.snapshot(), []);

const preflightFixture = createFixture({
  maximum: 1,
  productions: [
    { id: "Old", current: 1, priority: 1 },
    { id: "New", priority: 10 },
  ],
});
const preflightAdapter = createFactoryAdapter({
  getManager: () => preflightFixture.manager,
  getState: () => preflightFixture.state,
  getSettings: () => preflightFixture.settings,
  getGame: () => preflightFixture.game,
  getResources: () => preflightFixture.resources,
  consumptionBalanceMinimum: 60,
});
const preflightDecision = planFactory(preflightAdapter.reader.read());
delete preflightFixture.manager.increaseProduction;
assert.throws(
  () => preflightAdapter.executor.execute(preflightDecision),
  /increaseProduction/,
);
assert.deepEqual(preflightFixture.trace.snapshot(), []);

assert.throws(
  () =>
    createFactoryTooltipPublisher(() => ({})).publish([
      { key: "x", value: "y" },
    ]),
  /state\.tooltips/,
);

console.log(
  `Factory domain, adapter, application, tooltip, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
