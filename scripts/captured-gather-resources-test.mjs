import assert from "node:assert/strict";
import { createCapturedGatherResourcesAdapter } from "../src/adapters/evolve/economy/resources/captured-gather-resources.ts";

let root = {
  resource: {
    Food: { amount: 2, max: 10 },
    Lumber: { amount: 10, max: 10 },
    Stone: { amount: 10, max: 10 },
    Chrysotile: { amount: 10, max: 10 },
    Furs: { amount: 0, max: 10, display: false },
    Mana: { amount: 0, max: 10 },
    Population: { amount: 10, max: 20 },
  },
  race: {},
  tech: {},
  genes: {},
  city: { rock_quarry: { count: 0 } },
};
const handles = new Map([
  [
    "undefined-food",
    { elementId: "undefined-food", generation: 1, methods: ["action"] },
  ],
]);
const controls = {
  resolve: (elementId) => handles.get(elementId),
  invoke(handle, method) {
    assert.equal(method, "action");
    assert.equal(handle.elementId, "undefined-food");
    root.resource.Food.amount += 1;
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => [...handles.keys()],
};
const rootState = {
  readRoot: () => root,
  isReactivitySuppressed: () => false,
  subscribeRootReplaced: () => () => {},
};
const settings = {
  buildingAlwaysClick: true,
  buildingClickPerTick: 3,
};
const adapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls,
  readSettings: () => settings,
});

const input = adapter.reader.read();
assert.equal(input.stopped, false);
assert.equal(input.clickable.food, true);
assert.equal(input.clickable.lumber, false);
assert.equal(input.resources.Food.currentQuantity, 2);
const decision = {
  operations: [
    {
      actionId: "food",
      amount: 3,
      beforeAction: [{ resourceId: "Food", expectedQuantity: 2, quantity: 5 }],
      afterAction: [],
    },
  ],
};
assert.deepEqual(adapter.executor.execute(decision), { status: "succeeded" });
assert.equal(root.resource.Food.amount, 5);

root.resource.Population.amount = 20;
root.city.rock_quarry.count = 1;
settings.buildingAlwaysClick = false;
assert.equal(adapter.reader.read().stopped, true);

const changedRoot = { ...root, resource: { ...root.resource } };
root = changedRoot;
assert.deepEqual(adapter.executor.execute(decision), {
  status: "stale",
  failure: {
    code: "gather-root-changed",
    message: "captured game root changed",
  },
});

console.log("captured-gather-resources ok");
