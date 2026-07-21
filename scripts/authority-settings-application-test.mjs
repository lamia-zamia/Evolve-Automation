import assert from "node:assert/strict";

import { createAuthoritySettingsIntentHandler } from "../src/application/authority-settings.ts";

const trace = [];
const intents = createAuthoritySettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
});

intents.handle({ type: "reset-authority-settings" });

assert.deepEqual(trace, ["reset", "persist", "render"]);

console.log("Authority settings application tests passed");
