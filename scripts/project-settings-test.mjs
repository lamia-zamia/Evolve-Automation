import assert from "node:assert/strict";

import { createProjectSettingsBrowserAdapter } from "../src/adapters/browser/project-settings.ts";
import { createProjectSettingsReadModel } from "../src/domain/project-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 25 },
};
const trace = [];
let sectionRegistration;
let sortableOptions;

const readModel = createProjectSettingsReadModel([
  {
    id: "Alpha",
    label: "Project Alpha",
    enabledSettingName: "arpa_Alpha",
    maximumSettingName: "arpa_m_Alpha",
    weightingSettingName: "arpa_w_Alpha",
  },
  {
    id: "Beta",
    label: "Project Beta",
    enabledSettingName: "arpa_Beta",
    maximumSettingName: "arpa_m_Beta",
    weightingSettingName: "arpa_w_Beta",
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
  empty() {
    trace.push("empty:table-body");
    return tableBody;
  },
  off(events) {
    trace.push(`off:${events}`);
    return tableBody;
  },
  append(content) {
    trace.push(`append:table-body:${String(content).slice(0, 12)}`);
    return tableBody;
  },
  next() {
    return tableBody;
  },
  sortable(...args) {
    if (args[0] === "toArray") return ["Beta", "Alpha"];
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
      if (args[0] === "toArray") return ["Beta", "Alpha"];
      sortableOptions = args[0];
      return this;
    },
  };
}

function getJQuery(selector) {
  if (selector === "#script_projectTableBody") return tableBody;
  if (selector === "#script_Alpha") return makeCell(0, 0);
  if (selector === "#script_Beta") return makeCell(1, 0);
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
  addSettingsNumber(_node, settingName) {
    trace.push(`number:${settingName}`);
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
const settings = createProjectSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => getJQuery,
  getReadModel: () => readModel,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});

settings.updateProjectSettingsContent();
assert.deepEqual(
  trace.filter((entry) => /^(toggle|number|table-)/.test(entry)),
  [
    "toggle:arpaScaleWeighting",
    "number:arpaStep",
    "table-toggle:arpa_Alpha",
    "table-input:arpa_m_Alpha",
    "table-input:arpa_w_Alpha",
    "table-toggle:arpa_Beta",
    "table-input:arpa_m_Beta",
    "table-input:arpa_w_Beta",
  ],
);
assert.equal(document.documentElement.scrollTop, 25);
assert.equal(document.body.scrollTop, 25);
assert.equal(sortableOptions.items, "tr:not(.unsortable)");
sortableOptions.update();
assert.deepEqual(intents, [
  { type: "reorder-projects", projectIds: ["Beta", "Alpha"] },
]);

trace.length = 0;
intents = [];
settings.buildProjectSettings();
assert.deepEqual(trace, ["section:project:A.R.P.A."]);
assert.equal(sectionRegistration[3], settings.updateProjectSettingsContent);
sectionRegistration[2]();
assert.deepEqual(intents, [{ type: "reset-project-settings" }]);

console.log("Project settings browser adapter tests passed");
