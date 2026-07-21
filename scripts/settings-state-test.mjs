import assert from "node:assert/strict";

import { createSettingsState } from "../src/settings/state.ts";

const writes = [];
let settingsRaw = {
  overrides: {},
  triggers: [{ id: "first" }],
  count: "2",
};
let loaded = [];
let triggerManager = {
  priorityList: [],
  AddTriggerFromSetting(trigger) {
    loaded.push(trigger.id);
    this.priorityList.push({ id: trigger.id });
  },
};
const state = createSettingsState({
  getSettingsRaw: () => settingsRaw,
  getTriggerManager: () => triggerManager,
  settingsStore: {
    save: (record) => writes.push(["settings", JSON.stringify(record)]),
  },
});

state.updateStateFromSettings();
assert.deepEqual(loaded, ["first"]);

settingsRaw = {
  overrides: {},
  triggers: [{ id: "replacement" }],
};
loaded = [];
triggerManager = {
  priorityList: [],
  AddTriggerFromSetting(trigger) {
    loaded.push(trigger.id);
    this.priorityList.push({ copied: trigger.id });
  },
};
state.updateStateFromSettings();
assert.deepEqual(loaded, ["replacement"]);
state.updateSettingsFromState();
assert.deepEqual(JSON.parse(writes.at(-1)[1]).triggers, [
  { copied: "replacement" },
]);

console.log("Settings state module tests passed");
