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
assert.equal(Object.keys(resets).length, 28);

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
  "resetAuthoritySettings",
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
  "77c918d44b77b2d81d349c0f748d6b62cd12ab661b7a7d6d84563dec05f776d9",
);
assert.equal(Object.keys(settingsRaw).length, 122);

console.log("Reset settings bundled characterization tests passed");
