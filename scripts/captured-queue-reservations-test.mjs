import assert from "node:assert/strict";

import { createCapturedQueueReservationSource } from "../src/adapters/evolve/captured-queue-reservations.ts";
import { createCapturedResourceSource } from "../src/adapters/evolve/captured-world-state.ts";

/** Prices any id present in `prices`; anything else is unpriceable, as the game's own oracle is. */
function makeSource(root, prices = {}, onUnavailable) {
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  return createCapturedQueueReservationSource({
    rootState,
    resources: createCapturedResourceSource(rootState),
    costs: { readCost: (id) => prices[id] },
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
}

function makeRoot({
  display = true,
  qAny = false,
  queue = [],
  resources = {},
}) {
  const resource = {};
  for (const [id, view] of Object.entries(resources)) {
    resource[id] = { display: true, amount: 0, max: -1, diff: 0, ...view };
  }
  return { settings: { qAny }, queue: { display, queue }, resource };
}

const PRICES = {
  "city-warehouse": { Money: 400 },
  "city-mine": { Money: 450 },
};

// --- nothing to reserve ----------------------------------------------------

for (const [label, root] of [
  ["no root", undefined],
  ["no queue at all", {}],
  [
    "hidden queue",
    makeRoot({ display: false, queue: [{ id: "city-warehouse" }] }),
  ],
  ["empty queue", makeRoot({ queue: [] })],
]) {
  const sample = makeSource(root, PRICES).readReservations();
  assert.deepEqual([...sample.targets], [], label);
  assert.equal(sample.unavailable, false, label);
}

// --- the head entry, named and priced --------------------------------------

{
  const sample = makeSource(
    makeRoot({
      queue: [
        { id: "city-warehouse", label: "Warehouse" },
        { id: "city-mine", label: "Mine" },
      ],
      resources: { Money: { amount: 1000 } },
    }),
    PRICES,
  ).readReservations();
  assert.deepEqual(
    [...sample.targets],
    [{ name: "Warehouse", cause: "Queue", cost: { Money: 400 } }],
  );
  assert.equal(sample.unavailable, false);
}

{
  // `qAny` is the game's own "buy whichever queued item you can", so every entry is saved for.
  const sample = makeSource(
    makeRoot({
      qAny: true,
      queue: [
        { id: "city-warehouse", label: "Warehouse" },
        { id: "city-mine", label: "Mine" },
      ],
      resources: { Money: { amount: 1000 } },
    }),
    PRICES,
  ).readReservations();
  assert.deepEqual(
    sample.targets.map((entry) => entry.name),
    ["Warehouse", "Mine"],
  );
}

{
  // An entry the game stored without a label reports the id it reserved.
  const sample = makeSource(
    makeRoot({ queue: [{ id: "city-warehouse" }] }),
    PRICES,
  ).readReservations();
  assert.equal(sample.targets[0].name, "city-warehouse");
}

{
  // A malformed entry is not a queued structure and contributes nothing.
  const sample = makeSource(
    makeRoot({ qAny: true, queue: [{}, { id: "" }, { id: "city-mine" }] }),
    PRICES,
  ).readReservations();
  assert.deepEqual(
    sample.targets.map((entry) => entry.name),
    ["city-mine"],
  );
  assert.equal(sample.unavailable, false);
}

// --- storage that could never hold the cost --------------------------------

{
  const sample = makeSource(
    makeRoot({
      queue: [{ id: "city-warehouse", label: "Warehouse" }],
      resources: { Money: { amount: 100, max: 300 } },
    }),
    PRICES,
  ).readReservations();
  assert.deepEqual([...sample.targets], []);
  assert.equal(sample.unavailable, false);
}

{
  // An uncapped resource has no known ceiling, so the reservation stands.
  const sample = makeSource(
    makeRoot({
      queue: [{ id: "city-warehouse", label: "Warehouse" }],
      resources: { Money: { amount: 0, max: -1 } },
    }),
    PRICES,
  ).readReservations();
  assert.equal(sample.targets.length, 1);
}

// --- a commitment that cannot be priced ------------------------------------

{
  const reported = [];
  const sample = makeSource(
    makeRoot({
      qAny: true,
      queue: [
        { id: "city-mystery", label: "Mystery" },
        { id: "city-mine", label: "Mine" },
      ],
      resources: { Money: { amount: 1000 } },
    }),
    PRICES,
    (id, reason) => reported.push([id, reason]),
  ).readReservations();
  // What could be priced is still reported, and the sample says it is incomplete.
  assert.deepEqual(
    sample.targets.map((entry) => entry.name),
    ["Mine"],
  );
  assert.equal(sample.unavailable, true);
  assert.deepEqual(reported, [
    ["city-mystery", "queued item could not be priced"],
  ]);
}

console.log("captured-queue-reservations ok");
