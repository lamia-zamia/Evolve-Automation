import assert from "node:assert/strict";

import { createAutoResourceRatios } from "../src/subsystems/resource-ratios.ts";

function resource(storageRatio) {
  return { storageRatio, isDemanded: () => false };
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
const { autoQuarry, autoMine, autoExtractor } = createAutoResourceRatios({
  QuarryManager: {
    initIndustry: () => true,
    currentProduction: () => 50,
    increaseProduction: (delta) => actions.push(["quarry", delta]),
  },
  MineManager: {
    initIndustry: () => true,
    currentProduction: () => 20,
    increaseProduction: (delta) => actions.push(["mine", delta]),
  },
  ExtractorManager: {
    initIndustry: () => true,
    currentProduction: () => 50,
    increaseProduction: (id, delta) => actions.push(["extractor", id, delta]),
  },
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
});

autoQuarry();
autoMine();
autoExtractor();

assert.deepEqual(actions, [
  ["quarry", 30],
  ["mine", 30],
  ["extractor", "common", 17],
  ["extractor", "uncommon", 17],
  ["extractor", "rare", 17],
]);

console.log("Resource ratio automation regression tests passed");
