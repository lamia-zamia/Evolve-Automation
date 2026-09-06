import assert from "node:assert/strict";

import { installPageCapture } from "../src/adapters/evolve/page-capture.ts";
import { whenDocumentReady } from "../src/adapters/browser/document-ready.ts";

class FakeWorker {
  constructor(url) {
    this.url = String(url);
    this.registered = [];
  }
  addEventListener(type, listener) {
    this.registered.push({ type, listener });
  }
  removeEventListener() {}
  dispatch(data) {
    for (const entry of [...this.registered]) {
      if (entry.type === "message") entry.listener.call(this, { data });
    }
  }
}

function makeVue() {
  const proxies = new WeakMap();
  const raws = new WeakMap();
  const vue = {
    reactive(target) {
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
    createApp: (options) => ({ options }),
  };
  return vue;
}

// --- the whole capture, in the order a real page produces it ------------------------------------

const page = { Worker: FakeWorker };
const capture = installPageCapture(page);
assert.equal(capture.isComplete(), false);

const vue = makeVue();
page.Vue = vue;
assert.equal(
  capture.isComplete(),
  false,
  "Vue alone is not a complete capture",
);

const root = {
  settings: { expose: false, tabLoad: false },
  resource: { Food: { amount: 1 } },
  race: { species: "human" },
  stats: { days: 14 },
};
vue.reactive(root);
assert.equal(
  capture.isComplete(),
  false,
  "the worker has not been created yet",
);

const worker = new page.Worker("evolve/evolve.js");
assert.equal(capture.isComplete(), true);

const periods = [];
capture.periods.subscribe((period) => periods.push(period.periods));

// The game's listener mutates state, then the notification lands.
worker.addEventListener("message", () => {
  root.stats.days += 1;
});
const daysAtNotification = [];
capture.periods.subscribe(() => {
  daysAtNotification.push(capture.rootState.readRoot().stats.days);
});
worker.dispatch({ loop: "main", periods: 1 });
assert.deepEqual(periods, [1]);
assert.deepEqual(
  daysAtNotification,
  [15],
  "the notification follows the game's mutation",
);

vue.createApp({ el: "#city-farm", methods: { action: () => "built" } });
const farm = capture.controls.resolve("city-farm");
assert.deepEqual(capture.controls.invoke(farm, "action"), {
  ok: true,
  value: "built",
});

// Debug Mode is never involved: nothing here reads window.evolve.
assert.equal(page.evolve, undefined);

// --- a second copy of the script joins the live capture ------------------------------------------

const rejoined = installPageCapture(page);
assert.equal(rejoined, capture, "duplicate install returns the live capture");
assert.equal(
  page.Worker,
  FakeWorker,
  "no second Worker hook is installed beside the first",
);
const rejoinedPeriods = [];
rejoined.periods.subscribe((period) => rejoinedPeriods.push(period.periods));
worker.dispatch({ loop: "main", periods: 2 });
assert.deepEqual(
  rejoinedPeriods,
  [2],
  "the rejoined capture shares the live period source",
);
assert.deepEqual(periods, [1, 2]);

capture.uninstall();
worker.dispatch({ loop: "main", periods: 1 });
assert.deepEqual(periods, [1, 2], "teardown stops the period source");
const afterTeardown = installPageCapture(page);
assert.notEqual(afterTeardown, capture, "teardown clears the page marker");
afterTeardown.uninstall();

// --- a page with neither Vue nor Worker still yields working ports ---------------------------------

const bare = installPageCapture({});
assert.equal(bare.isComplete(), false);
assert.equal(bare.rootState.readRoot(), undefined);
assert.deepEqual(bare.controls.capturedElementIds(), []);
bare.periods.subscribe(() => assert.fail("nothing to notify"));
bare.uninstall();

installPageCapture(undefined).uninstall();

// --- document-ready ---------------------------------------------------------------------------------

let ran = 0;
whenDocumentReady({}, () => ran++);
assert.equal(ran, 1, "no document: start immediately");

whenDocumentReady({ document: { readyState: "complete" } }, () => ran++);
assert.equal(ran, 2);

whenDocumentReady({ document: { readyState: "loading" } }, () => ran++);
assert.equal(ran, 3, "a document that cannot register a listener still starts");

const listeners = [];
const loadingDocument = {
  readyState: "loading",
  addEventListener(type, listener, options) {
    listeners.push({ type, listener, options });
  },
};
whenDocumentReady({ document: loadingDocument }, () => ran++);
assert.equal(ran, 3, "still parsing: deferred");
assert.equal(listeners.length, 1);
assert.equal(listeners[0].type, "DOMContentLoaded");
assert.deepEqual(listeners[0].options, { once: true });
listeners[0].listener();
assert.equal(ran, 4);

console.log("page-capture ok");
