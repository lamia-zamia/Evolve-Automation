import assert from "node:assert/strict";

import { createBrowserDiagnostics } from "../src/adapters/browser/diagnostics.ts";

const performance = {
  now() {
    assert.equal(this, performance);
    return 12.5;
  },
};
const browserGlobal = { mechDebug: true, performance };
const diagnostics = createBrowserDiagnostics(browserGlobal);

assert.equal(diagnostics.readMechDebugEnabled(), true);
assert.equal(diagnostics.nowMs(), 12.5);
browserGlobal.mechDebug = false;
assert.equal(diagnostics.readMechDebugEnabled(), false);

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
