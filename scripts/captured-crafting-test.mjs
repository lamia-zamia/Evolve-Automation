import assert from "node:assert/strict";

import { runCraftAutomation } from "../src/application/craft.ts";
import { createCapturedCraftCosts } from "../src/adapters/evolve/economy/production/captured-craft-costs.ts";
import {
  createCapturedCraftExecutor,
  createCapturedCraftReader,
} from "../src/adapters/evolve/economy/production/captured-crafting.ts";

const RECIPES = {
  Plywood: [{ id: "Lumber", amount: 100 }],
  Brick: [{ id: "Lumber", amount: 50 }],
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
      Plywood: { name: "Plywood", display: true, amount: 5, max: -1, diff: 0 },
      Brick: { name: "Brick", display: true, amount: 0, max: -1, diff: 0 },
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
  const actionModes = overrides.actionModes ?? {};
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
      if (actionModes[resourceId] === "no-op") {
        return { ok: true, value: undefined };
      }
      let crafted = Math.min(
        ...recipe.map((entry) =>
          Math.floor(root.resource[entry.id].amount / entry.amount),
        ),
      );
      if (volume !== "A" && volume < crafted) crafted = volume;
      for (const entry of recipe) {
        root.resource[entry.id].amount -= crafted * entry.amount;
      }
      if (actionModes[resourceId] !== "input-only") {
        root.resource[resourceId].amount += crafted;
      }
      return { ok: true, value: undefined };
    },
  };

  const rendered = new Set(
    overrides.rendered ?? ["incPlywoodA", "incUselessA"],
  );
  // tickRate 1 is one script cycle per game period, which is the income budget these fixtures
  // were characterized against.
  let settings = { tickRate: 1, ...(overrides.settings ?? {}) };
  const demanded = new Set(overrides.demanded ?? []);
  const required = overrides.storageRequired ?? {};
  const requested = overrides.requested ?? {};
  const demand = {
    isDemanded: (id) => demanded.has(id),
    requestedQuantity: (id) => requested[id] ?? 0,
    storageRequired: (id) => required[id] ?? 1,
  };
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
    readDemand: () => demand,
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
  };
}

// An undemanded material above its storage requirement is crafted from one period of its income,
// not from the stockpile.
{
  const world = createWorld();
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 1 }]);
  assert.equal(world.root.resource.Lumber.amount, 900);
  assert.equal(world.root.resource.Plywood.amount, 6);
}

// The configured tick rate scales the income budget: a cycle that covers eight game periods
// accrues eight periods of income before this feature next acts.
{
  const world = createWorld();
  world.setSettings({ tickRate: 8 });
  world.root.resource.Lumber.diff = 100;
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 2 }]);
  assert.equal(world.root.resource.Lumber.amount, 800);
}

// A material below its storage cap is still crafted from income, which the at-cap gate used to
// refuse.
{
  const world = createWorld();
  world.root.resource.Lumber.amount = 999;
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 1 }]);
  assert.equal(world.root.resource.Lumber.amount, 899);
}

// A material something else is accumulating is blocked outright.
{
  const world = createWorld({ demanded: ["Lumber"] });
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, []);
  assert.equal(world.root.resource.Lumber.amount, 1000);
}

// A material the plan needs more of in storage than the player holds is blocked too, unless it is
// already at its cap and cannot hold more.
{
  const below = createWorld({ storageRequired: { Lumber: 5000 } });
  below.root.resource.Lumber.amount = 999;
  assert.deepEqual(below.run(), { status: "succeeded" });
  assert.deepEqual(below.calls, []);

  const capped = createWorld({ storageRequired: { Lumber: 5000 } });
  assert.deepEqual(capped.run(), { status: "succeeded" });
  assert.deepEqual(capped.calls, [{ resourceId: "Plywood", volume: 1 }]);
}

// A demanded craftable spends its material's spare quantity rather than one period of income.
{
  const world = createWorld({
    demanded: ["Plywood"],
    requested: { Lumber: 400 },
  });
  world.root.resource.Lumber.diff = 4;
  assert.deepEqual(world.run(), { status: "succeeded" });
  // 1000 held less 400 spoken for, over a cost of 100.
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 6 }]);
}

// A craftable the player has none of is below the script's own baseline requirement, so the first
// units come from spare material rather than from income.
{
  const world = createWorld({ requested: { Lumber: 400 } });
  world.root.resource.Plywood.amount = 0;
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 6 }]);
}

// A craftable the plan wants more of in storage spends spare quantity as well.
{
  const world = createWorld({
    storageRequired: { Plywood: 500 },
    requested: { Lumber: 700 },
  });
  world.root.resource.Lumber.diff = 4;
  assert.deepEqual(world.run(), { status: "succeeded" });
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 3 }]);
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
  const execution = createCapturedCraftExecutor(dependencies).execute({
    index: 0,
    craftableId: "Plywood",
    count: 1,
    spend: [
      { resourceId: "Lumber", expectedCurrentQuantity: 999, amount: 100 },
    ],
  });
  assert.equal(execution.outcome.status, "stale");
  assert.equal(execution.outcome.failure.code, "stale-craft-material");
}

// A rebound craft row is stale before invocation, even when the resource balances are unchanged.
{
  const world = createWorld();
  let invoked = false;
  const dependencies = {
    rootState: { readRoot: () => world.root },
    controls: {
      capturedElementIds: () => ["resPlywood"],
      resolve: (elementId) => ({
        elementId,
        generation: 2,
        methods: ["craft"],
      }),
      invoke: () => {
        invoked = true;
        return { ok: true, value: undefined };
      },
    },
  };
  const execution = createCapturedCraftExecutor(dependencies).execute({
    index: 0,
    craftableId: "Plywood",
    count: 1,
    controlGeneration: 1,
    expectedOutputQuantity: 5,
    spend: [
      { resourceId: "Lumber", expectedCurrentQuantity: 1000, amount: 100 },
    ],
  });
  assert.equal(execution.outcome.status, "stale");
  assert.equal(execution.outcome.failure.code, "stale-craft-control");
  assert.equal(invoked, false);
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
  const execution = createCapturedCraftExecutor(dependencies).execute({
    index: 0,
    craftableId: "Plywood",
    count: 1,
    spend: [
      { resourceId: "Lumber", expectedCurrentQuantity: 1000, amount: 100 },
    ],
  });
  assert.equal(execution.outcome.status, "stale");
  assert.equal(execution.outcome.failure.code, "craft-overspent");
}

// Inputs can move without the output changing; that invocation is uncertain and cannot fall
// through to the next craftable.
{
  const world = createWorld({
    actionModes: { Plywood: "input-only" },
    rendered: ["incPlywoodA", "incBrickA"],
  });
  const outcome = world.run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "craft-noop");
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 1 }]);
  assert.equal(world.root.resource.Lumber.amount, 900);
  assert.equal(world.root.resource.Plywood.amount, 5);
  assert.equal(world.root.resource.Brick.amount, 0);
}

// A successful method return with no state change is also uncertain and cannot invoke another
// destructive craft candidate.
{
  const world = createWorld({
    actionModes: { Plywood: "no-op" },
    rendered: ["incPlywoodA", "incBrickA"],
  });
  const outcome = world.run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "craft-noop");
  assert.deepEqual(world.calls, [{ resourceId: "Plywood", volume: 1 }]);
  assert.equal(world.root.resource.Brick.amount, 0);
}

console.log("Captured manual crafting adapter and cost reader tests passed");
