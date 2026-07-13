import assert from "node:assert/strict";

import { createPowerSupport } from "../src/game/power-support.ts";

let game = { global: { race: {} } };
let jobs = { Archaeologist: { count: 0 } };
let crafter = { Scarletite: { count: 0 } };
const changes = [];
const adjustable = (id, stateOnCount) => ({
  stateOnCount,
  tryAdjustState: (amount) => changes.push([id, amount]),
});
let buildings = {
  RuinsArcology: { stateOnCount: 0 },
  GateInferniteMine: { stateOnCount: 0 },
  SpireMechBay: adjustable("mech", 1),
  SpirePort: adjustable("port", 1),
  SpireBaseCamp: adjustable("camp", 1),
};
const support = createPowerSupport({
  getGame: () => game,
  getJobs: () => jobs,
  getCrafter: () => crafter,
  getBuildings: () => buildings,
});

assert.equal(support.getCitadelConsumption(2), 65);
assert.equal(support.isHellSupressUseful(), false);
support.adjustSpire(2, 3, 4);
assert.deepEqual(changes, [
  ["mech", 1],
  ["port", 2],
  ["camp", 3],
]);

game = { global: { race: { emfield: true } } };
jobs = { Archaeologist: { count: 1 } };
crafter = { Scarletite: { count: 0 } };
buildings = { ...buildings };
assert.equal(support.getCitadelConsumption(2), 97.5);
assert.equal(support.isHellSupressUseful(), true);

console.log("Power support module tests passed");
