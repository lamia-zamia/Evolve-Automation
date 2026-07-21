import assert from "node:assert/strict";

import { createChallengeHelperSettingsIntentHandler } from "../src/application/challenge-helper-settings.ts";

const trace = [];
const intents = createChallengeHelperSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
});

intents.handle({ type: "reset-challenge-helper-settings" });

assert.deepEqual(trace, ["reset", "persist", "render"]);

console.log("Challenge Helper settings application tests passed");
