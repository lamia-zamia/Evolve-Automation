import assert from "node:assert/strict";

import { createCapturedBuildControl } from "../src/bootstrap/captured-build-control.ts";

/**
 * A stand-in for the captured page: a game root, the game's own escalating prices behind
 * `buildQueue.setData`, and one `action()` per building that pays and increments exactly as the
 * game's does. Nothing here renders, so every call exercises the torn-down-panel path.
 */
function makePage({ buildings, resources, queue = [] }) {
  const root = {
    settings: { expose: false, tabLoad: false },
    race: { species: "human" },
    stats: { days: 100 },
    resource: {},
    city: {},
    queue: { queue: [...queue] },
  };
  for (const [id, resource] of Object.entries(resources)) {
    root.resource[id] = { display: true, max: -1, diff: 0, ...resource };
  }
  const clicks = [];
  const controls = new Map();
  for (const [id, building] of Object.entries(buildings)) {
    root.city[id] = { count: building.count ?? 0 };
    controls.set(`city-${id}`, {
      generation: building.generation ?? 1,
      methods: {
        action() {
          clicks.push(`city-${id}`);
          const price = building.priceAt(root.city[id].count);
          for (const [res, amount] of Object.entries(price)) {
            if (root.resource[res] === undefined) return;
            if (root.resource[res].amount < amount) return;
          }
          for (const [res, amount] of Object.entries(price)) {
            root.resource[res].amount -= amount;
          }
          root.city[id].count += 1;
        },
      },
    });
  }
  controls.set("buildQueue", {
    generation: 1,
    methods: {
      setData(index, prefix) {
        const entry = root.queue.queue[index];
        const building = buildings[entry.type];
        if (building === undefined) throw new TypeError("unknown action");
        return Object.fromEntries(
          Object.entries(building.priceAt(root.city[entry.type].count)).map(
            ([res, amount]) => [`${prefix}-${res}`, amount],
          ),
        );
      },
    },
  });

  const registry = {
    resolve(elementId) {
      const control = controls.get(elementId);
      return control === undefined
        ? undefined
        : {
            elementId,
            generation: control.generation,
            methods: Object.keys(control.methods),
          };
    },
    capturedElementIds: () => [...controls.keys()],
    invoke(handle, method, args = []) {
      const control = controls.get(handle.elementId);
      if (control === undefined)
        return { ok: false, reason: "unknown-control" };
      if (control.generation !== handle.generation) {
        return { ok: false, reason: "stale-control", detail: "superseded" };
      }
      const target = control.methods[method];
      if (target === undefined) return { ok: false, reason: "unknown-method" };
      try {
        return { ok: true, value: target(...args) };
      } catch (error) {
        return { ok: false, reason: "threw", detail: String(error) };
      }
    },
  };

  return {
    root,
    clicks,
    controls,
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    registry,
  };
}

function target(id, weighting, maximum = Number.MAX_SAFE_INTEGER) {
  return {
    key: `city-${id}`,
    elementId: `city-${id}`,
    region: "city",
    id,
    weighting,
    maximum,
  };
}

function policy(targets) {
  return () => ({
    targets,
    consumptionMode: "onePerTick",
    buildIfStorageFull: false,
    ignoreZeroRate: false,
  });
}

// --- a real purchase, with the panel never rendered -------------------------------------------------

{
  const page = makePage({
    buildings: {
      basic_housing: {
        count: 9,
        priceAt: (count) => ({ Money: 20 + count * 8, Lumber: 10 + count * 6 }),
      },
    },
    resources: { Money: { amount: 500 }, Lumber: { amount: 500 } },
  });
  const skipped = [];
  const control = createCapturedBuildControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("basic_housing", 100)]),
    onSkipped: (key, reason) => skipped.push([key, reason]),
  });

  const outcome = control.runCycle();
  assert.equal(outcome.status, "succeeded");
  assert.deepEqual(page.clicks, ["city-basic_housing"]);
  assert.equal(
    page.root.city.basic_housing.count,
    10,
    "the game's own action ran",
  );
  assert.equal(
    page.root.resource.Money.amount,
    500 - 92,
    "the game's escalated price was paid",
  );
  assert.equal(page.root.resource.Lumber.amount, 500 - 64);
  assert.deepEqual(skipped, []);
  assert.deepEqual(page.root.queue.queue, [], "the cost probe left no trace");
}

