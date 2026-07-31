import assert from "node:assert/strict";
import { createOverrideEditor } from "../src/application/override-editing.ts";

let saves = 0;
let settingsRaw;

const editor = createOverrideEditor({
  getSettingsRaw: () => settingsRaw,
  persistence: { save: () => saves++ },
});

// --- An applied edit is written back and persisted once ---
settingsRaw = { autoBuild: true, overrides: {} };
let outcome = editor.applyEdit({
  kind: "add-condition",
  settingKey: "autoBuild",
  result: settingsRaw.autoBuild,
});
assert.equal(outcome.conditionCount, 1);
assert.equal(saves, 1);
assert.equal(settingsRaw.overrides.autoBuild.length, 1);
assert.equal(settingsRaw.overrides.autoBuild[0].ret, true);

// --- The stored condition list is replaced, not edited in place ---
const beforeEdit = settingsRaw.overrides.autoBuild;
editor.applyEdit({
  kind: "set-result",
  settingKey: "autoBuild",
  index: 0,
  result: false,
});
assert.equal(settingsRaw.overrides.autoBuild[0].ret, false);
assert.equal(beforeEdit[0].ret, true);
assert.equal(saves, 2);

// --- Removing the last condition leaves no entry behind ---
outcome = editor.applyEdit({
  kind: "remove-condition",
  settingKey: "autoBuild",
  index: 0,
});
assert.equal(outcome.conditionCount, 0);
assert.deepEqual(settingsRaw.overrides, {});
assert.equal(saves, 3);

// --- An edit that cannot apply neither writes nor persists ---
settingsRaw.overrides = { autoTax: [{ ret: 1 }] };
const untouched = settingsRaw.overrides;
outcome = editor.applyEdit({
  kind: "remove-condition",
  settingKey: "autoBuild",
  index: 0,
});
assert.equal(outcome.conditionCount, 0);
assert.equal(settingsRaw.overrides, untouched);
assert.equal(saves, 3);

// --- The setting's own value goes through the same handler ---
editor.setSettingValue("autoBuild", false);
assert.equal(settingsRaw.autoBuild, false);
assert.equal(saves, 4);

console.log("Override editor application tests passed");
