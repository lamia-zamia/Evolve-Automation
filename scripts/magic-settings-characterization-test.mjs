import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
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
    append() {
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

assert.deepEqual(Object.keys(hooks.magicSettings), [
  "buildMagicSettings",
  "updateMagicSettingsContent",
]);

hooks.setMagicSettingsTestContext({
  game: {
    loc(key) {
      return `localized:${key}`;
    },
  },
  AlchemyManager: {
    priorityList: [
      { id: "Iron", name: "Iron", tier: 1 },
      { id: "Steel", name: "Steel", tier: 2 },
    ],
    transmuteTier(resource) {
      return resource.tier;
    },
  },
  RitualManager: {
    Productions: {
      Farmer: { id: "farmer" },
      Science: { id: "science" },
    },
  },
  actions: {
    buildSettingsSection(...args) {
      sectionRegistration = args;
      actionTrace.push(`section:${args[0]}:${args[1]}`);
    },
    addStandardHeading(_node, heading) {
      actionTrace.push(`heading:${heading}`);
    },
    addSettingsNumber(_node, key) {
      actionTrace.push(`number:${key}`);
    },
    addSettingsToggle(_node, key) {
      actionTrace.push(`toggle:${key}`);
    },
    addTableToggle(_node, key) {
      actionTrace.push(`table-toggle:${key}`);
    },
    addTableInput(_node, key) {
      actionTrace.push(`table-input:${key}`);
    },
    buildTableLabel(label, _title, color) {
      actionTrace.push(`label:${label}:${color ?? "default"}`);
      return `label:${label}`;
    },
  },
  resetMagicSettings(reset) {
    actionTrace.push(`resetMagicSettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
  resetCheckbox(...keys) {
    actionTrace.push(`resetCheckbox:${keys.join("|")}`);
  },
});

document.documentElement.scrollTop = 46;
document.body.scrollTop = 10;
domTrace.length = 0;
actionTrace.length = 0;
hooks.magicSettings.updateMagicSettingsContent();
assert.ok(domTrace.includes("select:#script_magicContent"));
assert.ok(domTrace.includes("empty:#script_magicContent"));
assert.ok(domTrace.includes("off:#script_magicContent:*"));
assert.deepEqual(actionTrace, [
  "heading:Alchemy",
  "number:magicAlchemyManaUse",
  "toggle:magicFullmetalHelper",
  "label:Iron:has-text-info",
  "table-toggle:res_alchemy_Iron",
  "table-input:res_alchemy_w_Iron",
  "label:Steel:has-text-advanced",
  "table-toggle:res_alchemy_Steel",
  "table-input:res_alchemy_w_Steel",
  "heading:Pylon",
  "number:productionRitualManaUse",
  "toggle:productionRitualSafe",
  "label:localized:modal_pylon_spell_farmer:default",
  "table-input:spell_w_farmer",
  "label:localized:modal_pylon_spell_science:default",
  "table-input:spell_w_science",
]);
assert.equal(document.documentElement.scrollTop, 46);
assert.equal(document.body.scrollTop, 46);

actionTrace.length = 0;
hooks.magicSettings.buildMagicSettings();
assert.deepEqual(actionTrace, ["section:magic:Magic"]);
assert.equal(
  sectionRegistration[3],
  hooks.magicSettings.updateMagicSettingsContent,
);

actionTrace.length = 0;
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetMagicSettings:true",
  "updateSettingsFromState",
  "heading:Alchemy",
  "number:magicAlchemyManaUse",
  "toggle:magicFullmetalHelper",
  "label:Iron:has-text-info",
  "table-toggle:res_alchemy_Iron",
  "table-input:res_alchemy_w_Iron",
  "label:Steel:has-text-advanced",
  "table-toggle:res_alchemy_Steel",
  "table-input:res_alchemy_w_Steel",
  "heading:Pylon",
  "number:productionRitualManaUse",
  "toggle:productionRitualSafe",
  "label:localized:modal_pylon_spell_farmer:default",
  "table-input:spell_w_farmer",
  "label:localized:modal_pylon_spell_science:default",
  "table-input:spell_w_science",
  "resetCheckbox:autoAlchemy|autoPylon|magicFullmetalHelper",
]);

console.log("Magic settings bundled characterization tests passed");
