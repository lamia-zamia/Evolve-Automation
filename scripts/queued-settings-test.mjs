import assert from "node:assert/strict";

import { createQueuedSettings } from "../src/settings/queued-settings.ts";

let settings = {
  evolutionQueueEnabled: true,
  evolutionQueueRepeat: false,
  showSettings: false,
};
let settingsRaw = {
  evolutionQueue: [{ enabled: false }],
  enabled: true,
};
let state = { evolutionAttempts: 0 };
const trace = [];
const queuedSettings = createQueuedSettings({
  getSettings: () => settings,
  getSettingsRaw: () => settingsRaw,
  getState: () => state,
  getGameLog: () => ({ logDanger: (...args) => trace.push(args) }),
  getUpdateOverrides: () => () => trace.push("overrides"),
  getUpdateStandAloneSettings: () => () => trace.push("standalone"),
  getUpdateStateFromSettings: () => () => trace.push("state-from"),
  getUpdateSettingsFromState: () => () => trace.push("settings-from"),
  getRemoveScriptSettings: () => () => trace.push("remove"),
  getBuildScriptSettings: () => () => trace.push("build"),
});

queuedSettings.loadQueuedSettings();
assert.equal(settingsRaw.enabled, false);
assert.equal(state.evolutionAttempts, 1);
assert.deepEqual(trace, [
  "overrides",
  "standalone",
  "state-from",
  "settings-from",
]);

settings = {
  evolutionQueueEnabled: true,
  evolutionQueueRepeat: true,
  showSettings: true,
};
settingsRaw = { evolutionQueue: [{ enabled: true }], enabled: false };
state = { evolutionAttempts: 5 };
trace.length = 0;
queuedSettings.loadQueuedSettings();
assert.equal(settingsRaw.enabled, true);
assert.equal(settingsRaw.evolutionQueue.length, 1);
assert.equal(state.evolutionAttempts, 6);
assert.deepEqual(trace.slice(-2), ["remove", "build"]);

console.log("Queued settings module tests passed");
