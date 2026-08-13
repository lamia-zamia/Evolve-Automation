import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const trace = [];
const { hooks, sandbox } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  document: {
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({
    empty() {
      return this;
    },
    off() {
      return this;
    },
    append() {
      return this;
    },
    children() {
      return this;
    },
    eq() {
      return this;
    },
    val(value) {
      return value === undefined ? "Boolean" : this;
    },
    on() {
      return this;
    },
    sortable() {
      return [];
    },
    ready() {
      return this;
    },
  }),
});
const manager = {
  priorityList: [],
  AddTrigger: (...args) => trace.push(["add", ...args]),
  getTrigger: () => undefined,
  RemoveTrigger: (seq) => trace.push(["remove", seq]),
  DuplicateTrigger: (seq) => trace.push(["duplicate", seq]),
  EvalizeTrigger: (seq) => trace.push(["evalize", seq]),
  sortByPriority: () => trace.push("sort"),
};
hooks.setTriggerSettingsTestContext({
  TriggerManager: manager,
  checkTypes: { Boolean: { arg: "boolean", options: null, desc: "Boolean" } },
  argType: {
    research: { arg: "list", options: {}, desc: "Research" },
    building: { arg: "list", options: {}, desc: "Building" },
    project: { arg: "list", options: {}, desc: "Project" },
  },
  retBools: ["Boolean"],
  overrideOnlyChecks: [],
  actions: {
    buildSettingsSection: (...args) => trace.push(["build", args[0], args[1]]),
    buildInputNode: () => sandbox.$(),
    sorterHelper: () => {},
  },
  resetTriggerSettings: (value) => trace.push(["reset", value]),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (key) => trace.push(["checkbox", key]),
});
hooks.triggerSettings.buildTriggerSettings();
assert.deepEqual(trace, [["build", "trigger", "Trigger"]]);
trace.length = 0;
const registration = [];
hooks.setTriggerSettingsTestContext({
  TriggerManager: manager,
  checkTypes: { Boolean: { arg: "boolean", options: null, desc: "Boolean" } },
  argType: {
    research: { arg: "list", options: {}, desc: "Research" },
    building: { arg: "list", options: {}, desc: "Building" },
    project: { arg: "list", options: {}, desc: "Project" },
  },
  retBools: ["Boolean"],
  overrideOnlyChecks: [],
  actions: {
    buildSettingsSection: (...args) => registration.push(args),
    buildInputNode: () => sandbox.$(),
    sorterHelper: () => {},
  },
  resetTriggerSettings: (value) => trace.push(["reset", value]),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (key) => trace.push(["checkbox", key]),
});
hooks.triggerSettings.buildTriggerSettings();
registration[0][2]();
assert.deepEqual(trace, [
  ["reset", true],
  "persist",
  ["checkbox", "autoTrigger"],
]);

console.log("Trigger settings bundled characterization tests passed");
