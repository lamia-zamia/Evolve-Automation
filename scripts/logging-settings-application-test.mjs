import assert from "node:assert/strict";

import { createLoggingSettingsIntentHandler } from "../src/application/logging-settings.ts";

const trace = [];
const handler = createLoggingSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
    setLogFilter: (value) => trace.push(`set:${value}`),
  },
  renderSettingsContent: (prefix) => trace.push(`render:${prefix}`),
  effects: {
    buildFilterRegExp: () => trace.push("filter"),
  },
});

handler.handle({ type: "reset-logging-settings", secondaryPrefix: "x-" });
assert.deepEqual(trace, ["reset", "persist", "render:x-", "filter"]);

trace.length = 0;
handler.handle({ type: "set-log-filter", value: "typed" });
assert.deepEqual(trace, ["set:typed", "filter", "persist"]);

console.log("Logging settings application tests passed");