// --- unaffordable is a decision, not an error ---------------------------------------------------------

{
  const page = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 1000 }) } },
    resources: { Money: { amount: 10 } },
  });
  const control = createCapturedBuildControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(page.root.city.farm.count, 0);
}

// --- a higher-weighted competitor protects its resource ------------------------------------------------

{
  const page = makePage({
    buildings: {
      wardenclyffe: { count: 0, priceAt: () => ({ Money: 1000 }) },
      farm: { count: 0, priceAt: () => ({ Money: 200 }) },
    },
    resources: { Money: { amount: 300, max: 1000, diff: 10 } },
  });
  const control = createCapturedBuildControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("wardenclyffe", 90), target("farm", 10)]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(
    page.clicks,
    [],
    "the cheap building waits for the expensive one",
  );
  assert.equal(page.root.resource.Money.amount, 300);

  // Just enough for the expensive one only: it is bought, and the cheap one still yields, now
  // measured against the holdings that purchase actually left.
  page.root.resource.Money.amount = 1500;
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["city-wardenclyffe"]);
  assert.equal(page.root.resource.Money.amount, 500);

  // Enough for both: the competitor is affordable, so it no longer reserves anything.
  page.root.resource.Money.amount = 3000;
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, [
    "city-wardenclyffe",
    "city-wardenclyffe",
    "city-farm",
  ]);
  assert.equal(page.root.city.wardenclyffe.count, 2);
  assert.equal(page.root.city.farm.count, 1);
  assert.equal(page.root.resource.Money.amount, 3000 - 1000 - 200);
}

// --- maximum, absent buildings, and queued targets -------------------------------------------------------

{
  const page = makePage({
    buildings: {
      farm: { count: 3, priceAt: () => ({ Money: 10 }) },
      mine: { count: 0, priceAt: () => ({ Money: 10 }) },
    },
    resources: { Money: { amount: 500 } },
    queue: [{ id: "city-mine" }],
  });
  const skipped = [];
  const control = createCapturedBuildControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([
      target("farm", 50, 3),
      target("mine", 40),
      target("not_a_building", 30),
    ]),
    onSkipped: (key, reason) => skipped.push([key, reason]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(
    page.clicks,
    [],
    "at maximum, queued by the player, or not in the game",
  );
  assert.deepEqual(skipped, [
    ["city-not_a_building", "not present in game state"],
  ]);
}

// --- a control the game never built is reported, never read as "locked" -------------------------------------

{
  const page = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 10 }) } },
    resources: { Money: { amount: 500 } },
  });
  page.controls.delete("city-farm");
  const control = createCapturedBuildControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
  });
  const outcome = control.runCycle();
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.failure.code, "build-control-missing");
  assert.match(outcome.failure.message, /city-farm/);
}

// --- a superseded control fails as stale rather than running the old closure ---------------------------------

{
  const page = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 10 }) } },
    resources: { Money: { amount: 500 } },
  });
  const control = createCapturedBuildControl({
    rootState: page.rootState,
    controls: {
      ...page.registry,
      resolve: (elementId) =>
        elementId === "city-farm"
          ? { elementId, generation: 99, methods: ["action"] }
          : page.registry.resolve(elementId),
    },
    readPolicy: policy([target("farm", 50)]),
  });
  const outcome = control.runCycle();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "stale-build-control");
  assert.deepEqual(page.clicks, []);
}

// --- before the game has state ---------------------------------------------------------------------------------

{
  const control = createCapturedBuildControl({
    rootState: {
      readRoot: () => undefined,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
    readPolicy: policy([target("farm", 50)]),
  });
  const outcome = control.runCycle();
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.failure.code, "game-state-not-captured");
}

// --- a cost the game cannot price drops the candidate, it is not guessed at ---------------------------------------

{
  const page = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 10 }) } },
    resources: { Money: { amount: 500 } },
  });
  page.controls.delete("buildQueue");
  const skipped = [];
  const control = createCapturedBuildControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
    onSkipped: (key, reason) => skipped.push([key, reason]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(
    skipped.some(([key]) => key === "city-farm"),
    true,
  );
}

console.log("captured-build ok");
