import assert from "node:assert/strict";

import { createFactoryTooltipPublisher } from "../src/adapters/browser/factory-tooltips.ts";
import { createFactoryAdapter } from "../src/adapters/evolve/economy/production/factory.ts";
import { runFactoryAutomation } from "../src/application/factory.ts";
import { planFactory } from "../src/domain/economy/production/factory.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

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

const customPriorityDecision = planFactory({
  initialized: true,
  maximum: 2,
  weightingMode: "none",
  hasUnlockedBuildings: false,
  useDemandedMaterials: false,
  minimumIngredientRatio: 0,
  consumptionBalanceMinimum: 60,
  bioseedConstruct: false,
  truepath: false,
  neutroniumCurrent: 0,
  neutroniumName: "Neutronium",
  productions: [
    {
      id: "supplementary",
      outputResourceId: "Supplementary",
      unlocked: true,
      enabled: true,
      weighting: 1,
      priority: -1,
      demanded: false,
      useful: true,
      currentQuantity: 0,
      storageRequired: 0,
      buildingWeight: 1,
      currentProduction: 0,
      isNanoTube: false,
      costs: [],
    },
    {
      id: "lower-priority",
      outputResourceId: "LowerPriority",
      unlocked: true,
      enabled: true,
      weighting: 1,
      priority: -2,
      demanded: false,
      useful: true,
      currentQuantity: 0,
      storageRequired: 0,
      buildingWeight: 1,
      currentProduction: 0,
      isNanoTube: false,
      costs: [],
    },
  ],
});
assert.deepEqual(
  customPriorityDecision.adjustments.map(({ productionId, delta }) => ({
    productionId,
    delta,
  })),
  [
    { productionId: "supplementary", delta: 1 },
    { productionId: "lower-priority", delta: 1 },
  ],
);

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

console.log("Factory domain, adapter, application, and tooltip tests passed");
