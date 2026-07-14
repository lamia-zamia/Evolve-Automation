import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
let domTrace = [];

function jquery(selector) {
  domTrace.push(`select:${selector}`);
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
  };
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: () => null,
  getElementById: () => null,
};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
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

assert.deepEqual(Object.keys(hooks.interfaceSettings), [
  "buildInterfaceSettings",
  "updateInterfaceSettingsContent",
]);
assert.equal(typeof hooks.setInterfaceSettingsTestContext, "function");

const settingsRaw = {
  overrides: {},
  triggers: [],
  activeTargetsUI: true,
  buildPlannerUI: false,
  displayPrestigeTypeInTopBar: false,
  displayTotalDaysTypeInTopBar: true,
  performanceHackAvoidDrawTech: true,
};
let actionTrace = [];
let controls = [];
let sectionRegistration;

function action(name) {
  const callback = () => actionTrace.push(name);
  callback.label = name;
  return callback;
}

const actions = {
  buildActiveTargetsUI: action("buildActiveTargetsUI"),
  removeActiveTargetsUI: action("removeActiveTargetsUI"),
  buildBuildPlannerUI: action("buildBuildPlannerUI"),
  removeBuildPlannerUI: action("removeBuildPlannerUI"),
  updatePrestigeInTopBar: action("updatePrestigeInTopBar"),
  updateTotalDaysInTopBar: action("updateTotalDaysInTopBar"),
  resetInterfaceSettings(reset) {
    actionTrace.push(`resetInterfaceSettings:${reset}`);
    Object.assign(settingsRaw, {
      activeTargetsUI: false,
      buildPlannerUI: true,
      buildPlannerCollapsed: false,
      displayPrestigeTypeInTopBar: true,
      displayTotalDaysTypeInTopBar: false,
      performanceHackAvoidDrawTech: false,
    });
  },
  updateSettingsFromState: () => actionTrace.push("updateSettingsFromState"),
  buildSettingsSection(...args) {
    sectionRegistration = args;
    actionTrace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsToggle(_node, key, label, hint, enabled, disabled) {
    controls.push({
      type: "toggle",
      key,
      label,
      hint,
      enabled: enabled?.label ?? null,
      disabled: disabled?.label ?? null,
    });
    actionTrace.push(`toggle:${key}`);
    if (settingsRaw[key] && enabled) {
      enabled();
    }
  },
  addSettingsHeader1(_node, label) {
    controls.push({ type: "header", label });
    actionTrace.push(`header:${label}`);
  },
};

hooks.setInterfaceSettingsTestContext({ settingsRaw, actions });

document.documentElement.scrollTop = 44;
document.body.scrollTop = 9;
hooks.interfaceSettings.updateInterfaceSettingsContent();
assert.deepEqual(domTrace.slice(-3), [
  "select:#script_interfaceContent",
  "empty:#script_interfaceContent",
  "off:#script_interfaceContent:*",
]);
assert.deepEqual(actionTrace, [
  "toggle:activeTargetsUI",
  "buildActiveTargetsUI",
  "toggle:buildPlannerUI",
  "toggle:displayPrestigeTypeInTopBar",
  "toggle:displayTotalDaysTypeInTopBar",
  "updateTotalDaysInTopBar",
  "header:Experimental",
  "toggle:performanceHackAvoidDrawTech",
]);
assert.deepEqual(controls, [
  {
    type: "toggle",
    key: "activeTargetsUI",
    label: "Display detailed queue",
    hint: "Add UI in right column to display currently active queued buildings, technologies, and triggers and their resources.",
    enabled: "buildActiveTargetsUI",
    disabled: "removeActiveTargetsUI",
  },
  {
    type: "toggle",
    key: "buildPlannerUI",
    label: "Display script planner",
    hint: "Add UI below the message log showing the top buildings/projects autoBuild wants next, their weights, what's blocking them, and cumulative bottleneck statistics for the current run.",
    enabled: "buildBuildPlannerUI",
    disabled: "removeBuildPlannerUI",
  },
  {
    type: "toggle",
    key: "displayPrestigeTypeInTopBar",
    label: "Display prestige type in top bar",
    hint: "Show the currently selected prestige type in the top bar",
    enabled: "updatePrestigeInTopBar",
    disabled: "updatePrestigeInTopBar",
  },
  {
    type: "toggle",
    key: "displayTotalDaysTypeInTopBar",
    label: "Display total days in top bar",
    hint: "Show the total days next to this year's days",
    enabled: "updateTotalDaysInTopBar",
    disabled: "updateTotalDaysInTopBar",
  },
  { type: "header", label: "Experimental" },
  {
    type: "toggle",
    key: "performanceHackAvoidDrawTech",
    label: "Enable performance hack: drawTech avoidance",
    hint: "Enables experimental performance hacks designed to avoid excessive redraws of expensive game tabs. The ARPA path preserves game behaviour; the repeat-building path is narrowly guarded but may still be risky if game internals change.",
    enabled: null,
    disabled: null,
  },
]);
assert.equal(document.documentElement.scrollTop, 44);
assert.equal(document.body.scrollTop, 44);

actionTrace = [];
controls = [];
domTrace = [];
hooks.interfaceSettings.buildInterfaceSettings();
assert.deepEqual(actionTrace, ["section:interface:Interface"]);
assert.equal(
  sectionRegistration[3],
  hooks.interfaceSettings.updateInterfaceSettingsContent,
);

actionTrace = [];
sectionRegistration[2]();
assert.deepEqual(actionTrace, [
  "resetInterfaceSettings:true",
  "updateSettingsFromState",
  "toggle:activeTargetsUI",
  "toggle:buildPlannerUI",
  "buildBuildPlannerUI",
  "toggle:displayPrestigeTypeInTopBar",
  "updatePrestigeInTopBar",
  "toggle:displayTotalDaysTypeInTopBar",
  "header:Experimental",
  "toggle:performanceHackAvoidDrawTech",
  "removeActiveTargetsUI",
  "buildBuildPlannerUI",
  "updatePrestigeInTopBar",
  "updateTotalDaysInTopBar",
]);
assert.deepEqual(domTrace, [
  "select:#script_interfaceContent",
  "empty:#script_interfaceContent",
  "off:#script_interfaceContent:*",
]);
assert.deepEqual(
  {
    activeTargetsUI: settingsRaw.activeTargetsUI,
    buildPlannerUI: settingsRaw.buildPlannerUI,
    displayPrestigeTypeInTopBar: settingsRaw.displayPrestigeTypeInTopBar,
    displayTotalDaysTypeInTopBar: settingsRaw.displayTotalDaysTypeInTopBar,
    performanceHackAvoidDrawTech: settingsRaw.performanceHackAvoidDrawTech,
  },
  {
    activeTargetsUI: false,
    buildPlannerUI: true,
    displayPrestigeTypeInTopBar: true,
    displayTotalDaysTypeInTopBar: false,
    performanceHackAvoidDrawTech: false,
  },
);

console.log("Interface settings bundled characterization tests passed");
