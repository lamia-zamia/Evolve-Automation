import assert from "node:assert/strict";

import { createSnapshotMetadata } from "../src/domain/snapshot.ts";
import { planTax } from "../src/domain/tax.ts";
import { createFixtureBuilder } from "./test-support/modernization-fixtures.mjs";

const buildSnapshot = createFixtureBuilder({
  metadata: createSnapshotMetadata({ id: "tax-fixture", capturedAtMs: 1 }),
  status: "ready",
  tax: { currentRate: 20, minimumRate: 0, maximumRate: 50 },
  morale: { current: 100, projected: 100, maximum: 120 },
  money: { storageRatio: 1, demanded: false },
  authority: { current: 100, maximum: 100, unlocked: true },
  banana: false,
});
const buildSettings = createFixtureBuilder({
  requestedRate: -1,
  minimumRate: 0,
  minimumMorale: 100,
  maximumMorale: 200,
  manageAuthority: true,
  authorityTarget: 0,
});

function plan(snapshotOverrides = {}, settingsOverrides = {}) {
  return planTax(
    buildSnapshot(snapshotOverrides),
    buildSettings(settingsOverrides),
  );
}

assert.deepEqual(
  planTax(
    {
      metadata: createSnapshotMetadata({ id: "inactive", capturedAtMs: 1 }),
      status: "unavailable",
      reason: "controls-unavailable",
    },
    buildSettings(),
  ),
  [],
);

assert.deepEqual(plan({ tax: { currentRate: 10 } }, { requestedRate: 13 }), [
  {
    kind: "adjust-tax-rate",
    expectedRate: 10,
    batches: [{ operations: [{ direction: "increase", count: 3 }] }],
  },
]);
assert.deepEqual(plan({ tax: { currentRate: 15 } }, { requestedRate: 13.5 }), [
  {
    kind: "adjust-tax-rate",
    expectedRate: 15,
    batches: [
      {
        operations: [
          { direction: "decrease", count: 2 },
          { direction: "increase", count: 1 },
        ],
      },
    ],
  },
]);
assert.deepEqual(plan({ tax: { currentRate: 13 } }, { requestedRate: 13 }), [
  {
    kind: "adjust-tax-rate",
    expectedRate: 13,
    batches: [{ operations: [] }],
  },
]);
assert.equal(
  plan({ tax: { currentRate: 20 } }, { requestedRate: 100 })[0].batches[0]
    .operations[0].count,
  30,
  "forced rates are capped to the Evolve maximum",
);

assert.deepEqual(plan({ banana: true }), [
  {
    kind: "adjust-tax-rate",
    expectedRate: 20,
    batches: [{ operations: [{ direction: "decrease", count: 1 }] }],
  },
]);
assert.deepEqual(
  plan({ morale: { current: 101, projected: 101 }, money: { demanded: true } }),
  [
    {
      kind: "adjust-tax-rate",
      expectedRate: 20,
      batches: [{ operations: [{ direction: "increase", count: 1 }] }],
    },
  ],
);
assert.deepEqual(
  plan(
    {
      morale: { current: 101, projected: 101, maximum: 140 },
      authority: { current: 80, maximum: 120 },
    },
    { authorityTarget: 100 },
  ),
  [
    {
      kind: "adjust-tax-rate",
      expectedRate: 20,
      batches: [{ operations: [{ direction: "increase", count: 1 }] }],
    },
  ],
);
assert.deepEqual(
  plan({
    tax: { currentRate: 30 },
    morale: { current: 101, projected: 102 },
    money: { storageRatio: 0.5 },
  }),
  [
    {
      kind: "adjust-tax-rate",
      expectedRate: 30,
      batches: [
        { operations: [{ direction: "increase", count: 1 }] },
        { operations: [{ direction: "decrease", count: 1 }] },
      ],
    },
  ],
  "independent legacy conditions remain separate execution batches",
);
assert.deepEqual(plan({ tax: { currentRate: 0 } }), []);

const immutablePlan = plan({ tax: { currentRate: 10 } }, { requestedRate: 11 });
assert.equal(Object.isFrozen(immutablePlan), true);
assert.equal(Object.isFrozen(immutablePlan[0].batches), true);
assert.equal(Object.isFrozen(immutablePlan[0].batches[0].operations), true);

console.log("Pure tax planner tests passed");
