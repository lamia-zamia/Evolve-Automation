import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const domTrace = [];
const actionTrace = [];
let sectionRegistration;

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

assert.deepEqual(Object.keys(hooks.researchSettings), [
  "buildResearchSettings",
  "updateResearchSettingsContent",
]);

hooks.setResearchSettingsTestContext({
  game: {
    loc(key) {
      return `localized:${key}`;
    },
  },
  techIds: {
    "tech-anthropology": {
      _vueBinding: "tech-anthropology",
      name: "Anthropology",
    },
    "tech-fanaticism": {
      _vueBinding: "tech-fanaticism",
      name: "Fanaticism",
    },
  },
  actions: {
    buildSettingsSection(...args) {
      sectionRegistration = args;
      actionTrace.push(`section:${args[0]}:${args[1]}`);
    },
    addSettingsSelect(_node, key, _label, _hint, options) {
      actionTrace.push(`select:${key}:${options.length}`);
    },
    addSettingsList(_node, key, _label, _hint, list) {
      actionTrace.push(`list:${key}:${Object.keys(list).length}`);
    },
  },
  resetResearchSettings(reset) {
    actionTrace.push(`resetResearchSettings:${reset}`);
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
hooks.researchSettings.updateResearchSettingsContent();
assert.deepEqual(domTrace, [
  "select:#script_researchContent",
  "empty:#script_researchContent",
  "off:#script_researchContent:*",
]);
assert.deepEqual(actionTrace, [
  "select:userResearchTheology_1:3",
  "select:userResearchTheology_2:3",
  "list:researchIgnore:2",
]);
assert.equal(document.documentElement.scrollTop, 46);
assert.equal(document.body.scrollTop, 46);

actionTrace.length = 0;
hooks.researchSettings.buildResearchSettings();
assert.deepEqual(actionTrace, ["section:research:Research"]);
assert.equal(
  sectionRegistration[3],
  hooks.researchSettings.updateResearchSettingsContent,
);

actionTrace.length = 0;
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetResearchSettings:true",
  "updateSettingsFromState",
  "select:userResearchTheology_1:3",
  "select:userResearchTheology_2:3",
  "list:researchIgnore:2",
  "resetCheckbox:autoResearch",
]);

console.log("Research settings bundled characterization tests passed");
