import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

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
const { hooks } = await loadCharacterizationBundle({
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
});

assert.deepEqual(Object.keys(hooks.challengeHelperSettings), [
  "buildChallengeHelperSettings",
  "updateChallengeHelperSettingsContent",
]);

const settingsRaw = { overrides: {}, triggers: [] };
hooks.setChallengeHelperSettingsTestContext({
  settingsRaw,
  buildSettingsSection(...args) {
    sectionRegistration = args;
    actionTrace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsToggle(_node, key, label, hint) {
    controls.push({ kind: "toggle", key, label, hint });
    actionTrace.push(`toggle:${key}`);
  },
  addSettingsNumber(_node, key, label, hint) {
    controls.push({ kind: "number", key, label, hint });
    actionTrace.push(`number:${key}`);
  },
  resetChallengeHelperSettings(reset) {
    actionTrace.push(`resetChallengeHelperSettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
});

domTrace.length = 0;
document.documentElement.scrollTop = 44;
document.body.scrollTop = 9;
hooks.challengeHelperSettings.updateChallengeHelperSettingsContent();
assert.deepEqual(domTrace, [
  "select:#script_challengeHelperContent",
  "empty:#script_challengeHelperContent",
  "off:#script_challengeHelperContent:*",
]);
assert.deepEqual(actionTrace, [
  "toggle:inflationChallengeAssist",
  "number:inflationChallengeSaveMinutes",
  "toggle:retirementChallengeAssist",
]);
assert.equal(document.documentElement.scrollTop, 44);
assert.equal(document.body.scrollTop, 44);

actionTrace = [];
controls.length = 0;
domTrace.length = 0;
hooks.challengeHelperSettings.buildChallengeHelperSettings();
assert.deepEqual(actionTrace, ["section:challengeHelper:Challenge Helper"]);
assert.equal(
  sectionRegistration[3],
  hooks.challengeHelperSettings.updateChallengeHelperSettingsContent,
);

actionTrace = [];
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetChallengeHelperSettings:true",
  "updateSettingsFromState",
  "toggle:inflationChallengeAssist",
  "number:inflationChallengeSaveMinutes",
  "toggle:retirementChallengeAssist",
]);

console.log("Challenge Helper settings bundled characterization tests passed");
