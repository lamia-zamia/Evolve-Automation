import assert from "node:assert/strict";

import { createBuildingSettingsBrowserAdapter } from "../src/adapters/browser/building-settings.ts";
import { createBuildingSettingsReadModel } from "../src/domain/progression/build/building-settings.ts";

const tableSorter = {
  attach(_element, options) {
    sortableHandlers.push(options.onOrderChanged);
  },
  readOrder: () => [],
};

const trace = [];
const handlers = [];
const sortableHandlers = [];
const document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 24 },
  getElementById: () => null,
};

function makeNode(label) {
  const node = {
    empty() {
      trace.push(`empty:${label}`);
      return node;
    },
    off(events) {
      trace.push(`off:${label}:${events}`);
      return node;
    },
    append(content) {
      trace.push(`append:${label}:${String(content).slice(0, 10)}`);
      return node;
    },
    appendTo(target) {
      trace.push(`appendTo:${label}:${target.label ?? "node"}`);
      return node;
    },
    find(selector) {
      return makeNode(`${label}.${selector}`);
    },
    next() {
      return makeNode(`${label}:next`);
    },
    addClass(className) {
      trace.push(`class:${label}:${className}`);
      return node;
    },
    toggleClass(className, value) {
      trace.push(`toggleClass:${label}:${className}:${value}`);
      return node;
    },
    prop(name, value) {
      trace.push(`prop:${label}:${name}:${value}`);
      return node;
    },
    on(...args) {
      const event = String(args[0]);
      const handler = typeof args[1] === "function" ? args[1] : args[2];
      handlers.push({ label, event, handler });
      return node;
    },
    0: "node",
    label,
  };
  return node;
}

const jquery = (selector) => makeNode(String(selector));
const model = createBuildingSettingsReadModel({
  allEnabled: true,
  allState: false,
  overrideKey: "ctrlKey",
  rows: [
    {
      id: "city",
      label: "City",
      color: "has-text-info",
      autoBuildSettingName: "batcity",
      maximumSettingName: "bld_m_city",
      weightingSettingName: "bld_w_city",
      stateSettingName: "bld_s_city",
      stateEnabled: true,
      hasStateOverride: true,
      hasSmartOverride: false,
    },
    {
      id: "transport",
      label: "Lake Transport",
      color: "has-text-danger",
      autoBuildSettingName: "battransport",
      maximumSettingName: "bld_m_transport",
      weightingSettingName: "bld_w_transport",
      stateSettingName: "bld_s_transport",
      stateEnabled: false,
      smartSettingName: "bld_s2_transport",
      smartEnabled: true,
      smartLinkedIds: ["transport", "bireme"],
      hasStateOverride: false,
      hasSmartOverride: true,
    },
  ],
});
const actions = {
  registration: undefined,
  buildSettingsSection(...args) {
    this.registration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsToggle(_node, key) {
    trace.push(`control:toggle:${key}`);
  },
  addSettingsNumber(_node, key) {
    trace.push(`control:number:${key}`);
  },
  addSettingsSelect(_node, key, _label, _hint, options) {
    trace.push(`control:select:${key}:${options.length}`);
  },
  addTableInput(_node, key) {
    trace.push(`input:${key}`);
  },
  addTableToggle(_node, key) {
    trace.push(`table-toggle:${key}`);
  },
  addToggleCallbacks(node, key) {
    trace.push(`callbacks:${key}`);
    return node;
  },
  buildTableLabel(label, _title, color) {
    trace.push(`label:${label}:${color}`);
    return makeNode(`label:${label}`);
  },
  confirm: () => true,
  getTableSorter: () => tableSorter,
};
const intents = [];
const settings = createBuildingSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => jquery,
  getReadModel: () => model,
  getFilterMatches: () => undefined,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});

settings.updateBuildingSettingsContent();
assert.deepEqual(
  trace.filter((entry) =>
    /^(control|label|table-toggle|input|callbacks):/.test(entry),
  ),
  [
    "control:toggle:buildingsIgnoreZeroRate",
    "control:toggle:buildingsLimitPowered",
    "control:toggle:buildingsTransportGem",
    "control:toggle:buildingsBestFreighter",
    "control:toggle:buildingsUseMultiClick",
    "control:toggle:buildingsBulkBuild",
    "control:number:buildingsBulkBuildMax",
    "control:number:buildingTowerSuppression",
    "control:select:buildingConsumptionCheck:3",
    "label:City:has-text-info",
    "table-toggle:batcity",
    "input:bld_m_city",
    "input:bld_w_city",
    "callbacks:bld_s_city",
    "label:Lake Transport:has-text-danger",
    "table-toggle:battransport",
    "input:bld_m_transport",
    "input:bld_w_transport",
    "callbacks:bld_s_transport",
  ],
);
assert.equal(document.documentElement.scrollTop, 24);
assert.equal(document.body.scrollTop, 24);

settings.buildBuildingSettings();
assert.deepEqual(trace.at(-1), "section:building:Building");
actions.registration[2]();
assert.deepEqual(intents, [{ type: "reset-building-settings" }]);

handlers
  .find((entry) => entry.label === "#script_resetBuildingsPriority")
  .handler();
sortableHandlers.at(-1)(["city", "transport"]);
assert.deepEqual(intents.slice(-2), [
  { type: "reset-building-priorities" },
  { type: "reorder-buildings", buildingIds: ["city", "transport"] },
]);

const linkedHandler = handlers.find(
  (entry) =>
    entry.event === "change" && entry.label.includes("bld_s2_transport"),
);
linkedHandler.handler.call({ checked: true }, {});
assert.deepEqual(intents.at(-1), {
  type: "set-linked-smart-state",
  buildingIds: ["transport", "bireme"],
  enabled: true,
});

console.log("Building settings browser adapter tests passed");
