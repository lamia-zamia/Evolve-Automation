import assert from "node:assert/strict";

import { createGamePriorityTargetsEvolveAdapter } from "../src/adapters/evolve/game-priority-targets.ts";

function makeAdapterState(overrides = {}) {
  const techElements = [];
  const trace = [];
  const dependencies = {
    game: {
      global: {
        queue: { display: true, queue: [{ id: "city-mine" }] },
        r_queue: { display: true, queue: [{ id: "tech-mining" }] },
        settings: { qAny: true, qAny_res: true },
        portal: { mechbay: { max: 5, bay: 1, blueprint: { size: "large" } } },
      },
    },
    spyManager: { purchaseMoney: 500 },
    fleetManagerOuter: {
      nextShipAffordable: true,
      nextShipName: "Dreadnought",
      nextShipCost: { Money: 777, Alloy: 10 },
    },
    mechManager: {
      Size: ["collector", "small", "titan"],
      initLab() {
        return true;
      },
      getPreferredSize() {
        return this.Size.includes("collector")
          ? ["collector", "small"]
          : ["small"];
      },
      getMechCost({ size }) {
        return this.Size.includes(size)
          ? size === "titan"
            ? [10, 5, 2]
            : [7, 3, 1]
          : [0, 0, 0];
      },
    },
    triggerManager: {
      targetTriggers: [{ actionId: "tech-construct" }, { nope: true }, "junk"],
      resetTargetTriggers() {
        trace.push("reset");
      },
    },
    jquery(selector) {
      return {
        each(callback) {
          if (selector === "#tech .action") {
            techElements.forEach((element, index) =>
              callback.call(element, index, element),
            );
          }
          return this;
        },
      };
    },
    ...overrides,
    techElements,
    trace,
  };
  const adapter = createGamePriorityTargetsEvolveAdapter({
    getGame: () => dependencies.game,
    getSpyManager: () => dependencies.spyManager,
    getFleetManagerOuter: () => dependencies.fleetManagerOuter,
    getMechManager: () => dependencies.mechManager,
    getTriggerManager: () => dependencies.triggerManager,
    getJQuery: () => dependencies.jquery,
  });
  return { adapter, dependencies };
}

const { adapter } = makeAdapterState();

// Queue reads normalize display, items, and the per-kind noorder setting.
assert.deepEqual(adapter.readQueue("queue"), {
  display: true,
  items: [{ id: "city-mine" }],
  noorder: true,
});
assert.deepEqual(adapter.readQueue("r_queue"), {
  display: true,
  items: [{ id: "tech-mining" }],
  noorder: true,
});

// Spy purchase money and the next outer-fleet ship read straight through.
assert.equal(adapter.readSpyPurchaseMoney(), 500);
assert.deepEqual(adapter.readOuterFleetNextShip(), {
  affordable: true,
  name: "Dreadnought",
  cost: { Money: 777, Alloy: 10 },
});

// Mech reads: lab readiness, bay capacity, preferred size, and gem cost.
assert.deepEqual(adapter.readMechBay(), {
  max: 5,
  bay: 1,
  blueprintSize: "large",
});
assert.equal(adapter.readMechLabReady(), true);
assert.equal(adapter.readMechPreferredSize(), "collector");
assert.equal(adapter.readMechCost("titan"), 10);
assert.equal(adapter.readMechCost("collector"), 7);

// Trigger reads return only well-formed actionId entries.
assert.deepEqual(adapter.readTriggerTargets(), [
  { actionId: "tech-construct" },
]);

// The reset command reaches the trigger manager.
const resetState = makeAdapterState();
resetState.adapter.resetTargetTriggers();
assert.deepEqual(resetState.dependencies.trace, ["reset"]);

// The tech sweep maps every element the jQuery collection renders.
const sweepState = makeAdapterState();
sweepState.dependencies.techElements.push({ id: "tech-mining" });
sweepState.dependencies.techElements.push({ id: "tech-advanced" });
assert.deepEqual(sweepState.adapter.readTechActionIds(), [
  "tech-mining",
  "tech-advanced",
]);

// An absent queue contributes nothing instead of failing: no tab rendered yet.
const absentState = makeAdapterState({
  game: { global: { settings: { qAny: true, qAny_res: true } } },
});
assert.deepEqual(absentState.adapter.readQueue("queue"), {
  display: false,
  items: [],
  noorder: true,
});
assert.deepEqual(absentState.adapter.readQueue("r_queue"), {
  display: false,
  items: [],
  noorder: true,
});

// noorder of false shortens the queue walk (the planner stops at the first).
const orderedState = makeAdapterState({
  game: {
    global: {
      queue: { display: true, queue: [{ id: "city-mine" }] },
      settings: { qAny: false, qAny_res: true },
    },
  },
});
assert.equal(orderedState.adapter.readQueue("queue").noorder, false);

// An empty mech bay yields zero space and the default blueprint size.
const emptyBayState = makeAdapterState({
  game: { global: { portal: { mechbay: {} } } },
});
assert.deepEqual(emptyBayState.adapter.readMechBay(), {
  max: 0,
  bay: 0,
  blueprintSize: "small",
});

// An empty sweep is a well-formed answer, not an error.
assert.deepEqual(emptyBayState.adapter.readTechActionIds(), []);

// A trigger manager with no well-formed entries yields an empty list.
const noTriggersState = makeAdapterState({
  triggerManager: { targetTriggers: [], resetTargetTriggers() {} },
});
assert.deepEqual(noTriggersState.adapter.readTriggerTargets(), []);

console.log("Game priority-targets Evolve adapter tests passed");
