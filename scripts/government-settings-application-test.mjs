import assert from "node:assert/strict";

import { createGovernmentSettingsIntentHandler } from "../src/application/government-settings.ts";

const trace = [];
const handler = createGovernmentSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: (prefix) => trace.push(`render:${prefix}`),
  effects: {
    resetCheckboxes: () => trace.push("checkbox:autoTax|autoGovernment"),
  },
});

handler.handle({ type: "reset-government-settings", secondaryPrefix: "x-" });
assert.deepEqual(trace, [
  "reset",
  "persist",
  "render:x-",
  "checkbox:autoTax|autoGovernment",
]);

console.log("Government settings application tests passed");
