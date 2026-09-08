import assert from "node:assert/strict";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";

let listener;
let unsubscribeCount = 0;
let storageValue = null;
const errors = [];

const stop = startCapturedRuntime({
  pageCapture: {
    isComplete: () => true,
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
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        listener = next;
        return () => unsubscribeCount++;
      },
    },
    mountSuppression: { available: false, withoutMounting: () => undefined },
    uninstall: () => {},
  },
  document: {},
  mouseEvent: class {},
  storage: {
    getItem() {
      return storageValue;
    },
  },
  logError: (message) => errors.push(message),
});

assert.equal(typeof listener, "function");

// A fresh install inherits the game's defaults: the captured runtime must not start an
// automation family merely because the script settings key is absent.
listener({ periods: 1 });
assert.deepEqual(errors, []);

storageValue = JSON.stringify({
  masterScriptToggle: false,
  autoResearch: true,
});
listener({ periods: 1 });
assert.deepEqual(errors, []);

stop();
assert.equal(unsubscribeCount, 1);

// The persisted settings must reach the construction policy: without them no managed building is
// ever a candidate and autoBuild silently builds nothing.
{
  const invoked = [];
  const root = {
    race: {},
    tech: {},
    city: { cottage: { count: 0 } },
    space: {},
    queue: { display: true, pause: false, queue: [] },
    r_queue: { display: false, pause: false, queue: [] },
    settings: {},
    resource: {
      Money: { amount: 0, max: 100000, display: true, diff: 0, name: "$" },
    },
  };
  const handles = new Map(
    ["buildQueue", "city-cottage"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: ["setData", "action"] },
    ]),
  );
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (id) => handles.get(id),
        invoke: (handle, method) => {
          invoked.push(`${handle.elementId}.${method}`);
          return method === "setData"
            ? { ok: true, value: { "res-Money": 500 } }
            : { ok: true, value: undefined };
        },
        capturedElementIds: () => [...handles.keys()],
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: true,
          "batcity-cottage": true,
          "bld_w_city-cottage": 100,
        }),
    },
    logError: () => {},
  });
  cycle({ periods: 1 });
  stopCycle();
  assert.ok(
    invoked.includes("buildQueue.setData"),
    `the construction cycle never priced the managed building: ${JSON.stringify(invoked)}`,
  );
}

// A candidate the cycle cannot supply is reported, and reported once rather than every period.
{
  const reported = [];
  const root = {
    race: {},
    tech: {},
    city: {},
    space: {},
    queue: { display: true, pause: false, queue: [] },
    settings: {},
    resource: {},
  };
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: () => undefined,
        invoke: () => ({ ok: false, reason: "unknown-control" }),
        capturedElementIds: () => ["city-cottage"],
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: true,
          "batcity-cottage": true,
        }),
    },
    logError: (message) => reported.push(message),
  });
  cycle({ periods: 1 });
  cycle({ periods: 1 });
  stopCycle();
  const skipped = reported.filter((message) =>
    message.includes("city-cottage"),
  );
  assert.deepEqual(skipped, [
    "progression skipped city-cottage: captured city state is unavailable",
  ]);
}

// What the cycle is saving for is held back from the cheaper candidates that arrive after it: the
// expensive target is unaffordable, and the cheap one must not spend the money it is accumulating.
{
  const invoked = [];
  const root = {
    race: {},
    tech: {},
    city: { bank: { count: 0 }, farm: { count: 0 } },
    space: {},
    queue: { display: true, pause: false, queue: [] },
    settings: {},
    resource: {
      Money: { amount: 600, max: 10000, display: true, diff: 0, name: "$" },
    },
  };
  const prices = { "city-bank": 5000, "city-farm": 500 };
  const handles = new Map(
    ["buildQueue", "city-bank", "city-farm"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: ["setData", "action"] },
    ]),
  );
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (id) => handles.get(id),
        invoke: (handle, method, args = []) => {
          if (method === "setData") {
            const entry = root.queue.queue[args[0]];
            return { ok: true, value: { "res-Money": prices[entry.id] } };
          }
          invoked.push(handle.elementId);
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => [...handles.keys()],
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: true,
          "batcity-bank": true,
          "bld_w_city-bank": 300,
          "batcity-farm": true,
          "bld_w_city-farm": 100,
        }),
    },
    logError: () => {},
  });
  // The first cycle has no reservation in force yet, so the cheap candidate is still bought.
  cycle({ periods: 1 });
  assert.deepEqual(invoked, ["city-farm"]);
  // The bank is now the published saving target, and its cost holds the farm back.
  cycle({ periods: 1 });
  cycle({ periods: 1 });
  stopCycle();
  assert.deepEqual(invoked, ["city-farm"]);
}

console.log("captured-runtime-control ok");
