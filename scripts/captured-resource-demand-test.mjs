import assert from "node:assert/strict";

import { createCapturedResourceDemand } from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";

const root = {
  resource: {
    Stone: { amount: 100, max: 1000 },
    Lumber: { amount: 900, max: 1000 },
    Money: { amount: 0, max: 500 },
    Plywood: { amount: 0, max: -1 },
  },
};

function withTargets(targets, settings = {}) {
  return createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets, unavailable: false }),
    },
    readSettings: () => settings,
  });
}

// A queued building's cost is what the queue is accumulating.
{
  const sample = withTargets([
    { name: "Cottage", cause: "Queue", cost: { Stone: 400, Lumber: 300 } },
  ]).sample();
  assert.equal(sample.requestedQuantity("Stone"), 400);
  assert.equal(sample.isDemanded("Stone"), true);
  // Lumber is wanted, but the player already has more than the queue needs.
  assert.equal(sample.requestedQuantity("Lumber"), 300);
  assert.equal(sample.isDemanded("Lumber"), false);
  assert.equal(sample.isDemanded("Copper"), false);
}

// Requests combine by maximum, as the script's own `requestQuantity` does.
{
  const sample = withTargets([
    { name: "Cottage", cause: "Queue", cost: { Stone: 400 } },
    { name: "Lodge", cause: "Queue", cost: { Stone: 250 } },
  ]).sample();
  assert.equal(sample.requestedQuantity("Stone"), 400);
}

// No request can exceed what storage holds; an uncapped resource has no ceiling.
{
  const sample = withTargets([
    { name: "Bank", cause: "Queue", cost: { Money: 900, Plywood: 40 } },
  ]).sample();
  assert.equal(sample.requestedQuantity("Money"), 500);
  assert.equal(sample.requestedQuantity("Plywood"), 40);
}

// The player's own setting decides whether the queue expresses demand at all.
{
  const sample = withTargets(
    [{ name: "Cottage", cause: "Queue", cost: { Stone: 400 } }],
    { prioritizeQueue: "save" },
  ).sample();
  assert.equal(sample.requestedQuantity("Stone"), 0);
  assert.equal(sample.isDemanded("Stone"), false);
}

// An empty queue plans nothing.
{
  const sample = withTargets([]).sample();
  assert.equal(sample.requestedQuantity("Stone"), 0);
  assert.equal(sample.isDemanded("Stone"), false);
}

// A root without resources yet is not a demand claim.
{
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => undefined },
    reservations: {
      readReservations: () => ({
        targets: [{ name: "Cottage", cause: "Queue", cost: { Stone: 400 } }],
        unavailable: false,
      }),
    },
    readSettings: () => ({}),
  }).sample();
  assert.equal(sample.isDemanded("Stone"), false);
}

console.log("Captured resource-demand adapter tests passed");
