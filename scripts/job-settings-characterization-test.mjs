import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const domHandlers = new Map();
const domTrace = [];

function makeNode(label) {
  const node = {
    empty() {
      domTrace.push(`empty:${label}`);
      return node;
    },
    off() {
      return node;
    },
    append() {
      return node;
    },
    addClass(className) {
      domTrace.push(`class:${label}:${className}`);
      return node;
    },
    next() {
      return node;
    },
    on(_events, handler) {
      domHandlers.set(label, handler);
      return node;
    },
    ready() {
      return node;
    },
    sortable(first) {
      if (typeof first === "string") {
        return ["forager", "smelter", "unemployed"];
      }
      domHandlers.set(`${label}:sortable`, first.update);
      return node;
    },
  };
  return node;
}

function jquery(value) {
  return makeNode(String(value));
}

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  document: {
    documentElement: { scrollTop: 30 },
    body: { scrollTop: 7 },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeNode("created-element"),
    getElementById: () => null,
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
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
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

class BasicJob {}
class CraftingJob {}
const unemployed = {
  _originalId: "unemployed",
  _originalName: "Unemployed",
  is: {},
};
const forager = {
  _originalId: "forager",
  _originalName: "Forager",
  is: { split: true },
};
Object.setPrototypeOf(forager, BasicJob.prototype);
const smelter = {
  _originalId: "smelter",
  _originalName: "Smelter",
  is: { smart: true },
};
Object.setPrototypeOf(smelter, CraftingJob.prototype);
const jobs = { Unemployed: unemployed, Forager: forager, Smelter: smelter };
const settingsRaw = { overrides: {}, job_forager: true };
const trace = [];
const manager = {
  priorityList: [smelter, forager, unemployed],
  sortByPriority: () => trace.push("sort"),
};
const actions = {
  buildSettingsSection(...args) {
    this.registration = args;
  },
  addSettingsNumber(_node, settingName) {
    trace.push(`number:${settingName}`);
  },
  addSettingsToggle(_node, settingName) {
    trace.push(`toggle:${settingName}`);
  },
  addTableInput(_node, settingName) {
    trace.push(`input:${settingName}`);
  },
  addTableToggle(_node, settingName) {
    trace.push(`table-toggle:${settingName}`);
  },
  addToggleCallbacks(node, settingName) {
    trace.push(`callbacks:${settingName}`);
    return node;
  },
  getSorterHelper: () => "helper",
  confirm: () => true,
};

hooks.setJobSettingsTestContext({
  BasicJob,
  CraftingJob,
  JobManager: manager,
  jobs,
  settingsRaw,
  actions,
  resetJobSettings: (reset) => trace.push(`reset:${reset}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (...keys) => trace.push(`checkbox:${keys.join("|")}`),
});

const settings = hooks.jobSettings;
settings.buildJobSettings();
actions.registration[2]();
assert.deepEqual(
  trace
    .filter((entry) => /^(reset|checkbox):/.test(entry) || entry === "persist")
    .slice(-3),
  ["reset:true", "persist", "checkbox:autoJobs|autoCraftsmen"],
);
assert.equal(settingsRaw.job_p_unemployed, undefined);

domHandlers.get("#script_resetJobsPriority")();
assert.equal(
  manager.priorityList.map((job) => job._originalId).join(","),
  "unemployed,forager,smelter",
);
assert.equal(settingsRaw.job_p_unemployed, 0);
assert.equal(settingsRaw.job_p_forager, 1);
assert.equal(settingsRaw.job_p_smelter, 2);

domHandlers.get("#script_jobTableBody:sortable")();
assert.equal(manager.priorityList.length, 3);
assert.equal(settingsRaw.job_p_forager, 0);
assert.equal(settingsRaw.job_p_smelter, 1);
assert.equal(settingsRaw.job_p_unemployed, 2);
assert.equal(trace.includes("sort"), true);

console.log("Job settings bundled characterization tests passed");
