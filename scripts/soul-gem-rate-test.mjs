import assert from "node:assert/strict";

import { createSoulGemRateDisplay } from "../src/ui/soul-gem-rate.ts";

function makeContext(overrides = {}) {
  const text = [];
  return {
    state: {
      scriptTick: 400,
      soulGemLast: 5,
      soulGemIncomes: [{ sec: 0, gems: 2 }],
      soulGemPerHour: 0,
      ...overrides.state,
    },
    resources: {
      Soul_Gem: {
        currentQuantity: 8,
        isUnlocked: () => true,
        ...overrides.soulGem,
      },
    },
    jquery: () => ({ text: (value) => text.push(value) }),
    text,
  };
}

let context = makeContext();
const formatted = [];
const { updateSoulGemRate } = createSoulGemRateDisplay({
  getState: () => context.state,
  getResources: () => context.resources,
  getJQuery: () => context.jquery,
  getNiceNumber: (value) => {
    formatted.push(value);
    return `n${value}`;
  },
});

updateSoulGemRate();
assert.deepEqual(context.state.soulGemIncomes, [
  { sec: 0, gems: 2 },
  { sec: 100, gems: 3 },
]);
assert.equal(context.state.soulGemLast, 8);
assert.equal(context.state.soulGemPerHour, 180);
assert.deepEqual(formatted, [180]);
assert.deepEqual(context.text, ["~n180 /h"]);

// Whole runtime objects are resolved per call, and locked Soul Gems are entirely inert.
const stale = context;
context = makeContext({ soulGem: { isUnlocked: () => false } });
updateSoulGemRate();
assert.deepEqual(context.text, []);
assert.equal(stale.state.soulGemPerHour, 180);

// Old records are retained until more than ten newer gems exist, then trimmed with the original
// splice assignment semantics. Display rounding only applies at 1000+ gems/hour.
context = makeContext({
  state: {
    scriptTick: 20_000,
    soulGemLast: 20,
    soulGemIncomes: [
      { sec: 0, gems: 50 },
      { sec: 4_000, gems: 12 },
    ],
  },
  soulGem: { currentQuantity: 20 },
});
updateSoulGemRate();
assert.deepEqual(context.state.soulGemIncomes, [{ sec: 4_000, gems: 12 }]);
assert.equal(context.state.soulGemPerHour, 43.2);
assert.deepEqual(context.text, ["n43.2 /h"]);

console.log("Soul Gem rate module tests passed");
