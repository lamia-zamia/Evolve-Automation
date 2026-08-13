import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const domTrace = [];
const actionTrace = [];
let sectionRegistration;
let sortableOptions;
const sortableBody = {
  append() {
    return sortableBody;
  },
  sortable(...args) {
    if (args[0] === "toArray") return ["Coal", "Iron"];
    sortableOptions = args[0];
    return sortableBody;
  },
};

function makeNode(selector) {
  return {
    ready() {
      return this;
    },
    empty() {
      domTrace.push(`empty:${selector}`);
      return this;
    },
    off(events) {
      domTrace.push(`off:${selector}:${events}`);
      return this;
    },
    append() {
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

function jquery(selector = "") {
  const key = String(selector);
  domTrace.push(`select:${key}`);
  if (key === "#script_storageTableBody") return sortableBody;
  return makeNode(key);
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};
const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  document,
  localStorage: {
    getItem: () => null,
    setItem() {},
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
});

assert.deepEqual(Object.keys(hooks.storageSettings), [
  "buildStorageSettings",
  "updateStorageSettingsContent",
]);

const settingsRaw = {};
const storageManager = {
  priorityList: [
    { id: "Iron", name: "Iron" },
    { id: "Coal", name: "Coal" },
  ],
  sortByPriority() {
    actionTrace.push("sortByPriority");
  },
};
hooks.setStorageSettingsTestContext({
  StorageManager: storageManager,
  settingsRaw,
  actions: {
    buildSettingsSection(...args) {
      sectionRegistration = args;
      actionTrace.push(`section:${args[0]}:${args[1]}`);
    },
    addSettingsToggle(_node, key) {
      actionTrace.push(`toggle:${key}`);
    },
    addTableToggle(_node, key) {
      actionTrace.push(`table-toggle:${key}`);
    },
    addTableInput(_node, key) {
      actionTrace.push(`table-input:${key}`);
    },
    buildTableLabel(label) {
      actionTrace.push(`label:${label}`);
      return `label:${label}`;
    },
    getSorterHelper: () => "helper",
  },
  resetStorageSettings(reset) {
    actionTrace.push(`resetStorageSettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
  resetCheckbox(...keys) {
    actionTrace.push(`resetCheckbox:${keys.join("|")}`);
  },
  removeStorageToggles() {
    actionTrace.push("removeStorageToggles");
  },
});

document.documentElement.scrollTop = 46;
document.body.scrollTop = 10;
domTrace.length = 0;
actionTrace.length = 0;
hooks.storageSettings.updateStorageSettingsContent();
assert.ok(domTrace.includes("select:#script_storageContent"));
assert.ok(domTrace.includes("empty:#script_storageContent"));
assert.ok(domTrace.includes("off:#script_storageContent:*"));
assert.deepEqual(actionTrace, [
  "toggle:storageLimitPreMad",
  "toggle:storageSafeReassign",
  "toggle:storageAssignExtra",
  "toggle:storageAssignPart",
  "label:Iron",
  "table-toggle:res_storageIron",
  "table-toggle:res_storage_o_Iron",
  "table-input:res_min_storeIron",
  "table-input:res_max_storeIron",
  "label:Coal",
  "table-toggle:res_storageCoal",
  "table-toggle:res_storage_o_Coal",
  "table-input:res_min_storeCoal",
  "table-input:res_max_storeCoal",
]);
assert.equal(document.documentElement.scrollTop, 46);
assert.equal(document.body.scrollTop, 46);

sortableOptions.update();
assert.deepEqual(settingsRaw, {
  res_storage_p_Coal: 0,
  res_storage_p_Iron: 1,
});
assert.deepEqual(actionTrace.slice(-2), [
  "sortByPriority",
  "updateSettingsFromState",
]);

actionTrace.length = 0;
hooks.storageSettings.buildStorageSettings();
assert.deepEqual(actionTrace, ["section:storage:Storage"]);
assert.equal(
  sectionRegistration[3],
  hooks.storageSettings.updateStorageSettingsContent,
);

actionTrace.length = 0;
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetStorageSettings:true",
  "updateSettingsFromState",
  "toggle:storageLimitPreMad",
  "toggle:storageSafeReassign",
  "toggle:storageAssignExtra",
  "toggle:storageAssignPart",
  "label:Iron",
  "table-toggle:res_storageIron",
  "table-toggle:res_storage_o_Iron",
  "table-input:res_min_storeIron",
  "table-input:res_max_storeIron",
  "label:Coal",
  "table-toggle:res_storageCoal",
  "table-toggle:res_storage_o_Coal",
  "table-input:res_min_storeCoal",
  "table-input:res_max_storeCoal",
  "resetCheckbox:autoStorage",
  "removeStorageToggles",
]);

console.log("Storage settings bundled characterization tests passed");
