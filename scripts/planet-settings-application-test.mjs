import assert from "node:assert/strict";

import { createPlanetSettingsIntentHandler } from "../src/application/planet-settings.ts";

const trace = [];
const handler = createPlanetSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
});

handler.handle({ type: "reset-planet-settings" });
assert.deepEqual(trace, ["reset", "persist", "render"]);

console.log("Planet settings application tests passed");
