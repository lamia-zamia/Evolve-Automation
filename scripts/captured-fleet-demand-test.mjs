import assert from "node:assert/strict";

import { createCapturedFleetDemand } from "../src/adapters/evolve/combat/captured-fleet-demand.ts";

/**
 * What the yard's own cost row said. `pool` is the `data-pool` the game wrote for this cost, and
 * `affordable` its own per-resource verdict — both are the game's, and demand carries them rather
 * than deriving either.
 */
function sample(amounts, pool) {
  return { pool, amounts };
}

const priced = sample(
  [
    { resourceId: "Aluminium", amount: 500000, affordable: true },
    { resourceId: "Money", amount: 2500000, affordable: true },
  ],
  undefined,
);
const regional = sample(
  [{ resourceId: "Aluminium", amount: 500000, affordable: false }],
  "spc_dwarf",
);
const root = {
  race: { truepath: 1 },
  tech: { syndicate: 1 },
  space: { shipyard: { blueprint: { class: "corvette" } } },
  resource: {
    Money: { max: 2500000 },
    Aluminium: { max: 500000 },
  },
};

/**
 * The yard, counted rather than merely spied on. `established: true` is a yard the player visited
 * earlier and has since navigated away from: its `shipPlans` survives, so `control()` still answers
 * and `current()` has no rendered `#shipYardCosts` to read and would fall back to the scratch probe.
 * That is the state in which a price is worth something to check and nothing at all to compute.
 */
function makeShipyard({
  established = true,
  order = [],
  establishmentResult = "succeeded",
} = {}) {
  const calls = { control: 0, established: 0, establish: 0 };
  let held = established;
  const trusted = { methods: ["avail", "build", "powerText", "redraw"] };
  return {
    calls,
    control() {
      calls.control += 1;
      return held ? trusted : undefined;
    },
    established(control) {
      calls.established += 1;
      return control?.methods.includes("build") === true;
    },
    establish() {
      calls.establish += 1;
      order.push("establish");
      held = establishmentResult === "succeeded";
      return held
        ? trusted
        : establishmentResult === "incomplete"
          ? { methods: ["setVal"] }
          : undefined;
    },
  };
}

/**
 * The cost row, counted, and recording its order so a price can be shown to follow a draw.
 *
 * `costSample` has no default on purpose: an absent price is one of the cases under test, and a
 * default would silently answer it with the priced sample instead.
 */
function makeCosts(costSample, order = []) {
  const calls = { current: 0, price: 0 };
  return {
    calls,
    current() {
      calls.current += 1;
      order.push("current");
      return costSample;
    },
    price() {
      calls.price += 1;
      return costSample;
    },
  };
}

function demand(
  costSample = priced,
  {
    rootValue = root,
    resourceMaximums = root.resource,
    settings = { autoFleet: true, prioritizeOuterFleet: "req" },
    shipyard = makeShipyard(),
    costs = makeCosts(costSample),
  } = {},
) {
  const settingsReads = { count: 0 };
  return {
    reader: createCapturedFleetDemand({
      rootState: {
        readRoot: () => ({ ...rootValue, resource: resourceMaximums }),
      },
      costs,
      shipyard,
      readSettings: () => {
        settingsReads.count += 1;
        return settings;
      },
    }),
    shipyard,
    costs,
    settingsReads,
  };
}

const plain = demand().reader;
assert.deepEqual(plain.read(), {
  nextShipAffordable: true,
  nextShipExpandable: true,
  nextShipCost: [
    { resourceId: "Aluminium", amount: 500000 },
    { resourceId: "Money", amount: 2500000 },
  ],
});

// The pool `updateCosts()` wrote travels with every cost, so the demand is scoped to the supply
// zone the yard will actually draw on instead of the combined resource totals.
assert.deepEqual(demand(regional).reader.read(), {
  nextShipAffordable: true,
  nextShipExpandable: true,
  nextShipCost: [
    { resourceId: "Aluminium", amount: 500000, pool: "spc_dwarf" },
  ],
});

