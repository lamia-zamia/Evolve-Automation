import assert from "node:assert/strict";

import { createJobSettingsBrowserAdapter } from "../src/adapters/browser/job-settings.ts";
import { createJobSettingsReadModel } from "../src/domain/civic/job-settings.ts";

const trace = [];
let document = { documentElement: { scrollTop: 0 }, body: { scrollTop: 18 } };
const handlers = new Map();

function makeNode(selector) {
  const node = {
    empty() {
      trace.push(`empty:${selector}`);
      return node;
    },
    off(events) {
      trace.push(`off:${selector}:${events}`);
      return node;
    },
    append(content) {
      trace.push(`append:${selector}:${String(content).slice(0, 12)}`);
      return node;
    },
    addClass(className) {
      trace.push(`class:${selector}:${className}`);
      return node;
    },
    next() {
      return node;
    },
    on(events, handler) {
      handlers.set(selector, handler);
      trace.push(`on:${selector}:${events}`);
      return node;
    },
    sortable(options) {
      if (typeof options === "string") return ["forager", "smelter"];
      handlers.set(`${selector}:sortable`, options.update);
      trace.push(`sortable:${selector}`);
      return node;
    },
  };
  return node;
}

const jquery = (selector) => makeNode(String(selector));
const readModel = createJobSettingsReadModel({
  rows: [
    {
      id: "smelter",
      label: "Smelter",
      color: "danger",
      enabledSettingName: "job_smelter",
      enabled: false,
      hasOverride: false,
      breakpoints: [
        { kind: "managed" },
        { kind: "managed" },
        { kind: "managed" },
      ],
    },
    {
      id: "forager",
      label: "Forager",
      color: "info",
      enabledSettingName: "job_forager",
      enabled: true,
      hasOverride: true,
      breakpoints: [
        { kind: "input", settingName: "job_b1_forager" },
        { kind: "input", settingName: "job_b2_forager" },
        { kind: "weighted" },
      ],
      smartSettingName: "job_s_forager",
    },
  ],
});

const actions = {
  buildSettingsSection(...args) {
    trace.push(`section:${args[0]}:${args[1]}`);
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
  confirm: (message) => {
    trace.push(`confirm:${message}`);
    return true;
  },
};

const intents = [];
const settings = createJobSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => jquery,
  getReadModel: () => readModel,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});

settings.updateJobSettingsContent();
assert.deepEqual(
  trace.filter((entry) =>
    /^(number|toggle|input|table-toggle|callbacks):/.test(entry),
  ),
  [
    "toggle:jobSetDefault",
    "toggle:jobManageServants",
    "number:jobLumberWeighting",
    "number:jobQuarryWeighting",
    "number:jobCrystalWeighting",
    "number:jobScavengerWeighting",
    "number:jobRaiderWeighting",
    "number:jobForagerWeighting",
    "toggle:jobDisableMiners",
    "callbacks:job_smelter",
    "callbacks:job_forager",
    "input:job_b1_forager",
    "input:job_b2_forager",
    "table-toggle:job_s_forager",
  ],
);
assert.ok(trace.includes("class:#script_smelter:script_bg_job_smelter"));
assert.ok(
  trace.includes("class:#script_forager:script_bg_job_forager inactive-row"),
);
assert.equal(document.documentElement.scrollTop, 18);
assert.equal(document.body.scrollTop, 18);

trace.length = 0;
settings.buildJobSettings();
assert.deepEqual(trace.slice(0, 1), ["section:job:Job"]);
actions.registration[2]();
assert.deepEqual(intents, [{ type: "reset-job-settings" }]);

handlers.get("#script_resetJobsPriority")();
handlers.get("#script_jobTableBody:sortable")();
assert.deepEqual(intents, [
  { type: "reset-job-settings" },
  { type: "reset-job-priorities" },
  { type: "reorder-jobs", jobIds: ["forager", "smelter"] },
]);

console.log("Job settings browser adapter tests passed");
