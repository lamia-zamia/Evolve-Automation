import assert from "node:assert/strict";

import { createStorageSettingsIntentHandler } from "../src/application/storage-settings.ts";

const trace = [];
const handler = createStorageSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
    reorderResources: (resourceIds) =>
      trace.push(`reorder:${resourceIds.join("|")}`),
  },
  renderSettingsContent: () => trace.push("render"),
  effects: {
    resetCheckbox: () => trace.push("checkbox:autoStorage"),
    removeStorageToggles: () => trace.push("cleanup:storage"),
  },
});

handler.handle({ type: "reset-storage-settings" });
assert.deepEqual(trace, [
  "reset",
  "persist",
  "render",
  "checkbox:autoStorage",
  "cleanup:storage",
]);

trace.length = 0;
handler.handle({
  type: "reorder-storage-resources",
  resourceIds: ["Coal", "Iron"],
});
assert.deepEqual(trace, ["reorder:Coal|Iron", "persist"]);

console.log("Storage settings application tests passed");
