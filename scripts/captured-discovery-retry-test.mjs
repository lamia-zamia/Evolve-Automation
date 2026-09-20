import assert from "node:assert/strict";

import { createDiscoveryAttempts } from "../src/bootstrap/discovery-attempts.ts";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";

/* ---------------------------------------------------------------- shared semantics */

{
  let cycle = 0;
  const attempts = createDiscoveryAttempts({ readCycle: () => cycle });

  // Never tried: eligible.
  assert.equal(attempts.shouldAttempt("a"), true);
  assert.equal(attempts.describe("a"), "never-tried");

  // A failure is retryable on the very next cycle, not never again.
  attempts.recordFailure("a");
  assert.equal(attempts.shouldAttempt("a"), false, "no second try same cycle");
  cycle = 1;
  assert.equal(attempts.shouldAttempt("a"), true, "retry next cycle");

  // Repeated failure backs off: 1, 2, 4, 8 ... cycles.
  attempts.recordFailure("a");
  cycle = 2;
  assert.equal(attempts.shouldAttempt("a"), false);
  cycle = 3;
  assert.equal(attempts.shouldAttempt("a"), true);

  // Success retires the key for good within the epoch.
  attempts.recordSuccess("a");
  assert.equal(attempts.describe("a"), "satisfied");
  for (cycle = 4; cycle < 200; cycle += 1) {
    assert.equal(attempts.shouldAttempt("a"), false);
  }

  // The backoff is capped rather than unbounded.
  const capped = createDiscoveryAttempts({ readCycle: () => cycle });
  for (let i = 0; i < 12; i += 1) capped.recordFailure("b");
  assert.match(capped.describe("b"), /failed\(12\) retry-at-232/);
}

{
  // Root replacement makes a cached success eligible again: its controls are not authoritative.
  const attempts = createDiscoveryAttempts({ readCycle: () => 0 });
  attempts.recordSuccess("a");
  assert.equal(attempts.shouldAttempt("a"), false);
  attempts.invalidate();
  assert.equal(attempts.shouldAttempt("a"), true);
}

{
  // A feature-owned epoch starts the attempts over without touching other features.
  const attempts = createDiscoveryAttempts({ readCycle: () => 0 });
  attempts.recordSuccess("mad", "epoch-1");
  assert.equal(attempts.shouldAttempt("mad", "epoch-1"), false);
  assert.equal(attempts.shouldAttempt("mad", "epoch-2"), true);
  attempts.recordFailure("mad", "epoch-2");
  assert.equal(attempts.shouldAttempt("mad", "epoch-2"), false);
  assert.equal(attempts.shouldAttempt("mad", "epoch-1"), true);
}

/* ------------------------------------------- a representative real feature: the market panel */

const MAIN_TAB_CONTROL = "#mainColumn div.content";
const MARKET_SUB_TAB_CONTROL = "mTabResource";
const MARKET_QUANTITY_CONTROL = "market-qty";

function stubDocument() {
  return {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      classList: { add() {}, remove() {} },
      appendChild() {},
      setAttribute() {},
    }),
    body: { appendChild() {}, removeChild() {} },
  };
}

/**
 * Drives the captured runtime over the real market discovery path. `swapTab` is the game call the
 * draw makes, so `onSwap` is where a test models a transient refusal — the stale sub-tab control
 * that the replaced one-shot latches spent their single session attempt on.
 *
 * `captureControl` decides whether a completed draw actually leaves `market-qty` captured, which
 * separates "the draw succeeded" from "the capability arrived".
 */
function runMarketFixture({
  onSwap = () => undefined,
  captureControl = () => true,
  cycles,
}) {
  const swaps = [];
  const errors = [];
  let captured = false;
  let listener;
  const root = {
    settings: { showMarket: true, civTabs: 0, marketTabs: 0, animated: false },
    race: { species: "human" },
  };
  const ids = () =>
    captured
      ? [MAIN_TAB_CONTROL, MARKET_SUB_TAB_CONTROL, MARKET_QUANTITY_CONTROL]
      : [MAIN_TAB_CONTROL, MARKET_SUB_TAB_CONTROL];
  const stop = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (elementId) =>
          ids().includes(elementId)
            ? { elementId, generation: 1, methods: ["swapTab"] }
            : undefined,
        invoke: (handle, method) => {
          if (method !== "swapTab") {
            return { ok: false, reason: "unknown-method" };
          }
          const isDraw = handle.elementId === MARKET_SUB_TAB_CONTROL;
          if (isDraw) swaps.push(swaps.length);
          const refusal = isDraw ? onSwap(swaps.length) : undefined;
          if (refusal !== undefined) return refusal;
          if (isDraw && captureControl(swaps.length)) captured = true;
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ids(),
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          listener = next;
          return () => {};
        },
      },
      mountSuppression: {
        available: true,
        withoutMounting: (draw) => draw(),
        withMountingEnabled: (draw) => draw(),
      },
      uninstall: () => {},
    },
    document: stubDocument(),
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({ masterScriptToggle: true, autoMarket: true }),
      setItem: () => {},
    },
    logError: (message) => errors.push(message),
  });
  for (let i = 0; i < cycles; i += 1) listener({ periods: 4 });
  stop?.();
  return { draws: swaps.length, errors, captured: () => captured };
}

