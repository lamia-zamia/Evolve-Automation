import assert from "node:assert/strict";

import { createStateLogSettingsIntentHandler } from "../src/application/state-log-settings.ts";

const trace = [];
const intents = createStateLogSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
});

intents.handle({ type: "reset-state-log-settings" });

// The handler owns the whole sequence, and renders once: the browser adapter's
// reset callback only emits the intent.
assert.deepEqual(trace, ["reset", "persist", "render"]);

console.log("State Log settings application tests passed");
