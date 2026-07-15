import assert from "node:assert/strict";

import { createSettingsControls } from "../src/ui/settings-controls.ts";
import { createSettingsShell } from "../src/ui/settings-shell.ts";

const trace = [];
const handlers = [];

function makeNode(label, length = 1) {
  const node = {
    label,
    length,
    on(...args) {
      handlers.push({ label, args });
      return node;
    },
    find(selector) {
      return makeNode(`${label} ${selector}`);
    },
    last() {
      return node;
    },
    append(value) {
      trace.push(
        `append:${label}:${typeof value === "string" ? value : value.label}`,
      );
      return node;
    },
    appendTo(target) {
      trace.push(`appendTo:${label}:${target.label}`);
      return node;
    },
    after(value) {
      trace.push(`after:${label}:${value.label}`);
      return node;
    },
    remove() {
      trace.push(`remove:${label}`);
      return node;
    },
    toggleClass() {
      return node;
    },
    addClass() {
      return node;
    },
    prop(name, value) {
      trace.push(`prop:${label}:${name}:${value}`);
      return node;
    },
    val(value) {
      if (arguments.length === 0) return node.value ?? "";
      node.value = value;
      trace.push(`val:${label}:${value}`);
      return node;
    },
    is() {
      return false;
    },
    end() {
      return node;
    },
    autocomplete() {
      return node;
    },
  };
  return node;
}

function jquery(value) {
  const label = typeof value === "string" ? value : value.label;
  if (label === "#script_settings") return makeNode(label, 0);
  return makeNode(label);
}
jquery.ui = { autocomplete: { escapeRegex: (value) => value } };

let settingsRaw = { overrides: {}, amount: 1, enabled: false };
const controlContext = {
  $: jquery,
  settingsRaw,
  settings: {},
  techIds: {},
  win: { prompt: () => {} },
  checkCompare: { "==": (a, b) => a == b },
  checkCustom: {},
  checkTypes: { Number: { fn: (value) => Number(value) } },
  overrideKey: "ctrlKey",
  getRealNumber: (value) => Number(value),
  openOptionsModal: () => {},
  sorterHelper: () => {},
  updateSettingsFromState: () => trace.push("persist"),
};
const controls = createSettingsControls({ getContext: () => controlContext });

const input = makeNode("input");
controls.addInputCallbacks(input, "amount");
let change = handlers.find(
  ({ label, args }) => label === "input" && args[0] === "change",
).args[1];
change.call({ value: "7.5" });
assert.equal(settingsRaw.amount, 7.5);
assert.ok(trace.includes("persist"));

const toggle = makeNode("toggle");
controls.addToggleCallbacks(toggle, "enabled");
change = handlers.find(
  ({ label, args }) => label === "toggle" && args[0] === "change",
).args[2];
change.call({ checked: true });
assert.equal(settingsRaw.enabled, true);

settingsRaw = { overrides: {}, amount: 2, enabled: false };
controlContext.settingsRaw = settingsRaw;
change.call({ checked: true });
assert.equal(settingsRaw.enabled, true);
controls.resetCheckbox("enabled");
assert.ok(trace.includes("prop:.script_enabled:checked:true"));
assert.equal(controls.evaluateCheck("Number", "8"), 8);

const buildNames = [
  "buildPrestigeSettings",
  "buildGeneralSettings",
  "buildInterfaceSettings",
  "buildStateLogSettings",
  "buildAchievementGuardSettings",
  "buildChallengeHelperSettings",
  "buildGovernmentSettings",
  "buildAuthoritySettings",
  "buildEvolutionSettings",
  "buildPlanetSettings",
  "buildTraitSettings",
  "buildTriggerSettings",
  "buildResearchSettings",
  "buildWarSettings",
  "buildHellSettings",
  "buildMechSettings",
  "buildFleetSettings",
  "buildEjectorSettings",
  "buildMarketSettings",
  "buildStorageSettings",
  "buildMagicSettings",
  "buildProductionSettings",
  "buildJobSettings",
  "buildBuildingSettings",
  "buildWeightingSettings",
  "buildProjectSettings",
  "buildLoggingSettings",
];
const document = {
  documentElement: { scrollTop: 31 },
  body: { scrollTop: 9 },
  getElementById: (id) => (id === "script_importExportButtons" ? { id } : null),
  querySelectorAll: () => [],
  execCommand: () => true,
};
const shellContext = {
  $: jquery,
  document,
  settingsRaw: {},
  settings: { scriptSettingsExportFilename: "settings.json" },
  game: { global: { settings: { civTabs: 7 } } },
  filterBuildingSettingsTable: () => trace.push("filter"),
  updateSettingsFromState: () => trace.push("persist-shell"),
  importSettings: () => true,
  exportSettings: () => "{}",
  triggerFileDownload: () => trace.push("download"),
  confirm: () => true,
};
for (const name of buildNames) {
  shellContext[name] = () => trace.push(name);
}
const shell = createSettingsShell({ getContext: () => shellContext });
trace.length = 0;
shell.buildScriptSettings();
assert.deepEqual(
  trace.filter((entry) => entry.startsWith("build")),
  buildNames,
);
assert.equal(document.documentElement.scrollTop, 31);
assert.equal(document.body.scrollTop, 31);

shellContext.game = { global: { settings: { civTabs: 2 } } };
trace.length = 0;
shell.buildScriptSettings();
assert.equal(trace.length, 0);

let reset = 0;
shell.genericResetFunction(() => reset++, "Demo");
assert.equal(reset, 1);

console.log("Settings shell and controls module tests passed");
