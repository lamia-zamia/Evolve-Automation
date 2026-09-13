import assert from "node:assert/strict";

import { createCapturedActionCostReader } from "../src/adapters/evolve/captured-action-costs.ts";

/** A registry that answers `setData` from the entry the caller queued, like the game's does. */
function makeRegistry(queueMethods, { generation = 1 } = {}) {
  const control =
    queueMethods === null
      ? undefined
      : {
          elementId: "buildQueue",
          generation,
          methods: Object.keys(queueMethods),
        };
  return {
    resolve: (id) => (id === "buildQueue" ? control : undefined),
    capturedElementIds: () => (control ? ["buildQueue"] : []),
    invoke(handle, method, args = []) {
      if (control === undefined)
        return { ok: false, reason: "unknown-control" };
      if (handle.generation !== control.generation) {
        return { ok: false, reason: "stale-control" };
      }
      const target = queueMethods[method];
      if (target === undefined) return { ok: false, reason: "unknown-method" };
      try {
        return { ok: true, value: target(...args) };
      } catch (error) {
        return { ok: false, reason: "threw", detail: String(error) };
      }
    },
  };
}

function makeRoot(queue = []) {
  return { queue: { queue }, resource: {}, settings: {}, race: {}, stats: {} };
}

function rootSource(root) {
  return {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
}

// --- the happy path: the game prices the queued probe entry ---------------------------------------

const prices = {
  "city-basic_housing": { Money: 119, Lumber: 109 },
  "space-spaceport": { Money: 47500, Iridium: 1750 },
  storehouse: { Money: 10 },
};
// The game adds `data-pool` to the result for exactly the `data` prefix, from its own `actionPool`.
const pools = { "space-spaceport": "spc_home" };
const seen = [];
const root = makeRoot([{ id: "city-farm", label: "player's own queued item" }]);
const registry = makeRegistry({
  setData(index, prefix) {
    const entry = root.queue.queue[index];
    seen.push({
      index,
      prefix,
      id: entry.id,
      type: entry.type,
      action: entry.action,
    });
    const price = prices[entry.id];
    if (price === undefined)
      throw new TypeError("Cannot read properties of undefined");
    const result = Object.fromEntries(
      Object.entries(price).map(([res, amount]) => [
        `${prefix}-${res}`,
        amount,
      ]),
    );
    if (prefix === "data" && pools[entry.id] !== undefined) {
      result["data-pool"] = pools[entry.id];
    }
    return result;
  },
});

const unavailable = [];
const costs = createCapturedActionCostReader({
  rootState: rootSource(root),
  controls: registry,
  onUnavailable: (id, reason) => unavailable.push([id, reason]),
});

// An action the game names no pool for — which is every action below `tech.shadow >= 5`, where the
// game has no regional pools at all — is priced with no pool rather than a guessed one.
assert.deepEqual(costs.readCost("city-basic_housing"), {
  cost: { Money: 119, Lumber: 109 },
  pool: undefined,
});
assert.deepEqual(seen.at(-1), {
  index: 1,
  prefix: "data",
  id: "city-basic_housing",
  type: "basic_housing",
  action: "city",
});
// The paying pool rides along in the same invocation, and is not mistaken for a cost.
assert.deepEqual(costs.readCost("space-spaceport"), {
  cost: { Money: 47500, Iridium: 1750 },
  pool: "spc_home",
});

// An id with no dash stands in for both halves, so the probe still runs.
assert.deepEqual(costs.readCost("storehouse"), {
  cost: { Money: 10 },
  pool: undefined,
});
assert.deepEqual(seen.at(-1), {
  index: 1,
  prefix: "data",
  id: "storehouse",
  type: "storehouse",
  action: "storehouse",
});

// The player's queue is exactly as it was: the probe entry is appended and removed in one step.
assert.deepEqual(root.queue.queue, [
  { id: "city-farm", label: "player's own queued item" },
]);

// --- an id the game cannot resolve ----------------------------------------------------------------

assert.equal(costs.readCost("tech-foundry"), undefined);
assert.deepEqual(
  root.queue.queue.length,
  1,
  "a throwing probe still leaves the queue clean",
);
assert.equal(unavailable.at(-1)[0], "tech-foundry");
assert.match(unavailable.at(-1)[1], /threw/);

// --- an action with no cost at all ------------------------------------------------------------------

const emptyRegistry = makeRegistry({ setData: () => ({}) });
const emptyCosts = createCapturedActionCostReader({
  rootState: rootSource(root),
  controls: emptyRegistry,
});
assert.deepEqual(emptyCosts.readCost("arpalaunch_facility"), {
  cost: {},
  pool: undefined,
});

// --- non-numeric and unprefixed values --------------------------------------------------------------

const oddRegistry = makeRegistry({
  setData: () => ({
    "data-Money": 10,
    "data-Bad": "lots",
    Plain: 5,
    "data-": 1,
    "data-NaN": Number.NaN,
    // Not a name, so not a pool. The game omits the key entirely rather than reporting `false`,
    // but a reader that trusted it would treat that as a pool called "false".
    "data-pool": false,
  }),
});
assert.deepEqual(
  createCapturedActionCostReader({
    rootState: rootSource(root),
    controls: oddRegistry,
  }).readCost("city-farm"),
  { cost: { Money: 10, Plain: 5 }, pool: undefined },
);

// --- nothing captured yet -----------------------------------------------------------------------------

const noQueue = createCapturedActionCostReader({
  rootState: rootSource(root),
  controls: makeRegistry(null),
  onUnavailable: (id, reason) => unavailable.push([id, reason]),
});
assert.equal(noQueue.readCost("city-farm"), undefined);
assert.match(unavailable.at(-1)[1], /not captured/);

const noRoot = createCapturedActionCostReader({
  rootState: rootSource(undefined),
  controls: registry,
  onUnavailable: (id, reason) => unavailable.push([id, reason]),
});
assert.equal(noRoot.readCost("city-farm"), undefined);
assert.match(unavailable.at(-1)[1], /queue unavailable/);

const noQueueArray = createCapturedActionCostReader({
  rootState: rootSource({
    queue: {},
    resource: {},
    settings: {},
    race: {},
    stats: {},
  }),
  controls: registry,
});
assert.equal(noQueueArray.readCost("city-farm"), undefined);

// --- a superseded queue control ---------------------------------------------------------------------

const staleRegistry = makeRegistry(
  { setData: () => ({ "data-Money": 1 }) },
  { generation: 1 },
);
const staleReader = createCapturedActionCostReader({
  rootState: rootSource(root),
  controls: {
    ...staleRegistry,
    resolve: () => ({
      elementId: "buildQueue",
      generation: 7,
      methods: ["setData"],
    }),
  },
  onUnavailable: (id, reason) => unavailable.push([id, reason]),
});
assert.equal(staleReader.readCost("city-farm"), undefined);
assert.match(unavailable.at(-1)[1], /stale-control/);
assert.equal(root.queue.queue.length, 1);

// --- a result that is not a record --------------------------------------------------------------------

assert.equal(
  createCapturedActionCostReader({
    rootState: rootSource(root),
    controls: makeRegistry({ setData: () => "nope" }),
  }).readCost("city-farm"),
  undefined,
);

console.log("captured-action-costs ok");
