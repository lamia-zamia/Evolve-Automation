import assert from "node:assert/strict";

import {
  createCapturedProductionRatios,
  MINING_SHIP_CONTROL,
  QUARRY_CONTROL,
  TITAN_MINE_CONTROL,
} from "../src/adapters/evolve/economy/resources/captured-production-ratios.ts";

function createWorld(overrides = {}) {
  const root = {
    race: { smoldering: true },
    tech: { tau_roid: 5 },
    city: {
      rock_quarry: { count: 4, asbestos: 50 },
      metal_refinery: { count: 0 },
    },
    space: { titan_mine: { count: 2, ratio: 50 } },
    tauceti: {
      mining_ship: { count: 1, common: 50, uncommon: 50, rare: 50 },
    },
    resource: {
      Chrysotile: { amount: 0, max: 100 },
      Stone: { amount: 100, max: 100 },
      Aluminium: { amount: 50, max: 100 },
      Adamantite: { amount: 0, max: 100 },
      Iron: { amount: 100, max: 100 },
      Iridium: { amount: 0, max: 100 },
      Neutronium: { amount: 0, max: 100 },
      Orichalcum: { amount: 0, max: 100 },
      Elerium: { amount: 0, max: 100 },
    },
    ...overrides.root,
  };

  const calls = [];
  const captured = new Set(
    overrides.captured ?? [
      QUARRY_CONTROL,
      TITAN_MINE_CONTROL,
      MINING_SHIP_CONTROL,
    ],
  );
  const controls = {
    capturedElementIds: () => [...captured],
    resolve: (elementId) =>
      captured.has(elementId)
        ? { elementId, generation: 1, methods: ["add", "sub"] }
        : undefined,
    invoke: (handle, method, args = []) => {
      calls.push({ elementId: handle.elementId, method, args });
      const step = method === "add" ? 1 : -1;
      if (handle.elementId === QUARRY_CONTROL) {
        root.city.rock_quarry.asbestos += step;
      } else if (handle.elementId === TITAN_MINE_CONTROL) {
        root.space.titan_mine.ratio += step;
      } else {
        root.tauceti.mining_ship[args[0]] += step;
      }
      return { ok: true, value: undefined };
    },
  };

  return {
    root,
    calls,
    automation: createCapturedProductionRatios({
      rootState: { readRoot: () => root },
      controls,
      readSettings: () => overrides.settings ?? {},
    }),
  };
}

// An empty Chrysotile pool against full Stone moves the quarry all the way onto Chrysotile.
{
  const world = createWorld();
  assert.deepEqual(world.automation.quarry(), { status: "succeeded" });
  assert.equal(world.root.city.rock_quarry.asbestos, 100);
  assert.equal(world.calls.length, 50);
  assert.ok(world.calls.every((call) => call.method === "add"));
  assert.deepEqual(world.calls[0].args, []);
}

// The metal refinery makes Stone compete for Aluminium's fullness as well.
{
  const world = createWorld({
    root: {
      city: {
        rock_quarry: { count: 4, asbestos: 50 },
        metal_refinery: { count: 1 },
      },
    },
  });
  world.root.resource.Chrysotile.amount = 50;
  assert.deepEqual(world.automation.quarry(), { status: "succeeded" });
  // Chrysotile 50% empty * weight 2 against Aluminium's 50% empty: an even split.
  assert.equal(world.root.city.rock_quarry.asbestos, 67);
}

// A configured weight scales the split without the demand model.
{
  const world = createWorld({ settings: { productionChrysotileWeight: 1 } });
  world.root.resource.Chrysotile.amount = 50;
  world.root.resource.Stone.amount = 50;
  assert.deepEqual(world.automation.quarry(), { status: "succeeded" });
  assert.equal(world.root.city.rock_quarry.asbestos, 50);
  assert.deepEqual(world.calls, []);
}

// A non-smoldering race, an unbuilt quarry, and an uncaptured control each leave the split alone.
for (const world of [
  createWorld({ root: { race: {} } }),
  createWorld({
    root: {
      city: {
        rock_quarry: { count: 0, asbestos: 50 },
        metal_refinery: { count: 0 },
      },
    },
  }),
  createWorld({ captured: [TITAN_MINE_CONTROL] }),
]) {
  assert.deepEqual(world.automation.quarry(), { status: "succeeded" });
  assert.deepEqual(world.calls, []);
}

// The titan mine moves toward the empty Adamantite pool, against half-full Aluminium.
{
  const world = createWorld();
  assert.deepEqual(world.automation.titanMine(), { status: "succeeded" });
  assert.equal(world.root.space.titan_mine.ratio, 67);
  assert.equal(world.calls.length, 17);
  assert.ok(world.calls.every((call) => call.elementId === TITAN_MINE_CONTROL));
}

// The mining ship moves each unlocked split and names it on every call.
{
  const world = createWorld();
  assert.deepEqual(world.automation.miningShip(), { status: "succeeded" });
  // Iron full against empty Aluminium; both halves of the other two pairs are empty.
  assert.equal(world.root.tauceti.mining_ship.common, 100);
  assert.equal(world.root.tauceti.mining_ship.uncommon, 50);
  assert.equal(world.root.tauceti.mining_ship.rare, 50);
  assert.ok(world.calls.every((call) => call.args[0] === "common"));
}

// The rare split stays out of the plan until the game unlocks it.
{
  const world = createWorld({ root: { tech: { tau_roid: 4 } } });
  world.root.resource.Orichalcum.amount = 100;
  assert.deepEqual(world.automation.miningShip(), { status: "succeeded" });
  assert.equal(world.root.tauceti.mining_ship.rare, 50);
  assert.ok(world.calls.every((call) => call.args[0] === "common"));
}

// Every pool full and nothing demanded leaves each split where it is, rather than dividing by a
// zero total weight.
{
  const world = createWorld();
  world.root.resource.Chrysotile.amount = 100;
  world.root.resource.Adamantite.amount = 100;
  world.root.resource.Aluminium.amount = 100;
  world.root.resource.Iridium.amount = 100;
  world.root.resource.Neutronium.amount = 100;
  world.root.resource.Orichalcum.amount = 100;
  world.root.resource.Elerium.amount = 100;
  assert.deepEqual(world.automation.quarry(), { status: "succeeded" });
  assert.deepEqual(world.automation.titanMine(), { status: "succeeded" });
  assert.deepEqual(world.automation.miningShip(), { status: "succeeded" });
  assert.equal(world.root.city.rock_quarry.asbestos, 50);
  assert.equal(world.root.space.titan_mine.ratio, 50);
  assert.equal(world.root.tauceti.mining_ship.common, 50);
  assert.equal(world.root.tauceti.mining_ship.uncommon, 50);
  assert.equal(world.root.tauceti.mining_ship.rare, 50);
  assert.deepEqual(world.calls, []);
}

// A split that moves underneath the plan stops the run instead of being overwritten.
{
  const world = createWorld();
  let moved = false;
  const controls = {
    capturedElementIds: () => [QUARRY_CONTROL],
    resolve: (elementId) => ({
      elementId,
      generation: 1,
      methods: ["add", "sub"],
    }),
    invoke: () => {
      if (!moved) {
        moved = true;
        world.root.city.rock_quarry.asbestos = 20;
      }
      return { ok: true, value: undefined };
    },
  };
  const automation = createCapturedProductionRatios({
    rootState: { readRoot: () => world.root },
    controls,
    readSettings: () => ({}),
  });
  const outcome = automation.quarry();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "stale-production-ratio");
}

console.log("Captured production-ratio adapter tests passed");
