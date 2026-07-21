import assert from "node:assert/strict";

import { createGeneralSettingsIntentHandler } from "../src/application/general-settings.ts";

const trace = [];
const intents = createGeneralSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
  effects: {
    resetCheckboxes: () => trace.push("checkboxes"),
  },
});

intents.handle({ type: "reset-general-settings" });

assert.deepEqual(trace, ["reset", "persist", "render", "checkboxes"]);

console.log("General settings application tests passed");
