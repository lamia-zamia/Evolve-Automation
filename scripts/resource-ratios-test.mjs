import assert from "node:assert/strict";

import {
  createResourceRatioCommandExecutors,
  readExtractorRatioInput,
  readMineRatioInput,
  readQuarryRatioInput,
} from "../src/adapters/evolve/economy/resources/resource-ratios.ts";
import {
  planExtractorRatios,
  planMineRatio,
  planQuarryRatio,
} from "../src/domain/economy/resources/resource-ratios.ts";

function resource(storageRatio, demanded = false) {
  return { storageRatio, isDemanded: () => demanded };
}

const actions = [];
const resources = {
  Chrysotile: resource(0.2),
  Stone: resource(0.6),
  Adamantite: resource(0.5),
  Aluminium: resource(0.5),
  Iron: resource(0.5),
  Iridium: resource(0.5),
  Neutronium: resource(0.5),
  Orichalcum: resource(0.5),
  Elerium: resource(0.5),
};
const dependencies = {
  getQuarryManager: () => ({
    initIndustry: () => true,
    currentProduction: () => 50,
    increaseProduction: (delta) => actions.push(["quarry", delta]),
  }),
  getMineManager: () => ({
    initIndustry: () => true,
    currentProduction: () => 20,
    increaseProduction: (delta) => actions.push(["mine", delta]),
  }),
  getExtractorManager: () => ({
    initIndustry: () => true,
    currentProduction: () => 50,
    increaseProduction: (id, delta) => actions.push(["extractor", id, delta]),
  }),
  getResources: () => resources,
  getSettings: () => ({
    productionChrysotileWeight: 2,
    productionAdamantiteWeight: 1,
    productionExtWeight_common: 2,
    productionExtWeight_uncommon: 2,
    productionExtWeight_rare: 2,
  }),
  getBuildings: () => ({ MetalRefinery: { count: 0 } }),
  haveTech: (id, level) => id === "tau_roid" && level === 5,
};
const executors = createResourceRatioCommandExecutors(dependencies);

const quarryAdjustment = planQuarryRatio(readQuarryRatioInput(dependencies));
if (quarryAdjustment !== null) executors.quarry.execute(quarryAdjustment);
const mineAdjustment = planMineRatio(readMineRatioInput(dependencies));
if (mineAdjustment !== null) executors.mine.execute(mineAdjustment);
executors.extractor.execute(
  planExtractorRatios(readExtractorRatioInput(dependencies)),
);

assert.deepEqual(actions, [
  ["quarry", 30],
  ["mine", 30],
  ["extractor", "common", 17],
  ["extractor", "uncommon", 17],
  ["extractor", "rare", 17],
]);

// Metal Refinery raises the Stone weight via Aluminium fullness.
{
  const adjustment = planQuarryRatio({
    initialised: true,
    currentRatio: 0,
    chrysotileDemanded: false,
    chrysotileStorageRatio: 0.5,
    stoneDemanded: false,
    stoneStorageRatio: 0.9,
    hasMetalRefinery: true,
    aluminiumDemanded: false,
    aluminiumStorageRatio: 0.1, // Aluminium weight 90 overrides Stone weight 10
    chrysotileWeight: 1,
  });
  // chrysotile 50, stone max(10, 90) = 90 -> round(50/140*100) = 36
  assert.equal(adjustment.delta, 36);
}

// Demanded resource forces its weight to MAX_SAFE_INTEGER.
assert.equal(
  planMineRatio({
    initialised: true,
    currentRatio: 10,
    adamantiteDemanded: true,
    adamantiteStorageRatio: 1,
    aluminiumDemanded: false,
    aluminiumStorageRatio: 0,
    adamantiteWeight: 1,
  }).delta,
  90, // adamantite MAX dominates -> round(~100) - 10
);

// Not initialised: null / empty, no production change.
assert.equal(planQuarryRatio({ initialised: false }), null);
assert.deepEqual(planExtractorRatios({ initialised: false }), []);

// Adapter: legacy refreshes resources/settings before initIndustry, but does
// not inspect their returned values when the industry is unavailable.
{
  const getterCalls = [];
  const input = readMineRatioInput({
    getMineManager: () => ({ initIndustry: () => false }),
    getResources: () => (getterCalls.push("resources"), null),
    getSettings: () => (getterCalls.push("settings"), null),
  });
  assert.equal(input.initialised, false);
  assert.deepEqual(getterCalls, ["resources", "settings"]);
  assert.ok(Object.isFrozen(input));
}

// tau_roid < 5 omits the rare extractor production.
{
  const input = readExtractorRatioInput({
    ...dependencies,
    haveTech: () => false,
  });
  assert.deepEqual(
    input.productions.map((p) => p.id),
    ["common", "uncommon"],
  );
}

// Executor rejects a stale sampled ratio before issuing a mutation.
{
  const mutations = [];
  const ratioExecutors = createResourceRatioCommandExecutors({
    getQuarryManager: () => ({
      currentProduction: () => 51,
      increaseProduction: (delta) => mutations.push(delta),
    }),
    getMineManager: () => ({}),
    getExtractorManager: () => ({}),
  });
  const result = ratioExecutors.quarry.execute({
    expectedCurrentRatio: 50,
    delta: 10,
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(mutations, []);
}

console.log("Resource ratio adapter, planner, and executor tests passed");
