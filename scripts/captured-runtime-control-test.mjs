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

console.log("captured-runtime-control ok");
