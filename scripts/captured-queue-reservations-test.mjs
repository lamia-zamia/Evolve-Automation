import assert from "node:assert/strict";

import { createCapturedQueueReservationSource } from "../src/adapters/evolve/captured-queue-reservations.ts";
import { priceLookup } from "./test-support/action-price.mjs";

/**
 * Prices any id present in `prices`; anything else is unpriceable, as the game's own oracle is.
 * `research` wires the offered-technology source: absent means the caller cannot price technology,
 * `{ offered: undefined }` means the catalog read failed. `reads` counts how often it was asked.
 */
function makeSource(root, prices = {}, onUnavailable, research, pools = {}) {
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  const reads = [];
  const source = createCapturedQueueReservationSource({
    rootState,
    costs: { readCost: priceLookup(prices, pools) },
    ...(research === undefined
      ? {}
      : {
          readOfferedTechs: () => {
            reads.push(1);
            return research.offered;
          },
        }),
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
  return {
    readReservations: () => source.readReservations(),
    catalogReads: reads,
  };
}

function makeRoot({
  display = true,
  pause = false,
  qAny = false,
  queue = [],
  resources = {},
  research,
}) {
  const resource = {};
  for (const [id, view] of Object.entries(resources)) {
    resource[id] = { display: true, amount: 0, max: -1, diff: 0, ...view };
  }
  const root = {
    settings: { qAny, qAny_res: research?.qAnyRes ?? false },
    queue: { display, pause, queue },
    resource,
    race: { species: "human" },
    tech: {},
  };
  if (research !== undefined) {
    if (research.unlocked !== false) root.tech.r_queue = 1;
    root.r_queue = {
      display: research.display ?? true,
      pause: research.pause ?? false,
      queue: research.queue ?? [],
    };
  }
  return root;
}

/** A research-queue entry as the game maintains it, with its written-back judgements. */
function queuedTech(type, { req = true, cna = false } = {}) {
  return { id: `tech-${type}`, action: "tech", type, label: type, req, cna };
}

/** One offered technology as the catalog reports it. */
function offeredTech(type, cost) {
  return { elementId: `tech-${type}`, cost, generation: 1 };
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
  // The queue reservation keeps the action's regional ledger alongside its cost.
  const sample = makeSource(
    makeRoot({
      queue: [{ id: "city-warehouse", label: "Home warehouse" }],
      resources: { Money: { amount: 1000 } },
    }),
    PRICES,
    undefined,
    undefined,
    { "city-warehouse": "spc_home" },
  ).readReservations();
  assert.deepEqual(
    [...sample.targets],
    [
      {
        name: "Home warehouse",
        cause: "Queue",
        pool: "spc_home",
        cost: { Money: 400 },
      },
    ],
  );
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

{
  // A zero capacity is not read as a ceiling here: the test errs loose on purpose, because
  // over-reserving only delays a build while under-reserving spends resources out from under
  // something the game is genuinely saving for.
  const sample = makeSource(
    makeRoot({
      queue: [{ id: "city-warehouse", label: "Warehouse" }],
      resources: { Money: { amount: 0, max: 0 } },
    }),
    PRICES,
  ).readReservations();
  assert.equal(sample.targets.length, 1);
}

{
  // A positive cost in a resource the game is not displaying is one the game itself refuses to
  // save for (`cna`), so it reserves nothing — matching the game's own write-off exactly.
  const sample = makeSource(
    makeRoot({
      queue: [{ id: "city-warehouse", label: "Warehouse" }],
      resources: { Money: { amount: 1000, max: 10000, display: false } },
    }),
    PRICES,
  ).readReservations();
  assert.deepEqual([...sample.targets], []);
  assert.equal(sample.unavailable, false);
}

{
  // `Species` is the game's alias for the current race's own resource, resolved the same way.
  const prices = { "city-hatchery": { Species: 4 } };
  const reserved = makeSource(
    makeRoot({
      queue: [{ id: "city-hatchery", label: "Hatchery" }],
      resources: { human: { amount: 4, max: 12 } },
    }),
    prices,
  ).readReservations();
  assert.equal(reserved.targets.length, 1);
  const writtenOff = makeSource(
    makeRoot({
      queue: [{ id: "city-hatchery", label: "Hatchery" }],
      resources: { human: { amount: 4, max: 3 } },
    }),
    prices,
  ).readReservations();
  assert.deepEqual([...writtenOff.targets], []);
}

{
  // A cost nothing can judge still reserves: with no known ceiling the loose answer is to hold
  // the resources rather than spend out from under the commitment.
  const sample = makeSource(
    makeRoot({
      queue: [{ id: "city-warehouse", label: "Warehouse" }],
      resources: {},
    }),
    { "city-warehouse": { Elerium: 10 } },
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

// --- a paused queue is not being bought from --------------------------------

{
  const sample = makeSource(
    makeRoot({
      pause: true,
      queue: [{ id: "city-warehouse", label: "Warehouse" }],
      resources: { Money: { amount: 1000 } },
    }),
    PRICES,
  ).readReservations();
  assert.deepEqual([...sample.targets], []);
  assert.equal(sample.unavailable, false);
}

// --- the research queue ------------------------------------------------------

const OFFERED = [
  offeredTech("mining", { Knowledge: 100 }),
  offeredTech("smelting", { Knowledge: 200, Money: 50 }),
];

{
  // Strictly down the queue: the first entry whose requirements the game says are met.
  const source = makeSource(
    makeRoot({
      resources: { Knowledge: { amount: 500 }, Money: { amount: 500 } },
      research: { queue: [queuedTech("mining"), queuedTech("smelting")] },
    }),
    PRICES,
    undefined,
    { offered: OFFERED },
  );
  const sample = source.readReservations();
  assert.deepEqual(
    [...sample.targets],
    [
      {
        name: "mining",
        cause: "Research queue",
        cost: { Knowledge: 100 },
      },
    ],
  );
  assert.equal(sample.unavailable, false);
  assert.equal(source.catalogReads.length, 1);
}

{
  // `qAny_res` is the game's own "buy whichever queued research you can".
  const sample = makeSource(
    makeRoot({
      resources: { Knowledge: { amount: 500 }, Money: { amount: 500 } },
      research: {
        qAnyRes: true,
        queue: [queuedTech("mining"), queuedTech("smelting")],
      },
    }),
    PRICES,
    undefined,
    { offered: OFFERED },
  ).readReservations();
  assert.deepEqual(
    sample.targets.map((entry) => entry.name),
    ["mining", "smelting"],
  );
}

{
  // The game skips an entry whose requirements are not met and keeps scanning, so the entry
  // behind it is the one being saved for.
  const sample = makeSource(
    makeRoot({
      resources: { Knowledge: { amount: 500 }, Money: { amount: 500 } },
      research: {
        queue: [queuedTech("mining", { req: false }), queuedTech("smelting")],
      },
    }),
    PRICES,
    undefined,
    { offered: OFFERED },
  ).readReservations();
  assert.deepEqual(
    sample.targets.map((entry) => entry.name),
    ["smelting"],
  );
}

{
  // An entry the game itself wrote off as never affordable reserves nothing and does not stop
  // the scan either.
  const sample = makeSource(
    makeRoot({
      resources: { Knowledge: { amount: 500 }, Money: { amount: 500 } },
      research: {
        queue: [queuedTech("mining", { cna: true }), queuedTech("smelting")],
      },
    }),
    PRICES,
    undefined,
    { offered: OFFERED },
  ).readReservations();
  assert.deepEqual(
    sample.targets.map((entry) => entry.name),
    ["smelting"],
  );
}

for (const [label, research] of [
  ["hidden", { display: false, queue: [queuedTech("mining")] }],
  ["paused", { pause: true, queue: [queuedTech("mining")] }],
  ["locked", { unlocked: false, queue: [queuedTech("mining")] }],
  ["empty", { queue: [] }],
  ["nothing researchable", { queue: [queuedTech("mining", { req: false })] }],
]) {
  const source = makeSource(
    makeRoot({ resources: { Knowledge: { amount: 500 } }, research }),
    PRICES,
    undefined,
    { offered: OFFERED },
  );
  const sample = source.readReservations();
  assert.deepEqual([...sample.targets], [], label);
  assert.equal(sample.unavailable, false, label);
  // A discovery pass is the expensive part; nothing waiting must never buy one.
  assert.equal(source.catalogReads.length, 0, label);
}

{
  // A caller with no way to price technology does not model the research queue at all, rather
  // than reporting every cycle unavailable and buying nothing.
  const sample = makeSource(
    makeRoot({
      resources: { Knowledge: { amount: 500 } },
      research: { queue: [queuedTech("mining")] },
    }),
    PRICES,
  ).readReservations();
  assert.deepEqual([...sample.targets], []);
  assert.equal(sample.unavailable, false);
}

{
  // A catalog that could not be read leaves a real commitment unpriced, which is unavailable.
  const reported = [];
  const sample = makeSource(
    makeRoot({
      resources: { Knowledge: { amount: 500 } },
      research: { queue: [queuedTech("mining")] },
    }),
    PRICES,
    (id, reason) => reported.push([id, reason]),
    { offered: undefined },
  ).readReservations();
  assert.deepEqual([...sample.targets], []);
  assert.equal(sample.unavailable, true);
  assert.deepEqual(reported, [
    ["tech-mining", "offered technologies could not be read"],
  ]);
}

{
  // A queued technology the game is no longer offering cannot be priced either.
  const reported = [];
  const sample = makeSource(
    makeRoot({
      resources: { Knowledge: { amount: 500 } },
      research: { queue: [queuedTech("theology")] },
    }),
    PRICES,
    (id, reason) => reported.push([id, reason]),
    { offered: OFFERED },
  ).readReservations();
  assert.equal(sample.unavailable, true);
  assert.deepEqual(reported, [
    ["tech-theology", "queued technology is not currently offered"],
  ]);
}

{
  // Both queues reserve at once, each under its own cause.
  const sample = makeSource(
    makeRoot({
      queue: [{ id: "city-warehouse", label: "Warehouse" }],
      resources: { Money: { amount: 1000 }, Knowledge: { amount: 500 } },
      research: { queue: [queuedTech("mining")] },
    }),
    PRICES,
    undefined,
    { offered: OFFERED },
  ).readReservations();
  assert.deepEqual(
    sample.targets.map((entry) => [entry.name, entry.cause]),
    [
      ["Warehouse", "Queue"],
      ["mining", "Research queue"],
    ],
  );
}

{
  // A research cost no storage could ever hold is one the game has written off.
  const sample = makeSource(
    makeRoot({
      resources: { Knowledge: { amount: 10, max: 50 } },
      research: { queue: [queuedTech("mining")] },
    }),
    PRICES,
    undefined,
    { offered: OFFERED },
  ).readReservations();
  assert.deepEqual([...sample.targets], []);
  assert.equal(sample.unavailable, false);
}

console.log("captured-queue-reservations ok");
