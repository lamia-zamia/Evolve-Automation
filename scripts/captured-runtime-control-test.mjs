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

console.log("captured-runtime-control ok");
