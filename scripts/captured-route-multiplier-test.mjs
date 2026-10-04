import assert from "node:assert/strict";

import { createCapturedTradeRoutes } from "../src/adapters/evolve/economy/market/captured-trade-routes.ts";
import { isCapturedRouteMultiplierNeutral } from "../src/adapters/evolve/economy/market/captured-route-multiplier.ts";

// Desktop width: pinned `resources.js:marketRouteMultiplier` takes the `keyMultiplier()` branch
// above 768px, so the captured picker's own data cannot speak for the value the native `more()` and
// `less()` closures will use. This fixture reproduces that branch faithfully.
const VIEWPORT_WIDTH = 1024;

function regionalRoot(mKeys, keyMap) {
  return {
    race: {
      supplySplit: true,
      governor: {
        g: { bg: "none" },
        config: { trader: { margin: 0, reserve: 0 } },
      },
    },
    tech: { shadow: 5 },
    settings: { mKeys, keyMap },
    city: {
      market: {
        mtrade: 2,
        trade: 1,
        bmZone: "spc_home",
        bm: { spc_home: { Food: 1 }, spc_moon: {} },
      },
    },
    resource: {
      Money: { amount: 100, max: 1000, diff: 100, display: true },
      Food: { display: true, regDiff: { spc_home: 30, spc_moon: 0 } },
      Iron: { display: true, regDiff: { spc_home: 0, spc_moon: -25 } },
    },
  };
}

function createFixture({
  mKeys = false,
  keyMap = {},
  pressed = [],
  mobileMultiplier = 1,
  withPicker = true,
  keyStateUnavailable = false,
  forcedMultiplier,
  noOpFirstMutation = false,
  afterMutation,
  removeFood = true,
  maximumRoutes = 2,
} = {}) {
  const root = regionalRoot(mKeys, keyMap);
  root.city.market.mtrade = maximumRoutes;
  if (!removeFood) root.resource.Food.regDiff.spc_home = 0;
  const down = new Set(pressed);

  /** `vars.js:keyMultiplier`: each mapping the game currently records as held multiplies in. */
  function mappingHeld(mapping) {
    const configured = root.settings.keyMap[mapping];
    if (typeof configured !== "string" && typeof configured !== "number")
      return false;
    return down.has(configured);
  }
  function nativeRouteMultiplier() {
    if (VIEWPORT_WIDTH <= 768) return mobileMultiplier;
    if (forcedMultiplier !== undefined) return forcedMultiplier;
    let number = 1;
    if (root.settings.mKeys) {
      if (mappingHeld("x10")) number *= 10;
      if (mappingHeld("x25")) number *= 25;
      if (mappingHeld("x100")) number *= 100;
    }
    return number;
  }
  function bmAdjust(resourceId, pool, delta) {
    const ledger = (root.city.market.bm[pool] ??= {});
    const current = ledger[resourceId] ?? 0;
    const applied = Math.max(delta, -current);
    if (current + applied <= 0) delete ledger[resourceId];
    else ledger[resourceId] = current + applied;
    root.city.market.trade += applied;
  }

  const controls = new Map();
  for (const id of ["bm-Food", "bm-Iron"]) {
    controls.set(id, {
      elementId: id,
      generation: 1,
      methods: ["more", "less", "none", "volume"],
    });
  }
  if (withPicker) {
    controls.set("marketRouteMultiplier", {
      elementId: "marketRouteMultiplier",
      generation: 1,
      methods: ["set"],
      data: { multiplier: mobileMultiplier },
    });
  }

  let rounded = [];
  const nativeCalls = [];
  const appliedMultipliers = [];
  const registry = {
    resolve: (id) => controls.get(id),
    capturedElementIds: () => [...controls.keys()],
    invoke: (handle, method) => {
      if (method === "volume") {
        const value = handle.elementId === "bm-Food" ? 20 : 10;
        rounded = [{ receiver: value, digits: 2, text: value.toFixed(2) }];
        return { ok: true, value: "localized" };
      }
      if (method === "set") return { ok: true, value: undefined };
      const multiplier = nativeRouteMultiplier();
      nativeCalls.push([method, root.city.market.bmZone]);
      appliedMultipliers.push(multiplier);
      if (!(noOpFirstMutation && nativeCalls.length === 1)) {
        bmAdjust(
          handle.elementId.slice(3),
          root.city.market.bmZone,
          method === "more" ? multiplier : -multiplier,
        );
      }
      afterMutation?.(nativeCalls.length);
      return { ok: true, value: undefined };
    },
  };

  let board;
  const draw = () => {
    const routeMultiplier = registry.resolve("marketRouteMultiplier");
    board = {
      root,
      mode: "regional",
      epoch: "test",
      rows: ["bm-Food", "bm-Iron"].map((id) => registry.resolve(id)),
      ...(routeMultiplier === undefined ? {} : { routeMultiplier }),
    };
  };
  draw();
  const boards = {
    draw,
    current: () => board,
    isCurrent: (candidate) =>
      candidate === board &&
      candidate.rows.every(
        (row) => registry.resolve(row.elementId)?.generation === row.generation,
      ) &&
      (candidate.routeMultiplier === undefined ||
        registry.resolve("marketRouteMultiplier")?.generation ===
          candidate.routeMultiplier.generation),
  };

  const keyState = {
    readPressed: (key) => (keyStateUnavailable ? undefined : down.has(key)),
  };
  const adjuster = createCapturedTradeRoutes({
    rootState: { readRoot: () => root },
    controls: registry,
    board: boards,
    mechanics: {
      readRoundedValues(read) {
        rounded = [];
        read();
        return { kind: "value", value: rounded };
      },
    },
    keyState,
    readSettings: () => ({}),
  });

  return {
    adjust: () => adjuster.adjust(),
    board: () => board,
    boards,
    controls,
    keyState,
    root,
    nativeCalls,
    appliedMultipliers,
    neutral: (source = boards) =>
      isCapturedRouteMultiplierNeutral({
        root,
        boards: source,
        board,
        controls: registry,
        keyState,
      }),
    ledger: (pool, resourceId) => root.city.market.bm[pool]?.[resourceId],
    trade: () => root.city.market.trade,
    press: (key) => down.add(key),
  };
}

