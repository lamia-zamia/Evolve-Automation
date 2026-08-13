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

assert.deepEqual(Object.keys(hooks.authoritySettings), [
  "buildAuthoritySettings",
  "updateAuthoritySettingsContent",
]);

hooks.setAuthoritySettingsTestContext({
  settingsRaw: { overrides: {}, triggers: [] },
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
  resetAuthoritySettings(reset) {
    actionTrace.push(`resetAuthoritySettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
});

domTrace.length = 0;
document.documentElement.scrollTop = 45;
document.body.scrollTop = 8;
hooks.authoritySettings.updateAuthoritySettingsContent();
assert.deepEqual(domTrace, [
  "select:#script_authorityContent",
  "empty:#script_authorityContent",
  "off:#script_authorityContent:*",
]);
assert.deepEqual(actionTrace, [
  "toggle:authorityManage",
  "number:generalMinimumAuthority",
  "number:generalAuthorityMinPatrolPercent",
  "number:buildingWeightingAuthority",
]);
assert.equal(document.documentElement.scrollTop, 45);
assert.equal(document.body.scrollTop, 45);

actionTrace = [];
controls.length = 0;
domTrace.length = 0;
hooks.authoritySettings.buildAuthoritySettings();
assert.deepEqual(actionTrace, ["section:authority:Authority"]);
assert.equal(
  sectionRegistration[3],
  hooks.authoritySettings.updateAuthoritySettingsContent,
);

actionTrace = [];
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetAuthoritySettings:true",
  "updateSettingsFromState",
  "toggle:authorityManage",
  "number:generalMinimumAuthority",
  "number:generalAuthorityMinPatrolPercent",
  "number:buildingWeightingAuthority",
]);

console.log("Authority settings bundled characterization tests passed");
