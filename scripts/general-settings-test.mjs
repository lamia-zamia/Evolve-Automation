import assert from "node:assert/strict";

import { createGeneralSettingsBrowserAdapter } from "../src/adapters/browser/general-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 20 },
};
let jqueryContext = "first";
let trace = [];
let controls = [];
let sectionRegistration;

function makeNode(selector) {
  return {
    empty() {
      trace.push(`empty:${jqueryContext}:${selector}`);
      return this;
    },
    off(events) {
      trace.push(`off:${events}`);
      return this;
    },
  };
}

let actions = {
  buildSettingsSection(...args) {
    sectionRegistration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsHeader1(_node, label) {
    controls.push({ kind: "header", label });
    trace.push(`header:${label}`);
  },
  addSettingsNumber(_node, key, label, hint) {
    controls.push({ kind: "number", key, label, hint });
    trace.push(`number:${key}`);
  },
  addSettingsSelect(_node, key, label, hint, options) {
    controls.push({ kind: "select", key, label, hint, options });
    trace.push(`select:${key}`);
  },
  addSettingsString(_node, key, label, hint) {
    controls.push({ kind: "string", key, label, hint });
    trace.push(`string:${key}`);
  },
  addSettingsToggle(_node, key, label, hint) {
    controls.push({ kind: "toggle", key, label, hint });
    trace.push(`toggle:${key}`);
  },
};

const settings = createGeneralSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => (selector) => makeNode(selector),
  intents: { handle: (intent) => trace.push(`intent:${intent.type}`) },
  getActions: () => actions,
});

settings.updateGeneralSettingsContent();
assert.deepEqual(
  controls.map(({ kind, key, label }) => ({ kind, key, label })),
  [
    { kind: "number", key: "tickRate", label: "Script tick rate" },
    { kind: "toggle", key: "tickSchedule", label: "Schedule script ticks" },
    {
      kind: "toggle",
      key: "exposeGating",
      label: "Skip the game's debug refresh between script ticks",
    },
    { kind: "header", key: undefined, label: "Prioritization" },
    {
      kind: "toggle",
      key: "useDemanded",
      label: "Allow using prioritized resources for crafting",
    },
    {
      kind: "toggle",
      key: "researchRequest",
      label: "Prioritize resources for Pre-MAD researches",
    },
    {
      kind: "toggle",
      key: "researchRequestSpace",
      label: "Prioritize resources for Space+ researches",
    },
    {
      kind: "toggle",
      key: "missionRequest",
      label: "Prioritize resources for missions",
    },
    { kind: "select", key: "prioritizeQueue", label: "Queue" },
    { kind: "select", key: "prioritizeTriggers", label: "Triggers" },
    { kind: "select", key: "prioritizeUnify", label: "Unification" },
    {
      kind: "select",
      key: "prioritizeOuterFleet",
      label: "Ship Yard Blueprint (The True Path)",
    },
    { kind: "header", key: undefined, label: "Auto clicker" },
    {
      kind: "toggle",
      key: "buildingAlwaysClick",
      label: "Always autoclick resources",
    },
    {
      kind: "number",
      key: "buildingClickPerTick",
      label: "Maximum clicks per tick",
    },
    { kind: "header", key: undefined, label: "Misc" },
    {
      kind: "string",
      key: "scriptSettingsExportFilename",
      label: "Export Filename",
    },
  ],
);
assert.deepEqual(
  controls
    .find(({ key }) => key === "prioritizeQueue")
    .options.map(({ val }) => val),
  ["ignore", "save", "req", "savereq"],
);
assert.equal(document.documentElement.scrollTop, 20);
assert.equal(document.body.scrollTop, 20);

document = {
  documentElement: { scrollTop: 35 },
  body: { scrollTop: 7 },
};
jqueryContext = "second";
trace = [];
controls = [];
settings.updateGeneralSettingsContent();
assert.deepEqual(trace.slice(0, 2), [
  "empty:second:#script_generalContent",
  "off:*",
]);
assert.equal(document.documentElement.scrollTop, 35);
assert.equal(document.body.scrollTop, 35);

trace = [];
settings.buildGeneralSettings();
assert.deepEqual(trace, ["section:general:General"]);
assert.equal(sectionRegistration[3], settings.updateGeneralSettingsContent);

trace = [];
sectionRegistration[2]();
assert.deepEqual(trace, ["intent:reset-general-settings"]);

console.log("General settings browser adapter tests passed");
