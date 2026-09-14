import assert from "node:assert/strict";

import { createCapturedCostConflictReader } from "../src/adapters/evolve/captured-cost-conflict.ts";

function makeResources(holdings, pooledHoldings = {}) {
  return {
    readResources(ids, options) {
      const selected =
        options?.pool === undefined
          ? holdings
          : (pooledHoldings[options.pool] ?? {});
      return {
        resources: new Map(
          [...ids].map((id) => [
            id,
            {
              unlocked: true,
              amount: selected[id] ?? 0,
              max: 1000,
              rateOfChange: 0,
              storageRatio: (selected[id] ?? 0) / 1000,
            },
          ]),
        ),
      };
    },
  };
}

const reader = createCapturedCostConflictReader({
  resources: makeResources({ Money: 100 }),
  reservations: {
    readReservations: () => ({
      targets: Object.freeze([]),
      unavailable: false,
    }),
  },
  additionalReservations: {
    readReservations: () => ({
      targets: Object.freeze([
        Object.freeze({
          name: "Spy purchase",
          cause: "Purchase",
          cost: Object.freeze({ Money: 100 }),
        }),
      ]),
      unavailable: false,
    }),
  },
});

const result = reader.evaluate({ Money: 20 });
assert.equal(result.status, "conflict");
if (result.status === "conflict") {
  assert.equal(result.conflict.targetName, "Spy purchase");
  assert.equal(result.conflict.targetCause, "Purchase");
}

const unavailableReader = createCapturedCostConflictReader({
  resources: makeResources({ Money: 100 }),
  reservations: {
    readReservations: () => ({
      targets: Object.freeze([]),
      unavailable: false,
    }),
  },
  additionalReservations: {
    readReservations: () => ({
      targets: Object.freeze([]),
      unavailable: true,
    }),
  },
});
assert.deepEqual(unavailableReader.evaluate({ Money: 20 }), {
  status: "unavailable",
});

// Regional commitments only contend with the action's pool. The holdings sample must use that
// same ledger; the civilization-wide total would incorrectly let Home spend against its own queue
// merely because Moon has enough money.
{
  const reader = createCapturedCostConflictReader({
    resources: makeResources(
      { Money: 1_090_000 },
      { spc_home: { Money: 90 }, spc_moon: { Money: 1_000_000 } },
    ),
    reservations: {
      readReservations: () => ({
        targets: Object.freeze([
          Object.freeze({
            name: "Moon target",
            cause: "Saving",
            pool: "spc_moon",
            cost: Object.freeze({ Money: 100_000 }),
          }),
          Object.freeze({
            name: "Home queue",
            cause: "Queue",
            pool: "spc_home",
            cost: Object.freeze({ Money: 100 }),
          }),
        ]),
        unavailable: false,
      }),
    },
  });

  const result = reader.evaluate({ Money: 20 }, "spc_home");
  assert.equal(result.status, "conflict");
  if (result.status === "conflict") {
    assert.equal(result.conflict.targetName, "Home queue");
    assert.deepEqual(result.conflict.targetNames, ["Home queue"]);
  }
}

console.log("captured cost conflict ok");
