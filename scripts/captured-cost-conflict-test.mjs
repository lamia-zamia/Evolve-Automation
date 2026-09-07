import assert from "node:assert/strict";

import { createCapturedCostConflictReader } from "../src/adapters/evolve/captured-cost-conflict.ts";

function makeResources(holdings) {
  return {
    readResources(ids) {
      return {
        resources: new Map(
          [...ids].map((id) => [
            id,
            {
              unlocked: true,
              amount: holdings[id] ?? 0,
              max: 1000,
              rateOfChange: 0,
              storageRatio: (holdings[id] ?? 0) / 1000,
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

console.log("captured cost conflict ok");
