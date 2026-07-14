import assert from "node:assert/strict";

import { createInterfaceSettings } from "../src/ui/interface-settings.ts";

let settingsRaw = { activeTargetsUI: false, buildPlannerUI: true };
let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 12 },
};
let jqueryContext = "first";
let actions;
let trace = [];
let controls = [];
let sectionRegistration;

function action(name, context) {
  const callback = () => trace.push(`${context}:${name}`);
  callback.label = name;
  return callback;
}

function makeActions(context) {
  const result = {
    buildActiveTargetsUI: action("buildActiveTargetsUI", context),
    removeActiveTargetsUI: action("removeActiveTargetsUI", context),
    buildBuildPlannerUI: action("buildBuildPlannerUI", context),
    removeBuildPlannerUI: action("removeBuildPlannerUI", context),
    updatePrestigeInTopBar: action("updatePrestigeInTopBar", context),
    updateTotalDaysInTopBar: action("updateTotalDaysInTopBar", context),
    resetInterfaceSettings: (reset) =>
      trace.push(`${context}:resetInterfaceSettings:${reset}`),
    updateSettingsFromState: () =>
      trace.push(`${context}:updateSettingsFromState`),
    buildSettingsSection(...args) {
      sectionRegistration = args;
      trace.push(`${context}:section:${args[0]}:${args[1]}`);
    },
    addSettingsToggle(_node, key, label, hint, enabled, disabled) {
      controls.push({
        context,
        key,
        label,
        hint,
        enabled: enabled?.label ?? null,
        disabled: disabled?.label ?? null,
      });
      trace.push(`${context}:toggle:${key}`);
    },
    addSettingsHeader1(_node, label) {
      trace.push(`${context}:header:${label}`);
    },
  };
  return result;
}

actions = makeActions("first");
const interfaceSettings = createInterfaceSettings({
  getSettingsRaw: () => settingsRaw,
  getDocument: () => document,
  getJQuery: () => (selector) => ({
    empty() {
      trace.push(`${jqueryContext}:empty:${selector}`);
      return this;
    },
    off(events) {
      trace.push(`${jqueryContext}:off:${events}`);
      return this;
    },
  }),
  getActions: () => actions,
});

interfaceSettings.updateInterfaceSettingsContent();
assert.deepEqual(
  controls.map(({ key, enabled, disabled }) => ({ key, enabled, disabled })),
  [
    {
      key: "activeTargetsUI",
      enabled: "buildActiveTargetsUI",
      disabled: "removeActiveTargetsUI",
    },
    {
      key: "buildPlannerUI",
      enabled: "buildBuildPlannerUI",
      disabled: "removeBuildPlannerUI",
    },
    {
      key: "displayPrestigeTypeInTopBar",
      enabled: "updatePrestigeInTopBar",
      disabled: "updatePrestigeInTopBar",
    },
    {
      key: "displayTotalDaysTypeInTopBar",
      enabled: "updateTotalDaysInTopBar",
      disabled: "updateTotalDaysInTopBar",
    },
    {
      key: "performanceHackAvoidDrawTech",
      enabled: null,
      disabled: null,
    },
  ],
);
assert.equal(document.documentElement.scrollTop, 12);
assert.equal(document.body.scrollTop, 12);

document = {
  documentElement: { scrollTop: 29 },
  body: { scrollTop: 4 },
};
jqueryContext = "second";
actions = makeActions("second");
trace = [];
controls = [];
interfaceSettings.updateInterfaceSettingsContent();
assert.ok(trace.every((entry) => entry.startsWith("second:")));
assert.equal(controls[0].context, "second");
assert.equal(document.documentElement.scrollTop, 29);
assert.equal(document.body.scrollTop, 29);

trace = [];
interfaceSettings.buildInterfaceSettings();
assert.deepEqual(trace, ["second:section:interface:Interface"]);
assert.equal(
  sectionRegistration[3],
  interfaceSettings.updateInterfaceSettingsContent,
);

settingsRaw = { activeTargetsUI: true, buildPlannerUI: false };
trace = [];
sectionRegistration[2]();
assert.deepEqual(trace.slice(0, 2), [
  "second:resetInterfaceSettings:true",
  "second:updateSettingsFromState",
]);
assert.deepEqual(trace.slice(-4), [
  "second:buildActiveTargetsUI",
  "second:removeBuildPlannerUI",
  "second:updatePrestigeInTopBar",
  "second:updateTotalDaysInTopBar",
]);

assert.equal(controls[0].label, "Display detailed queue");
assert.equal(
  controls[0].hint,
  "Add UI in right column to display currently active queued buildings, technologies, and triggers and their resources.",
);

console.log("Interface settings module tests passed");
