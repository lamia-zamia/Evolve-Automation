import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const domTrace = [];
const actionTrace = [];
let sectionRegistration;

function makeNode(selector) {
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
    append(content) {
      domTrace.push(`append:${selector}:${String(content).slice(0, 24)}`);
      return this;
    },
    next() {
      return this;
    },
  };
}

function jquery(selector = "") {
  const key = String(selector);
  domTrace.push(`select:${key}`);
  return makeNode(key);
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

assert.deepEqual(Object.keys(hooks.planetSettings), [
  "buildPlanetSettings",
  "updatePlanetSettingsContent",
]);

hooks.setPlanetSettingsTestContext({
  game: {
    loc(key) {
      return `localized:${key}`;
    },
  },
  biomeList: ["grassland", "oceanic"],
  traitList: ["none"],
  extraList: ["Achievement", "Orbit"],
  actions: {
    buildSettingsSection(...args) {
      sectionRegistration = args;
      actionTrace.push(`section:${args[0]}:${args[1]}`);
    },
    addTableInput(_node, settingName) {
      actionTrace.push(`input:${settingName}`);
    },
    buildTableLabel(label) {
      actionTrace.push(`label:${label}`);
      return `label:${label}`;
    },
  },
  resetPlanetSettings(reset) {
    actionTrace.push(`resetPlanetSettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
});

domTrace.length = 0;
actionTrace.length = 0;
document.documentElement.scrollTop = 46;
document.body.scrollTop = 10;
hooks.planetSettings.updatePlanetSettingsContent();
assert.ok(domTrace.includes("select:#script_planetContent"));
assert.ok(domTrace.includes("empty:#script_planetContent"));
assert.ok(domTrace.includes("off:#script_planetContent:*"));
assert.deepEqual(actionTrace, [
  "label:localized:biome_grassland_name",
  "input:biome_w_grassland",
  "label:None",
  "input:trait_w_none",
  "label:Achievement",
  "input:extra_w_Achievement",
  "label:localized:biome_oceanic_name",
  "input:biome_w_oceanic",
  "label:Orbit",
  "input:extra_w_Orbit",
]);
assert.equal(document.documentElement.scrollTop, 46);
assert.equal(document.body.scrollTop, 46);

actionTrace.length = 0;
hooks.planetSettings.buildPlanetSettings();
assert.deepEqual(actionTrace, ["section:planet:Planet Weighting"]);
assert.equal(
  sectionRegistration[3],
  hooks.planetSettings.updatePlanetSettingsContent,
);

actionTrace.length = 0;
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetPlanetSettings:true",
  "updateSettingsFromState",
  "label:localized:biome_grassland_name",
  "input:biome_w_grassland",
  "label:None",
  "input:trait_w_none",
  "label:Achievement",
  "input:extra_w_Achievement",
  "label:localized:biome_oceanic_name",
  "input:biome_w_oceanic",
  "label:Orbit",
  "input:extra_w_Orbit",
]);

console.log("Planet settings bundled characterization tests passed");
