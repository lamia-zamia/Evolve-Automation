import assert from "node:assert/strict";

import { createProjectSettingsIntentHandler } from "../src/application/project-settings.ts";

const trace = [];
const handler = createProjectSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
    reorderProjects: (projectIds) =>
      trace.push(`reorder:${projectIds.join("|")}`),
  },
  renderSettingsContent: () => trace.push("render"),
  effects: { resetCheckbox: () => trace.push("checkbox:autoARPA") },
});

handler.handle({ type: "reset-project-settings" });
assert.deepEqual(trace, ["reset", "persist", "render", "checkbox:autoARPA"]);

trace.length = 0;
handler.handle({
  type: "reorder-projects",
  projectIds: ["Beta", "Alpha"],
});
assert.deepEqual(trace, ["reorder:Beta|Alpha", "persist"]);

console.log("Project settings application tests passed");
