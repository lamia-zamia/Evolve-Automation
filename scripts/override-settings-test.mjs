import assert from "node:assert/strict";
import { createOverrideSettings } from "../src/application/override-settings.ts";

// The handler owns only the calculation and the write-back. The evaluator, the failure report,
// and the effective-value display arrive as ports, so this test asserts what it delegates.
const trace = [];
let safeMode = false;
let forcedTasks = {
  storageTaskActive: false,
  trashTaskActive: false,
  taxTaskActive: false,
};
let reported;
let settings;
let settingsRaw;

const evaluator = {
  hasOperandType: (type) => type === "Boolean" || type === "Value",
  readOperand: (type, argument) =>
    type === "Boolean" ? argument : probe[argument],
  hasComparator: (comparator) => comparator === "==",
  compare: (comparator, left, right) => left === right,
  comparatorReturnsRightOperand: () => false,
};
let probe = {};

const { updateOverrides } = createOverrideSettings({
  getSafeMode: () => safeMode,
  getSettings: () => settings,
  getSettingsRaw: () => settingsRaw,
  source: {
    sampleEvaluator: () => {
      trace.push("sample");
      return evaluator;
    },
    readForcedTasks: () => {
      trace.push("tasks");
      return forcedTasks;
    },
  },
  reporter: {
    report: (failures) => {
      trace.push("report");
      reported = failures;
    },
  },
  display: {
    publish: () => trace.push("publish"),
  },
});

// --- Safe mode: copy raw verbatim, force the master toggle off, and touch no port ---
safeMode = true;
trace.length = 0;
settings = {};
settingsRaw = { masterScriptToggle: true, autoTax: true, overrides: {} };
updateOverrides();
assert.equal(settings.masterScriptToggle, false);
assert.equal(settings.autoTax, true);
assert.deepEqual(trace, []);
safeMode = false;

// --- A matching condition replaces the raw value; tickRate is normalized ---
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
// round(5.3 * 2) / 2 = 5.5, clamped to [1, 240].
assert.equal(settings.tickRate, 5.5);

// --- A list override is written back without touching the stored list ---
settings = {};
settingsRaw = {
  ignoredList: ["a", "b", "c"],
  tickRate: 1,
  overrides: {
    ignoredList: [
      {
        type1: "Boolean",
        arg1: true,
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: "b",
      },
      {
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
assert.deepEqual(settingsRaw.ignoredList, ["a", "b", "c"]);

// --- The forced-task answers come from the port, not from a task id in this layer ---
settings = {};
forcedTasks = {
  storageTaskActive: true,
  trashTaskActive: true,
  taxTaskActive: true,
};
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
forcedTasks = {
  storageTaskActive: false,
  trashTaskActive: false,
  taxTaskActive: false,
};

// --- Failures are handed to the reporter as data; the display always publishes ---
settings = {};
trace.length = 0;
reported = null;
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
assert.deepEqual(trace, ["sample", "tasks", "report", "publish"]);
assert.equal(reported.length, 1);
assert.deepEqual(reported[0], {
  settingKey: "autoBuild",
  conditionNumber: 1,
  reason: { kind: "unknown-operand-type", operandType: "Missing" },
});
assert.equal(settings.autoBuild, false);

// --- A clean pass still reports (with nothing) and still publishes ---
settings = {};
trace.length = 0;
settingsRaw = { autoBuild: false, tickRate: 1, overrides: {} };
updateOverrides();
assert.deepEqual(trace, ["sample", "tasks", "report", "publish"]);
assert.deepEqual(reported, []);

// --- Each pass re-reads its operands, so a changed answer changes the effective value ---
settings = {};
probe = { foo: true };
settingsRaw = {
  autoBuild: false,
  tickRate: 1,
  overrides: {
    autoBuild: [
      {
        type1: "Value",
        arg1: "foo",
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
probe = { foo: false };
settings = {};
updateOverrides();
assert.equal(settings.autoBuild, false);

// --- The effective settings are a layer over the stored ones, not a copy ---
// Only the keys this pass decided are own properties; everything else resolves
// to the stored setting as it stands now.
settings = {};
probe = { foo: true };
settingsRaw = {
  autoBuild: false,
  autoTax: true,
  tickRate: 1,
  overrides: {
    autoBuild: [
      {
        type1: "Value",
        arg1: "foo",
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
assert.equal(settings.autoTax, true);
assert.ok(Object.hasOwn(settings, "autoBuild"));
assert.ok(!Object.hasOwn(settings, "autoTax"));

// A stored value edited between passes is read live, without a pass.
settingsRaw.autoTax = false;
assert.equal(settings.autoTax, false);

// A condition that stops matching drops the override rather than leaving the
// previous pass's value behind.
probe = { foo: false };
updateOverrides();
assert.equal(settings.autoBuild, false);
assert.ok(!Object.hasOwn(settings, "autoBuild"));

// --- Replacing the stored settings (import, reset) re-points the layer ---
settingsRaw = { autoBuild: true, tickRate: 1, overrides: {} };
updateOverrides();
assert.equal(settings.autoBuild, true);

// --- Safe mode clears the previous pass's overrides too ---
probe = { foo: true };
settingsRaw = {
  autoBuild: false,
  tickRate: 1,
  masterScriptToggle: true,
  overrides: {
    autoBuild: [
      {
        type1: "Value",
        arg1: "foo",
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
safeMode = true;
updateOverrides();
assert.equal(settings.autoBuild, false);
assert.equal(settings.masterScriptToggle, false);
safeMode = false;

console.log("Override settings handler tests passed");
