import assert from "node:assert/strict";

import { overrideComparatorExpressions } from "../src/settings/override-comparators.ts";
import { createOverrideConditionControls } from "../src/ui/override-condition-controls.ts";
import { createOverrideEditorControls } from "../src/ui/override-editor.ts";
import { createSettingsInputs } from "../src/ui/settings-inputs.ts";

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

function makeNode(label) {
  const node = {
    label,
    length: 1,
    on(...args) {
      handlers.push({ label, args });
      return node;
    },
    find(selector) {
      return makeNode(`${label} ${selector}`);
    },
    append(value) {
      trace.push(
        `append:${label}:${typeof value === "string" ? value : value.label}`,
      );
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
    addClass(name) {
      trace.push(`addClass:${label}:${name}`);
      return node;
    },
    removeClass(name) {
      trace.push(`removeClass:${label}:${name}`);
      return node;
    },
    attr(name) {
      return node.attributes?.[name];
    },
    autocomplete() {
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
    text(value) {
      trace.push(`text:${label}:${value}`);
      return node;
    },
    val(value) {
      trace.push(`val:${label}:${value}`);
      return node;
    },
    end() {
      return node;
    },
  };
  return node;
}

function jquery(value) {
  return makeNode(typeof value === "string" ? value : value.label);
}
jquery.ui = { autocomplete: { escapeRegex: (value) => value } };

const prompts = [];
const storedCondition = {
  type1: "Number",
  arg1: 1,
  type2: "Boolean",
  arg2: false,
  cmp: "==",
  ret: true,
};
const context = {
  settingsRaw: {
    overrides: { autoBuild: [storedCondition] },
    autoBuild: false,
  },
  settings: { autoBuild: true, researchIgnore: ["tech-club"] },
  techIds: { "tech-club": { name: "Clubs" } },
  checkCompareExpressions: overrideComparatorExpressions,
  checkCustom: {},
  checkTypes: {
    Number: { fn: Number, desc: "a number", arg: "number", def: 0 },
    Boolean: { fn: Boolean, desc: "a boolean", arg: "boolean", def: true },
  },
};

const { buildInputNode } = createSettingsInputs({
  getJQuery: () => jquery,
  getRealNumber: () => Number,
});
const conditionControls = createOverrideConditionControls({
  overrideEditor,
  getJQuery: () => jquery,
  getSettingsRaw: () => context.settingsRaw,
  getWin: () => ({
    prompt: (message, value) => prompts.push({ message, value }),
  }),
  getCheckCompareExpressions: () => context.checkCompareExpressions,
  getCheckCustom: () => context.checkCustom,
  getCheckTypes: () => context.checkTypes,
  buildInputNode,
});
const editor = createOverrideEditorControls({
  overrideEditor,
  conditionControls,
  getJQuery: () => jquery,
  getSettingsRaw: () => context.settingsRaw,
  getSettings: () => context.settings,
  getTechIds: () => context.techIds,
  getCheckCustom: () => context.checkCustom,
  getOverrideKey: () => "ctrlKey",
  getOpenOptionsModal: () => (title, build) => {
    trace.push(`modal:${title}`);
    build(makeNode("modal"));
  },
  getSorterHelper: () => "helper",
  buildInputNode,
});

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
const storedBefore = JSON.stringify(context.settingsRaw);

// --- The editor emits typed intents and writes no settings itself ---
const handlerStart = handlers.length;
editor.buildOverrideSettings("autoBuild", "boolean", undefined);

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

// --- Each condition control names the condition it edits ---
const condition = {
  type1: "Number",
  arg1: 1,
  type2: "Boolean",
  arg2: false,
  comparator: "==",
  result: true,
};

conditionControls.buildConditionType("autoBuild", 3, condition, 2, rebuild);
lastHandler("change").call({ value: "Number" });
assert.deepEqual(overrideEdits.at(-1), {
  kind: "set-operand",
  settingKey: "autoBuild",
  index: 3,
  slot: 2,
  operandType: "Number",
  argument: 0,
});

conditionControls.buildConditionArg("autoBuild", 3, condition, 1);
lastHandler("change").call({ value: "7.5" });
assert.deepEqual(overrideEdits.at(-1), {
  kind: "set-operand-argument",
  settingKey: "autoBuild",
  index: 3,
  slot: 1,
  argument: 7.5,
});

conditionControls.buildConditionComparator("autoBuild", 3, condition, rebuild);
lastHandler("change").call({ value: "==" });
assert.deepEqual(overrideEdits.at(-1), {
  kind: "set-comparator",
  settingKey: "autoBuild",
  index: 3,
  comparator: "==",
});

conditionControls.buildConditionRet("autoBuild", 3, condition, "boolean");
lastHandler("change").call({ checked: false });
assert.deepEqual(overrideEdits.at(-1), {
  kind: "set-result",
  settingKey: "autoBuild",
  index: 3,
  result: false,
});

conditionCount = 0;
conditionControls.buildConditionRemove("autoBuild", 3, rebuild);
lastHandler("click").call({});
assert.deepEqual(overrideEdits.at(-1), {
  kind: "remove-condition",
  settingKey: "autoBuild",
  index: 3,
});
assert.ok(trace.includes("removeClass:.script_bg_autoBuild:inactive-row"));

conditionControls.buildConditionDuplicate("autoBuild", 3, rebuild);
lastHandler("click").call({});
assert.deepEqual(overrideEdits.at(-1), {
  kind: "duplicate-condition",
  settingKey: "autoBuild",
  index: 3,
});

// Every one of those re-rendered, and none of them touched the stored settings or persistence.
assert.equal(rebuilds, 4);
assert.equal(JSON.stringify(context.settingsRaw), storedBefore);

// --- Evalize renders the stored condition, re-read at click time ---
conditionControls.buildConditionEvalize("autoBuild", 0);
lastHandler("click").call({});
assert.deepEqual(prompts.at(-1), {
  message: "Eval of this condition:",
  value: "1 == false",
});

// An operand type without its own literal spelling is rendered as a catalog read.
context.settingsRaw.overrides.autoBuild = [
  { ...storedCondition, type1: "SettingCurrent", arg1: "autoBuild" },
];
conditionControls.buildConditionEvalize("autoBuild", 0);
lastHandler("click").call({});
assert.deepEqual(prompts.at(-1), {
  message: "Eval of this condition:",
  value: `_("SettingCurrent","autoBuild") == false`,
});

// A condition that is no longer there, or one whose comparator is unknown, prompts nothing.
const promptCount = prompts.length;
conditionControls.buildConditionEvalize("autoBuild", 7);
lastHandler("click").call({});
context.settingsRaw.overrides.autoBuild = [
  { ...storedCondition, cmp: "nosuch" },
];
conditionControls.buildConditionEvalize("autoBuild", 0);
lastHandler("click").call({});
assert.equal(prompts.length, promptCount);

// --- A stored shape the boundary would have dropped renders no controls ---
context.settingsRaw.overrides.autoBuild = [{ ret: 5 }];
trace.length = 0;
const brokenStart = handlers.length;
editor.buildOverrideSettings("autoBuild", "boolean", undefined);
assert.equal(handlersFrom(brokenStart, "change").length, 1); // the setting's own value only
assert.equal(handlersFrom(brokenStart, "click").length, 1); // the add button only

// --- The effective value is displayed read-only ---
editor.buildInputNodeForDisplay(
  "list",
  { list: { "tech-club": { name: "Clubs" } }, name: "name", id: "id" },
  ["tech-club", "tech-nosuch"],
);
assert.ok(
  trace.includes(
    "text:\n                  <span></span>:Clubs, [Invalid item]",
  ),
);

const displayNode = makeNode("#script_override_true_value");
displayNode.attributes = { type: "list", value: "researchIgnore" };
trace.length = 0;
editor.changeDisplayInputNode(displayNode);
assert.ok(
  trace.includes(
    "text:#script_override_true_value td:eq(1)>*:first-child:Clubs",
  ),
);

displayNode.attributes = { type: "boolean", value: "autoBuild" };
trace.length = 0;
editor.changeDisplayInputNode(displayNode);
assert.ok(
  trace.includes(
    "prop:#script_override_true_value td:eq(1)>*:first-child input:checked:true",
  ),
);

// --- The catalog read the editor offers to custom expressions ---
assert.equal(conditionControls.evaluateCheck("Number", "8"), 8);
assert.equal(conditionControls.evaluateCheck("Nosuch", "8"), undefined);

// --- Opening the modal needs the override key held ---
let opened = 0;
const event = {
  ctrlKey: false,
  preventDefault: () => opened++,
  data: { label: "Auto Build (autoBuild)", name: "autoBuild", type: "boolean" },
};
editor.openOverrideModal(event);
assert.equal(opened, 0);
editor.openOverrideModal({ ...event, ctrlKey: true });
assert.equal(opened, 1);
assert.ok(trace.includes("modal:Auto Build (autoBuild)"));

console.log("Override editor controls tests passed");
