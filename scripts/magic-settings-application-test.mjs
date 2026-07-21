import assert from "node:assert/strict";

import { createMagicSettingsIntentHandler } from "../src/application/magic-settings.ts";

const trace = [];
const handler = createMagicSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
  effects: {
    resetCheckboxes: () =>
      trace.push("checkbox:autoAlchemy|autoPylon|magicFullmetalHelper"),
  },
});

handler.handle({ type: "reset-magic-settings" });
assert.deepEqual(trace, [
  "reset",
  "persist",
  "render",
  "checkbox:autoAlchemy|autoPylon|magicFullmetalHelper",
]);

console.log("Magic settings application tests passed");
