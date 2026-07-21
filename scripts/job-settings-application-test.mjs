import assert from "node:assert/strict";

import { createJobSettingsIntentHandler } from "../src/application/job-settings.ts";

const trace = [];
const handler = createJobSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
    resetPriorities: () => trace.push("reset-priorities"),
    reorderJobs: (jobIds) => trace.push(`reorder:${jobIds.join(",")}`),
  },
  renderSettingsContent: () => trace.push("render"),
  effects: {
    resetCheckboxes: () => trace.push("checkbox:autoJobs|autoCraftsmen"),
  },
});

handler.handle({ type: "reset-job-settings" });
handler.handle({ type: "reset-job-priorities" });
handler.handle({ type: "reorder-jobs", jobIds: ["farmer", "forager"] });
assert.deepEqual(trace, [
  "reset",
  "persist",
  "render",
  "checkbox:autoJobs|autoCraftsmen",
  "reset-priorities",
  "persist",
  "render",
  "reorder:farmer,forager",
  "persist",
]);

console.log("Job settings application tests passed");
