import assert from "node:assert/strict";

import { createStateLogSettingsIntentHandler } from "../src/application/state-log-settings.ts";

const trace = [];
const intents = createStateLogSettingsIntentHandler({
  resetToDefaults: () => trace.push("reset"),
  persist: () => trace.push("persist"),
});

intents.handle({ type: "reset-state-log-settings" });

assert.deepEqual(trace, ["reset", "persist"]);

console.log("State Log settings application tests passed");
