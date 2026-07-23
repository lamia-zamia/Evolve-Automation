import assert from "node:assert/strict";

import {
  runTriggerAutomation,
  triggerPhaseActive,
} from "../src/application/trigger.ts";
import {
  createTriggerCommandExecutor,
  createTriggerReader,
} from "../src/adapters/evolve/progression/build/trigger.ts";
import { planTrigger } from "../src/domain/progression/build/trigger.ts";

assert.deepEqual(
  planTrigger({
    target: {
      index: 2,
      id: "inflation-spend",
      shouldSaveMoney: true,
      hasPositiveMoneyCost: true,
    },
  }),
  { kind: "skip", index: 2, targetId: "inflation-spend" },
);
assert.deepEqual(
  planTrigger({
    target: {
      index: 3,
      id: "knowledge-spend",
      shouldSaveMoney: true,
      hasPositiveMoneyCost: false,
    },
  }),
  { kind: "click", index: 3, targetId: "knowledge-spend" },
);
assert.equal(planTrigger({ target: null }), null);

assert.throws(
  () =>
    createTriggerReader({
      getState: () => ({}),
      shouldSaveInflationMoney: () => false,
    }).read(0),
  /state\.triggerTargets must be an array/,
);
assert.throws(
  () =>
    createTriggerReader({
      getState: () => ({ triggerTargets: [{ id: 7 }] }),
      shouldSaveInflationMoney: () => false,
    }).read(0),
  /state\.triggerTargets\[0\]\.id must be a string/,
);
assert.throws(
  () =>
    createTriggerReader({
      getState: () => ({
        triggerTargets: [{ id: "bad-cost", cost: { Money: "5" } }],
      }),
      shouldSaveInflationMoney: () => true,
    }).read(0),
  /state\.triggerTargets\[0\]\.cost\.Money must be a finite number/,
);

let staleClicks = 0;
const staleResult = createTriggerCommandExecutor({
  getState: () => ({
    triggerTargets: [
      {
        id: "replacement",
        click: () => staleClicks++,
      },
    ],
  }),
}).execute({ kind: "click", index: 0, targetId: "sampled" });
assert.equal(staleResult.outcome.status, "stale");
assert.equal(staleClicks, 0, "stale trigger target performs no click");

const rejectedResult = createTriggerCommandExecutor({
  getState: () => ({ triggerTargets: [] }),
}).execute({ kind: "click", index: -1, targetId: "invalid" });
assert.equal(rejectedResult.outcome.status, "rejected");

const priorActiveResult = runTriggerAutomation({
  reader: {
    read(index) {
      return index < 2
        ? {
            target: {
              index,
              id: `target-${index}`,
              shouldSaveMoney: false,
              hasPositiveMoneyCost: false,
            },
          }
        : { target: null };
    },
  },
  executor: {
    execute(decision) {
      return decision.index === 0
        ? { outcome: { status: "succeeded" }, clicked: true }
        : {
            outcome: {
              status: "stale",
              failure: { code: "changed", message: "changed" },
            },
            clicked: false,
          };
    },
  },
});
assert.equal(priorActiveResult.outcome.status, "stale");
assert.equal(
  priorActiveResult.active,
  true,
  "a later stale result retains prior trigger activity",
);

// Phase-active gate consumed by the tick's research/build spending guard: a
// succeeded outcome reports the observed activity, while a stale or rejected
// outcome forces active so those phases cannot spend afterward.
assert.equal(
  triggerPhaseActive({ outcome: { status: "succeeded" }, active: true }),
  true,
);
assert.equal(
  triggerPhaseActive({ outcome: { status: "succeeded" }, active: false }),
  false,
);
assert.equal(
  triggerPhaseActive({
    outcome: { status: "stale", failure: { code: "changed", message: "x" } },
    active: false,
  }),
  true,
);
assert.equal(
  triggerPhaseActive({
    outcome: { status: "rejected", failure: { code: "invalid", message: "x" } },
    active: false,
  }),
  true,
);

console.log("Trigger planner and adapter tests passed");
