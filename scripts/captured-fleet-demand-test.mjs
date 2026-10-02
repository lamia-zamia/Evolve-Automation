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
  race: { truepath: true },
  tech: { syndicate: 1 },
  space: { shipyard: { blueprint: { class: "corvette" } } },
  resource: {
    Money: { max: 2500000 },
    Aluminium: { max: 500000 },
  },
};

function makeShipyard({ established = true, onEstablish = [] } = {}) {
  const calls = { established: 0 };
  let held = established;
  return {
    calls,
    establish() {
      onEstablish.push(true);
      held = true;
      return undefined;
    },
    control: () => undefined,
    established: () => {
      calls.established += 1;
      return held;
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
    costs = { current: () => costSample, price: () => costSample },
  } = {},
) {
  return {
    reader: createCapturedFleetDemand({
      rootState: {
        readRoot: () => ({ ...rootValue, resource: resourceMaximums }),
      },
      costs,
      shipyard,
      readSettings: () => settings,
    }),
    shipyard,
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
      costs: { current: () => absent, price: () => absent },
    }).reader.read(),
    undefined,
  );
}

// A save that never rendered the shipyard still gets a price — by establishing the yard itself —
// but only while the fleet demand the prioritizer would keep is a live one.
{
  const established = [];
  const shipyard = makeShipyard({
    established: false,
    onEstablish: established,
  });
  const reader = demand(priced, { shipyard }).reader;
  reader.read();
  reader.read();
  assert.equal(established.length, 1, "the yard was established");
  assert.equal(shipyard.calls.established, 2);
}

for (const settings of [
  { autoFleet: false, prioritizeOuterFleet: "req" },
  { autoFleet: true, prioritizeOuterFleet: "ignore" },
  { autoFleet: true },
  {},
  "not a settings record",
]) {
  const established = [];
  const shipyard = makeShipyard({
    established: false,
    onEstablish: established,
  });
  demand(priced, { shipyard, settings }).reader.read();
  assert.deepEqual(
    established,
    [],
    `the yard was established to price a cost nothing keeps: ${JSON.stringify(settings)}`,
  );
}

// A yard already established is never re-established, whatever the settings say.
{
  const established = [];
  const shipyard = makeShipyard({
    established: true,
    onEstablish: established,
  });
  demand(priced, { shipyard }).reader.read();
  assert.deepEqual(established, []);
}

// Anything but a True Path save with the syndicate has no fleet cost to ask about.
for (const absent of [
  { ...root, race: { truepath: false } },
  { ...root, tech: { syndicate: 0 } },
  { ...root, space: {} },
]) {
  assert.equal(demand(priced, { rootValue: absent }).reader.read(), undefined);
}

console.log("Captured fleet demand adapter tests passed");
