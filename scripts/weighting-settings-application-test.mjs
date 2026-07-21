import assert from "node:assert/strict";

import { createWeightingSettingsIntentHandler } from "../src/application/weighting-settings.ts";

const trace = [];
const handler = createWeightingSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
});

handler.handle({ type: "reset-weighting-settings" });
assert.deepEqual(trace, ["reset", "persist", "render"]);

console.log("Weighting settings application tests passed");
