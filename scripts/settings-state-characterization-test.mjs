import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const writes = [];
const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: {
    getItem: () => null,
    setItem: (key, value) => writes.push([key, value]),
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
});

assert.equal(typeof hooks.setSettingsStateTestContext, "function");
for (const name of [
  "updateStateFromSettings",
  "updateSettingsFromState",
  "applySettings",
  "migrateSetting",
]) {
  assert.equal(
    typeof hooks.settingsState?.[name],
    "function",
    `${name} missing`,
  );
}

let settingsRaw = {
  existing: true,
  count: "7",
  label: 9,
  overrides: { resetMe: [{ ret: false }], untouched: [{ ret: 1 }] },
  triggers: [],
};
const loaded = [];
let triggerManager = {
  priorityList: [{ stale: true }],
  AddTriggerFromSetting(trigger) {
    loaded.push(trigger);
    this.priorityList.push({ loaded: trigger.id });
  },
};
hooks.setSettingsStateTestContext({ settingsRaw, triggerManager });

hooks.settingsState.applySettings(
  { existing: false, count: 0, label: "", missing: 3 },
  false,
);
assert.deepEqual(
  {
    existing: settingsRaw.existing,
    count: settingsRaw.count,
    label: settingsRaw.label,
    missing: settingsRaw.missing,
  },
  { existing: true, count: 7, label: "9", missing: 3 },
);

hooks.settingsState.applySettings({ resetMe: 4, newValue: "yes" }, true);
assert.equal(settingsRaw.resetMe, 4);
assert.equal(settingsRaw.newValue, "yes");
assert.equal(settingsRaw.overrides.resetMe, undefined);
assert.deepEqual({ ...settingsRaw.overrides.untouched[0] }, { ret: 1 });

settingsRaw.oldValue = 3;
settingsRaw.overrides.oldValue = [{ ret: 2 }, { ret: 5 }];
settingsRaw.overrides.newValue = [{ ret: 11 }];
hooks.settingsState.migrateSetting(
  "oldValue",
  "newValue",
  (value) => value * 10,
);
assert.equal(settingsRaw.oldValue, undefined);
assert.equal(settingsRaw.newValue, 30);
assert.deepEqual(
  Array.from(settingsRaw.overrides.newValue, (entry) => entry.ret),
  [11, 20, 50],
);
assert.equal(settingsRaw.overrides.oldValue, undefined);

settingsRaw.kept = true;
hooks.settingsState.migrateSetting(
  "kept",
  "destination",
  (value) => !value,
  true,
);
assert.equal(settingsRaw.kept, undefined);
assert.equal(settingsRaw.destination, undefined);

const triggerA = { id: "a", nested: { count: 1 } };
const triggerB = { id: "b", nested: { count: 2 } };
settingsRaw.triggers = [triggerA, triggerB];
hooks.settingsState.updateStateFromSettings();
assert.deepEqual(loaded, [triggerA, triggerB]);
assert.deepEqual(
  Array.from(triggerManager.priorityList, (entry) => ({ ...entry })),
  [{ loaded: "a" }, { loaded: "b" }],
);

hooks.settingsState.updateSettingsFromState();
assert.equal(writes.length, 1);
assert.equal(writes[0][0], "settings");
assert.deepEqual(JSON.parse(writes[0][1]).triggers, [
  { loaded: "a" },
  { loaded: "b" },
]);
assert.notEqual(settingsRaw.triggers, triggerManager.priorityList);

console.log("Settings state bundled characterization tests passed");
