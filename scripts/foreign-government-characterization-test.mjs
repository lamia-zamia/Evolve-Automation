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

assert.equal(typeof hooks.setForeignGovernmentTestContext, "function");
const foreign = hooks.foreignGovernment;
assert.equal(typeof foreign?.getGovName, "function");
assert.equal(typeof foreign?.getGovPower, "function");

const locCalls = [];
const game = {
  global: {
    race: {},
    civic: {
      foreign: {
        gov0: { spy: 0, mil: 100 },
        gov1: {
          spy: 2,
          mil: 143,
          name: { s0: "democracy", s1: "Alpha" },
        },
        gov2: { spy: 0, mil: 190 },
      },
    },
  },
};
hooks.setForeignGovernmentTestContext({
  game,
  poly: {
    loc(key, args) {
      locCalls.push([key, [...args]]);
      return `${key}:${args[0]}`;
    },
  },
});

assert.equal(foreign.getGovName(0), "foreign power 1");
assert.equal(foreign.getGovName(1), "civics_govdemocracy:Alpha (2)");
assert.deepEqual(locCalls, [["civics_govdemocracy", ["Alpha"]]]);
assert.equal(foreign.getGovPower(0), 125);
assert.equal(foreign.getGovPower(1), 143);
assert.equal(foreign.getGovPower(2), 190);

game.global.civic.foreign.gov0.mil = 70;
assert.equal(foreign.getGovPower(0), 70);

game.global.race.truepath = true;
game.global.civic.foreign.gov0.mil = 100;
assert.equal(foreign.getGovPower(0), 100);
game.global.civic.foreign.gov0.mil = 120;
assert.equal(foreign.getGovPower(0), 187.5);

console.log("Foreign government bundled characterization tests passed");
