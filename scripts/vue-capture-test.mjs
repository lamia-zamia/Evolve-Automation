import assert from "node:assert/strict";

import {
  installVueCapture,
  isGameRootShape,
} from "../src/adapters/evolve/vue-capture.ts";

/** Enough of Vue 3 for the three methods the game drives the capture through. */
function makeVue() {
  const proxies = new WeakMap();
  const raws = new WeakMap();
  const vue = {
    reactive(target) {
      assert.equal(this, vue, "the game calls Vue.reactive as a method");
      const existing = proxies.get(target);
      if (existing !== undefined) return existing;
      const proxy = new Proxy(target, {});
      proxies.set(target, proxy);
      raws.set(proxy, target);
      return proxy;
    },
    toRaw(value) {
      return raws.get(value) ?? value;
    },
    createApp(options) {
      return { options, mounted: true };
    },
  };
  return vue;
}

function makeRoot(days) {
  return {
    settings: { expose: false, tabLoad: false },
    resource: { Food: { amount: 10 } },
    race: { species: "human" },
    stats: { days },
  };
}

// --- root shape ------------------------------------------------------------------------------

assert.equal(isGameRootShape(makeRoot(1)), true);
assert.equal(isGameRootShape({ settings: {}, resource: {}, race: {} }), false);
assert.equal(isGameRootShape(null), false);
assert.equal(isGameRootShape("global"), false);
assert.equal(
  isGameRootShape({ settings: 1, resource: {}, race: {}, stats: {} }),
  false,
);

// --- absent globals --------------------------------------------------------------------------

const absent = installVueCapture(undefined);
assert.equal(absent.installed, false);
assert.equal(absent.rootState.readRoot(), undefined);
assert.equal(absent.controls.resolve("city-farm"), undefined);
assert.deepEqual(absent.controls.capturedElementIds(), []);
assert.deepEqual(
  absent.controls.invoke(
    { elementId: "city-farm", generation: 1, methods: [] },
    "action",
  ),
  { ok: false, reason: "unknown-control" },
);
absent.uninstall();

// --- document-start: the accessor wins the race, then hands the name back ----------------------

const page = {};
const capture = installVueCapture(page);
assert.equal(capture.installed, true);
assert.equal(capture.rootState.readRoot(), undefined);

const vue = makeVue();
page.Vue = vue;
assert.equal(
  page.Vue,
  vue,
  "window.Vue reads back as the value the page assigned",
);
assert.equal(
  Object.getOwnPropertyDescriptor(page, "Vue").get,
  undefined,
  "the accessor is replaced by a plain data property once capture is installed",
);

// --- root capture ----------------------------------------------------------------------------

let rootReplacements = 0;
const unsubscribeRoot = capture.rootState.subscribeRootReplaced(() => {
  rootReplacements += 1;
});

const componentData = { title: "Shanty", act: { count: 9 } };
vue.reactive(componentData);
assert.equal(
  capture.rootState.readRoot(),
  undefined,
  "component data is not the root",
);
assert.equal(rootReplacements, 0);

const rawRoot = makeRoot(14);
const rootProxy = vue.reactive(rawRoot);
assert.equal(
  capture.rootState.readRoot(),
  rootProxy,
  "the proxy is captured, not the raw input",
);
assert.notEqual(capture.rootState.readRoot(), rawRoot);
assert.equal(rootReplacements, 1);

// Live: the capture reads through to the game's own object.
rawRoot.stats.days = 15;
assert.equal(capture.rootState.readRoot().stats.days, 15);

// --- offline catch-up is bracketed by toRaw / reactive ----------------------------------------

assert.equal(capture.rootState.isReactivitySuppressed(), false);
vue.toRaw(componentData);
assert.equal(
  capture.rootState.isReactivitySuppressed(),
  false,
  "only the root brackets it",
);
vue.toRaw(rootProxy);
assert.equal(capture.rootState.isReactivitySuppressed(), true);
vue.reactive(rawRoot);
assert.equal(capture.rootState.isReactivitySuppressed(), false);
assert.equal(
  rootReplacements,
  2,
  "re-wrapping the same raw root is still a replacement event",
);
assert.equal(
  capture.rootState.readRoot(),
  rootProxy,
  "Vue caches by raw target, so the proxy identity does not change",
);

unsubscribeRoot();
vue.reactive(rawRoot);
assert.equal(rootReplacements, 2, "unsubscribe stops delivery");

// --- control capture and invocation ------------------------------------------------------------

const calls = [];
function makeActionMethods(id, state) {
  return {
    action(...args) {
      calls.push([id, args]);
      state.count += 1;
      return true;
    },
    on_cap() {
      return state.count;
    },
    // Reaches a sibling through `this`, exactly as the game's power_on does.
    power_on() {
      state.on = Math.min(state.on + 1, this.on_cap());
      return state.on;
    },
    boom() {
      throw new Error("game threw");
    },
  };
}

const farmState = { count: 3, on: 0 };
vue.createApp({
  el: "#city-farm",
  methods: makeActionMethods("farm", farmState),
});
vue.createApp({
  el: "#mainColumn div.content",
  methods: { swapTab: (tab) => tab },
});
vue.createApp({ el: "#noMethods" });
vue.createApp({ el: "#emptyMethods", methods: {} });
vue.createApp({ methods: { orphan: () => 1 } });
vue.createApp("not-an-options-object");

