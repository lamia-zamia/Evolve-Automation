import assert from "node:assert/strict";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
const { createCapturedGatherResourcesAdapter } =
  await import("../../../src/adapters/evolve/economy/resources/captured-gather-resources.ts");

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
    return { ok: true, value: false };
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
assert.equal(input.resourcesPerClick, 1);
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

const incorrectNativeYield = {
  operations: [
    {
      actionId: "food",
      amount: 1,
      beforeAction: [{ resourceId: "Food", expectedQuantity: 5, quantity: 5 }],
      afterAction: [{ resourceId: "Food", expectedQuantity: 5, quantity: 15 }],
    },
  ],
};
assert.deepEqual(adapter.executor.execute(incorrectNativeYield), {
  status: "stale",
  failure: {
    code: "gather-result-changed",
    message: "gather result differed for food",
  },
});
assert.equal(root.resource.Food.amount, 6);

for (const [rank, expected] of [
  [0.1, 2],
  [0.25, 2.3],
  [0.5, 2.9],
  [0.75, 3.4],
  [1, 4],
  [1.33, 5],
  [1.5, 5.5],
  [1.67, 6],
  [2, 7],
  [2.2, 7.3],
  [2.4, 7.6],
]) {
  root.race.strong = rank;
  assert.equal(adapter.reader.read().resourcesPerClick, expected);
}
for (const rank of [undefined, false, 0]) {
  if (rank === undefined) delete root.race.strong;
  else root.race.strong = rank;
  assert.equal(adapter.reader.read().resourcesPerClick, 1);
}
root.race.strong = true;
assert.equal(adapter.reader.read().resourcesPerClick, 4);
root.race.strong = 1;
root.genes.enhance = true;
assert.equal(adapter.reader.read().resourcesPerClick, 8);
root.race.strong = 0.25;
assert.equal(adapter.reader.read().resourcesPerClick, 4.7);
root.genes.enhance = false;

const unavailableAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: { ...controls, resolve: () => undefined },
  readSettings: () => settings,
});
assert.equal(
  Object.values(unavailableAdapter.reader.read().clickable).some(Boolean),
  false,
);

const suppressedAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls,
  readSettings: () => settings,
  readTestIntervention: () => ({ manaConservationExperiment: true }),
});
root.tech.conjuring = 2;
root.resource.Mana.amount = 1;
assert.equal(suppressedAdapter.reader.read().clickable.food, false);
assert.equal(suppressedAdapter.reader.read().clickable.lumber, false);
root.resource.Mana.amount = 0.5;
assert.equal(suppressedAdapter.reader.read().clickable.food, true);

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
