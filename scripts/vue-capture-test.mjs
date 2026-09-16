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
    settings: { expose: false },
    resource: { Food: { amount: 10 } },
    race: { species: "human" },
    stats: { days },
    tech: {},
    city: {},
    civic: {},
  };
}

// --- root shape ------------------------------------------------------------------------------

assert.equal(isGameRootShape(makeRoot(1)), true);
const initialRoot = makeRoot(0);
delete initialRoot.settings;
assert.equal(
  isGameRootShape(initialRoot),
  true,
  "DeadSpace adds settings after the first fresh-game reactive call",
);
assert.equal(isGameRootShape({ settings: {}, resource: {}, race: {} }), false);
assert.equal(isGameRootShape(null), false);
assert.equal(isGameRootShape("global"), false);
assert.equal(isGameRootShape({ ...makeRoot(1), tech: 1 }), false);

// --- absent globals --------------------------------------------------------------------------

const absent = installVueCapture(undefined);
assert.equal(absent.installed, false);
assert.equal(absent.rootState.readRoot(), undefined);
assert.equal(absent.controls.resolve("city-farm"), undefined);
assert.deepEqual(absent.controls.capturedElementIds(), []);
assert.deepEqual(absent.controlUsage.readUsage(), []);
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

// A compound selector keeps its whole text: the leading id does not name what was bound.
assert.deepEqual(capture.controls.capturedElementIds(), [
  "city-farm",
  "#mainColumn div.content",
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
assert.deepEqual(capture.controlUsage.readUsage(), [
  { elementId: "city-farm", method: "action", returned: 1, threw: 0 },
]);

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
assert.deepEqual(capture.controlUsage.readUsage(), [
  { elementId: "city-farm", method: "action", returned: 1, threw: 0 },
  { elementId: "city-farm", method: "power_on", returned: 1, threw: 0 },
  { elementId: "city-farm", method: "boom", returned: 0, threw: 1 },
]);

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
assert.deepEqual(capture.controlUsage.readUsage(), [
  { elementId: "city-farm", method: "action", returned: 2, threw: 0 },
  { elementId: "city-farm", method: "power_on", returned: 1, threw: 0 },
  { elementId: "city-farm", method: "boom", returned: 0, threw: 1 },
]);

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

// --- scoped mount suppression --------------------------------------------------------------------

{
  const suppressPage = {};
  const suppressFaults = [];
  const suppressCapture = installVueCapture(suppressPage, {
    onCaptureError: (stage, detail) => suppressFaults.push([stage, detail]),
  });
  assert.equal(
    suppressCapture.mountSuppression.available,
    false,
    "there is nothing to suppress before the page's Vue arrives",
  );

  const realApps = [];
  const suppressVue = makeVue();
  suppressVue.createApp = (options) => {
    const app = {
      options,
      used: [],
      mountedOn: undefined,
      unmounted: false,
      use(plugin) {
        app.used.push(plugin);
        return app;
      },
      mount(el) {
        app.mountedOn = el;
        return { $forceUpdate: () => {} };
      },
      unmount() {
        app.unmounted = true;
      },
    };
    realApps.push(app);
    return app;
  };
  suppressPage.Vue = suppressVue;
  assert.equal(suppressCapture.mountSuppression.available, true);

  // What `vBind` does with the app it is handed, inside the scope and out.
  function bind(el, methods) {
    const app = suppressPage.Vue.createApp({ el, methods });
    const usedResult = app.use({ name: "Buefy" });
    const proxy = app.mount({ id: el });
    return { app, usedResult, proxy };
  }

  const before = bind("#city-farm", { action: () => "built" });
  assert.equal(
    realApps.length,
    1,
    "outside the scope Vue mounts as it always did",
  );

  const clicks = [];
  const inside = suppressCapture.mountSuppression.withoutMounting(() =>
    bind("#tech-mining", { action: () => clicks.push("tech-mining") }),
  );

  // Nothing was compiled or mounted, and `vBind` still got everything it reads back.
  assert.equal(realApps.length, 1, "the temporary component never reached Vue");
  assert.equal(
    inside.usedResult,
    inside.app,
    "use() chains, the way Vue's does",
  );
  assert.notEqual(
    inside.proxy,
    undefined,
    "mount() answers a proxy to store on the element",
  );
  assert.equal(typeof inside.proxy.$forceUpdate, "function");
  assert.equal(
    inside.app[Symbol.for("evolve-automation.disposable-vue-app")],
    true,
  );
  assert.doesNotThrow(() => inside.app.unmount());

  // The point of the scope: the game-owned closures are recorded exactly as they are outside it.
  const mining = suppressCapture.controls.resolve("tech-mining");
  assert.equal(mining.generation, 1);
  assert.deepEqual(suppressCapture.controls.invoke(mining, "action"), {
    ok: true,
    value: 1,
  });
  assert.deepEqual(clicks, ["tech-mining"]);

  // And the scope ended with it: what comes after is the page's own Vue again.
  bind("#mTabResource", { swapTab: (tab) => tab });
  assert.equal(realApps.length, 2);
  assert.equal(realApps[1].options.el, "#mTabResource");
  assert.equal(before.app.unmounted, false);

  // Nesting: mounting resumes when the outermost scope ends, not the first.
  suppressCapture.mountSuppression.withoutMounting(() => {
    suppressCapture.mountSuppression.withoutMounting(() => {
      bind("#tech-a", { action: () => 1 });
    });
    bind("#tech-b", { action: () => 1 });
  });
  assert.equal(realApps.length, 2, "both nested draws stayed unmounted");
  bind("#tech-c", { action: () => 1 });
  assert.equal(realApps.length, 3);

  // An exception unwinds the scope rather than leaving the page unable to mount.
  assert.throws(
    () =>
      suppressCapture.mountSuppression.withoutMounting(() => {
        throw new Error("draw exploded");
      }),
    /draw exploded/,
  );
  bind("#tech-d", { action: () => 1 });
  assert.equal(realApps.length, 4);

  // A second copy of the script joins the live capture, so it shares the one scope instead of
  // opening a second one over the same Vue.
  const rejoined = installVueCapture(suppressPage);
  assert.equal(rejoined.mountSuppression, suppressCapture.mountSuppression);
  rejoined.mountSuppression.withoutMounting(() => {
    suppressCapture.mountSuppression.withoutMounting(() => {
      bind("#tech-e", { action: () => 1 });
    });
    bind("#tech-f", { action: () => 1 });
  });
  assert.equal(realApps.length, 4);

  // The scope can watch what the game binds inside it, which is the only handle on the middle of
  // a draw: the game creates a panel's containers and fills them in one call.
  const boundInside = [];
  suppressCapture.mountSuppression.withoutMounting(
    () => {
      bind("#resContent", { label_f: () => "old" });
      bind("#tech-mining", { action: () => 1 });
    },
    { onComponentBound: (selector) => boundInside.push(selector) },
  );
  assert.deepEqual(boundInside, ["#resContent", "#tech-mining"]);
  assert.equal(realApps.length, 4, "watching is not mounting");

  // A nested scope's observer does not miss what the outer one sees, and neither throws at the game.
  const outer = [];
  const inner = [];
  const watched = suppressCapture;
  watched.mountSuppression.withoutMounting(
    () => {
      bind("#outerOnly", { action: () => 1 });
      watched.mountSuppression.withoutMounting(
        () => {
          bind("#nested", { action: () => 1 });
        },
        { onComponentBound: (selector) => inner.push(selector) },
      );
    },
    {
      onComponentBound: (selector) => {
        outer.push(selector);
        throw new Error("observer exploded");
      },
    },
  );
  assert.deepEqual(outer, ["#outerOnly", "#nested"]);
  assert.deepEqual(inner, ["#nested"]);
  assert.equal(
    realApps.length,
    4,
    "a throwing observer still suppressed the mount",
  );
  assert.deepEqual(
    suppressFaults.map(([stage]) => stage),
    ["component-bound", "component-bound"],
  );
  // And the controls it was watching were captured all the same.
  assert.notEqual(watched.controls.resolve("nested"), undefined);

  suppressCapture.uninstall();
  assert.equal(suppressCapture.mountSuppression.available, false);
  assert.throws(
    () => suppressCapture.mountSuppression.withoutMounting(() => 1),
    /cannot be suppressed/,
  );
}

{
  // No page at all: an inert capture says so rather than pretending it suppressed anything.
  const inert = installVueCapture(undefined);
  assert.equal(inert.mountSuppression.available, false);
  assert.throws(
    () => inert.mountSuppression.withoutMounting(() => 1),
    /cannot be suppressed/,
  );
  assert.throws(
    () => inert.mountSuppression.withMountingEnabled(() => 1),
    /cannot be re-enabled/,
  );
}

// --- letting one component through a suppressed scope --------------------------------------------

// A Buefy programmatic modal creates a second, selectorless Vue app from inside the mounted
// Foreign component. The escape must reach the real Vue createApp while the Foreign scratch app
// remains the only app owned by the discovery scope.
{
  const page = {};
  const capture = installVueCapture(page);
  const realApps = [];
  let trigger;
  const vue = makeVue();
  vue.createApp = (options) => {
    const app = {
      options,
      mountedOn: undefined,
      unmounted: false,
      use: () => app,
      mount(el) {
        app.mountedOn = el;
        if (options.el === "#foreign") {
          trigger = {
            click() {
              const buefyModal = page.Vue.createApp({ component: "modal" });
              buefyModal.use({ name: "Buefy" }).mount({ id: "modalBox" });
              page.Vue.createApp({
                el: "#espModal",
                methods: { influence: () => "captured" },
              }).mount({ id: "espModal" });
            },
          };
        }
        return { $forceUpdate: () => {} };
      },
      unmount() {
        app.unmounted = true;
      },
    };
    realApps.push(app);
    return app;
  };
  page.Vue = vue;

  capture.mountSuppression.withoutMounting(
    () => {
      const foreign = page.Vue.createApp({
        el: "#foreign",
        methods: { trigModal: () => {} },
      });
      foreign.mount({ id: "foreign" });
      assert.notEqual(trigger, undefined);
      capture.mountSuppression.withMountingEnabled(() => trigger.click());
      const stillSuppressed = page.Vue.createApp({
        el: "#foreign-row",
        methods: { action: () => {} },
      });
      stillSuppressed.mount({ id: "foreign-row" });
      assert.equal(
        stillSuppressed[Symbol.for("evolve-automation.disposable-vue-app")],
        true,
      );
    },
    { shouldMount: (selector) => selector === "#foreign" },
  );

  assert.equal(realApps.length, 3);
  assert.equal(realApps[0].unmounted, true, "scratch Foreign app is scoped");
  assert.equal(
    realApps[1][Symbol.for("evolve-automation.disposable-vue-app")],
    undefined,
    "Buefy's selectorless app mounts for real",
  );
  assert.equal(realApps[1].mountedOn.id, "modalBox");
  assert.equal(realApps[2].mountedOn.id, "espModal");
  assert.notEqual(
    capture.controls.resolve("espModal"),
    undefined,
    "the modal vBind is captured during the mounting escape",
  );
  assert.equal(realApps[1].unmounted, false);
  assert.equal(realApps[2].unmounted, false);
  capture.uninstall();
}

{
  const page = {};
  const faults = [];
  const capture = installVueCapture(page, {
    onCaptureError: (stage, detail) => faults.push([stage, detail]),
  });
  const realApps = [];
  const vue = makeVue();
  vue.createApp = (options) => {
    const app = {
      options,
      unmounted: false,
      use: () => app,
      mount: () => ({ $forceUpdate: () => {} }),
      unmount() {
        app.unmounted = true;
      },
    };
    realApps.push(app);
    return app;
  };
  page.Vue = vue;
  const bind = (el) => page.Vue.createApp({ el, methods: { action: () => 1 } });

  const asked = [];
  const scope = {
    shouldMount: (selector) => {
      asked.push(selector);
      return selector === "#mTabCivil";
    },
  };

  let parent;
  let row;
  capture.mountSuppression.withoutMounting(() => {
    // The panel whose render creates the containers the draw needs.
    parent = bind("#mTabCivil");
    // One of the hundreds of rows that render into them.
    row = bind("#city-factory");
  }, scope);

  assert.deepEqual(asked, ["#mTabCivil", "#city-factory"]);
  assert.equal(realApps.length, 1, "only the named component reached Vue");
  assert.equal(realApps[0], parent);
  assert.equal(
    row[Symbol.for("evolve-automation.disposable-vue-app")],
    true,
    "the action row is still suppressed",
  );
  // The parent came down with the scope: an app left mounted on a discarded node keeps its
  // reactive effects alive and re-renders for the rest of the session.
  assert.equal(parent.unmounted, true);
  // Both are captured either way, which is the whole point of recording from the options.
  assert.notEqual(capture.controls.resolve("city-factory"), undefined);
  assert.notEqual(capture.controls.resolve("mTabCivil"), undefined);
  assert.deepEqual(faults, []);

  // A scope that names nothing suppresses everything, as before.
  realApps.length = 0;
  capture.mountSuppression.withoutMounting(() => bind("#mTabCivil"));
  assert.deepEqual(realApps, []);

  // A draw that throws still takes down what it was allowed to mount.
  realApps.length = 0;
  assert.throws(
    () =>
      capture.mountSuppression.withoutMounting(() => {
        bind("#mTabCivil");
        throw new Error("draw exploded");
      }, scope),
    /draw exploded/,
  );
  assert.equal(realApps.length, 1);
  assert.equal(realApps[0].unmounted, true);

  // A nested scope's allowance ends with that scope, not with the outer one.
  realApps.length = 0;
  capture.mountSuppression.withoutMounting(() => {
    capture.mountSuppression.withoutMounting(() => bind("#mTabCivil"), scope);
    assert.equal(realApps.length, 1);
    assert.equal(
      realApps[0].unmounted,
      true,
      "unmounted when its own scope ended",
    );
    // The outer scope named nothing, so this one stays suppressed.
    bind("#mTabCivil");
    assert.equal(realApps.length, 1);
  });

  // A predicate that throws is a capture fault, not a mounted component.
  realApps.length = 0;
  capture.mountSuppression.withoutMounting(() => bind("#mTabCivil"), {
    shouldMount: () => {
      throw new Error("bad predicate");
    },
  });
  assert.deepEqual(realApps, []);
  assert.deepEqual(
    faults.map(([stage]) => stage),
    ["should-mount"],
  );
  capture.uninstall();
}

// --- the data a binding carries -----------------------------------------------------------------

/** A page whose Vue is already attached, so each case below binds against a fresh registry. */
function makeBoundPage() {
  const host = {};
  const capture = installVueCapture(host);
  host.Vue = makeVue();
  return { page: host, capture };
}

// `vBind` rewrites the options before `Vue.createApp` sees them: `data: {...}` becomes a factory
// returning `Vue.reactive(original)`. Recording the options verbatim therefore captures a function
// for every component the game binds, and reading a field off it answers `undefined` — silently,
// and for all of them at once. The registry calls the factory instead.
{
  const { page, capture } = makeBoundPage();
  const act = { on: 3, count: 7 };
  const original = { title: "Factory", act };
  page.Vue.createApp({
    el: "#city-factory",
    // What vBind actually hands over.
    data() {
      return page.Vue.reactive(original);
    },
    methods: { on_cap: () => 7 },
  });
  const handle = capture.controls.resolve("city-factory");
  assert.equal(
    handle.data.act,
    act,
    "the row's own state object, not the factory",
  );
  assert.equal(handle.data.title, "Factory");
  capture.uninstall();
}

// The factory is called once per binding, and only for a caller that asks for the data: a handle
// resolved to invoke a method must not run arbitrary component code.
{
  const { page, capture } = makeBoundPage();
  let calls = 0;
  page.Vue.createApp({
    el: "#city-farm",
    data() {
      calls += 1;
      return { act: { count: 1 } };
    },
    methods: { on_cap: () => 1 },
  });
  const handle = capture.controls.resolve("city-farm");
  assert.equal(calls, 0, "resolving alone must not run the factory");
  capture.controls.invoke(handle, "on_cap");
  assert.equal(calls, 0, "invoking a method must not run the factory");
  void handle.data;
  void capture.controls.resolve("city-farm").data;
  assert.equal(calls, 1, "materialized once and remembered");
  capture.uninstall();
}

// A redraw rebinds the row with fresh data, so the remembered value goes with the old generation.
{
  const { page, capture } = makeBoundPage();
  const first = { act: { count: 1 } };
  const second = { act: { count: 2 } };
  const bind = (data) =>
    page.Vue.createApp({
      el: "#city-mine",
      data: () => data,
      methods: { on_cap: () => 1 },
    });
  bind(first);
  assert.equal(capture.controls.resolve("city-mine").data, first);
  bind(second);
  assert.equal(capture.controls.resolve("city-mine").data, second);
  capture.uninstall();
}

// A plain data object is still a plain data object, and a factory that throws leaves no data
// rather than failing the caller.
{
  const { page, capture } = makeBoundPage();
  const plain = { act: { count: 4 } };
  page.Vue.createApp({
    el: "#city-bank",
    data: plain,
    methods: { on_cap: () => 1 },
  });
  assert.equal(capture.controls.resolve("city-bank").data, plain);
  page.Vue.createApp({
    el: "#city-mill",
    data() {
      throw new Error("no");
    },
    methods: { on_cap: () => 1 },
  });
  assert.equal(capture.controls.resolve("city-mill").data, undefined);
  capture.uninstall();
}

console.log("vue-capture ok");
