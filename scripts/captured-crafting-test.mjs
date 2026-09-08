import assert from "node:assert/strict";

import { runCraftAutomation } from "../src/application/craft.ts";
import { createCapturedCraftCosts } from "../src/adapters/evolve/economy/production/captured-craft-costs.ts";
import {
  createCapturedCraftExecutor,
  createCapturedCraftReader,
} from "../src/adapters/evolve/economy/production/captured-crafting.ts";

const RECIPES = {
  Plywood: [{ id: "Lumber", amount: 100 }],
  Scarletite: [{ id: "Iron", amount: 250000 }],
};

function createWorld(overrides = {}) {
  const root = {
    race: { species: "human" },
    resource: {
      human: { name: "Human", display: true, amount: 10, max: 20, diff: 0 },
      Lumber: {
        name: "Lumber",
        display: true,
        amount: 1000,
        max: 1000,
        diff: 400,
      },
      Iron: { name: "Iron", display: true, amount: 500, max: 1000, diff: 10 },
      Plywood: { name: "Plywood", display: true, amount: 0, max: -1, diff: 0 },
      Scarletite: {
        name: "Scarletite",
        display: true,
        amount: 0,
        max: -1,
        diff: 0,
      },
      Useless: { name: "Lumber", display: false, amount: 0, max: -1, diff: 0 },
      ...overrides.resource,
    },
  };

  const calls = [];
  const controls = {
    capturedElementIds: () =>
      Object.keys(root.resource).map((id) => `res${id}`),
    resolve: (elementId) =>
      elementId.startsWith("res")
        ? { elementId, generation: 1, methods: ["craft", "craftCost"] }
        : undefined,
    invoke: (handle, method, args = []) => {
      const [resourceId, volume] = args;
      const recipe = RECIPES[resourceId];
      if (recipe === undefined) return { ok: false, reason: "threw" };
      if (method === "craftCost") {
        return {
          ok: true,
          value: recipe
            .map(
              (entry) =>
                `<div>${root.resource[entry.id].name} ${entry.amount * volume}</div>`,
            )
            .join(""),
        };
      }
      calls.push({ resourceId, volume });
      let crafted = Math.min(
        ...recipe.map((entry) =>
          Math.floor(root.resource[entry.id].amount / entry.amount),
        ),
      );
      if (volume !== "A" && volume < crafted) crafted = volume;
      for (const entry of recipe) {
        root.resource[entry.id].amount -= crafted * entry.amount;
      }
      root.resource[resourceId].amount += crafted;
      return { ok: true, value: undefined };
    },
  };

  const rendered = new Set(
    overrides.rendered ?? ["incPlywoodA", "incUselessA"],
  );
  let settings = overrides.settings ?? {};
  let periods = 1;
  const dependencies = {
    rootState: { readRoot: () => root },
    controls,
    costs: createCapturedCraftCosts({
      rootState: { readRoot: () => root },
      controls,
    }),
    getDocument: () => ({
      getElementById: (id) => (rendered.has(id) ? { id } : null),
    }),
    readSettings: () => settings,
    readPeriods: () => periods,
  };
  return {
    root,
    calls,
    run: () =>
      runCraftAutomation({
        reader: createCapturedCraftReader(dependencies),
        executor: createCapturedCraftExecutor(dependencies),
      }),
    setSettings: (value) => (settings = value),
    setPeriods: (value) => (periods = value),
  };
}

// A material at its storage cap is crafted from one period of its income, not from the stockpile.
{
  const world = createWorld();
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 1 }]);
  assert.equal(world.root.resource.Lumber.amount, 900);
  assert.equal(world.root.resource.Plywood.amount, 1);
}

// The reported period count scales the income budget.
{
  const world = createWorld();
  world.setPeriods(8);
  world.root.resource.Lumber.diff = 100;
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 2 }]);
  assert.equal(world.root.resource.Lumber.amount, 800);
}

// A material below its storage cap is blocked: manual crafting never eats a stockpile.
{
  const world = createWorld();
  world.root.resource.Lumber.amount = 999;
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, []);
  assert.equal(world.root.resource.Lumber.amount, 999);
}

// Only resources whose craft-all button the game actually rendered are candidates.
{
  const world = createWorld({ rendered: ["incScarletiteA"] });
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, []);
}

// A disabled per-resource setting and a no-craft race both stop the resource being crafted.
{
  const world = createWorld({ settings: { craftPlywood: false } });
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, []);

  const noCraft = createWorld();
  noCraft.root.race.no_craft = true;
  assert.deepEqual(noCraft.run(), { status: "succeeded" });
  assert.deepEqual(noCraft.calls, []);
}

// A preserved fraction of the material's cap keeps crafting off the stockpile entirely.
{
  const world = createWorld({ settings: { foundry_p_Plywood: 1 } });
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, []);
}

// The rendered cost is resolved through the live root, and the `Useless` name clash resolves to
// the displayed resource rather than crafting from the hidden one.
{
  const world = createWorld();
  const costs = createCapturedCraftCosts({
    rootState: { readRoot: () => world.root },
    controls: {
      capturedElementIds: () => ["resPlywood"],
      resolve: (elementId) => ({
        elementId,
        generation: 1,
        methods: ["craftCost"],
      }),
      invoke: () => ({ ok: true, value: "<div>Lumber 100</div>" }),
    },
  });
  assert.deepEqual([...costs.read("Plywood")], [["Lumber", 100]]);
}

// An unreadable recipe leaves the resource alone instead of guessing a cost.
{
  const world = createWorld();
  const costs = createCapturedCraftCosts({
    rootState: { readRoot: () => world.root },
    controls: {
      capturedElementIds: () => ["resPlywood"],
      resolve: (elementId) => ({
        elementId,
        generation: 1,
        methods: ["craftCost"],
      }),
      invoke: () => ({ ok: true, value: "<div>Unobtainium 100</div>" }),
    },
  });
  assert.equal(costs.read("Plywood"), undefined);
}

// A material amount that moved between planning and execution is reported as stale.
{
  const world = createWorld();
  const dependencies = {
    rootState: { readRoot: () => world.root },
    controls: {
      capturedElementIds: () => ["resPlywood"],
      resolve: (elementId) => ({
        elementId,
        generation: 1,
        methods: ["craft"],
      }),
      invoke: () => ({ ok: true, value: undefined }),
    },
  };
  const outcome = createCapturedCraftExecutor(dependencies).execute({
    index: 0,
    craftableId: "Plywood",
    count: 1,
    spend: [
      { resourceId: "Lumber", expectedCurrentQuantity: 999, amount: 100 },
    ],
  });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "stale-craft-material");
}

// Spending more than planned is reported rather than silently accepted.
{
  const world = createWorld();
  const dependencies = {
    rootState: { readRoot: () => world.root },
    controls: {
      capturedElementIds: () => ["resPlywood"],
      resolve: (elementId) => ({
        elementId,
        generation: 1,
        methods: ["craft"],
      }),
      invoke: () => {
        world.root.resource.Lumber.amount -= 500;
        return { ok: true, value: undefined };
      },
    },
  };
  const outcome = createCapturedCraftExecutor(dependencies).execute({
    index: 0,
    craftableId: "Plywood",
    count: 1,
    spend: [
      { resourceId: "Lumber", expectedCurrentQuantity: 1000, amount: 100 },
    ],
  });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "craft-overspent");
}

console.log("Captured manual crafting adapter and cost reader tests passed");