{
  // Transient failure: the first draw is refused by a stale sub-tab control. The old latch spent
  // its only attempt here and left the market dark for the page session; now a later cycle
  // retries and captures the control.
  const { draws, captured } = runMarketFixture({
    cycles: 4,
    onSwap: (n) =>
      n === 1 ? { ok: false, reason: "stale-control" } : undefined,
  });
  assert.ok(draws >= 2, `expected a retry, saw ${draws} draws`);
  assert.equal(captured(), true, "market control captured on the retry");
}

{
  // Successful cache: one draw captures the control and no later cycle redraws the tab.
  const { draws, captured } = runMarketFixture({ cycles: 6 });
  assert.equal(captured(), true);
  assert.equal(draws, 1, `redundant draws: ${draws}`);
}

{
  // A draw that reports success while leaving the expected control absent is not a success. The
  // feature stays discoverable, and the diagnostic says so rather than going quiet.
  const { draws, errors, captured } = runMarketFixture({
    cycles: 4,
    captureControl: () => false,
  });
  assert.equal(captured(), false);
  assert.ok(draws >= 2, "an uncaptured capability is retried");
  assert.ok(
    errors.some((message) =>
      message.includes("drew its tab without capturing its control"),
    ),
    `expected the uncaptured-capability diagnostic, saw ${JSON.stringify(errors)}`,
  );
}

{
  // A persistent failure keeps retrying, but backs off instead of drawing on every cycle.
  const { draws } = runMarketFixture({
    cycles: 16,
    onSwap: () => ({ ok: false, reason: "stale-control" }),
  });
  assert.ok(draws >= 2, "a persistent failure is still retried");
  assert.ok(draws < 16, `expected backoff, drew on every cycle: ${draws}`);
}

{
  // Unlock arrives later: while the game has not offered the market, no attempt is consumed. The
  // first eligible cycle then discovers it.
  const swaps = [];
  const errors = [];
  let captured = false;
  let offered = false;
  let listener;
  const root = {
    settings: { showMarket: false, civTabs: 0, marketTabs: 0, animated: false },
    race: { species: "human" },
  };
  const ids = () =>
    captured
      ? [MAIN_TAB_CONTROL, MARKET_SUB_TAB_CONTROL, MARKET_QUANTITY_CONTROL]
      : [MAIN_TAB_CONTROL, MARKET_SUB_TAB_CONTROL];
  startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (elementId) =>
          ids().includes(elementId)
            ? { elementId, generation: 1, methods: ["swapTab"] }
            : undefined,
        invoke: (handle, method) => {
          if (method !== "swapTab") {
            return { ok: false, reason: "unknown-method" };
          }
          if (handle.elementId === MARKET_SUB_TAB_CONTROL) {
            swaps.push(offered);
            captured = true;
          }
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ids(),
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          listener = next;
          return () => {};
        },
      },
      mountSuppression: {
        available: true,
        withoutMounting: (draw) => draw(),
        withMountingEnabled: (draw) => draw(),
      },
      uninstall: () => {},
    },
    document: stubDocument(),
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({ masterScriptToggle: true, autoMarket: true }),
      setItem: () => {},
    },
    logError: (message) => errors.push(message),
  });
  for (let i = 0; i < 5; i += 1) listener({ periods: 4 });
  assert.equal(swaps.length, 0, "a locked feature consumes no discovery");
  offered = true;
  root.settings.showMarket = true;
  listener({ periods: 4 });
  assert.deepEqual(swaps, [true], "the first eligible cycle discovers");
}

{
  // Root replacement: the page the successful draw captured its control from is gone, so the
  // cached success is no longer authoritative and the feature must be discoverable again.
  const swaps = [];
  let captured = false;
  let listener;
  const rootListeners = [];
  let root = {
    settings: { showMarket: true, civTabs: 0, marketTabs: 0, animated: false },
    race: { species: "human" },
  };
  const ids = () =>
    captured
      ? [MAIN_TAB_CONTROL, MARKET_SUB_TAB_CONTROL, MARKET_QUANTITY_CONTROL]
      : [MAIN_TAB_CONTROL, MARKET_SUB_TAB_CONTROL];
  startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: (next) => {
          rootListeners.push(next);
          return () => {};
        },
      },
      controls: {
        resolve: (elementId) =>
          ids().includes(elementId)
            ? { elementId, generation: 1, methods: ["swapTab"] }
            : undefined,
        invoke: (handle, method) => {
          if (method !== "swapTab") {
            return { ok: false, reason: "unknown-method" };
          }
          if (handle.elementId === MARKET_SUB_TAB_CONTROL) {
            swaps.push(swaps.length);
            captured = true;
          }
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ids(),
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          listener = next;
          return () => {};
        },
      },
      mountSuppression: {
        available: true,
        withoutMounting: (draw) => draw(),
        withMountingEnabled: (draw) => draw(),
      },
      uninstall: () => {},
    },
    document: stubDocument(),
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({ masterScriptToggle: true, autoMarket: true }),
      setItem: () => {},
    },
    logError: () => {},
  });
  for (let i = 0; i < 3; i += 1) listener({ periods: 4 });
  assert.equal(swaps.length, 1, "one draw on the original page");

  // A new page: the old control is not authoritative for it.
  root = {
    settings: { showMarket: true, civTabs: 0, marketTabs: 0, animated: false },
    race: { species: "human" },
  };
  captured = false;
  assert.ok(rootListeners.length > 0, "root replacement is observed");
  for (const notify of rootListeners) notify();
  listener({ periods: 4 });
  assert.equal(swaps.length, 2, "the replaced page is discovered again");
}

console.log("captured-discovery-retry ok");
