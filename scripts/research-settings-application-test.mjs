import assert from "node:assert/strict";

import { createResearchSettingsIntentHandler } from "../src/application/research-settings.ts";

const trace = [];
const handler = createResearchSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
  effects: {
    resetCheckbox: () => trace.push("checkbox:autoResearch"),
  },
});

handler.handle({ type: "reset-research-settings" });

assert.deepEqual(trace, [
  "reset",
  "persist",
  "render",
  "checkbox:autoResearch",
]);
console.log("Research settings application tests passed");
