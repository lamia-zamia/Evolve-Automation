import assert from "node:assert/strict";

import { createInterfaceSettingsIntentHandler } from "../src/application/interface-settings.ts";

const trace = [];
const intents = createInterfaceSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  reader: {
    read: () => ({ activeTargetsUI: true, buildPlannerUI: false }),
  },
  effects: {
    renderSettingsContent: () => trace.push("render"),
    syncActiveTargetsUI: (enabled) => trace.push(`active:${enabled}`),
    syncBuildPlannerUI: (enabled) => trace.push(`planner:${enabled}`),
    updatePrestigeInTopBar: () => trace.push("prestige"),
    updateTotalDaysInTopBar: () => trace.push("days"),
  },
});

intents.handle({ type: "reset-interface-settings" });

assert.deepEqual(trace, [
  "reset",
  "persist",
  "render",
  "active:true",
  "planner:false",
  "prestige",
  "days",
]);

console.log("Interface settings application tests passed");
