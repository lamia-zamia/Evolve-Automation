import assert from "node:assert/strict";

import { createPhaseMeasure } from "../src/utils/performance.ts";

function createSink(enabled) {
  let clock = 0;
  const records = [];
  let nowCalls = 0;
  return {
    records,
    setEnabled(value) {
      enabled = value;
    },
    get nowCalls() {
      return nowCalls;
    },
    readPerformanceEnabled: () => enabled,
    nowMs: () => {
      nowCalls++;
      clock += 5;
      return clock;
    },
    recordPerformance: (phase, durationMs) => records.push([phase, durationMs]),
  };
}

// No diagnostics at all: the action runs once and its result is forwarded.
let runs = 0;
const unmeasured = createPhaseMeasure(undefined);
assert.equal(
  unmeasured("autoBuild.planGate", () => {
    runs++;
    return "planned";
  }),
  "planned",
);
assert.equal(runs, 1);

// Disabled diagnostics never reach the clock, which is the cost the hoisted
// gate exists to avoid on the normal-play path.
const disabled = createSink(false);
const measureDisabled = createPhaseMeasure(disabled);
assert.equal(
  measureDisabled("autoPower.readCycle", () => 42),
  42,
);
assert.deepEqual(disabled.records, []);
assert.equal(disabled.nowCalls, 0);

// Enabled: one record per phase, timed across the action.
const enabled = createSink(true);
const measure = createPhaseMeasure(enabled);
assert.equal(
  measure("autoResearch.read", () => "observation"),
  "observation",
);
assert.deepEqual(enabled.records, [["autoResearch.read", 5]]);
assert.equal(enabled.nowCalls, 2);

// Nested phases each record, and the outer duration spans the inner one.
const nested = createSink(true);
const measureNested = createPhaseMeasure(nested);
measureNested("autoBuild.beginCycle", () => {
  measureNested("autoBuild.beginCycle.readSnapshot", () => undefined);
});
assert.deepEqual(nested.records, [
  ["autoBuild.beginCycle.readSnapshot", 5],
  ["autoBuild.beginCycle", 15],
]);

// A phase that throws is still timed, and the original error propagates.
const throwing = createSink(true);
const measureThrowing = createPhaseMeasure(throwing);
const failure = new Error("click rejected");
assert.throws(
  () =>
    measureThrowing("autoBuild.executeClick", () => {
      throw failure;
    }),
  (error) => error === failure,
);
assert.deepEqual(throwing.records, [["autoBuild.executeClick", 5]]);

// The enabled flag is sampled once per createPhaseMeasure call, so one run
// measures either all of its phases or none of them.
const toggled = createSink(true);
const measureToggled = createPhaseMeasure(toggled);
toggled.setEnabled(false);
measureToggled("autoJobs", () => undefined);
assert.deepEqual(toggled.records, [["autoJobs", 5]]);

const toggledOn = createSink(false);
const measureToggledOn = createPhaseMeasure(toggledOn);
toggledOn.setEnabled(true);
measureToggledOn("autoJobs", () => undefined);
assert.deepEqual(toggledOn.records, []);
// The next run picks the new value up, which is why the helper is called at the
// start of a run rather than where a factory is constructed.
createPhaseMeasure(toggledOn)("autoJobs", () => undefined);
assert.deepEqual(toggledOn.records, [["autoJobs", 5]]);

console.log("Phase measurement tests passed");
