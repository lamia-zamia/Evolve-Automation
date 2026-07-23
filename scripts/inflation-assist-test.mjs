import assert from "node:assert/strict";

import {
  inflationSecondsToFinish,
  isInflationAssistActive,
  shouldSaveInflationMoney,
} from "../src/domain/economy/resources/inflation-assist.ts";

// --- Assist-active decision -------------------------------------------------
assert.equal(
  isInflationAssistActive({
    assistEnabled: true,
    inflationRun: true,
    wheelbarrowStar: 0,
    achievementLevel: 4,
  }),
  true,
);
assert.equal(
  isInflationAssistActive({
    assistEnabled: true,
    inflationRun: true,
    wheelbarrowStar: 4,
    achievementLevel: 4,
  }),
  false,
  "earned star equal to alevel is no longer assisting",
);

// --- Countdown and save decision --------------------------------------------
// Exact characterized values.
assert.equal(
  inflationSecondsToFinish({
    targetMoney: 250_000_000_000,
    currentMoney: 249_999_999_000,
    maxMoney: 250_000_000_000,
    moneyRate: 10,
  }),
  100,
);
assert.equal(
  inflationSecondsToFinish({
    targetMoney: 250e9,
    currentMoney: 100e9,
    maxMoney: 249e9,
    moneyRate: 10,
  }),
  Number.POSITIVE_INFINITY,
  "unreachable storage never finishes",
);
assert.equal(
  inflationSecondsToFinish({
    targetMoney: 250e9,
    currentMoney: 100e9,
    maxMoney: 250e9,
    moneyRate: -50,
  }),
  Number.POSITIVE_INFINITY,
  "a deficit never finishes",
);

// Negative save-minutes disables saving even when finishing immediately.
assert.equal(
  shouldSaveInflationMoney({
    active: true,
    saveMinutes: -1,
    money: {
      targetMoney: 250e9,
      currentMoney: 250e9,
      maxMoney: 250e9,
      moneyRate: 0,
    },
  }),
  false,
);
assert.equal(
  shouldSaveInflationMoney({
    active: true,
    saveMinutes: 0,
    money: {
      targetMoney: 250e9,
      currentMoney: 250e9,
      maxMoney: 250e9,
      moneyRate: 0,
    },
  }),
  true,
  "already-complete finishes within a zero-minute window",
);

console.log("Inflation assist domain tests passed");