// The capacity verdicts stay this module's own policy: they ask whether the cost fits the yard's
// storage, which is not the same question as the game's current-stock marking.
const overCapacity = demand(undefined, {
  resourceMaximums: { ...root.resource, Money: { max: 2499999 } },
}).reader;
assert.equal(overCapacity.read()?.nextShipAffordable, false);
assert.equal(overCapacity.read()?.nextShipExpandable, false);

const expandable = demand(undefined, {
  resourceMaximums: {
    ...root.resource,
    Money: { max: 2499999, stackable: true },
  },
}).reader;
assert.equal(expandable.read()?.nextShipExpandable, true);

const notStackable = demand(undefined, {
  resourceMaximums: {
    ...root.resource,
    Money: { max: 2499999, stackable: false },
  },
}).reader;
assert.equal(notStackable.read()?.nextShipExpandable, false);

// No price from the yard is no demand. The reader never treats an unreadable row as an empty cost.
for (const absent of [undefined, sample([], undefined)]) {
  assert.equal(
    demand(absent, {
      costs: makeCosts(absent),
    }).reader.read(),
    undefined,
  );
}

// A save that never rendered the shipyard still gets a price — by establishing the yard itself —
// and the price is read after the draw that made it possible, never before.
{
  const order = [];
  const shipyard = makeShipyard({ established: false, order });
  const costs = makeCosts(priced, order);
  const { reader, settingsReads } = demand(priced, { shipyard, costs });
  reader.read();
  reader.read();
  assert.deepEqual(order, ["establish", "current", "current"]);
  assert.deepEqual(
    shipyard.calls,
    { control: 2, established: 3, establish: 1 },
    "the yard was established once and asked twice",
  );
  assert.equal(
    costs.calls.price,
    0,
    "the held design was never priced by candidate",
  );
  assert.equal(settingsReads.count, 2, "the gate was read once per sample");
}

// A draw that failed to establish a trusted yard cannot supply the demand's price, even when a
// cost reader could independently return one. The establishment result must be validated first.
for (const establishmentResult of ["failed", "incomplete"]) {
  const order = [];
  const shipyard = makeShipyard({
    established: false,
    establishmentResult,
    order,
  });
  const costs = makeCosts(priced, order);
  assert.equal(demand(priced, { shipyard, costs }).reader.read(), undefined);
  assert.deepEqual(order, ["establish"]);
  assert.deepEqual(costs.calls, { current: 0, price: 0 });
}

// A yard already established is never re-established, whatever the settings say, and is priced
// directly: `current()` is the same read either way.
{
  const order = [];
  const shipyard = makeShipyard({ established: true, order });
  const costs = makeCosts(priced, order);
  const sampleValue = demand(priced, { shipyard, costs }).reader.read();
  assert.deepEqual(order, ["current"]);
  assert.deepEqual(shipyard.calls, {
    control: 1,
    established: 1,
    establish: 0,
  });
  assert.equal(sampleValue?.nextShipCost.length, 2);
}

// The runtime's effective settings are layered: a thin object whose prototype is the raw persisted
// record and whose own properties are only this pass's overrides. Both gates resolve through that
// chain, so a save whose fleet switches live only in the raw record is still priced...
{
  const layered = Object.create({
    autoFleet: true,
    prioritizeOuterFleet: "req",
  });
  assert.deepEqual(Object.keys(layered), []);
  const order = [];
  const shipyard = makeShipyard({ established: false, order });
  const costs = makeCosts(priced, order);
  const reader = demand(priced, { shipyard, costs, settings: layered }).reader;
  assert.equal(reader.read()?.nextShipCost.length, 2);
  assert.deepEqual(order, ["establish", "current"]);
}

// ...and an override that turns the fleet off wins over the inherited value, still without the yard
// being asked anything.
{
  const layered = Object.assign(
    Object.create({ autoFleet: true, prioritizeOuterFleet: "req" }),
    { autoFleet: false },
  );
  const order = [];
  const shipyard = makeShipyard({ established: false, order });
  const costs = makeCosts(priced, order);
  assert.equal(
    demand(priced, { shipyard, costs, settings: layered }).reader.read(),
    undefined,
  );
  assert.deepEqual(order, []);
}

