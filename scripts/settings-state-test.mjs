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
  storage: { setItem: (key, value) => writes.push([key, value]) },
});

state.applySettings({ count: 0, enabled: true }, false);
assert.equal(settingsRaw.count, 2);
assert.equal(settingsRaw.enabled, true);
state.updateStateFromSettings();
assert.deepEqual(loaded, ["first"]);

settingsRaw = {
  overrides: { old: [{ ret: 4 }] },
  triggers: [{ id: "replacement" }],
  old: 3,
};
loaded = [];
triggerManager = {
  priorityList: [],
  AddTriggerFromSetting(trigger) {
    loaded.push(trigger.id);
    this.priorityList.push({ copied: trigger.id });
  },
};
state.migrateSetting("old", "new", (value) => Number(value) + 1);
assert.equal(settingsRaw.new, 4);
assert.equal(settingsRaw.overrides.new[0].ret, 5);
state.updateStateFromSettings();
assert.deepEqual(loaded, ["replacement"]);
state.updateSettingsFromState();
assert.deepEqual(JSON.parse(writes.at(-1)[1]).triggers, [
  { copied: "replacement" },
]);

console.log("Settings state module tests passed");
