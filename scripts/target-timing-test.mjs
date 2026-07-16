import assert from "node:assert/strict";

import { calculateTargetTiming } from "../src/domain/target-timing.ts";
import { readTargetTimingInput } from "../src/adapters/evolve/target-timing.ts";
import { legacyGetMultiSegmentedTimeLeft } from "./test-support/legacy-target-timing.mjs";

function modernTiming({ game, target, isProject, timeFormat }) {
  const readResult = readTargetTimingInput(game, target, isProject);
  assert.equal(readResult.status, "ready");
  const result = calculateTargetTiming(readResult.input);
  return {
    resource: result.resourceId,
    timeLeft:
      result.seconds === Infinity ? "Never" : timeFormat(result.seconds),
  };
}

const cases = [
  {
    name: "multi-segment target",
    game: { global: { resource: { Money: { amount: 0, diff: 10 } } } },
    target: { gameMax: 2, count: 0, cost: { Money: 100 } },
    isProject: false,
    expected: { resource: "Money", timeLeft: "20s" },
  },
  {
    name: "project progress",
    game: { global: { resource: { Money: { amount: 50, diff: 5 } } } },
    target: {
      gameMax: 0,
      count: 0,
      progress: 50,
      currentStep: 25,
      cost: { Money: 50 },
    },
    isProject: true,
    expected: { resource: "Money", timeLeft: "10s" },
  },
  {
    name: "slowest resource wins",
    game: {
      global: {
        resource: {
          Money: { amount: 20, diff: 10 },
          Stone: { amount: 0, diff: 5 },
        },
      },
    },
    target: {
      gameMax: 5,
      count: 3,
      cost: { Money: 100, Stone: 10 },
    },
    isProject: false,
    expected: { resource: "Money", timeLeft: "18s" },
  },
  {
    name: "zero production is never",
    game: {
      global: { resource: { Knowledge: { amount: 0, diff: 0 } } },
    },
    target: { gameMax: 1, count: 0, cost: { Knowledge: 50 } },
    isProject: false,
    expected: { resource: "Knowledge", timeLeft: "Never" },
  },
  {
    name: "satisfied requirements take no time",
    game: { global: { resource: { Money: { amount: 10, diff: 10 } } } },
    target: { gameMax: 1, count: 0, cost: { Money: 10 } },
    isProject: false,
    expected: { resource: "", timeLeft: "0s" },
  },
  {
    name: "negative production retains characterized zero display",
    game: { global: { resource: { Money: { amount: 0, diff: -5 } } } },
    target: { gameMax: 1, count: 0, cost: { Money: 10 } },
    isProject: false,
    expected: { resource: "", timeLeft: "0s" },
  },
];

for (const testCase of cases) {
  const timeFormat = (seconds) => `${seconds}s`;
  const modern = modernTiming({ ...testCase, timeFormat });
  const legacy = legacyGetMultiSegmentedTimeLeft({
    ...testCase,
    timeFormat,
  });
  assert.deepEqual(modern, testCase.expected, testCase.name);
  assert.deepEqual(modern, legacy, `${testCase.name}: legacy comparison`);
}

console.log("Target timing module tests passed");
