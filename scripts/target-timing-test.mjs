import assert from "node:assert/strict";

import { createTargetTiming } from "../src/planning/target-timing.ts";

let game = {
  global: { resource: { Money: { amount: 0, diff: 10 } } },
};
let prefix = "first";
const timing = createTargetTiming({
  getGame: () => game,
  getPoly: () => ({ timeFormat: (seconds) => `${prefix}:${seconds}` }),
  isProject: (target) => target.kind === "project",
});

assert.deepEqual(
  timing.getMultiSegmentedTimeLeft({
    gameMax: 2,
    count: 0,
    cost: { Money: 100 },
  }),
  { resource: "Money", timeLeft: "first:20" },
);

game = {
  global: { resource: { Money: { amount: 50, diff: 5 } } },
};
prefix = "replacement";
assert.deepEqual(
  timing.getMultiSegmentedTimeLeft({
    kind: "project",
    gameMax: 0,
    count: 0,
    progress: 50,
    currentStep: 25,
    cost: { Money: 50 },
  }),
  { resource: "Money", timeLeft: "replacement:10" },
);

console.log("Target timing module tests passed");
