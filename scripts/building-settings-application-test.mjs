import assert from "node:assert/strict";

import { createBuildingSettingsIntentHandler } from "../src/application/building-settings.ts";

const trace = [];
const handler = createBuildingSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
    resetPriorities: () => trace.push("reset-priorities"),
    reorderBuildings: (ids) => trace.push(`reorder:${ids.join(",")}`),
    setAllAutoBuild: (enabled) => trace.push(`all-build:${enabled}`),
    setAllAutoPower: (enabled) => trace.push(`all-power:${enabled}`),
    setLinkedSmartState: (ids, enabled) =>
      trace.push(`linked:${ids.join(",")}:${enabled}`),
  },
  renderSettingsContent: () => trace.push("render"),
  effects: {
    resetCheckboxes: () => trace.push("checkbox:autoBuild|autoPower"),
    removeBuildingToggles: () => trace.push("cleanup:building"),
  },
});

handler.handle({ type: "reset-building-settings" });
handler.handle({ type: "reset-building-priorities" });
handler.handle({ type: "reorder-buildings", buildingIds: ["city", "mine"] });
handler.handle({ type: "set-all-autobuild", enabled: true });
handler.handle({ type: "set-all-autopower", enabled: false });
handler.handle({
  type: "set-linked-smart-state",
  buildingIds: ["transport", "bireme"],
  enabled: true,
});

assert.deepEqual(trace, [
  "reset",
  "persist",
  "render",
  "checkbox:autoBuild|autoPower",
  "cleanup:building",
  "reset-priorities",
  "persist",
  "render",
  "reorder:city,mine",
  "persist",
  "all-build:true",
  "persist",
  "all-power:false",
  "persist",
  "linked:transport,bireme:true",
  "persist",
]);

console.log("Building settings application tests passed");
