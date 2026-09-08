import assert from "node:assert/strict";

import {
  createCapturedGrapheneAutomation,
  GRAPHENE_CONTROL,
} from "../src/adapters/evolve/economy/production/captured-graphene.ts";

const root = {
  race: {},
  interstellar: {
    g_factory: { count: 1, on: 4, Lumber: 0, Coal: 0, Oil: 0 },
  },
  resource: {
    Graphene: { amount: 0, max: 100, display: true },
    Lumber: { amount: 1000, max: 1000, diff: 100000, display: true },
    Coal: { amount: 1000, max: 1000, diff: 100000, display: true },
    Oil: { amount: 1000, max: 1000, diff: 100000, display: true },
  },
};
const calls = [];
const controls = {
  capturedElementIds: () => [GRAPHENE_CONTROL],
  resolve: (elementId) =>
    elementId === GRAPHENE_CONTROL
      ? { elementId, generation: 1, methods: ["addWood", "addCoal", "addOil"] }
      : undefined,
  invoke: (_handle, method) => {
    calls.push(method);
    const id = method.includes("Wood")
      ? "Lumber"
      : method.includes("Coal")
        ? "Coal"
        : "Oil";
    root.interstellar.g_factory[id] += method.startsWith("add") ? 1 : -1;
    return { ok: true, value: undefined };
  },
};

const automation = createCapturedGrapheneAutomation({
  rootState: { readRoot: () => root },
  controls,
});

assert.deepEqual(automation.run(), { status: "succeeded" });
assert.equal(calls.length, 4);
assert.equal(
  root.interstellar.g_factory.Lumber +
    root.interstellar.g_factory.Coal +
    root.interstellar.g_factory.Oil,
  4,
);

root.resource.Graphene.amount = 100;
assert.deepEqual(automation.run(), { status: "succeeded" });
assert.equal(calls.length, 8);
assert.deepEqual(root.interstellar.g_factory, {
  count: 1,
  on: 4,
  Lumber: 0,
  Coal: 0,
  Oil: 0,
});

root.race.truepath = true;
assert.deepEqual(automation.run(), { status: "succeeded" });
assert.equal(calls.length, 8);

console.log("Captured graphene adapter and bounded policy tests passed");
