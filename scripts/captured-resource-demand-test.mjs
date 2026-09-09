import assert from "node:assert/strict";

import { createCapturedResourceDemand } from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";

const root = {
  race: {},
  resource: {
    Stone: { amount: 100, max: 1000, stackable: true },
    Lumber: { amount: 900, max: 1000, stackable: true },
    Money: { amount: 0, max: 500, stackable: false },
    Plywood: { amount: 0, max: -1, stackable: false },
  },
};

function withTargets(targets, settings = {}, saving = null) {
  return createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets, unavailable: false }),
    },
    construction: {
      readSavingTarget: () => saving,
      readKnowledgeRequirement: () => 0,
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

// The construction cycle's saving target demands its cost even with nothing queued, and does so
// whatever the queue setting says, because it is not the player's queue.
{
  const sample = withTargets(
    [],
    { prioritizeQueue: "save" },
    {
      name: "city-cottage",
      cost: { Stone: 700 },
    },
  ).sample();
  assert.equal(sample.requestedQuantity("Stone"), 700);
  assert.equal(sample.isDemanded("Stone"), true);
}

// Queue and saving demands combine by maximum, like every other request.
{
  const sample = withTargets(
    [{ name: "Lodge", cause: "Queue", cost: { Stone: 800 } }],
    {},
    { name: "city-cottage", cost: { Stone: 300 } },
  ).sample();
  assert.equal(sample.requestedQuantity("Stone"), 800);
}

// Nothing queued and nothing being saved for is no demand at all.
{
  const sample = withTargets([], {}, null).sample();
  assert.equal(sample.isDemanded("Stone"), false);
}

// Storage requirements come from the same commitments: a queued cost the player can store raises
// the requirement, and the 3% buffer the script asks for is applied.
{
  const sample = withTargets([
    { name: "Cottage", cause: "Queue", cost: { Stone: 400 } },
  ]).sample();
  assert.equal(sample.storageRequired("Stone"), 412);
  // Nothing is saving for Lumber, so it keeps the script's own baseline of one.
  assert.equal(sample.storageRequired("Lumber"), 1);
}

// A stackable resource can always grow into the cost, so the buffer applies whatever the cost is.
{
  const sample = withTargets([
    { name: "Bank", cause: "Queue", cost: { Stone: 2000 } },
  ]).sample();
  assert.equal(sample.storageRequired("Stone"), 2060);
}

// A resource with no crates or containers cannot grow past its cap, so a cost the buffer would push
// over it is planned for half way instead of demanding the impossible.
{
  const sample = withTargets([
    { name: "Bank", cause: "Queue", cost: { Money: 490 } },
  ]).sample();
  assert.equal(sample.storageRequired("Money"), 495);
}

// A cost that resource's storage can never hold takes the whole target out of the plan, rather than
// reserving storage for the parts of it that would fit.
{
  const sample = withTargets([
    { name: "Bank", cause: "Queue", cost: { Money: 900, Stone: 100 } },
  ]).sample();
  assert.equal(sample.storageRequired("Stone"), 1);
  assert.equal(sample.storageRequired("Money"), 1);
}

// The saving target contributes its own storage requirement.
{
  const sample = withTargets(
    [],
    {},
    {
      name: "city-cottage",
      cost: { Stone: 200 },
    },
  ).sample();
  assert.equal(sample.storageRequired("Stone"), 206);
}

// Nothing committed at all leaves every resource at the baseline.
{
  const sample = withTargets([]).sample();
  assert.equal(sample.storageRequired("Stone"), 1);
}

// DeadSpace's market gate is race.no_trade. A different race trait must not suppress the
// auto-market storage buffer, while no_trade must suppress it.
{
  const marketRoot = {
    race: { terrifying: true, no_trade: false },
    resource: {
      Stone: { amount: 100, max: 1000, stackable: true },
    },
  };
  const demand = (noTrade) =>
    createCapturedResourceDemand({
      rootState: {
        readRoot: () => ({
          ...marketRoot,
          race: { ...marketRoot.race, no_trade: noTrade },
        }),
      },
      reservations: {
        readReservations: () => ({
          targets: [{ name: "Cottage", cause: "Queue", cost: { Stone: 400 } }],
          unavailable: false,
        }),
      },
      readSettings: () => ({
        autoMarket: true,
        sellStone: true,
        res_sell_r_Stone: 0.5,
      }),
    }).sample();
  assert.equal(demand(false).storageRequired("Stone"), 824);
  assert.equal(demand(true).storageRequired("Stone"), 412);
}

// An already-captured offered technology participates in the research fallback. The adapter
// trusts the game's offer qualification and only checks its current resource holdings.
{
  const offeredRoot = {
    race: {},
    resource: {
      Knowledge: { amount: 150, max: 500, stackable: false },
      Stone: { amount: 100, max: 1000, stackable: true },
    },
  };
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => offeredRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readOfferedTechs: () => [
      { elementId: "tech-stonework", cost: { Knowledge: 100, Stone: 40 } },
      { elementId: "tech-forge", cost: { Knowledge: 200 } },
    ],
    readSettings: () => ({ researchRequestSpace: true }),
  }).sample();
  assert.equal(sample.requestedQuantity("Knowledge"), 100);
  assert.equal(sample.requestedQuantity("Stone"), 40);
  assert.equal(sample.isDemanded("Knowledge"), false);
  assert.equal(sample.isDemanded("Stone"), false);
}

// A fully captured city factory reserves its active recipe materials even without a queue target.
{
  const factoryRoot = {
    race: {},
    tech: { factory: 1 },
    city: { factory: { on: 2 } },
    resource: {
      Alloy: { amount: 0, max: 1000, stackable: true },
      Copper: { amount: 0, max: 1000, stackable: true },
      Aluminium: { amount: 0, max: 1000, stackable: true },
    },
  };
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => factoryRoot },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({
      productionFactoryFocusMaterials: true,
      production_Lux: false,
      production_Furs: false,
      production_Alloy: true,
      production_Polymer: false,
      production_Nano: false,
      production_Stanene: false,
      production_w_Alloy: 1,
      productionFactoryMinIngredients: 0,
    }),
  }).sample();
  assert.equal(sample.requestedQuantity("Copper"), 5);
  assert.equal(sample.requestedQuantity("Aluminium"), 5);
}

console.log("Captured resource-demand adapter tests passed");
