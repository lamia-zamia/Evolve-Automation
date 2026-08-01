import assert from "node:assert/strict";

import { createSettingsControls } from "../src/ui/settings-controls.ts";
import { createSettingsShell } from "../src/ui/settings-shell.ts";

const trace = [];
const handlers = [];
const overrideModalClicks = [];
const autocompleteOptions = [];

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
    addClass(name) {
      trace.push(`addClass:${label}:${name}`);
      return node;
    },
    removeClass(name) {
      trace.push(`removeClass:${label}:${name}`);
      return node;
    },
    empty() {
      return node;
    },
    off() {
      return node;
    },
    children() {
      return node;
    },
    eq() {
      return node;
    },
    next() {
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
    autocomplete(options) {
      autocompleteOptions.push(options);
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
  getRealNumber: (value) => Number(value),
  updateSettingsFromState: () => trace.push("persist"),
};
const controls = createSettingsControls({
  getJQuery: () => controlContext.$,
  getSettingsRaw: () => controlContext.settingsRaw,
  getRealNumber: () => controlContext.getRealNumber,
  getUpdateSettingsFromState: () => controlContext.updateSettingsFromState,
  openOverrideModal: (event) => overrideModalClicks.push(event),
  buildSelectOptions: (optionsList) =>
    optionsList.map((item) => `<option value="${item.val}"></option>`).join(),
});

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

// A control's click carries what the override editor needs to open on that setting.
const clickData = handlers.findLast(({ args }) => args[0] === "click").args[1];
assert.deepEqual(clickData, {
  label: "Toggle (enabled)",
  name: "enabled",
  type: "boolean",
});

// A toggle reports its state changes only. Building it never runs the enabled callback.
let enabledCalls = 0;
settingsRaw = { overrides: {}, amount: 1, enabled: true, techs: [] };
controlContext.settingsRaw = settingsRaw;
controls.addSettingsToggle(
  makeNode("section"),
  "enabled",
  "Enabled",
  "hint",
  () => enabledCalls++,
);
assert.equal(enabledCalls, 0);
const toggleChange = handlers.findLast(
  ({ args }) => args[0] === "change" && args[1] === "input",
).args[2];
toggleChange.call({ checked: true });
assert.equal(enabledCalls, 1);

// A list setting displays the names of the ids it stores, and edits them through its buttons.
settingsRaw = { overrides: {}, techs: ["tech-a", "retired"] };
controlContext.settingsRaw = settingsRaw;
const techList = {
  "tech-a": { name: "Alpha", _vueBinding: "tech-a" },
  "tech-b": { name: "Beta", _vueBinding: "tech-b" },
};
controls.addSettingsList(
  makeNode("section"),
  "techs",
  "Researches",
  "hint",
  techList,
);
// An id the game no longer lists shows as itself instead of failing the render.
assert.ok(trace.includes("val:.script_techs:Alpha, retired"));

const listClickData = handlers.findLast(
  ({ args }) => args[0] === "click" && typeof args[1] === "object",
).args[1];
assert.deepEqual(listClickData, {
  label: "Add or Remove (techs)",
  name: "techs",
  type: "list",
  options: { list: techList, name: "name", id: "_vueBinding" },
});

const listOptions = autocompleteOptions.at(-1);
const suggestions = [];
listOptions.source({ term: "Al" }, (items) => suggestions.push(...items));
assert.deepEqual(suggestions, [{ label: "Alpha", value: "tech-a" }]);

// A typed name that matches an entry selects it; anything else clears the selection.
const typedInput = { value: "Beta" };
listOptions.change.call(typedInput, { preventDefault() {} }, { item: null });
assert.equal(typedInput.value, "Beta");

const addHandler = handlers.findLast(({ args }) => args[1] === "button:eq(1)")
  .args[2];
const removeHandler = handlers.findLast(
  ({ args }) => args[1] === "button:eq(0)",
).args[2];
addHandler();
assert.deepEqual(settingsRaw.techs, ["retired", "tech-a", "tech-b"]);
assert.ok(trace.includes("val:.script_techs:retired, Alpha, Beta"));
removeHandler();
assert.deepEqual(settingsRaw.techs, ["retired", "tech-a"]);

const unknownInput = { value: "Gamma" };
listOptions.change.call(unknownInput, { preventDefault() {} }, { item: null });
assert.equal(unknownInput.value, "");
addHandler();
assert.deepEqual(settingsRaw.techs, ["retired", "tech-a"]);

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
const shell = createSettingsShell({
  ...shellContext,
  getDocument: () => shellContext.document,
  getSettingsRaw: () => shellContext.settingsRaw,
  getSettings: () => shellContext.settings,
  getGame: () => shellContext.game,
});
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
