import assert from "node:assert/strict";

import { createTriggerSettingsIntentHandler } from "../src/application/trigger-settings.ts";
import { createTriggerSettingsBrowserAdapter } from "../src/adapters/browser/trigger-settings.ts";
import { createTriggerSettingsEvolveAdapter } from "../src/adapters/evolve/progression/build/trigger-settings.ts";

const manager = {
  priorityList: [
    {
      seq: 0,
      requirementType: "Boolean",
      requirementId: false,
      requirementCount: 1,
      actionType: "research",
      actionId: "tech-club",
      actionCount: 0,
    },
  ],
};
const checks = {
  Boolean: { arg: "boolean", options: null, desc: "Returns boolean" },
  Resource: { arg: "list", options: { list: {} }, desc: "Returns resource" },
  String: { arg: "string", options: null, desc: "Returns string" },
};
const argType = {
  building_cost: { arg: "list_cb", options: () => ({}) },
  research: { arg: "list", options: { list: {} }, desc: "Research" },
  building: { arg: "list", options: { list: {} }, desc: "Building" },
  project: { arg: "list", options: { list: {} }, desc: "Project" },
};

const reader = createTriggerSettingsEvolveAdapter({
  getTriggerManager: () => manager,
  getCheckTypes: () => checks,
  getActionInputs: () => argType,
  getBooleanResultChecks: () => ["Boolean"],
  getOverrideOnlyChecks: () => ["String"],
});
const model = reader.read();
assert.equal(model.rows.length, 1);
assert.deepEqual(Object.keys(model.checks), ["Boolean", "Resource"]);
assert.equal(model.actionInputs.building_cost.arg, "list_cb");
assert.equal("description" in model.actionInputs.building_cost, false);
assert.equal(Object.isFrozen(model), true);
assert.throws(
  () =>
    createTriggerSettingsEvolveAdapter({
      getTriggerManager: () => ({ priorityList: [{ seq: 0 }] }),
      getCheckTypes: () => checks,
      getActionInputs: () => argType,
      getBooleanResultChecks: () => ["Boolean"],
      getOverrideOnlyChecks: () => [],
    }).read(),
  /requirementType/,
);

const trace = [];
const intentHandler = createTriggerSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    addDefault: () => trace.push("add"),
    update: (...args) => trace.push(["update", ...args]),
    remove: (seq) => trace.push(["remove", seq]),
    duplicate: (seq) => trace.push(["duplicate", seq]),
    evalize: (seq) => trace.push(["evalize", seq]),
    reorder: (seqs) => trace.push(["reorder", ...seqs]),
    persist: () => trace.push("persist"),
  },
  render: () => trace.push("render"),
  effects: { resetCheckbox: () => trace.push("checkbox") },
});
intentHandler.handle({
  type: "update-trigger",
  seq: 0,
  field: "actionId",
  value: "tech-mad",
});
intentHandler.handle({ type: "evalize-trigger", seq: 0 });
intentHandler.handle({ type: "reset-trigger-settings" });
assert.deepEqual(trace, [
  ["update", 0, "actionId", "tech-mad"],
  "persist",
  "render",
  ["evalize", 0],
  "reset",
  "persist",
  "render",
  "checkbox",
]);

const registrations = [];
const node = {
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
};
const browser = createTriggerSettingsBrowserAdapter({
  getDocument: () => ({
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
  }),
  getJQuery: () => node,
  reader,
  intents: intentHandler,
  getActions: () => ({
    buildSettingsSection: (...args) => registrations.push(args),
    buildInputNode: () => node,
    sorterHelper: () => node,
  }),
});
browser.buildTriggerSettings();
assert.equal(registrations[0][0], "trigger");
assert.equal(registrations[0][1], "Trigger");

console.log(
  "Trigger settings domain, Evolve, browser, and application tests passed",
);
