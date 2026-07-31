import assert from "node:assert/strict";
import { createOverrideEffectiveValueDisplay } from "../src/adapters/browser/override-display.ts";

const selectors = [];
let matchCount = 0;
let refreshed = null;

const display = createOverrideEffectiveValueDisplay({
  getJQuery: () => (selector) => {
    selectors.push(selector);
    return { length: matchCount, selector };
  },
  changeDisplayInputNode: (node) => (refreshed = node),
});

// --- Nothing is refreshed while the editor's current-value field is off screen ---
display.publish();
assert.deepEqual(selectors, ["#script_override_true_value:visible"]);
assert.equal(refreshed, null);

// --- The matched node is handed to the editor's own refresh ---
matchCount = 1;
display.publish();
assert.ok(refreshed);
assert.equal(refreshed.selector, "#script_override_true_value:visible");

console.log("Override effective-value display adapter tests passed");
