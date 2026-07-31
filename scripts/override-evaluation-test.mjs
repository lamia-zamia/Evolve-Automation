import assert from "node:assert/strict";
import { createOverrideEvaluation } from "../src/settings/override-evaluation.ts";

// Comparators and check types matching the shape the override catalog supplies.
const checkCompare = {
  "==": (a, b) => a === b,
  ">=": (a, b) => a >= b,
  AND: (a, b) => a && b,
};
const checkCustom = { AND: true }; // custom-return comparator uses var2 as return
const checkTypes = {
  Boolean: { fn: (arg) => arg },
  Number: { fn: (arg) => arg },
  Value: { fn: (arg) => probe[arg] },
};
let probe = {};

let safeMode = false;
let windowOpen = false;
let recordShownMessages = false;
const dangerLog = [];
const lastMsgAll = {};
const tasks = new Set();
let settings;
let settingsRaw;
let displayNode;
let jqLength = 0;

const deps = {
  getSafeMode: () => safeMode,
  getSettings: () => settings,
  getSettingsRaw: () => settingsRaw,
  getCheckTypes: () => checkTypes,
  getCheckCompare: () => checkCompare,
  getCheckCustom: () => checkCustom,
  getHaveTask: () => (task) => tasks.has(task),
  getWindowManager: () => ({ isOpen: () => windowOpen }),
  getGame: () => ({ global: { lastMsg: { all: lastMsgAll } } }),
  getGameLog: () => ({
    logDanger: (kind, message) => {
      dangerLog.push(message);
      if (recordShownMessages) {
        lastMsgAll[`m${dangerLog.length}`] = { m: message };
      }
    },
  }),
  getJQuery: () => (selector) => ({ length: jqLength, selector }),
  changeDisplayInputNode: (node) => (displayNode = node),
};

const { updateOverrides } = createOverrideEvaluation(deps);

// --- Safe mode: copy raw verbatim and force-disable master toggle ---
safeMode = true;
settings = {};
settingsRaw = { masterScriptToggle: true, autoTax: true, overrides: {} };
updateOverrides();
assert.equal(settings.masterScriptToggle, false);
assert.equal(settings.autoTax, true);
safeMode = false;

// --- Single-value override applied when condition matches ---
settings = {};
settingsRaw = {
  autoBuild: false,
  tickRate: 5.3,
  overrides: {
    autoBuild: [
      {
        type1: "Boolean",
        arg1: true,
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: true,
      },
    ],
  },
};
updateOverrides();
assert.equal(settings.autoBuild, true);
// tickRate normalized to nearest 0.5 (round(5.3*2)/2 = 5.5), clamped [1,240].
assert.equal(settings.tickRate, 5.5);

// --- Non-matching condition leaves the base value ---
settings = {};
settingsRaw = {
  autoBuild: false,
  tickRate: 1,
  overrides: {
    autoBuild: [
      {
        type1: "Boolean",
        arg1: false,
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: true,
      },
    ],
  },
};
updateOverrides();
assert.equal(settings.autoBuild, false);

// --- Custom-return comparator returns var2 rather than ret ---
settings = {};
probe = { foo: 42 };
settingsRaw = {
  someNumber: 0,
  tickRate: 1,
  overrides: {
    someNumber: [
      {
        type1: "Boolean",
        arg1: true,
        type2: "Value",
        arg2: "foo",
        cmp: "AND",
        ret: 999,
      },
    ],
  },
};
updateOverrides();
assert.equal(settings.someNumber, 42);

// --- Xor list toggling for object-typed settings ---
settings = {};
settingsRaw = {
  ignoredList: ["a", "b", "c"],
  tickRate: 1,
  overrides: {
    ignoredList: [
      {
        // remove "b" (present -> spliced out)
        type1: "Boolean",
        arg1: true,
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: "b",
      },
      {
        // add "d" (absent -> pushed)
        type1: "Boolean",
        arg1: true,
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: "d",
      },
    ],
  },
};
updateOverrides();
assert.deepEqual(settings.ignoredList, ["a", "c", "d"]);
// Base raw list untouched.
assert.deepEqual(settingsRaw.ignoredList, ["a", "b", "c"]);

// --- Invalid condition logs danger once and skips ---
settings = {};
dangerLog.length = 0;
settingsRaw = {
  autoBuild: false,
  tickRate: 1,
  overrides: {
    autoBuild: [
      {
        type1: "Missing",
        arg1: true,
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: true,
      },
    ],
  },
};
updateOverrides();
assert.equal(dangerLog.length, 1);
assert.match(dangerLog[0], /variable not found/);
assert.equal(settings.autoBuild, false);

// --- Active game tasks force related automation off ---
settings = {};
tasks.add("bal_storage");
tasks.add("trash");
tasks.add("tax");
settingsRaw = {
  autoStorage: true,
  autoEject: true,
  autoTax: true,
  tickRate: 1,
  overrides: {},
};
updateOverrides();
assert.equal(settings.autoStorage, false);
assert.equal(settings.autoEject, false);
assert.equal(settings.autoTax, false);
tasks.clear();

// --- Visible override-display node is refreshed after evaluation ---
settings = {};
displayNode = null;
jqLength = 1;
settingsRaw = { autoBuild: false, tickRate: 1, overrides: {} };
updateOverrides();
assert.ok(displayNode);
assert.equal(displayNode.selector, "#script_override_true_value:visible");
jqLength = 0;

// --- A message already on screen from an earlier pass is not repeated ---
settings = {};
dangerLog.length = 0;
recordShownMessages = true;
settingsRaw = {
  autoBuild: false,
  tickRate: 1,
  overrides: {
    autoBuild: [
      {
        type1: "Missing",
        arg1: true,
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: true,
      },
    ],
  },
};
updateOverrides();
updateOverrides();
assert.equal(dangerLog.length, 1);
recordShownMessages = false;
for (const key of Object.keys(lastMsgAll)) {
  delete lastMsgAll[key];
}

// --- Nothing is logged while a script window is open ---
settings = {};
dangerLog.length = 0;
windowOpen = true;
updateOverrides();
assert.equal(dangerLog.length, 0);
assert.equal(settings.autoBuild, false);
windowOpen = false;

console.log("Override evaluation module tests passed");