assert.deepEqual(capture.controls.capturedElementIds(), [
  "city-farm",
  "mainColumn div.content",
]);

const farm = capture.controls.resolve("city-farm");
assert.equal(farm.elementId, "city-farm");
assert.equal(farm.generation, 1);
assert.deepEqual([...farm.methods].sort(), [
  "action",
  "boom",
  "on_cap",
  "power_on",
]);

assert.deepEqual(
  capture.controls.invoke(farm, "action", [{ isQueue: false }]),
  {
    ok: true,
    value: true,
  },
);
assert.deepEqual(calls, [["farm", [{ isQueue: false }]]]);
assert.equal(farmState.count, 4);

// `this` is a bag of self-bound siblings: no component data, no DOM node, no effect scope.
assert.deepEqual(capture.controls.invoke(farm, "power_on"), {
  ok: true,
  value: 1,
});

const unknownMethod = capture.controls.invoke(farm, "nope");
assert.equal(unknownMethod.ok, false);
assert.equal(unknownMethod.reason, "unknown-method");

const threw = capture.controls.invoke(farm, "boom");
assert.equal(threw.ok, false);
assert.equal(threw.reason, "threw");
assert.match(threw.detail, /city-farm\.boom: Error: game threw/);

assert.equal(capture.controls.resolve("city-mine"), undefined);

// --- a redraw supersedes the old handle ---------------------------------------------------------

vue.createApp({
  el: "#city-farm",
  methods: makeActionMethods("farm-2", farmState),
});
const redrawn = capture.controls.resolve("city-farm");
assert.equal(redrawn.generation, 2);

const stale = capture.controls.invoke(farm, "action");
assert.equal(stale.ok, false);
assert.equal(
  stale.reason,
  "stale-control",
  "the superseded closure must not run silently",
);
assert.equal(farmState.count, 4, "a rejected stale call has no effect");

assert.deepEqual(capture.controls.invoke(redrawn, "action"), {
  ok: true,
  value: true,
});
assert.equal(farmState.count, 5);
assert.deepEqual(calls.at(-1), ["farm-2", []]);

// --- duplicate installation --------------------------------------------------------------------

const again = installVueCapture(page);
assert.equal(again, capture, "a second install finds the live capture");

const freshPage = {};
const first = installVueCapture(freshPage);
const second = installVueCapture(freshPage);
assert.equal(
  second,
  first,
  "duplicate install before Vue exists also resolves to the first",
);
const freshVue = makeVue();
freshPage.Vue = freshVue;
const freshRoot = makeRoot(1);
freshVue.reactive(freshRoot);
assert.equal(first.rootState.readRoot() !== undefined, true);
assert.equal(second.rootState.readRoot(), first.rootState.readRoot());

// --- teardown ------------------------------------------------------------------------------------

const beforeUninstall = vue.reactive;
capture.uninstall();
assert.notEqual(
  vue.reactive,
  beforeUninstall,
  "uninstall restores the original Vue methods",
);
const afterRoot = makeRoot(99);
vue.reactive(afterRoot);
assert.equal(
  capture.rootState.readRoot(),
  rootProxy,
  "an uninstalled capture stops recording",
);
capture.uninstall();

// After teardown the page can be captured again from scratch.
const reinstalled = installVueCapture(page);
assert.notEqual(reinstalled, capture);
vue.reactive(afterRoot);
assert.equal(reinstalled.rootState.readRoot().stats.days, 99);
reinstalled.uninstall();

// --- capture faults are reported, never thrown at the game ----------------------------------------

const faultPage = {};
const faults = [];
const faulting = installVueCapture(faultPage, {
  isRootCandidate: () => {
    throw new Error("bad predicate");
  },
  onCaptureError: (stage, detail) => faults.push([stage, detail]),
});
const faultVue = makeVue();
faultPage.Vue = faultVue;
const survivor = faultVue.reactive({ ok: true });
assert.equal(
  survivor.ok,
  true,
  "the game still gets its proxy when the capture faults",
);
assert.deepEqual(
  faults.map(([stage]) => stage),
  ["reactive"],
);
faulting.uninstall();

const listenerFaults = [];
const listenerPage = {};
const listenerCapture = installVueCapture(listenerPage, {
  onCaptureError: (stage, detail) => listenerFaults.push([stage, detail]),
});
const listenerVue = makeVue();
listenerPage.Vue = listenerVue;
listenerCapture.rootState.subscribeRootReplaced(() => {
  throw new Error("subscriber threw");
});
let secondListenerRan = false;
listenerCapture.rootState.subscribeRootReplaced(() => {
  secondListenerRan = true;
});
listenerVue.reactive(makeRoot(3));
assert.equal(
  secondListenerRan,
  true,
  "one bad subscriber does not stop the others",
);
assert.deepEqual(
  listenerFaults.map(([stage]) => stage),
  ["root-listener"],
);
listenerCapture.uninstall();

console.log("vue-capture ok");