// The planner asks for exactly one route per step, so a neutral multiplier lets every step through.
{
  const run = createFixture();
  run.adjust();
  assert.deepEqual(run.appliedMultipliers, [1, 1, 1]);
  assert.deepEqual(run.nativeCalls, [
    ["less", "spc_home"],
    ["more", "spc_moon"],
    ["more", "spc_moon"],
  ]);
  assert.equal(run.ledger("spc_home", "Food"), undefined);
  assert.equal(run.ledger("spc_moon", "Iron"), 2);
  assert.equal(run.trade(), 2);
}

{
  const run = createFixture({ removeFood: false, maximumRoutes: 3 });
  run.adjust();
  assert.deepEqual(run.nativeCalls, [
    ["more", "spc_moon"],
    ["more", "spc_moon"],
  ]);
  assert.deepEqual(run.appliedMultipliers, [1, 1]);
  assert.equal(run.ledger("spc_moon", "Iron"), 2);
}

// A held multiplier key would make the native call commit ten routes. Nothing may be invoked.
for (const mapping of ["x10", "x25", "x100"]) {
  for (const configured of ["Shift", "x", 88]) {
    const run = createFixture({
      mKeys: true,
      keyMap: { [mapping]: configured },
      pressed: [configured],
    });
    assert.equal(run.neutral(), false, `${mapping}=${configured} is held`);
    run.adjust();
    assert.equal(
      run.nativeCalls.length,
      0,
      `${mapping}=${configured} must not reach a native more()/less()`,
    );
    assert.equal(run.ledger("spc_moon", "Iron"), undefined);
    assert.equal(run.ledger("spc_home", "Food"), 1);
    assert.equal(run.trade(), 1);
  }
}

// Without a configured mapping there is nothing upstream can multiply by, however many keys are
// down; the modifier names are not assumed, so only the mapping value decides.
{
  const run = createFixture({
    mKeys: true,
    keyMap: {},
    pressed: ["Shift", "Control", "z", 88],
  });
  assert.equal(run.neutral(), true);
}

// Without `mKeys` the keyboard half of upstream `keyMultiplier()` contributes nothing at all.
{
  const run = createFixture({
    mKeys: false,
    keyMap: { x10: "Shift", x25: 88, x100: "x" },
    pressed: ["Shift", 88, "x"],
  });
  assert.equal(run.neutral(), true);
  run.adjust();
  assert.equal(run.nativeCalls.length, 3);
  assert.deepEqual(run.appliedMultipliers, [1, 1, 1]);
}

// The mobile picker must be this board's own handle, current, and reading one.
{
  const scaled = createFixture({ mobileMultiplier: 5 });
  assert.equal(scaled.neutral(), false);
  scaled.adjust();
  assert.equal(scaled.nativeCalls.length, 0);
}
{
  const missing = createFixture({ withPicker: false });
  assert.equal(missing.neutral(), false);
  missing.adjust();
  assert.equal(missing.nativeCalls.length, 0);
}
{
  const stale = createFixture();
  stale.controls.set("marketRouteMultiplier", {
    ...stale.controls.get("marketRouteMultiplier"),
    generation: 2,
  });
  assert.equal(stale.neutral(), false);
  assert.equal(
    stale.neutral({ isCurrent: () => true }),
    false,
    "the helper's own generation fence holds without the board's",
  );
  stale.adjust();
  assert.equal(stale.nativeCalls.length, 0);
}
{
  const blind = createFixture({
    mKeys: true,
    keyMap: { x10: "Shift" },
    keyStateUnavailable: true,
  });
  assert.equal(blind.neutral(), false);
  blind.adjust();
  assert.equal(blind.nativeCalls.length, 0);
}

// Each step proves its own neutrality, so a key pressed mid-batch stops the next step only.
{
  const run = createFixture({
    mKeys: true,
    keyMap: { x10: "Shift" },
    afterMutation: (count) => {
      if (count === 1) run.press("Shift");
    },
  });
  run.adjust();
  assert.deepEqual(run.nativeCalls, [["less", "spc_home"]]);
  assert.equal(run.ledger("spc_home", "Food"), undefined);
  assert.equal(run.ledger("spc_moon", "Iron"), undefined);
  assert.equal(run.trade(), 0);
}

// The one-route postconditions still reject a native step that moved anything else, and the plan is
// not rewritten around what the game happened to do.
{
  const oversized = createFixture({
    forcedMultiplier: 10,
    removeFood: false,
    maximumRoutes: 3,
  });
  oversized.adjust();
  assert.equal(oversized.nativeCalls.length, 1);
  assert.equal(oversized.ledger("spc_moon", "Iron"), 10);
}
{
  const silent = createFixture({ noOpFirstMutation: true });
  silent.adjust();
  assert.equal(silent.nativeCalls.length, 1);
  assert.equal(silent.ledger("spc_home", "Food"), 1);
  assert.equal(silent.ledger("spc_moon", "Iron"), undefined);
}

console.log("captured regional route multiplier tests passed");
