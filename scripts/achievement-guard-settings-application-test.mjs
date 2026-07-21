import assert from "node:assert/strict";

import { createAchievementGuardSettingsIntentHandler } from "../src/application/achievement-guard-settings.ts";

const trace = [];
const intents = createAchievementGuardSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
});

intents.handle({ type: "reset-achievement-guard-settings" });

assert.deepEqual(trace, ["reset", "persist", "render"]);

console.log("Achievement Guard settings application tests passed");
