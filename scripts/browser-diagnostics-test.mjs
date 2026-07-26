import assert from "node:assert/strict";

import { createBrowserDiagnostics } from "../src/adapters/browser/diagnostics.ts";

const performance = {
  now() {
    assert.equal(this, performance);
    return 12.5;
  },
};
const performanceLogs = [];
const browserGlobal = {
  mechDebug: true,
  performance,
  console: {
    log(...values) {
      assert.equal(this, browserGlobal.console);
      performanceLogs.push(values);
    },
  },
};
const diagnostics = createBrowserDiagnostics(browserGlobal);

assert.equal(diagnostics.readMechDebugEnabled(), true);
assert.equal(diagnostics.nowMs(), 12.5);
assert.equal(diagnostics.readPerformanceEnabled(), false);
diagnostics.recordPerformance("tick", 99);
diagnostics.flushPerformance();
assert.equal(performanceLogs.length, 0);
browserGlobal.mechDebug = false;
assert.equal(diagnostics.readMechDebugEnabled(), false);

browserGlobal.eaPerformance = true;
assert.equal(diagnostics.readPerformanceEnabled(), true);
for (let index = 0; index < 25; index++) {
  diagnostics.recordPerformance("tick", 10 + index);
  diagnostics.recordPerformance("updateState", 2);
}
diagnostics.flushPerformance();
assert.equal(performanceLogs.length, 1);
assert.equal(performanceLogs[0][0], "[EA perf] 25 work ticks");
assert.equal(performanceLogs[0][1].tick.count, 25);
assert.equal(performanceLogs[0][1].tick.averageMs, 22);
assert.equal(performanceLogs[0][1].tick.maxMs, 34);
assert.equal(performanceLogs[0][1].updateState.count, 25);

browserGlobal.eaPerformance = false;
diagnostics.recordPerformance("tick", 1);
diagnostics.flushPerformance();
assert.equal(performanceLogs.length, 1);

const malformed = createBrowserDiagnostics({
  mechDebug: "true",
  performance: { now: () => "not-a-number" },
});
assert.equal(malformed.readMechDebugEnabled(), false);
assert.equal(typeof malformed.nowMs(), "number");

const throwing = createBrowserDiagnostics({
  performance: {
    now() {
      throw new Error("broken performance");
    },
  },
});
assert.equal(typeof throwing.nowMs(), "number");

console.log("Browser diagnostics adapter tests passed");
