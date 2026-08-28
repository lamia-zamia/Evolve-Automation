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

assert.deepEqual(Object.keys(hooks.generalSettings), [
  "buildGeneralSettings",
  "updateGeneralSettingsContent",
]);

hooks.setGeneralSettingsTestContext({
  settingsRaw: { overrides: {}, triggers: [] },
  buildSettingsSection(...args) {
    sectionRegistration = args;
    actionTrace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsHeader1(_node, label) {
    actionTrace.push(`header:${label}`);
  },
  addSettingsNumber(_node, key) {
    actionTrace.push(`number:${key}`);
  },
  addSettingsSelect(_node, key) {
    actionTrace.push(`select:${key}`);
  },
  addSettingsString(_node, key) {
    actionTrace.push(`string:${key}`);
  },
  addSettingsToggle(_node, key) {
    actionTrace.push(`toggle:${key}`);
  },
  resetGeneralSettings(reset) {
    actionTrace.push(`resetGeneralSettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
  resetCheckbox(...keys) {
    actionTrace.push(`resetCheckbox:${keys.join("|")}`);
  },
});

domTrace.length = 0;
document.documentElement.scrollTop = 46;
document.body.scrollTop = 10;
hooks.generalSettings.updateGeneralSettingsContent();
assert.deepEqual(domTrace, [
  "select:#script_generalContent",
  "empty:#script_generalContent",
  "off:#script_generalContent:*",
]);
assert.deepEqual(actionTrace, [
  "number:tickRate",
  "toggle:tickSchedule",
  "toggle:exposeGating",
  "header:Prioritization",
  "toggle:useDemanded",
  "toggle:researchRequest",
  "toggle:researchRequestSpace",
  "toggle:missionRequest",
  "select:prioritizeQueue",
  "select:prioritizeTriggers",
  "select:prioritizeUnify",
  "select:prioritizeOuterFleet",
  "header:Auto clicker",
  "toggle:buildingAlwaysClick",
  "number:buildingClickPerTick",
  "header:Misc",
  "string:scriptSettingsExportFilename",
]);
assert.equal(document.documentElement.scrollTop, 46);
assert.equal(document.body.scrollTop, 46);

actionTrace = [];
controls.length = 0;
domTrace.length = 0;
hooks.generalSettings.buildGeneralSettings();
assert.deepEqual(actionTrace, ["section:general:General"]);
assert.equal(
  sectionRegistration[3],
  hooks.generalSettings.updateGeneralSettingsContent,
);

actionTrace = [];
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetGeneralSettings:true",
  "updateSettingsFromState",
  "number:tickRate",
  "toggle:tickSchedule",
  "toggle:exposeGating",
  "header:Prioritization",
  "toggle:useDemanded",
  "toggle:researchRequest",
  "toggle:researchRequestSpace",
  "toggle:missionRequest",
  "select:prioritizeQueue",
  "select:prioritizeTriggers",
  "select:prioritizeUnify",
  "select:prioritizeOuterFleet",
  "header:Auto clicker",
  "toggle:buildingAlwaysClick",
  "number:buildingClickPerTick",
  "header:Misc",
  "string:scriptSettingsExportFilename",
  "resetCheckbox:masterScriptToggle|showSettings|autoPrestige",
]);

console.log("General settings bundled characterization tests passed");
