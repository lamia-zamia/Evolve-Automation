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
  "27037a825275fe1c9ffc1023e6712191a0e75f2e7c073c7561d07f5cb612008e",
);
assert.equal(Object.keys(settingsRaw).length, 127);

console.log("Reset settings bundled characterization tests passed");
