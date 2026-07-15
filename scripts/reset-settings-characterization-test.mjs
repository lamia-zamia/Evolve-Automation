import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null, setItem() {} },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

const resets = hooks.resetSettings;
assert.equal(Object.keys(resets).length, 27);

for (const reset of Object.values(resets)) {
  assert.equal(typeof reset, "function");
  assert.equal(reset.length, 1);
}

const settingsRaw = { overrides: {}, triggers: [] };
hooks.setSettingsStateTestContext({
  settingsRaw,
  triggerManager: { priorityList: [], AddTriggerFromSetting() {} },
});
for (const name of [
  "resetWarSettings",
  "resetHellSettings",
  "resetGeneralSettings",
  "resetInterfaceSettings",
  "resetStateLogSettings",
  "resetAchievementGuardSettings",
  "resetChallengeHelperSettings",
  "resetPrestigeSettings",
  "resetResearchSettings",
  "resetLoggingSettings",
]) {
  resets[name](false);
}

const stateDigest = createHash("sha256")
  .update(
    JSON.stringify(
      Object.entries(settingsRaw).sort(([a], [b]) => a.localeCompare(b)),
    ),
  )
  .digest("hex");

assert.equal(
  stateDigest,
  "a151ac31f93c46d74b3669d0402b7561bb97cff74cd603285d09aeb52d93afb4",
);
assert.equal(Object.keys(settingsRaw).length, 118);

console.log("Reset settings bundled characterization tests passed");
