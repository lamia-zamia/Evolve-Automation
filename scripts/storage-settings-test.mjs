import assert from "node:assert/strict";

import { createStorageSettingsBrowserAdapter } from "../src/adapters/browser/storage-settings.ts";
import { createStorageSettingsReadModel } from "../src/domain/storage-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 25 },
};
const trace = [];
let sectionRegistration;
let sortableOptions;

const readModel = createStorageSettingsReadModel([
  {
    id: "Iron",
    label: "Iron",
    enabledSettingName: "res_storageIron",
    overflowSettingName: "res_storage_o_Iron",
    minimumSettingName: "res_min_storeIron",
    maximumSettingName: "res_max_storeIron",
  },
  {
    id: "Coal",
    label: "Coal",
    enabledSettingName: "res_storageCoal",
    overflowSettingName: "res_storage_o_Coal",
    minimumSettingName: "res_min_storeCoal",
    maximumSettingName: "res_max_storeCoal",
  },
]);

function makeCell(rowIndex, cellIndex) {
  const cell = {
    append(content) {
      trace.push(`append:${rowIndex}:${cellIndex}:${String(content)}`);
      return cell;
    },
    next() {
      return makeCell(rowIndex, cellIndex + 1);
    },
  };
  return cell;
}

const tableBody = {
  append(content) {
    trace.push(`append:table-body:${String(content).slice(0, 12)}`);
    return tableBody;
  },
  sortable(...args) {
    if (args[0] === "toArray") return ["Coal", "Iron"];
    sortableOptions = args[0];
    return tableBody;
  },
};

function makeContentNode(selector) {
  return {
    empty() {
      trace.push(`empty:${selector}`);
      return this;
    },
    off(events) {
      trace.push(`off:${selector}:${events}`);
      return this;
    },
    append(content) {
      trace.push(`append:${selector}:${String(content).slice(0, 12)}`);
      return this;
    },
    next() {
      return this;
    },
    sortable(...args) {
      if (args[0] === "toArray") return ["Coal", "Iron"];
      sortableOptions = args[0];
      return this;
    },
  };
}

function getJQuery(selector) {
  if (selector === "#script_storageTableBody") return tableBody;
  if (selector === "#script_storage_Iron") return makeCell(0, 0);
  if (selector === "#script_storage_Coal") return makeCell(1, 0);
  return makeContentNode(String(selector));
}

const actions = {
  buildSettingsSection(...args) {
    sectionRegistration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsToggle(_node, settingName) {
    trace.push(`toggle:${settingName}`);
  },
  addTableToggle(_node, settingName) {
    trace.push(`table-toggle:${settingName}`);
  },
  addTableInput(_node, settingName) {
    trace.push(`table-input:${settingName}`);
  },
  buildTableLabel(label) {
    return `label:${label}`;
  },
  getSorterHelper() {
    return "helper";
  },
};

let intents = [];
const settings = createStorageSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => getJQuery,
  getReadModel: () => readModel,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});

settings.updateStorageSettingsContent();
assert.deepEqual(
  trace.filter((entry) => /^(toggle|table-)/.test(entry)),
  [
    "toggle:storageLimitPreMad",
    "toggle:storageSafeReassign",
    "toggle:storageAssignExtra",
    "toggle:storageAssignPart",
    "table-toggle:res_storageIron",
    "table-toggle:res_storage_o_Iron",
    "table-input:res_min_storeIron",
    "table-input:res_max_storeIron",
    "table-toggle:res_storageCoal",
    "table-toggle:res_storage_o_Coal",
    "table-input:res_min_storeCoal",
    "table-input:res_max_storeCoal",
  ],
);
assert.equal(document.documentElement.scrollTop, 25);
assert.equal(document.body.scrollTop, 25);
assert.equal(sortableOptions.items, "tr:not(.unsortable)");
sortableOptions.update();
assert.deepEqual(intents, [
  { type: "reorder-storage-resources", resourceIds: ["Coal", "Iron"] },
]);

trace.length = 0;
intents = [];
settings.buildStorageSettings();
assert.deepEqual(trace, ["section:storage:Storage"]);
assert.equal(sectionRegistration[3], settings.updateStorageSettingsContent);
sectionRegistration[2]();
assert.deepEqual(intents, [{ type: "reset-storage-settings" }]);

console.log("Storage settings browser adapter tests passed");
