import assert from "node:assert/strict";

import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import {
  GOV_TABS_SETTING,
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
  SUB_TAB_CONTROLS,
} from "../src/adapters/evolve/captured-tab-discovery.ts";
import { CAPTURED_MAD_CONTROL } from "../src/adapters/evolve/progression/prestige/captured-mad.ts";

const root = {
  civic: {
    mad: { display: true, armed: true },
    govern: {},
  },
  tech: { mad: 1 },
  race: {},
  stats: {},
  resource: {},
  settings: {
    [MAIN_TAB_SETTING]: 0,
    [GOV_TABS_SETTING]: 0,
    animated: false,
  },
  arpa: {},
};
const mainHandle = {
  elementId: MAIN_TAB_CONTROL,
  generation: 1,
  methods: ["swapTab"],
};
const civicHandle = {
  elementId: SUB_TAB_CONTROLS[GOV_TABS_SETTING],
  generation: 1,
  methods: ["swapTab"],
};
const madHandle = {
  elementId: CAPTURED_MAD_CONTROL,
  generation: 1,
  methods: ["arm", "launch"],
};
let madCaptured = false;
let discoveryInvocations = 0;
let cycle;
const reported = [];
const controls = {
  resolve(elementId) {
    if (elementId === MAIN_TAB_CONTROL) return mainHandle;
    if (elementId === civicHandle.elementId) return civicHandle;
    if (elementId === CAPTURED_MAD_CONTROL && madCaptured) return madHandle;
    return undefined;
  },
  invoke(handle, method) {
    if (handle.elementId === CAPTURED_MAD_CONTROL) {
      return { ok: true, value: undefined };
    }
    if (method !== "swapTab") {
      return { ok: false, reason: "unknown-method" };
    }
    if (root.tech.retry !== 1) {
      return { ok: false, reason: "threw", detail: "temporary draw failure" };
    }
    if (handle.elementId === civicHandle.elementId) {
      madCaptured = true;
      discoveryInvocations += 1;
    }
    return { ok: true, value: undefined };
  },
  capturedElementIds() {
    return madCaptured
      ? [MAIN_TAB_CONTROL, civicHandle.elementId, CAPTURED_MAD_CONTROL]
      : [MAIN_TAB_CONTROL, civicHandle.elementId];
  },
};

const stop = startCapturedRuntime({
  pageCapture: {
    isComplete: () => true,
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        cycle = next;
        return () => {};
      },
    },
    mountSuppression: {
      available: true,
      withoutMounting(draw) {
        draw();
      },
    },
    uninstall: () => {},
  },
  document: { getElementById: () => null },
  mouseEvent: class {},
  storage: {
    getItem() {
      return JSON.stringify({
        masterScriptToggle: true,
        tickRate: 1,
        autoPrestige: true,
        prestigeType: "mad",
      });
    },
  },
  logError: (message) => reported.push(message),
});

assert.equal(typeof cycle, "function");
cycle({ periods: 1 });
const firstDrawFailures = reported.filter((message) =>
  message.startsWith("MAD discovery skipped:"),
);
assert.equal(firstDrawFailures.length, 1);
assert.equal(discoveryInvocations, 0);

// A failed discovery is throttled for this progression epoch, so repeated ticks do not redraw
// the same panel while waiting for the transient page condition to clear.
cycle({ periods: 1 });
assert.equal(discoveryInvocations, 0);
assert.equal(
  reported.filter((message) => message.startsWith("MAD discovery skipped:"))
    .length,
  1,
);

// A progression change opens one retry. The successful draw captures the control, which makes
// later cycles permanently complete without another discovery pass.
root.tech.retry = 1;
cycle({ periods: 1 });
assert.equal(discoveryInvocations, 1);
assert.equal(controls.resolve(CAPTURED_MAD_CONTROL), madHandle);
cycle({ periods: 1 });
assert.equal(discoveryInvocations, 1);
assert.equal(
  reported.filter((message) => message.startsWith("MAD discovery skipped:"))
    .length,
  1,
);

stop();
console.log("captured-mad-discovery ok");
