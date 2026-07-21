import assert from "node:assert/strict";

import { createLoggingSettingsBrowserAdapter } from "../src/adapters/browser/logging-settings.ts";
import { createLoggingSettingsReadModel } from "../src/domain/logging-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 18 },
};
let jqueryContext = "first";
let trace = [];
let controls = [];
let sectionRegistration;
let filterHandler;
let appendedHtml;
let readModel = createLoggingSettingsReadModel({
  messageTypes: [
    { id: "special", label: "Specials" },
    { id: "research", label: "Research" },
  ],
  locale: "en-US",
  logFilter: "first-filter",
});

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
    append(content) {
      appendedHtml = content;
      trace.push(`append:${selector}`);
      return this;
    },
    on(events, handler) {
      trace.push(`on:${selector}:${events}`);
      if (selector === "#script_logFilter") filterHandler = handler;
      return this;
    },
  };
}

const actions = {
  buildSettingsSection2(...args) {
    sectionRegistration = args;
    trace.push(`section2:${args[1]}:${args[2]}:${args[3]}`);
  },
  addSettingsHeader1(_node, label) {
    controls.push({ kind: "header", label });
    trace.push(`header:${label}`);
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

const settings = createLoggingSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => (selector) => makeNode(selector),
  getReadModel: () => readModel,
  intents: {
    handle(intent) {
      trace.push(`intent:${intent.type}`);
      if (intent.type === "set-log-filter") {
        readModel = createLoggingSettingsReadModel({
          messageTypes: [
            { id: "special", label: "Specials" },
            { id: "research", label: "Research" },
          ],
          locale: "en-US",
          logFilter: "normalized-filter",
        });
      }
    },
  },
  getActions: () => actions,
});

settings.updateLoggingSettingsContent("");
assert.deepEqual(
  controls.map(({ kind, key, label }) => ({ kind, key, label })),
  [
    { kind: "header", key: undefined, label: "Script Messages" },
    { kind: "toggle", key: "logEnabled", label: "Enable logging" },
    { kind: "toggle", key: "log_special", label: "Specials" },
    { kind: "toggle", key: "log_research", label: "Research" },
    {
      kind: "string",
      key: "log_prestige_format",
      label: "Prestige Log Format",
    },
    { kind: "header", key: undefined, label: "Game Messages" },
    {
      kind: "toggle",
      key: "hellTurnOffLogMessages",
      label: "Turn off patrol and surveyor log messages",
    },
  ],
);
assert.match(appendedHtml, /strings\/strings\.json/);
assert.match(appendedHtml, />first-filter<\/textarea>/);
assert.equal(document.documentElement.scrollTop, 18);
assert.equal(document.body.scrollTop, 18);

filterHandler.call({ value: "typed-filter" });
assert.equal(trace.at(-1), "intent:set-log-filter");

readModel = createLoggingSettingsReadModel({
  messageTypes: [{ id: "special", label: "Specials" }],
  locale: "fr-FR",
  logFilter: "second-filter",
});
document = {
  documentElement: { scrollTop: 31 },
  body: { scrollTop: 6 },
};
jqueryContext = "second";
trace = [];
controls = [];
settings.updateLoggingSettingsContent("x-");
assert.deepEqual(trace.slice(0, 2), [
  "empty:second:#script_x-loggingContent",
  "off:*",
]);
assert.match(appendedHtml, /strings\/strings\.fr-FR\.json/);
assert.equal(document.documentElement.scrollTop, 31);
assert.equal(document.body.scrollTop, 31);

trace = [];
settings.buildLoggingSettings({}, "");
assert.deepEqual(trace, ["section2::logging:Logging"]);
assert.equal(sectionRegistration[5], settings.updateLoggingSettingsContent);

trace = [];
sectionRegistration[4]();
assert.deepEqual(trace, ["intent:reset-logging-settings"]);

console.log("Logging settings browser adapter tests passed");
