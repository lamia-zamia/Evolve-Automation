import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
});

assert.equal(typeof hooks.setPowerSupportTestContext, "function");
const support = hooks.powerSupport;
for (const name of [
  "getCitadelConsumption",
  "isHellSupressUseful",
  "adjustSpire",
  "getBestSupplyRatio",
]) {
  assert.equal(typeof support?.[name], "function", `${name} hook missing`);
}

const adjustments = [];
const adjustable = (id, current) => ({
  stateOnCount: current,
  tryAdjustState: (amount) => adjustments.push([id, amount]),
});
const game = { global: { race: {} } };
const jobs = { Archaeologist: { count: 0 } };
const crafter = { Scarletite: { count: 0 } };
const buildings = {
  RuinsArcology: { stateOnCount: 0 },
  GateInferniteMine: { stateOnCount: 0 },
  SpireMechBay: adjustable("mech", 2),
  SpirePort: adjustable("port", 3),
  SpireBaseCamp: adjustable("camp", 4),
};
hooks.setPowerSupportTestContext({ game, jobs, crafter, buildings });

assert.equal(support.getCitadelConsumption(1), 30);
assert.equal(support.getCitadelConsumption(3), 105);
game.global.race.emfield = true;
assert.equal(support.getCitadelConsumption(3), 157.5);

assert.equal(support.isHellSupressUseful(), false);
jobs.Archaeologist.count = 1;
assert.equal(support.isHellSupressUseful(), true);
jobs.Archaeologist.count = 0;
crafter.Scarletite.count = 1;
assert.equal(support.isHellSupressUseful(), true);
crafter.Scarletite.count = 0;
buildings.RuinsArcology.stateOnCount = 1;
assert.equal(support.isHellSupressUseful(), true);

support.adjustSpire(5, 1, 4);
assert.deepEqual(adjustments, [
  ["mech", 3],
  ["port", -2],
  ["camp", 0],
]);

assert.deepEqual([...support.getBestSupplyRatio(2, 10, 10)], [20100, 2, 0]);
assert.deepEqual([...support.getBestSupplyRatio(10, 10, 10)], [156100, 6, 4]);
assert.deepEqual([...support.getBestSupplyRatio(10, 4, 10)], [136100, 4, 6]);
assert.deepEqual([...support.getBestSupplyRatio(10, 10, 2)], [144100, 8, 2]);

console.log("Power support bundled characterization tests passed");