// Fleet demand nothing keeps is not a reason to touch the yard at all. The off-tab case is the one
// this gate exists for: nothing needed establishing, so an earlier reader went straight on to price
// the ship — and `current()` with no rendered row is the scratch probe, `shipPlans.setVal` per call,
// for a figure that was discarded unread.
for (const settings of [
  { autoFleet: false, prioritizeOuterFleet: "req" },
  { autoFleet: true, prioritizeOuterFleet: "ignore" },
]) {
  const label = JSON.stringify(settings);
  for (const established of [false, true]) {
    const order = [];
    const shipyard = makeShipyard({ established, order });
    const costs = makeCosts(priced, order);
    const { reader, settingsReads } = demand(priced, {
      shipyard,
      costs,
      settings,
    });
    assert.equal(
      reader.read(),
      undefined,
      `a cost nothing keeps was sampled: ${label}, yard established: ${established}`,
    );
    assert.deepEqual(
      shipyard.calls,
      { control: 0, established: 0, establish: 0 },
      `the yard was asked to price a cost nothing keeps: ${label}, yard established: ${established}`,
    );
    assert.deepEqual(
      costs.calls,
      { current: 0, price: 0 },
      `the cost row was read for a cost nothing keeps: ${label}, yard established: ${established}`,
    );
    assert.deepEqual(order, [], `the probe ran: ${label}`);
    assert.equal(
      settingsReads.count,
      1,
      "the gate was read once, and it was the only read",
    );
  }
}

// The same gate for settings that cannot answer it at all: a missing switch, a missing priority, an
// empty record and something that is not a record are all "not wanted", and cost the yard nothing.
for (const settings of [
  { autoFleet: true },
  { autoFleet: true, prioritizeOuterFleet: "ignore" },
  {},
  "not a settings record",
]) {
  const shipyard = makeShipyard({ established: false });
  const costs = makeCosts(priced);
  assert.equal(
    demand(priced, { shipyard, costs, settings }).reader.read(),
    undefined,
  );
  assert.deepEqual(shipyard.calls, {
    control: 0,
    established: 0,
    establish: 0,
  });
  assert.deepEqual(costs.calls, { current: 0, price: 0 });
}

// A `save` or `savereq` priority keeps the demand: only `ignore` switches it off.
for (const prioritizeOuterFleet of ["save", "savereq", "req"]) {
  const shipyard = makeShipyard({ established: false });
  const costs = makeCosts(priced);
  const reader = demand(priced, {
    shipyard,
    costs,
    settings: { autoFleet: true, prioritizeOuterFleet },
  }).reader;
  assert.equal(reader.read()?.nextShipCost.length, 2);
  assert.equal(shipyard.calls.establish, 1);
  assert.equal(costs.calls.current, 1);
}

// Anything but a True Path save with the syndicate has no fleet cost to ask about, so the settings
// are never even consulted.
for (const truepath of [1, true]) {
  assert.equal(
    demand(priced, { rootValue: { ...root, race: { truepath } } }).reader.read()
      ?.nextShipCost.length,
    2,
    `upstream's truthy True Path representation ${truepath} permits demand`,
  );
}
for (const absent of [
  { ...root, race: { truepath: 0 } },
  { ...root, race: { truepath: false } },
  { ...root, race: {} },
  { ...root, tech: { syndicate: 0 } },
  { ...root, space: {} },
]) {
  const shipyard = makeShipyard({ established: false });
  const costs = makeCosts(priced);
  const { reader, settingsReads } = demand(priced, {
    rootValue: absent,
    shipyard,
    costs,
  });
  assert.equal(reader.read(), undefined);
  assert.deepEqual(shipyard.calls, {
    control: 0,
    established: 0,
    establish: 0,
  });
  assert.deepEqual(costs.calls, { current: 0, price: 0 });
  assert.equal(settingsReads.count, 0);
}

console.log("Captured fleet demand adapter tests passed");
