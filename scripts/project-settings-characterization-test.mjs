import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const domTrace = [];
const actionTrace = [];
let sectionRegistration;
let sortableOptions;
const sortableBody = {
  empty() {
    return sortableBody;
  },
  off() {
    return sortableBody;
  },
  append() {
    return sortableBody;
  },
  next() {
    return sortableBody;
  },
  sortable(...args) {
    if (args[0] === "toArray") return ["Beta", "Alpha"];
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
      if (args[0] === "toArray") return ["Beta", "Alpha"];
      sortableOptions = args[0];
      return this;
    },
  };
}

function jquery(selector = "") {
  const key = String(selector);
  domTrace.push(`select:${key}`);
  if (key === "#script_projectTableBody") return sortableBody;
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
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
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
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.deepEqual(Object.keys(hooks.projectSettings), [
  "buildProjectSettings",
  "updateProjectSettingsContent",
]);

const settingsRaw = {};
const projectManager = {
  priorityList: [
    { id: "Alpha", name: "Project Alpha" },
    { id: "Beta", name: "Project Beta" },
  ],
  sortByPriority() {
    actionTrace.push("sortByPriority");
  },
};
hooks.setProjectSettingsTestContext({
  ProjectManager: projectManager,
  settingsRaw,
  actions: {
    buildSettingsSection(...args) {
      sectionRegistration = args;
      actionTrace.push(`section:${args[0]}:${args[1]}`);
    },
    addSettingsToggle(_node, key) {
      actionTrace.push(`toggle:${key}`);
    },
    addSettingsNumber(_node, key) {
      actionTrace.push(`number:${key}`);
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
  resetProjectSettings(reset) {
    actionTrace.push(`resetProjectSettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
  resetCheckbox(...keys) {
    actionTrace.push(`resetCheckbox:${keys.join("|")}`);
  },
});

document.documentElement.scrollTop = 46;
document.body.scrollTop = 10;
domTrace.length = 0;
actionTrace.length = 0;
hooks.projectSettings.updateProjectSettingsContent();
assert.ok(domTrace.includes("select:#script_projectContent"));
assert.ok(domTrace.includes("empty:#script_projectContent"));
assert.ok(domTrace.includes("off:#script_projectContent:*"));
assert.deepEqual(actionTrace, [
  "toggle:arpaScaleWeighting",
  "number:arpaStep",
  "label:Project Alpha",
  "table-toggle:arpa_Alpha",
  "table-input:arpa_m_Alpha",
  "table-input:arpa_w_Alpha",
  "label:Project Beta",
  "table-toggle:arpa_Beta",
  "table-input:arpa_m_Beta",
  "table-input:arpa_w_Beta",
]);
assert.equal(document.documentElement.scrollTop, 46);
assert.equal(document.body.scrollTop, 46);

sortableOptions.update();
assert.deepEqual(settingsRaw, { arpa_p_Beta: 0, arpa_p_Alpha: 1 });
assert.deepEqual(actionTrace.slice(-2), [
  "sortByPriority",
  "updateSettingsFromState",
]);

actionTrace.length = 0;
hooks.projectSettings.buildProjectSettings();
assert.deepEqual(actionTrace, ["section:project:A.R.P.A."]);
assert.equal(
  sectionRegistration[3],
  hooks.projectSettings.updateProjectSettingsContent,
);

actionTrace.length = 0;
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetProjectSettings:true",
  "updateSettingsFromState",
  "toggle:arpaScaleWeighting",
  "number:arpaStep",
  "label:Project Alpha",
  "table-toggle:arpa_Alpha",
  "table-input:arpa_m_Alpha",
  "table-input:arpa_w_Alpha",
  "label:Project Beta",
  "table-toggle:arpa_Beta",
  "table-input:arpa_m_Beta",
  "table-input:arpa_w_Beta",
  "resetCheckbox:autoARPA",
]);

console.log("Project settings bundled characterization tests passed");
