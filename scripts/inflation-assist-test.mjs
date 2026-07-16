import assert from "node:assert/strict";

import {
  inflationSecondsToFinish,
  isInflationAssistActive,
  isInflationMoneyReachable,
  shouldSaveInflationMoney,
} from "../src/domain/inflation-assist.ts";
import {
  legacyInflationSecondsToFinish,
  legacyInflationAssistActive,
  legacyInflationMoneyReachable,
  legacyShouldSaveInflationMoney,
} from "./test-support/legacy-inflation-assist.mjs";

// --- Assist-active decision -------------------------------------------------
const assistCases = [
  {
    assistEnabled: true,
    inflationRun: true,
    wheelbarrowStar: 0,
    achievementLevel: 4,
  },
  {
    assistEnabled: true,
    inflationRun: true,
    wheelbarrowStar: 4,
    achievementLevel: 4,
  },
  {
    assistEnabled: true,
    inflationRun: true,
    wheelbarrowStar: 5,
    achievementLevel: 4,
  },
  {
    assistEnabled: false,
    inflationRun: true,
    wheelbarrowStar: 0,
    achievementLevel: 4,
  },
  {
    assistEnabled: true,
    inflationRun: false,
    wheelbarrowStar: 0,
    achievementLevel: 4,
  },
];
for (const input of assistCases) {
  assert.equal(
    isInflationAssistActive(input),
    legacyInflationAssistActive(input),
    `assist active mismatch: ${JSON.stringify(input)}`,
  );
}
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

// --- Money reachability, countdown, and save decision -----------------------
const moneyCases = [
  { targetMoney: 250e9, currentMoney: 249e9, maxMoney: 250e9, moneyRate: 10 },
  { targetMoney: 250e9, currentMoney: 250e9, maxMoney: 250e9, moneyRate: 0 },
  { targetMoney: 250e9, currentMoney: 260e9, maxMoney: 250e9, moneyRate: 5 },
  { targetMoney: 250e9, currentMoney: 100e9, maxMoney: 249e9, moneyRate: 10 },
  { targetMoney: 250e9, currentMoney: 100e9, maxMoney: 250e9, moneyRate: 0 },
  { targetMoney: 250e9, currentMoney: 100e9, maxMoney: 250e9, moneyRate: -50 },
];
for (const money of moneyCases) {
  assert.equal(
    isInflationMoneyReachable(money),
    legacyInflationMoneyReachable(money),
    `reachable mismatch: ${JSON.stringify(money)}`,
  );
  assert.equal(
    inflationSecondsToFinish(money),
    legacyInflationSecondsToFinish(money),
    `seconds mismatch: ${JSON.stringify(money)}`,
  );
}

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

const saveCases = [];
for (const active of [true, false]) {
  for (const saveMinutes of [-1, 0, 2, 30]) {
    for (const money of moneyCases) {
      saveCases.push({ active, saveMinutes, money });
    }
  }
}
for (const input of saveCases) {
  assert.equal(
    shouldSaveInflationMoney(input),
    legacyShouldSaveInflationMoney(input),
    `save mismatch: ${JSON.stringify(input)}`,
  );
}

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
