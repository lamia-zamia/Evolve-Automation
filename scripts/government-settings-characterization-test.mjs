import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const domTrace = [];
const actionTrace = [];
const nodes = new Map();
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
  };
}

function jquery(selector = "") {
  const key = String(selector);
  domTrace.push(`select:${key}`);
  if (!nodes.has(key)) nodes.set(key, makeNode(key));
  return nodes.get(key);
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

assert.deepEqual(Object.keys(hooks.governmentSettings), [
  "buildGovernmentSettings",
  "updateGovernmentSettingsContent",
]);

hooks.setGovernmentSettingsTestContext({
  game: {
    loc(key) {
      return `localized:${key}`;
    },
  },
  GovernmentManager: {
    Types: {
      anarchy: { id: "anarchy", selectable: false },
      autocracy: { id: "autocracy" },
      democracy: { id: "democracy" },
    },
  },
  governors: ["governor_one"],
  actions: {
    buildSettingsSection2(...args) {
      sectionRegistration = args;
      actionTrace.push(`section2:${args[1]}:${args[2]}:${args[3]}`);
    },
    addSettingsNumber(_node, key) {
      actionTrace.push(`number:${key}`);
    },
    addSettingsSelect(_node, key, _label, _hint, options) {
      actionTrace.push(`select:${key}:${options.length}`);
    },
  },
  resetGovernmentSettings(reset) {
    actionTrace.push(`resetGovernmentSettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
  resetCheckbox(...keys) {
    actionTrace.push(`resetCheckbox:${keys.join("|")}`);
  },
});

domTrace.length = 0;
actionTrace.length = 0;
document.documentElement.scrollTop = 46;
document.body.scrollTop = 10;
hooks.governmentSettings.updateGovernmentSettingsContent("");
assert.deepEqual(domTrace, [
  "select:#script_governmentContent",
  "empty:#script_governmentContent",
  "off:#script_governmentContent:*",
]);
assert.deepEqual(actionTrace, [
  "number:generalRequestedTaxRate",
  "number:generalMinimumTaxRate",
  "number:generalMinimumMorale",
  "number:generalMaximumMorale",
  "select:govInterim:3",
  "select:govFinal:3",
  "select:govSpace:3",
  "select:govGovernor:2",
]);
assert.equal(document.documentElement.scrollTop, 46);
assert.equal(document.body.scrollTop, 46);

actionTrace.length = 0;
hooks.governmentSettings.buildGovernmentSettings({}, "");
assert.deepEqual(actionTrace, ["section2::government:Government"]);
assert.equal(
  sectionRegistration[5],
  hooks.governmentSettings.updateGovernmentSettingsContent,
);

actionTrace.length = 0;
sectionRegistration[4]();
assert.deepEqual(actionTrace, [
  "resetGovernmentSettings:true",
  "updateSettingsFromState",
  "number:generalRequestedTaxRate",
  "number:generalMinimumTaxRate",
  "number:generalMinimumMorale",
  "number:generalMaximumMorale",
  "select:govInterim:3",
  "select:govFinal:3",
  "select:govSpace:3",
  "select:govGovernor:2",
  "resetCheckbox:autoTax|autoGovernment",
]);

console.log("Government settings bundled characterization tests passed");
