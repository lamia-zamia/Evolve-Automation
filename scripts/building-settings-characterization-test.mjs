import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const tableSorter = {
  attach(_element, options) {
    sortableHandlers.push(options.onOrderChanged);
  },
  readOrder: () => [],
};

const handlers = [];
const sortableHandlers = [];
const trace = [];
let registration;

function makeNode(label) {
  const node = {
    empty() {
      return node;
    },
    off() {
      return node;
    },
    append() {
      return node;
    },
    appendTo() {
      return node;
    },
    find() {
      return node;
    },
    next() {
      return node;
    },
    addClass() {
      return node;
    },
    toggleClass() {
      return node;
    },
    prop() {
      return node;
    },
    on(...args) {
      const event = String(args[0]);
      const handler = typeof args[1] === "function" ? args[1] : args[2];
      handlers.push({ label, event, handler });
      return node;
    },
    0: "node",
    ready() {
      return node;
    },
  };
  return node;
}

function jquery(value) {
  return makeNode(String(value));
}

const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  document: {
    documentElement: { scrollTop: 33 },
    body: { scrollTop: 12 },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeNode("created-element"),
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
  $: jquery,
});

const city = {
  _vueBinding: "city",
  name: "City",
  _tab: "city",
  is: { smart: false },
  isSwitchable: () => true,
};
const transport = {
  _vueBinding: "transport",
  name: "Lake Transport",
  _tab: "space",
  is: { smart: true },
  isSwitchable: () => true,
};
const settingsRaw = { overrides: {}, buildingEnabledAll: true };
const manager = {
  priorityList: [city, transport],
  sortByPriority: () => trace.push("sort"),
};
const actions = {
  buildSettingsSection(...args) {
    registration = args;
  },
  addSettingsToggle(_node, key) {
    trace.push(`toggle:${key}`);
  },
  addSettingsNumber(_node, key) {
    trace.push(`number:${key}`);
  },
  addSettingsSelect(_node, key) {
    trace.push(`select:${key}`);
  },
  addTableToggle(_node, key) {
    trace.push(`table-toggle:${key}`);
  },
  addTableInput(_node, key) {
    trace.push(`input:${key}`);
  },
  addToggleCallbacks(_node, key) {
    trace.push(`callbacks:${key}`);
    return makeNode(key);
  },
  buildTableLabel(_label, _title, color) {
    trace.push(`label:${color}`);
    return makeNode("label");
  },
  confirm: () => true,
  getTableSorter: () => tableSorter,
};

hooks.setBuildingSettingsTestContext({
  BuildingManager: manager,
  buildingIds: { city, transport },
  resources: {},
  linkedBuildings: [],
  checkCompare: {},
  overrideKey: "ctrlKey",
  getRealNumber: (value) => Number(value),
  initBuildingState: () => trace.push("init"),
  settingsRaw,
  actions,
  resetBuildingSettings: (reset) => trace.push(`reset:${reset}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (...keys) => trace.push(`checkbox:${keys.join("|")}`),
  removeBuildingToggles: () => trace.push("cleanup:building"),
});

hooks.buildingSettings.buildBuildingSettings();
registration[2]();
assert.deepEqual(trace.slice(0, 3), [
  "reset:true",
  "persist",
  "toggle:buildingsIgnoreZeroRate",
]);
assert.equal(trace.includes("select:buildingConsumptionCheck"), true);
assert.equal(trace.includes("table-toggle:batcity"), true);
assert.equal(trace.includes("input:bld_m_transport"), true);
assert.deepEqual(trace.slice(-2), [
  "checkbox:autoBuild|autoPower",
  "cleanup:building",
]);

handlers
  .find((entry) => entry.label === "#script_resetBuildingsPriority")
  .handler();
assert.equal(settingsRaw.bld_p_city, 0);
assert.equal(settingsRaw.bld_p_transport, 1);
sortableHandlers.at(-1)(["city", "transport"]);
assert.equal(trace.includes("sort"), true);

console.log("Building settings bundled characterization tests passed");
