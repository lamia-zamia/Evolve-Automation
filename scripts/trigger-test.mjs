import assert from "node:assert/strict";

import { runTriggerAutomation } from "../src/application/trigger.ts";
import {
  createTriggerCommandExecutor,
  createTriggerReader,
} from "../src/adapters/evolve/trigger.ts";
import { planTrigger } from "../src/domain/trigger.ts";

function createFixture(scenario) {
  const trace = [];
  let saving = scenario.initialSaving ?? false;
  const targets = scenario.targets.map((definition) => {
    const target = {
      id: definition.id,
      click() {
        trace.push(["click", definition.id]);
        if (definition.setsSaving !== undefined) {
          saving = definition.setsSaving;
        }
        return definition.click ?? false;
      },
    };
    if (definition.throwCost) {
      Object.defineProperty(target, "cost", {
        get() {
          throw new Error(`irrelevant cost read: ${definition.id}`);
        },
      });
    } else if (Object.hasOwn(definition, "cost")) {
      target.cost = definition.cost;
    }
    return target;
  });
  return {
    trace,
    state: { triggerTargets: targets },
    shouldSaveInflationMoney() {
      trace.push(["save", saving]);
      return saving;
    },
  };
}

// Exact copy of the deleted factory algorithm, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  let triggerActive = false;
  for (const trigger of fixture.state.triggerTargets) {
    if (fixture.shouldSaveInflationMoney() && (trigger.cost?.Money ?? 0) > 0) {
      continue;
    }
    if (trigger.click()) {
      triggerActive = true;
    }
  }
  return { trace: fixture.trace, active: triggerActive };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const result = runTriggerAutomation({
    reader: createTriggerReader({
      getState: () => fixture.state,
      shouldSaveInflationMoney: fixture.shouldSaveInflationMoney,
    }),
    executor: createTriggerCommandExecutor({
      getState: () => fixture.state,
    }),
  });
  assert.equal(result.outcome.status, "succeeded");
  return { trace: fixture.trace, active: result.active };
}

const parityScenarios = [
  {
    name: "all targets run in order after both false and true clicks",
    targets: [
      { id: "first", cost: {}, click: false },
      { id: "second", cost: {}, click: true },
      { id: "third", cost: {}, click: true },
    ],
  },
  {
    name: "Inflation saving skips only positive Money costs",
    initialSaving: true,
    targets: [
      { id: "money", cost: { Money: 1 }, click: true },
      { id: "free", cost: { Money: 0 }, click: true },
      { id: "other", cost: { Knowledge: 5 }, click: false },
      { id: "absent-cost", click: true },
    ],
  },
  {
    name: "inactive Inflation saving does not inspect costs",
    initialSaving: false,
    targets: [{ id: "guarded", throwCost: true, click: true }],
  },
  {
    name: "Inflation saving is recomputed after every earlier click",
    initialSaving: false,
    targets: [
      {
        id: "starts-saving",
        cost: { Money: 2 },
        click: true,
        setsSaving: true,
      },
      { id: "money-after", cost: { Money: 2 }, click: true },
      { id: "free-after", cost: { Money: null }, click: false },
    ],
  },
  {
    name: "false clicks leave the trigger phase inactive",
    targets: [
      { id: "first", cost: {}, click: false },
      { id: "second", cost: {}, click: false },
    ],
  },
  { name: "empty target list is inactive", targets: [] },
];

for (const scenario of parityScenarios) {
  assert.deepEqual(runModern(scenario), runLegacy(scenario), scenario.name);
}

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

console.log("Trigger automation dual-run and adapter tests passed");
