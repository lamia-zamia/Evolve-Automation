import assert from "node:assert/strict";

import {
  readExtractorRatioInput,
  readMineRatioInput,
  readQuarryRatioInput,
} from "../src/adapters/evolve/resource-ratios.ts";
import {
  planExtractorRatios,
  planMineRatio,
  planQuarryRatio,
} from "../src/domain/resource-ratios.ts";

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

const quarryDelta = planQuarryRatio(readQuarryRatioInput(dependencies));
if (quarryDelta !== null)
  dependencies.getQuarryManager().increaseProduction(quarryDelta);
const mineDelta = planMineRatio(readMineRatioInput(dependencies));
if (mineDelta !== null)
  dependencies.getMineManager().increaseProduction(mineDelta);
for (const { id, delta } of planExtractorRatios(
  readExtractorRatioInput(dependencies),
)) {
  dependencies.getExtractorManager().increaseProduction(id, delta);
}

assert.deepEqual(actions, [
  ["quarry", 30],
  ["mine", 30],
  ["extractor", "common", 17],
  ["extractor", "uncommon", 17],
  ["extractor", "rare", 17],
]);

// Metal Refinery raises the Stone weight via Aluminium fullness.
{
  const delta = planQuarryRatio({
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
  assert.equal(delta, 36);
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
  }),
  90, // adamantite MAX dominates -> round(~100) - 10
);

// Not initialised: null / empty, no production change.
assert.equal(planQuarryRatio({ initialised: false }), null);
assert.deepEqual(planExtractorRatios({ initialised: false }), []);

// Adapter: uninitialised industry short-circuits without reading resources.
{
  const input = readMineRatioInput({
    getMineManager: () => ({ initIndustry: () => false }),
    getResources: () => {
      throw new Error("resources must not be read when uninitialised");
    },
    getSettings: () => {
      throw new Error("settings must not be read when uninitialised");
    },
  });
  assert.equal(input.initialised, false);
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

console.log("Resource ratio automation regression tests passed");
