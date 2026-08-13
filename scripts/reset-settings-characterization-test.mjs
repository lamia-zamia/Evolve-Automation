import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";
import { createHash } from "node:crypto";

const { hooks } = await loadCharacterizationBundle({
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
  "ca74f693b17a777d3fb96317dce2e01bcca408d2869d55773aa2b59e79fdb27a",
);
assert.equal(Object.keys(settingsRaw).length, 126);

console.log("Reset settings bundled characterization tests passed");
