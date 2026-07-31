import assert from "node:assert/strict";

import { createSettingsControls } from "../src/ui/settings-controls.ts";
import { createSettingsShell } from "../src/ui/settings-shell.ts";

const trace = [];
const handlers = [];
const sortableConfigs = [];
let sortableOrder = [];

const overrideEdits = [];
let conditionCount = 1;
const overrideEditor = {
  applyEdit(edit) {
    overrideEdits.push(edit);
    return { conditionCount };
  },
  setSettingValue(settingKey, value) {
    overrideEdits.push({ kind: "set-setting-value", settingKey, value });
  },
};

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
    sortable(...args) {
      if (typeof args[0] === "object") {
        sortableConfigs.push(args[0]);
        return node;
      }
      return sortableOrder;
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
const controls = createSettingsControls({
  overrideEditor,
  getJQuery: () => controlContext.$,
  getSettingsRaw: () => controlContext.settingsRaw,
  getSettings: () => controlContext.settings,
  getTechIds: () => controlContext.techIds,
  getWin: () => controlContext.win,
  getCheckCompare: () => controlContext.checkCompare,
  getCheckCustom: () => controlContext.checkCustom,
  getCheckTypes: () => controlContext.checkTypes,
  getOverrideKey: () => controlContext.overrideKey,
  getRealNumber: () => controlContext.getRealNumber,
  getOpenOptionsModal: () => controlContext.openOptionsModal,
  getSorterHelper: () => controlContext.sorterHelper,
  getUpdateSettingsFromState: () => controlContext.updateSettingsFromState,
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

// --- The override editor emits typed intents and writes no settings itself ---
const storedCondition = {
  type1: "Number",
  arg1: 1,
  type2: "Boolean",
  arg2: false,
  cmp: "==",
  ret: true,
};
controlContext.checkTypes = {
  Number: { fn: Number, desc: "a number", arg: "number", def: 0 },
  Boolean: { fn: Boolean, desc: "a boolean", arg: "boolean", def: true },
};
controlContext.settings = { autoBuild: true };
settingsRaw = { overrides: { autoBuild: [storedCondition] }, autoBuild: false };
controlContext.settingsRaw = settingsRaw;
const storedBefore = JSON.stringify(settingsRaw);

function handlersFrom(start, event) {
  return handlers
    .slice(start)
    .filter(({ args }) => args[0] === event)
    .map(({ args }) => args[args.length - 1]);
}
function lastHandler(event) {
  const entry = handlers.findLast(({ args }) => args[0] === event);
  return entry.args[entry.args.length - 1];
}

let rebuilds = 0;
const rebuild = () => rebuilds++;

trace.length = 0;
const handlerStart = handlers.length;
controls.buildOverrideSettings("autoBuild", "boolean", undefined);

// The setting's own value beside the conditions goes through the editor too.
handlersFrom(handlerStart, "change")[0].call({ checked: true });
assert.deepEqual(overrideEdits.at(-1), {
  kind: "set-setting-value",
  settingKey: "autoBuild",
  value: true,
});

// Adding the first condition marks the settings row and re-renders. The condition rows register
// their own clicks after the add button, so this is the first click of the render, not the last.
handlersFrom(handlerStart, "click")[0].call({});
assert.deepEqual(overrideEdits.at(-1), {
  kind: "add-condition",
  settingKey: "autoBuild",
  result: false,
});
assert.ok(trace.includes("addClass:.script_bg_autoBuild:inactive-row"));

// Dragging a row reports the new stored order as numbers.
sortableOrder = ["1", "0"];
sortableConfigs.at(-1).update.call({});
assert.deepEqual(overrideEdits.at(-1), {
  kind: "reorder-conditions",
  settingKey: "autoBuild",
  order: [1, 0],
});

// Each condition control names the condition it edits.
controls.buildConditionType("autoBuild", 3, storedCondition, 2, rebuild);
lastHandler("change").call({ value: "Number" });
assert.deepEqual(overrideEdits.at(-1), {
  kind: "set-operand",
  settingKey: "autoBuild",
  index: 3,
  slot: 2,
  operandType: "Number",
  argument: 0,
});

controls.buildConditionArg("autoBuild", 3, storedCondition, 1);
lastHandler("change").call({ value: "7.5" });
assert.deepEqual(overrideEdits.at(-1), {
  kind: "set-operand-argument",
  settingKey: "autoBuild",
  index: 3,
  slot: 1,
  argument: 7.5,
});

controls.buildConditionComparator("autoBuild", 3, storedCondition, rebuild);
lastHandler("change").call({ value: "==" });
assert.deepEqual(overrideEdits.at(-1), {
  kind: "set-comparator",
  settingKey: "autoBuild",
  index: 3,
  comparator: "==",
});

controls.buildConditionRet(
  "autoBuild",
  3,
  storedCondition,
  "boolean",
  undefined,
);
lastHandler("change").call({ checked: false });
assert.deepEqual(overrideEdits.at(-1), {
  kind: "set-result",
  settingKey: "autoBuild",
  index: 3,
  result: false,
});

conditionCount = 0;
controls.buildConditionRemove("autoBuild", 3, rebuild);
lastHandler("click").call({});
assert.deepEqual(overrideEdits.at(-1), {
  kind: "remove-condition",
  settingKey: "autoBuild",
  index: 3,
});
assert.ok(trace.includes("removeClass:.script_bg_autoBuild:inactive-row"));

controls.buildConditionDuplicate("autoBuild", 3, rebuild);
lastHandler("click").call({});
assert.deepEqual(overrideEdits.at(-1), {
  kind: "duplicate-condition",
  settingKey: "autoBuild",
  index: 3,
});

// Every one of those re-rendered, and none of them touched the stored settings or persistence.
assert.equal(rebuilds, 4);
assert.equal(JSON.stringify(settingsRaw), storedBefore);
assert.ok(!trace.includes("persist"));

console.log("Settings shell and controls module tests passed");
