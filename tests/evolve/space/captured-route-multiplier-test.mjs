import assert from "node:assert/strict";

import { createGameKeyStateCapture } from "../../../src/adapters/browser/game-key-state.ts";
import { readCapturedMultiplierMapping } from "../../../src/adapters/evolve/captured-multiplier-keys.ts";
import { createCapturedTradeRoutes } from "../../../src/adapters/evolve/economy/market/captured-trade-routes.ts";
import { isCapturedRouteMultiplierNeutral } from "../../../src/adapters/evolve/economy/market/captured-route-multiplier.ts";

// Desktop width: pinned `resources.js:marketRouteMultiplier` takes the `keyMultiplier()` branch
// above 768px, so the captured picker's own data cannot speak for the value the native `more()` and
// `less()` closures will use. This fixture reproduces that branch faithfully.
const VIEWPORT_WIDTH = 1024;

/**
 * The game's own private latch, transcribed from pinned `main.js` and updated only by the fixture's
 * key events.
 *
 * It is deliberately *not* derived from the pressed-key set the adapter under test observes: if the
 * adapter reconstructed latched state from physical keys, this copy of upstream would disagree with it
 * exactly where the game would multiply and the adapter would not, which is the defect these tests
 * exist to catch. Pinned `vars.js` starts all four entries `false` and `main.js` is the only writer.
 */
const nativeKeyMap = { x10: false, x25: false, x100: false, q: false };

