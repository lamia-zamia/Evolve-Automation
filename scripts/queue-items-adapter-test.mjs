import assert from "node:assert/strict";

import {
  readCostAffordabilityInput,
  readQueueTarget,
} from "../src/adapters/evolve/queue-items.ts";

const resources = {
  Money: { currentQuantity: 10, maxQuantity: 100 },
  Soul_Gem: { currentQuantity: 2, maxQuantity: 20 },
  Supply: { currentQuantity: 1, maxQuantity: 10 },
  status: { currentQuantity: 1, maxQuantity: 1 },
};

const current = readCostAffordabilityInput(
  { Money: 10, status: 1 },
  resources,
  "current",
);
assert.equal(current.status, "ready");
assert.deepEqual(current.input, {
  requirements: [
    { resourceId: "Money", requiredQuantity: 10, availableQuantity: 10 },
    { resourceId: "status", requiredQuantity: 1, availableQuantity: 1 },
  ],
});
assert.ok(Object.isFrozen(current));
assert.ok(Object.isFrozen(current.input));
assert.ok(Object.isFrozen(current.input.requirements));
assert.ok(Object.isFrozen(current.input.requirements[0]));

assert.deepEqual(
  readCostAffordabilityInput({ Money: NaN }, resources, "current"),
  {
    status: "unavailable",
    reason: "invalid-cost",
    resourceId: "Money",
  },
);
assert.deepEqual(
  readCostAffordabilityInput({ Money: -1 }, resources, "current"),
  {
    status: "unavailable",
    reason: "invalid-cost",
    resourceId: "Money",
  },
);
assert.deepEqual(
  readCostAffordabilityInput({ Missing: 0 }, resources, "current"),
  {
    status: "unavailable",
    reason: "invalid-resource",
    resourceId: "Missing",
  },
);
assert.deepEqual(
  readCostAffordabilityInput(
    { Money: 1 },
    { Money: { currentQuantity: NaN, maxQuantity: 10 } },
    "current",
  ),
  { status: "unavailable", reason: "invalid-resource", resourceId: "Money" },
);

const catalogTarget = {
  id: "city-foundry",
  title: "Foundry",
  cost: { Money: 50 },
  isAffordable(maximum) {
    assert.equal(this, catalogTarget);
    assert.equal(maximum, true);
    return true;
  },
};
const catalog = readQueueTarget(
  { action: "build", id: "city-foundry" },
  {
    resources,
    poly: {},
    mechManager: {},
    buildingIds: { "city-foundry": catalogTarget },
    arpaIds: {},
  },
);
assert.equal(catalog.status, "ready");
assert.equal(
  catalog.target,
  catalogTarget,
  "catalog identity must be preserved",
);
assert.equal(catalog.maximumAffordable, true);

const arpaTarget = {
  id: "arpa-monument",
  title: "Monument",
  cost: {},
  isAffordable: () => false,
};
const arpa = readQueueTarget(
  { action: "arpa", id: "arpa-monument" },
  {
    resources,
    poly: {},
    mechManager: {},
    buildingIds: {},
    arpaIds: { "arpa-monument": arpaTarget },
  },
);
assert.equal(arpa.status, "ready");
assert.equal(arpa.target, arpaTarget);
assert.equal(arpa.maximumAffordable, false);

assert.deepEqual(
  readQueueTarget(
    { action: "build", id: "missing" },
    { resources, poly: {}, mechManager: {}, buildingIds: {}, arpaIds: {} },
  ),
  { status: "missing", itemId: "missing" },
);

const shipBlueprint = { name: "Scout" };
const poly = {
  shipCosts(blueprint) {
    assert.equal(this, poly);
    assert.equal(blueprint, shipBlueprint);
    return { Money: 50 };
  },
};
const ship = readQueueTarget(
  {
    action: "tp-ship",
    id: "ship-1",
    label: "Scout",
    type: shipBlueprint,
  },
  { resources, poly, mechManager: {}, buildingIds: {}, arpaIds: {} },
);
assert.equal(ship.status, "ready");
assert.deepEqual(ship.target, {
  id: "ship-1",
  name: "Scout",
  title: "Scout",
  cost: { Money: 50 },
});
assert.equal(ship.maximumAffordable, true);
assert.ok(Object.isFrozen(ship));
assert.ok(Object.isFrozen(ship.target));
assert.ok(Object.isFrozen(ship.target.cost));

const mechBlueprint = { size: "small", infernal: false };
const mechManager = {
  getMechCost(blueprint) {
    assert.equal(this, mechManager);
    assert.equal(blueprint, mechBlueprint);
    return [8, 4, 0];
  },
};
const mech = readQueueTarget(
  {
    action: "hell-mech",
    id: "mech-1",
    label: "Collector",
    type: mechBlueprint,
  },
  { resources, poly, mechManager, buildingIds: {}, arpaIds: {} },
);
assert.equal(mech.status, "ready");
assert.deepEqual(mech.target.cost, { Soul_Gem: 8, Supply: 4 });
assert.equal(mech.maximumAffordable, true);

assert.deepEqual(
  readQueueTarget(
    { action: "tp-ship", id: "bad", label: "Bad", type: {} },
    {
      resources,
      poly: { shipCosts: () => ({ Money: NaN }) },
      mechManager,
      buildingIds: {},
      arpaIds: {},
    },
  ),
  {
    status: "unavailable",
    reason: "invalid-cost",
    itemId: "bad",
    resourceId: "Money",
  },
);
assert.deepEqual(
  readQueueTarget(
    { action: "build", id: "bad-target" },
    {
      resources,
      poly,
      mechManager,
      buildingIds: { "bad-target": { title: "Bad" } },
      arpaIds: {},
    },
  ),
  { status: "unavailable", reason: "invalid-target", itemId: "bad-target" },
);
assert.deepEqual(
  readQueueTarget(
    { action: "tp-ship", id: "throwing", label: "Bad", type: {} },
    {
      resources,
      poly: {
        shipCosts() {
          throw new Error("hostile cost reader");
        },
      },
      mechManager,
      buildingIds: {},
      arpaIds: {},
    },
  ),
  { status: "unavailable", reason: "inaccessible-data", itemId: "throwing" },
);

console.log("Queue item Evolve adapter contract tests passed");
