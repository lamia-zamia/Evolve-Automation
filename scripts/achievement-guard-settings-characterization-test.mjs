import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const domTrace = [];
const controls = [];
let sectionRegistration;
let actionTrace = [];

function jquery(selector) {
  domTrace.push(`select:${selector}`);
  return {
    ready() {
      return this;
    },
    empty() {
      domTrace.push(`empty:${selector}`);
      return this;
    },
    off(events) {
      domTrace.push(`off:${selector}:${events}`);
      return this;
    },
  };
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  document,
  localStorage: {
    getItem: () => null,
    setItem() {},
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.deepEqual(Object.keys(hooks.achievementGuardSettings), [
  "buildAchievementGuardSettings",
  "updateAchievementGuardSettingsContent",
]);

hooks.setAchievementGuardSettingsTestContext({
  settingsRaw: { overrides: {}, triggers: [] },
  buildSettingsSection(...args) {
    sectionRegistration = args;
    actionTrace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsToggle(_node, key, label, hint) {
    controls.push({ key, label, hint });
    actionTrace.push(`toggle:${key}`);
  },
  resetAchievementGuardSettings(reset) {
    actionTrace.push(`resetAchievementGuardSettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
});

domTrace.length = 0;
document.documentElement.scrollTop = 44;
document.body.scrollTop = 9;
hooks.achievementGuardSettings.updateAchievementGuardSettingsContent();
assert.deepEqual(domTrace, [
  "select:#script_achievementGuardContent",
  "empty:#script_achievementGuardContent",
  "off:#script_achievementGuardContent:*",
]);
assert.deepEqual(actionTrace, [
  "toggle:achievementGuards",
  "toggle:guardPacifist",
  "toggle:guardDreaded",
  "toggle:guardCultOfPersonality",
  "toggle:guardAnarchist",
  "toggle:guardEnergetic",
  "toggle:guardRedDead",
  "toggle:guardSecondEvolution",
  "toggle:guardWorldDomination",
  "toggle:guardSyndicate",
  "toggle:guardTradeFederation",
  "toggle:guardBananaRepublic",
]);
assert.equal(document.documentElement.scrollTop, 44);
assert.equal(document.body.scrollTop, 44);

actionTrace = [];
controls.length = 0;
domTrace.length = 0;
hooks.achievementGuardSettings.buildAchievementGuardSettings();
assert.deepEqual(actionTrace, ["section:achievementGuard:Achievement Guard"]);
assert.equal(
  sectionRegistration[3],
  hooks.achievementGuardSettings.updateAchievementGuardSettingsContent,
);

actionTrace = [];
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetAchievementGuardSettings:true",
  "updateSettingsFromState",
  "toggle:achievementGuards",
  "toggle:guardPacifist",
  "toggle:guardDreaded",
  "toggle:guardCultOfPersonality",
  "toggle:guardAnarchist",
  "toggle:guardEnergetic",
  "toggle:guardRedDead",
  "toggle:guardSecondEvolution",
  "toggle:guardWorldDomination",
  "toggle:guardSyndicate",
  "toggle:guardTradeFederation",
  "toggle:guardBananaRepublic",
]);

console.log("Achievement Guard settings bundled characterization tests passed");