function regionalRoot(mKeys, keyMap) {
  return {
    race: {
      supplyZones: true,
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
  keyMap = { x10: "Control", x25: "Shift", x100: "Alt", q: "q" },
  mobileMultiplier = 1,
  withPicker = true,
  forcedMultiplier,
  noOpFirstMutation = false,
  afterMutation,
  removeFood = true,
  maximumRoutes = 2,
} = {}) {
  const root = regionalRoot(mKeys, keyMap);
  root.city.market.mtrade = maximumRoutes;
  if (!removeFood) root.resource.Food.regDiff.spc_home = 0;
  for (const name of Object.keys(nativeKeyMap)) nativeKeyMap[name] = false;

  /** `vars.js:keyMultiplier`, reading the latch the game's own handlers maintain. */
  function nativeRouteMultiplier() {
    if (VIEWPORT_WIDTH <= 768) return mobileMultiplier;
    if (forcedMultiplier !== undefined) return forcedMultiplier;
    let number = 1;
    if (currentRoot.settings.mKeys) {
      if (nativeKeyMap.x10) number *= 10;
      if (nativeKeyMap.x25) number *= 25;
      if (nativeKeyMap.x100) number *= 100;
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

  const listeners = new Map();
  const documentStub = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    dispatch: (type, event) => listeners.get(type)?.(event),
  };
  const rootListeners = new Set();
  let currentRoot = root;
  const roots = {
    readRoot: () => currentRoot,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: (listener) => {
      rootListeners.add(listener);
      return () => rootListeners.delete(listener);
    },
  };
  const keyState = createGameKeyStateCapture(() => documentStub, {
    roots,
    readMultiplierMapping: (name) =>
      readCapturedMultiplierMapping(currentRoot, name),
  });

  /** One browser event, handed to the capture and to the game's own handler. */
  function event(type, properties) {
    documentStub.dispatch(type, properties);
    if (type === "keydown" || type === "keyup") {
      const key = properties.key || properties.keyCode;
      for (const name of Object.keys(nativeKeyMap)) {
        if (key === currentRoot.settings.keyMap[name])
          nativeKeyMap[name] = type === "keydown";
      }
      return;
    }
    for (const [name, mapping] of Object.entries(currentRoot.settings.keyMap)) {
      switch (mapping) {
        case "Shift":
        case 16:
          nativeKeyMap[name] = properties.shiftKey ? true : false;
          break;
        case "Control":
        case 17:
          nativeKeyMap[name] = properties.ctrlKey ? true : false;
          break;
        case "Alt":
        case 18:
          nativeKeyMap[name] = properties.altKey ? true : false;
          break;
        case "Meta":
        case 91:
          nativeKeyMap[name] = properties.metaKey ? true : false;
          break;
      }
    }
  }
  const mouse = (flags = {}) =>
    event("mousemove", {
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...flags,
    });

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

  const adjuster = createCapturedTradeRoutes({
    rootState: roots,
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
    latch: (name) => keyState.readMultiplierLatch(name),
    keyDown: (key, keyCode) => event("keydown", { key, keyCode }),
    keyUp: (key, keyCode) => event("keyup", { key, keyCode }),
    mouse,
    /** Remap a multiplier while the game is running, as the settings panel does. */
    remap: (name, value) => {
      root.settings.keyMap[name] = value;
    },
    /** A different captured root with its own settings, as a wiki save import produces. */
    swapRoot: () => {
      currentRoot = {
        ...root,
        settings: {
          mKeys: true,
          keyMap: { x10: "y", x25: "Shift", x100: "Alt", q: "q" },
        },
      };
      for (const listener of rootListeners) listener();
    },
    establishLatch: () => mouse(),
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

// The latch answers nothing until the capture has compared an event against a real mapping, and the
// regional mutation fails closed in the meantime.
{
  const run = createFixture({ mKeys: true });
  assert.equal(run.latch("x10"), undefined);
  assert.equal(run.neutral(), false);
  run.adjust();
  assert.equal(run.nativeCalls.length, 0);
  run.establishLatch();
  assert.equal(run.latch("x10"), false);
  assert.equal(run.neutral(), true);
}

// A held multiplier key latches the game's own state, so nothing may reach a native more()/less().
for (const mapping of ["x10", "x25", "x100"]) {
  for (const configured of ["Shift", "x", 88]) {
    const run = createFixture({
      mKeys: true,
      keyMap: {
        x10: "Control",
        x25: "Shift",
        x100: "Alt",
        q: "q",
        [mapping]: configured,
      },
    });
    run.establishLatch();
    assert.equal(run.neutral(), true, `${mapping}=${configured} idle`);
    if (typeof configured === "string") run.keyDown(configured, 0);
    else run.keyDown("", configured);
    assert.equal(
      nativeKeyMap[mapping],
      true,
      `${mapping}=${configured} latches`,
    );
    assert.equal(run.neutral(), false, `${mapping}=${configured} is latched`);
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

// The whole defect: upstream latches on keydown and clears on the keyup of whatever is mapped *then*,
// so a mapping changed while its key is down leaves the game multiplying by ten with nothing held. A
// pressed-key reconstruction reads the new mapping, sees nothing pressed, and calls that neutral.
{
  const run = createFixture({ mKeys: true });
  run.remap("x10", "x");
  run.establishLatch();
  run.keyDown("x", 88);
  assert.equal(run.neutral(), false);
  run.remap("x10", "z");
  assert.equal(run.latch("x10"), true, "the latch outlives its own mapping");
  assert.equal(run.keyState.readPressed("x"), true);
  assert.equal(run.keyState.readPressed("z"), false);
  assert.equal(run.neutral(), false, "a stale latch is not neutral");
  run.adjust();
  assert.equal(
    run.nativeCalls.length,
    0,
    "no native call while remapped mid-press",
  );

  // Upstream's keyup compares `x` against the *current* mapping `z` and clears nothing, so the latch
  // survives the release as well. Preserved deliberately: the question is what the game will answer.
  run.keyUp("x", 88);
  assert.equal(nativeKeyMap.x10, true, "upstream leaves the stale latch set");
  assert.equal(run.latch("x10"), true);
  assert.equal(run.neutral(), false);
  run.adjust();
  assert.equal(run.nativeCalls.length, 0);

  // Pressing and releasing the currently mapped key clears it, exactly as upstream does.
  run.keyDown("z", 90);
  assert.equal(nativeKeyMap.x10, true);
  run.keyUp("z", 90);
  assert.equal(nativeKeyMap.x10, false);
  assert.equal(run.latch("x10"), false);
  assert.equal(run.neutral(), true);
  run.adjust();
  assert.deepEqual(run.appliedMultipliers, [1, 1, 1]);
  assert.equal(run.nativeCalls.length, 3);
}

// The mapping the game is configured with is the one each event is compared against, at that moment.
{
  const run = createFixture({ mKeys: true });
  run.remap("x10", 88);
  run.establishLatch();
  // `e.key || e.keyCode` is `"x"` here, so a numeric mapping never matches a named keydown.
  run.keyDown("x", 88);
  assert.equal(nativeKeyMap.x10, false);
  assert.equal(run.latch("x10"), false);
  assert.equal(run.neutral(), true);
  // A keyCode-only event compares as the code, which is the mapping.
  run.keyDown("", 88);
  assert.equal(nativeKeyMap.x10, true);
  assert.equal(run.neutral(), false);
  run.keyUp("", 88);
  assert.equal(run.latch("x10"), false);
  run.keyDown("x", 88);
  assert.equal(run.latch("x10"), false, "strict equality, not coercion");
}

// Modifiers arrive through mousemove rather than keyup/keydown, so they can set or clear a latch on
// their own. Default upstream mappings are exactly these three aliases.
{
  const run = createFixture({ mKeys: true });
  run.establishLatch();
  assert.equal(run.latch("x25"), false);
  run.mouse({ shiftKey: true });
  assert.equal(nativeKeyMap.x25, true);
  assert.equal(run.latch("x25"), true);
  assert.equal(run.neutral(), false, "a held Shift holds x25");
  run.mouse();
  assert.equal(nativeKeyMap.x25, false);
  assert.equal(run.latch("x25"), false);
  assert.equal(run.neutral(), true);

  const numeric = createFixture({
    mKeys: true,
    keyMap: { x10: "Control", x25: 17, x100: "Alt", q: "q" },
  });
  numeric.establishLatch();
  numeric.mouse({ ctrlKey: true });
  assert.equal(nativeKeyMap.x25, true);
  assert.equal(numeric.latch("x25"), true);
  assert.equal(numeric.neutral(), false);
  numeric.mouse();
  assert.equal(numeric.latch("x25"), false);
  assert.equal(numeric.neutral(), true);
}

// Without a configured mapping there is nothing upstream could ever compare against, so the latch
// stays unanswerable and a mutation waiting on it waits — rather than being answered from a guess.
{
  const run = createFixture({ mKeys: true, keyMap: {} });
  run.establishLatch();
  assert.equal(
    run.latch("x10"),
    undefined,
    "an unmapped latch stays unanswerable",
  );
  run.mouse({ shiftKey: true, ctrlKey: true });
  run.keyDown("z", 90);
  assert.equal(run.latch("x10"), undefined);
  assert.equal(run.neutral(), false);
  run.adjust();
  assert.equal(run.nativeCalls.length, 0);
}

// Without `mKeys` the keyboard half of upstream `keyMultiplier()` contributes nothing at all, latch or
// not, so a true latch must not block the regional trade.
{
  const run = createFixture({ mKeys: false });
  run.remap("x10", "x");
  run.establishLatch();
  run.mouse({ shiftKey: true });
  run.keyDown("x", 88);
  assert.equal(nativeKeyMap.x10, true);
  assert.equal(nativeKeyMap.x25, true);
  assert.equal(run.neutral(), true);
  run.adjust();
  assert.equal(run.nativeCalls.length, 3);
  assert.deepEqual(run.appliedMultipliers, [1, 1, 1]);
}

// The mobile picker must be this board's own handle, current, and reading one.
{
  const scaled = createFixture({ mobileMultiplier: 5 });
  scaled.establishLatch();
  assert.equal(scaled.neutral(), false);
  scaled.adjust();
  assert.equal(scaled.nativeCalls.length, 0);
}
{
  const missing = createFixture({ withPicker: false });
  missing.establishLatch();
  assert.equal(missing.neutral(), false);
  missing.adjust();
  assert.equal(missing.nativeCalls.length, 0);
}
{
  const stale = createFixture();
  stale.establishLatch();
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

// A capture that cannot report the latch at all proves nothing, so the regional trade waits.
{
  const blind = createFixture({ mKeys: true });
  blind.establishLatch();
  blind.keyState.uninstall();
  assert.equal(blind.neutral(), false);
  blind.adjust();
  assert.equal(blind.nativeCalls.length, 0);
}

// Each step proves its own neutrality, so a key latched mid-batch stops the next step only.
{
  const run = createFixture({
    mKeys: true,
    afterMutation: (count) => {
      if (count === 1) run.mouse({ shiftKey: true });
    },
  });
  run.establishLatch();
  run.adjust();
  assert.deepEqual(run.nativeCalls, [["less", "spc_home"]]);
  assert.equal(run.ledger("spc_home", "Food"), undefined);
  assert.equal(run.ledger("spc_moon", "Iron"), undefined);
  assert.equal(run.trade(), 0);
}

// A different captured root is not the root the fold was derived from, so its latches are unknown again
// rather than inherited — fail closed, and re-established from the next observed event.
{
  const run = createFixture({ mKeys: true });
  run.remap("x10", "x");
  run.establishLatch();
  run.keyDown("x", 88);
  assert.equal(run.latch("x10"), true);
  assert.equal(run.neutral(), false);
  run.swapRoot();
  assert.equal(run.latch("x10"), undefined, "no inherited authority");
  assert.equal(run.neutral(), false);
  run.adjust();
  assert.equal(run.nativeCalls.length, 0);
  run.mouse();
  assert.equal(run.latch("x10"), false);
  assert.equal(run.neutral(), true);
}

// The one-route postconditions still reject a native step that moved anything else, and the plan is
// not rewritten around what the game happened to do.
{
  const oversized = createFixture({
    forcedMultiplier: 10,
    removeFood: false,
    maximumRoutes: 3,
  });
  oversized.establishLatch();
  oversized.adjust();
  assert.equal(oversized.nativeCalls.length, 1);
  assert.equal(oversized.ledger("spc_moon", "Iron"), 10);
}
{
  const silent = createFixture({ noOpFirstMutation: true });
  silent.establishLatch();
  silent.adjust();
  assert.equal(silent.nativeCalls.length, 1);
  assert.equal(silent.ledger("spc_home", "Food"), 1);
  assert.equal(silent.ledger("spc_moon", "Iron"), undefined);
}

console.log("captured regional route multiplier tests passed");
