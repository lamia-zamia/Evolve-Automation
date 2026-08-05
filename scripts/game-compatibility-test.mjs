import assert from "node:assert/strict";
import { createGameCompatibility } from "../src/game/compatibility.ts";
import { createGameStorageControls } from "../src/adapters/browser/game-storage-controls.ts";

const trace = [];
let context = {
  game: {
    global: {
      race: { universe: "evil" },
      civic: { foreign: { gov0: { eco: 1, hstl: 0, unrest: 0 } } },
      blood: { prepared: 0 },
      portal: { mechbay: { scouts: 0 } },
    },
    adjustCosts: (action, wiki) => {
      trace.push(["adjustCosts", action, wiki]);
      return action;
    },
    loc: (key, variables) => [key, variables],
    messageQueue: (...args) => trace.push(["messageQueue", ...args]),
    shipCosts: (blueprint) => blueprint,
  },
  buildings: {
    RuinsGuardPost: { stateOnCount: 0 },
    RuinsArcology: { stateOnCount: 0 },
    GateTurret: { stateOnCount: 0 },
  },
  traitVal: (_trait, _index, operation) =>
    operation === "+" || operation === "-" ? 1 : (operation ?? 0),
  haveTech: () => false,
  governor: "none",
  getVueById: () => ({
    buildCrateDesc: () => "1 crate stores 250 resources",
    buildContainerDesc: () => "1 container stores 500 resources",
  }),
  date: {
    getMonth: () => 0,
    getDate: () => 1,
  },
};
const compatibility = createGameCompatibility({
  getGame: () => context.game,
  getBuildings: () => context.buildings,
  getTraitVal: () => context.traitVal,
  getHaveTech: () => context.haveTech,
  getGovernor: () => context.governor,
  getVueById: (...args) => context.getVueById(...args),
  storageControls: createGameStorageControls({
    getVueById: (...args) => context.getVueById(...args),
    clickSteps: () => [],
  }),
  normalizeProperties: (value) => value,
  cloneIntoPage: (value, options) => {
    trace.push(["cloneIntoPage", value, options]);
    return value;
  },
  getDate: () => context.date,
});

assert.equal(compatibility.astrologySign(), "capricorn");
assert.equal(compatibility.universeAffix(), "e");
context = {
  ...context,
  game: {
    ...context.game,
    global: {
      ...context.game.global,
      race: { universe: "magic" },
    },
  },
  date: {
    getMonth: () => 6,
    getDate: () => 23,
  },
};
assert.equal(compatibility.astrologySign(), "leo");
assert.equal(compatibility.universeAffix(), "mg");

assert.equal(compatibility.crateValue(), 250);
assert.equal(compatibility.containerValue(), 500);
assert.deepEqual(compatibility.adjustCosts({ cost: 1 }, true), { cost: 1 });
assert.deepEqual(trace.slice(-2), [
  ["cloneIntoPage", { cost: 1 }, { cloneFunctions: true }],
  ["adjustCosts", { cost: 1 }, true],
]);

context = {
  ...context,
  getVueById: () => ({
    buildCrateDesc: () => "1 crate stores 750 resources",
    buildContainerDesc: () => "1 container stores 1000 resources",
  }),
};
assert.equal(compatibility.crateValue(), 750);
assert.equal(compatibility.containerValue(), 1000);

// timeFormat picks one of five branches; each is exercised at its boundary.
assert.deepEqual(compatibility.timeFormat(-1), ["time_never", undefined]);
assert.equal(compatibility.timeFormat(5), "05s");
assert.equal(compatibility.timeFormat(60), "60s");
assert.equal(compatibility.timeFormat(61), "01m 01s");
assert.equal(compatibility.timeFormat(3599), "59m 59s");
assert.equal(compatibility.timeFormat(3661), "1h 01m");
assert.equal(compatibility.timeFormat(86400), "24h 00m");
assert.equal(compatibility.timeFormat(90061), "1d 1h");

// mechCost reads blood.prepared only when the caller omits the override.
assert.deepEqual(compatibility.mechCost("medium", false), { s: 4, c: 180000 });
assert.deepEqual(compatibility.mechCost("titan", true), {
  s: 1500,
  c: 1500000,
});
assert.deepEqual(compatibility.mechCost("collector", false, 2), {
  s: 1,
  c: 8000,
});
assert.deepEqual(compatibility.mechCost("unknown", false), {
  s: 9999,
  c: 10000000,
});

context.game.global.civic.foreign.gov1 = { eco: 2, hstl: 50, unrest: 20 };
assert.equal(compatibility.govPrice(1), 52613);

console.log("Game compatibility module tests passed");
