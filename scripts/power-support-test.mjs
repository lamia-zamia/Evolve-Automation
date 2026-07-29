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
let smart = { mechBay: false, purifier: false };
let resources = { Spire_Support: { maxQuantity: 0 } };
let buildings = {
  RuinsArcology: { stateOnCount: 0 },
  GateInferniteMine: { stateOnCount: 0 },
  NeutronCitadel: { count: 0 },
  SpireMechBay: {
    ...adjustable("mech", 1),
    isSmartManaged: () => smart.mechBay,
  },
  SpirePurifier: { isSmartManaged: () => smart.purifier },
  SpirePort: { ...adjustable("port", 1), count: 0, autoMax: 0 },
  SpireBaseCamp: { ...adjustable("camp", 1), count: 0, autoMax: 0 },
};
const support = createPowerSupport({
  getGame: () => game,
  getJobs: () => jobs,
  getCrafter: () => crafter,
  getResources: () => resources,
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

// The next citadel's draw is the difference between the totals either side of
// it, so it grows with the count and follows the emfield multiplier.
game = { global: { race: {} } };
assert.equal(support.nextCitadelPowerDraw(), 30);
buildings.NeutronCitadel.count = 2;
assert.equal(support.nextCitadelPowerDraw(), 40);
game = { global: { race: { emfield: true } } };
assert.equal(support.nextCitadelPowerDraw(), 60);

// Support 10 with room to spare wants 6 ports and 4 base camps.
resources = { Spire_Support: { maxQuantity: 10 } };
buildings.SpirePort.autoMax = 20;
buildings.SpireBaseCamp.autoMax = 20;

// Nothing is prebuilt while both the mech bay and the purifier are unmanaged.
smart = { mechBay: false, purifier: false };
assert.deepEqual(support.spirePrebuildShortfall(), {
  ports: false,
  baseCamps: false,
});

// Either one being smart managed is enough for the prebuild to matter.
smart = { mechBay: true, purifier: false };
assert.deepEqual(support.spirePrebuildShortfall(), {
  ports: true,
  baseCamps: true,
});
smart = { mechBay: false, purifier: true };
assert.deepEqual(support.spirePrebuildShortfall(), {
  ports: true,
  baseCamps: true,
});

// Each building drops out of the shortfall as it reaches its own target.
buildings.SpirePort.count = 6;
buildings.SpireBaseCamp.count = 3;
assert.deepEqual(support.spirePrebuildShortfall(), {
  ports: false,
  baseCamps: true,
});
buildings.SpireBaseCamp.count = 4;
assert.deepEqual(support.spirePrebuildShortfall(), {
  ports: false,
  baseCamps: false,
});

console.log("Power support module tests passed");
