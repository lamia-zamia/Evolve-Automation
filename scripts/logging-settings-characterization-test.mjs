import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const domTrace = [];
const actionTrace = [];
const nodes = new Map();
let sectionRegistration;
let appendedHtml;
let filterHandler;
const settingsRaw = { overrides: {}, triggers: [], logFilter: "initial" };

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
    append(content) {
      appendedHtml = content;
      domTrace.push(`append:${selector}`);
      return this;
    },
    on(events, handler) {
      domTrace.push(`on:${selector}:${events}`);
      if (selector === "#script_logFilter") filterHandler = handler;
      return this;
    },
  };
}

function jquery(selector = "") {
  const key = String(selector);
  domTrace.push(`select:${key}`);
  if (!nodes.has(key)) nodes.set(key, makeNode(key));
  return nodes.get(key);
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

assert.deepEqual(Object.keys(hooks.loggingSettings), [
  "buildLoggingSettings",
  "updateLoggingSettingsContent",
]);

hooks.setLoggingSettingsTestContext({
  game: { global: { settings: { locale: "en-US" } } },
  GameLog: {
    Types: { special: "Specials", research: "Research" },
  },
  settingsRaw,
  actions: {
    buildSettingsSection2(...args) {
      sectionRegistration = args;
      actionTrace.push(`section2:${args[1]}:${args[2]}:${args[3]}`);
    },
    addSettingsHeader1(_node, label) {
      actionTrace.push(`header:${label}`);
    },
    addSettingsString(_node, key) {
      actionTrace.push(`string:${key}`);
    },
    addSettingsToggle(_node, key) {
      actionTrace.push(`toggle:${key}`);
    },
  },
  resetLoggingSettings(reset) {
    settingsRaw.logFilter = "";
    actionTrace.push(`resetLoggingSettings:${reset}`);
  },
  updateSettingsFromState() {
    actionTrace.push("updateSettingsFromState");
  },
  buildFilterRegExp() {
    settingsRaw.logFilter = settingsRaw.logFilter.replace(
      "typed",
      "normalized",
    );
    actionTrace.push("buildFilterRegExp");
  },
});

domTrace.length = 0;
actionTrace.length = 0;
document.documentElement.scrollTop = 46;
document.body.scrollTop = 10;
hooks.loggingSettings.updateLoggingSettingsContent("");
assert.deepEqual(domTrace, [
  "select:#script_loggingContent",
  "empty:#script_loggingContent",
  "off:#script_loggingContent:*",
  "append:#script_loggingContent",
  "select:#script_logFilter",
  "on:#script_logFilter:change",
]);
assert.deepEqual(actionTrace, [
  "header:Script Messages",
  "toggle:logEnabled",
  "toggle:log_special",
  "toggle:log_research",
  "string:log_prestige_format",
  "header:Game Messages",
  "toggle:hellTurnOffLogMessages",
]);
assert.match(appendedHtml, /strings\/strings\.json/);
assert.match(appendedHtml, />initial<\/textarea>/);
assert.equal(document.documentElement.scrollTop, 46);
assert.equal(document.body.scrollTop, 46);

const filterInput = { value: "typed-filter" };
filterHandler.call(filterInput);
assert.equal(settingsRaw.logFilter, "normalized-filter");
assert.equal(filterInput.value, "normalized-filter");
assert.deepEqual(actionTrace.slice(-2), [
  "buildFilterRegExp",
  "updateSettingsFromState",
]);

actionTrace.length = 0;
domTrace.length = 0;
hooks.loggingSettings.buildLoggingSettings({}, "");
assert.deepEqual(actionTrace, ["section2::logging:Logging"]);
assert.equal(
  sectionRegistration[5],
  hooks.loggingSettings.updateLoggingSettingsContent,
);

actionTrace.length = 0;
domTrace.length = 0;
sectionRegistration[4]();
assert.equal(actionTrace[0], "resetLoggingSettings:true");
assert.equal(actionTrace[1], "updateSettingsFromState");
assert.equal(actionTrace.at(-1), "buildFilterRegExp");
assert.equal(settingsRaw.logFilter, "");
assert.ok(domTrace.includes("select:#script_loggingContent"));

console.log("Logging settings bundled characterization tests passed");
