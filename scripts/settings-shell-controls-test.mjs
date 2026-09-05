import assert from "node:assert/strict";

import { createSettingsControls } from "../src/ui/settings-controls.ts";
import { createSettingsShell } from "../src/ui/settings-shell.ts";

const trace = [];
const handlers = [];
const overrideModalClicks = [];
const autocompleteOptions = [];
/** Labels of nodes whose `is(":empty")` answers true. */
const emptyNodes = new Set();

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
    is(selector) {
      return (
        selector === ":empty" &&
        [...emptyNodes].some((suffix) => label.endsWith(suffix))
      );
    },
    select() {
      trace.push(`select:${label}`);
      return node;
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

// Selecting the same thing twice returns the same node, so a value written through one selector
// reads back through the next.
const selectedNodes = new Map();
function jquery(value) {
  const label = typeof value === "string" ? value : value.label;
  let node = selectedNodes.get(label);
  if (node === undefined) {
    node = makeNode(label, label === "#script_settings" ? 0 : 1);
    selectedNodes.set(label, node);
  }
  return node;
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
/** A `.script-collapsible` heading and the `.script-content` div that follows it. */
function makeHeading(id, display, searchInputs = []) {
  return {
    id,
    classList: {
      toggle: (name) => trace.push(`toggle:${id}:${name}`),
    },
    nextElementSibling: {
      style: { display },
      getElementsByClassName: () => searchInputs,
    },
    addEventListener(type, listener) {
      handlers.push({ label: id, args: [type, listener] });
    },
  };
}

const elements = {
  script_importExportButtons: { id: "script_importExportButtons" },
};
let collapsibles = [];
const document = {
  documentElement: { scrollTop: 31 },
  body: { scrollTop: 9 },
  getElementById: (id) => elements[id] ?? null,
  querySelectorAll: () => collapsibles,
  execCommand: (command) => {
    trace.push(`execCommand:${command}`);
    return true;
  },
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
  importSettings: (value) => shellContext.importSettings(value),
  exportSettings: () => shellContext.exportSettings(),
  triggerFileDownload: (content, filename) =>
    shellContext.triggerFileDownload(content, filename),
  confirm: (message) => shellContext.confirm(message),
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

// A collapsible heading records its own state under its id and clears any search box it closes.
const search = { value: "carbon" };
collapsibles = [makeHeading("BuildingSettingsCollapsed", "block", [search])];
shellContext.game = { global: { settings: { civTabs: 7 } } };
shellContext.settingsRaw = {};
trace.length = 0;
shell.buildScriptSettings();
const collapse = handlers.findLast(
  ({ label }) => label === "BuildingSettingsCollapsed",
).args[1];

collapse();
assert.equal(shellContext.settingsRaw.BuildingSettingsCollapsed, true);
assert.equal(collapsibles[0].nextElementSibling.style.display, "none");
assert.equal(search.value, "");
assert.ok(trace.includes("filter"));
assert.ok(
  trace.includes("toggle:BuildingSettingsCollapsed:script-contentactive"),
);
assert.ok(trace.includes("persist-shell"));

collapse();
assert.equal(shellContext.settingsRaw.BuildingSettingsCollapsed, false);
assert.equal(collapsibles[0].nextElementSibling.style.display, "block");

// The import/export buttons attach after the game's own, and each drives its own action.
delete elements.script_importExportButtons;
trace.length = 0;
shell.buildImportExport();
assert.ok(
  trace.some((entry) =>
    entry.startsWith(
      'after:.importExport:<div id="script_importExportButtons"',
    ),
  ),
);
for (const id of [
  "script_settingsImport",
  "script_settingsExport",
  "script_settingsFile",
]) {
  assert.ok(trace.some((entry) => entry.includes(`id="${id}"`)));
}

// A section's nodes are labelled by the markup they were built from, so match the tail.
const clickOn = (labelSuffix) =>
  handlers.findLast(
    (entry) => entry.label.endsWith(labelSuffix) && entry.args[0] === "click",
  ).args[1];

// Import reads the textarea nested inside the game's box - Buefy 3 puts the id on the wrapper -
// and clears it only when the settings were accepted.
jquery("#importExport textarea").val('{"a":1}');
let imported = null;
shellContext.importSettings = (value) => {
  imported = value;
  return true;
};
clickOn("#script_settingsImport")();
assert.equal(imported, '{"a":1}');
assert.equal(jquery("#importExport textarea").val(), "");

// A rejected import leaves the box alone so the text can be corrected.
shellContext.importSettings = (value) => {
  imported = value;
  return false;
};
jquery("#importExport textarea").val('{"b":2}');
clickOn("#script_settingsImport")();
assert.equal(imported, '{"b":2}');
assert.equal(jquery("#importExport textarea").val(), '{"b":2}');

// An empty box imports nothing.
jquery("#importExport textarea").val("");
shellContext.importSettings = () => {
  throw new Error("must not import an empty box");
};
clickOn("#script_settingsImport")();

// Export writes the box and copies it.
trace.length = 0;
clickOn("#script_settingsExport")();
assert.equal(jquery("#importExport textarea").val(), "{}");
assert.ok(trace.includes("select:#importExport textarea"));
assert.ok(trace.includes("execCommand:copy"));

// The file button downloads the raw settings, pretty printed, under the configured name.
const downloads = [];
shellContext.triggerFileDownload = (content, filename) =>
  downloads.push({ content, filename });
shellContext.settingsRaw = { amount: 1 };
clickOn("#script_settingsFile")();
assert.deepEqual(downloads, [
  { content: '{\n  "amount": 1\n}', filename: "settings.json" },
]);

// Already having the buttons, a second call adds nothing.
elements.script_importExportButtons = { id: "script_importExportButtons" };
trace.length = 0;
shell.buildImportExport();
assert.deepEqual(trace, []);

// An open section builds its content immediately and shows it.
let contentBuilds = 0;
shellContext.settingsRaw = {};
elements.DemoSettingsCollapsed = makeHeading("DemoSettingsCollapsed", "none");
trace.length = 0;
shell.buildSettingsSection(
  "Demo",
  "Demo",
  () => reset++,
  () => contentBuilds++,
);
assert.equal(contentBuilds, 1);
assert.equal(
  elements.DemoSettingsCollapsed.nextElementSibling.style.display,
  "block",
);
assert.ok(trace.includes("toggle:DemoSettingsCollapsed:script-contentactive"));

// Its reset button confirms first.
shellContext.confirm = () => false;
reset = 0;
clickOn("#script_resetDemo")();
assert.equal(reset, 0);
shellContext.confirm = () => true;
clickOn("#script_resetDemo")();
assert.equal(reset, 1);

// A collapsed section defers its content until the heading is clicked, and builds it once.
contentBuilds = 0;
shellContext.settingsRaw = { DemoSettingsCollapsed: true };
shell.buildSettingsSection(
  "Demo",
  "Demo",
  () => reset++,
  () => contentBuilds++,
);
assert.equal(contentBuilds, 0);
const openSection = clickOn("> #DemoSettingsCollapsed");
emptyNodes.add("#script_DemoContent");
openSection();
assert.equal(contentBuilds, 1);
emptyNodes.delete("#script_DemoContent");
openSection();
assert.equal(contentBuilds, 1);

// A secondary section is only a content div in its host, rendered under the prefix.
const host = makeNode("host");
const prefixes = [];
trace.length = 0;
shell.buildSettingsSection2(
  host,
  "warSecondary",
  "Demo",
  "Demo",
  () => reset++,
  (prefix) => prefixes.push(prefix),
);
assert.deepEqual(prefixes, ["warSecondary"]);
assert.ok(
  trace.some((entry) => entry.includes('id="script_warSecondaryDemoContent"')),
);

// Without a prefix it is a full section in its host, rendered under the empty prefix.
shellContext.settingsRaw = { DemoSettingsCollapsed: true };
shell.buildSettingsSection2(
  host,
  "",
  "Demo",
  "Demo",
  () => reset++,
  (prefix) => prefixes.push(prefix),
);
assert.ok(trace.some((entry) => entry.startsWith("append:host:")));
emptyNodes.add("#script_DemoContent");
clickOn("> #DemoSettingsCollapsed")();
assert.deepEqual(prefixes, ["warSecondary", ""]);

// The headings are plain markup appended to whatever node the caller owns.
trace.length = 0;
shell.addStandardHeading(host, "Outer Solar");
shell.addSettingsHeader1(host, "Fighter");
shell.addSettingsHeader2(host, "Scout");
assert.ok(
  trace[0].includes("has-text-danger") && trace[0].includes("Outer Solar"),
);
assert.ok(
  trace[1].includes("has-text-success") && trace[1].includes("Fighter"),
);
assert.ok(trace[2].includes("has-text-caution") && trace[2].includes("Scout"));

shell.removeScriptSettings();
assert.ok(trace.includes("remove:#script_settings"));

console.log("Settings shell and controls module tests passed");
