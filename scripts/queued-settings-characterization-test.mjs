import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
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

assert.equal(typeof hooks.loadQueuedSettings, "function");
assert.equal(typeof hooks.setQueuedSettingsTestContext, "function");

const trace = [];
const dangers = [];
const queued = { enabled: false, count: "wrong", unknown: true };
const remaining = { enabled: true };
const settings = {
  evolutionQueueEnabled: true,
  evolutionQueueRepeat: true,
  showSettings: true,
};
const settingsRaw = {
  evolutionQueue: [queued, remaining],
  enabled: true,
  count: 3,
};
const state = { evolutionAttempts: 4 };
hooks.setQueuedSettingsTestContext({
  settings,
  settingsRaw,
  state,
  GameLog: { logDanger: (...args) => dangers.push(args) },
  actions: Object.fromEntries(
    [
      "updateOverrides",
      "updateStandAloneSettings",
      "updateStateFromSettings",
      "updateSettingsFromState",
      "removeScriptSettings",
      "buildScriptSettings",
    ].map((name) => [name, () => trace.push(name)]),
  ),
});

hooks.loadQueuedSettings();
assert.equal(state.evolutionAttempts, 5);
assert.equal(settingsRaw.enabled, false);
assert.equal(settingsRaw.count, 3);
assert.equal(settingsRaw.unknown, undefined);
assert.deepEqual(settingsRaw.evolutionQueue, [remaining, queued]);
assert.deepEqual(trace, [
  "updateOverrides",
  "updateStandAloneSettings",
  "updateStateFromSettings",
  "updateSettingsFromState",
  "removeScriptSettings",
  "buildScriptSettings",
]);
assert.equal(dangers.length, 2);
assert.equal(dangers[0][0], "special");
assert.match(dangers[0][1], /settingsRaw\.count type: number/);
assert.match(dangers[1][1], /settingsRaw\.unknown type: undefined/);
assert.deepEqual(JSON.parse(JSON.stringify(dangers[0][2])), [
  "events",
  "major_events",
]);

settings.evolutionQueueEnabled = false;
hooks.loadQueuedSettings();
assert.equal(state.evolutionAttempts, 5);
assert.equal(trace.length, 6);

console.log("Queued settings bundled characterization tests passed");
