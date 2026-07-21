import assert from "node:assert/strict";

import { createInterfaceSettingsBrowserAdapter } from "../src/adapters/browser/interface-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 12 },
};
let jqueryContext = "first";
let trace = [];
let controls = [];
let sectionRegistration;

function action(name, context) {
  const callback = () => trace.push(`${context}:${name}`);
  callback.label = name;
  return callback;
}

function makeActions(context) {
  return {
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
    controlEffects: {
      activeTargetsUI: {
        enabled: action("buildActiveTargetsUI", context),
        disabled: action("removeActiveTargetsUI", context),
      },
      buildPlannerUI: {
        enabled: action("buildBuildPlannerUI", context),
        disabled: action("removeBuildPlannerUI", context),
      },
      displayPrestigeTypeInTopBar: {
        enabled: action("updatePrestigeInTopBar", context),
        disabled: action("updatePrestigeInTopBar", context),
      },
      displayTotalDaysTypeInTopBar: {
        enabled: action("updateTotalDaysInTopBar", context),
        disabled: action("updateTotalDaysInTopBar", context),
      },
    },
  };
}

let actions = makeActions("first");
const settings = createInterfaceSettingsBrowserAdapter({
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
  intents: { handle: (intent) => trace.push(`intent:${intent.type}`) },
  getActions: () => actions,
});

settings.updateInterfaceSettingsContent();
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
settings.updateInterfaceSettingsContent();
assert.ok(trace.every((entry) => entry.startsWith("second:")));
assert.equal(controls[0].context, "second");
assert.equal(document.documentElement.scrollTop, 29);
assert.equal(document.body.scrollTop, 29);

trace = [];
settings.buildInterfaceSettings();
assert.deepEqual(trace, ["second:section:interface:Interface"]);
assert.equal(sectionRegistration[3], settings.updateInterfaceSettingsContent);

trace = [];
sectionRegistration[2]();
assert.deepEqual(trace, ["intent:reset-interface-settings"]);

assert.equal(controls[0].label, "Display detailed queue");
assert.equal(
  controls[0].hint,
  "Add UI in right column to display currently active queued buildings, technologies, and triggers and their resources.",
);

console.log("Interface settings browser adapter tests passed");
