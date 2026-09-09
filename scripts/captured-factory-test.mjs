import assert from "node:assert/strict";

import { planCapturedFactoryTrim } from "../src/domain/economy/production/captured-factory.ts";
import {
  createCapturedFactoryAutomation,
  FACTORY_CONTROL,
} from "../src/adapters/evolve/economy/production/captured-factory.ts";

assert.deepEqual(
  planCapturedFactoryTrim({
    maximum: 2,
    lines: [
      { id: "Lux", current: 2 },
      { id: "Furs", current: 0 },
      { id: "Alloy", current: 3 },
      { id: "Polymer", current: 0 },
      { id: "Nano", current: 0 },
      { id: "Stanene", current: 0 },
    ],
  }),
  [
    { id: "Lux", delta: -2 },
    { id: "Alloy", delta: -1 },
  ],
  "capacity repair follows DeadSpace's factory line order",
);
assert.deepEqual(
  planCapturedFactoryTrim({
    maximum: 4,
    lines: [
      { id: "Lux", current: 1 },
      { id: "Furs", current: 1 },
      { id: "Alloy", current: 1 },
      { id: "Polymer", current: 1 },
      { id: "Nano", current: 0 },
      { id: "Stanene", current: 0 },
    ],
  }),
  [],
);

const root = {
  city: {
    factory: {
      count: 1,
      on: 2,
      Lux: 1,
      Furs: 2,
      Alloy: 0,
      Polymer: 0,
      Nano: 0,
      Stanene: 0,
    },
  },
};
const calls = [];
const automation = createCapturedFactoryAutomation({
  rootState: { readRoot: () => root },
  controls: {
    capturedElementIds: () => [FACTORY_CONTROL],
    resolve: (elementId) =>
      elementId === FACTORY_CONTROL
        ? { elementId, generation: 1, methods: ["subItem"] }
        : undefined,
    invoke: (_handle, method, args) => {
      calls.push([method, ...args]);
      const id = args[0];
      root.city.factory[id] -= 1;
      return { ok: true, value: undefined };
    },
  },
});
assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(calls, [["subItem", "Lux"]]);
assert.equal(root.city.factory.Lux + root.city.factory.Furs, 2);

const missingControl = createCapturedFactoryAutomation({
  rootState: { readRoot: () => root },
  controls: {
    capturedElementIds: () => [],
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
  },
});
root.city.factory.Furs = 3;
assert.equal(missingControl.run().status, "rejected");

const laterFactoryRoot = {
  ...root,
  space: { red_factory: { count: 1, on: 1 } },
};
const laterFactory = createCapturedFactoryAutomation({
  rootState: { readRoot: () => laterFactoryRoot },
  controls: {
    capturedElementIds: () => [],
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
  },
});
assert.deepEqual(
  laterFactory.run(),
  { status: "succeeded" },
  "full weighted capacity remains unavailable when a later-region factory exists",
);

console.log("captured-factory ok");
