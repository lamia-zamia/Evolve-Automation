import assert from "node:assert/strict";

import { createGovernmentSettingsBrowserAdapter } from "../src/adapters/browser/government-settings.ts";
import { createGovernmentSettingsReadModel } from "../src/domain/civic/government-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 22 },
};
let jqueryContext = "first";
let trace = [];
let controls = [];
let sectionRegistration;

const readModel = createGovernmentSettingsReadModel({
  governmentOptions: [
    { val: "none", label: "None", hint: "Do not select government" },
    { val: "autocracy", label: "Autocracy", hint: "Autocracy description" },
    { val: "democracy", label: "Democracy", hint: "Democracy description" },
  ],
  governorOptions: [
    { val: "none", label: "None", hint: "Do not select governor" },
    {
      val: "governor_one",
      label: "Governor One",
      hint: "Governor description",
    },
  ],
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
  };
}

const actions = {
  buildSettingsSection2(...args) {
    sectionRegistration = args;
    trace.push(`section2:${args[1]}:${args[2]}:${args[3]}`);
  },
  addSettingsNumber(_node, key, label, hint) {
    controls.push({ kind: "number", key, label, hint });
    trace.push(`number:${key}`);
  },
  addSettingsSelect(_node, key, label, hint, options) {
    controls.push({ kind: "select", key, label, hint, options });
    trace.push(`select:${key}`);
  },
};

const settings = createGovernmentSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => (selector) => makeNode(selector),
  getReadModel: () => readModel,
  intents: {
    handle: (intent) =>
      trace.push(`intent:${intent.type}:${intent.secondaryPrefix}`),
  },
  getActions: () => actions,
});

settings.updateGovernmentSettingsContent("");
assert.deepEqual(
  controls.map(({ kind, key, label }) => ({ kind, key, label })),
  [
    {
      kind: "number",
      key: "generalRequestedTaxRate",
      label: "Forced tax rate",
    },
    {
      kind: "number",
      key: "generalMinimumTaxRate",
      label: "Minimum allowed tax rate",
    },
    {
      kind: "number",
      key: "generalMinimumMorale",
      label: "Minimum allowed morale",
    },
    {
      kind: "number",
      key: "generalMaximumMorale",
      label: "Maximum allowed morale",
    },
    { kind: "select", key: "govInterim", label: "Interim Government" },
    { kind: "select", key: "govFinal", label: "Second Government" },
    { kind: "select", key: "govSpace", label: "Space Government" },
    { kind: "select", key: "govGovernor", label: "Governor" },
  ],
);
assert.deepEqual(
  controls[4].options.map(({ val }) => val),
  ["none", "autocracy", "democracy"],
);
assert.deepEqual(
  controls[7].options.map(({ val }) => val),
  ["none", "governor_one"],
);
assert.equal(document.documentElement.scrollTop, 22);
assert.equal(document.body.scrollTop, 22);

document = {
  documentElement: { scrollTop: 37 },
  body: { scrollTop: 9 },
};
jqueryContext = "second";
trace = [];
controls = [];
settings.updateGovernmentSettingsContent("x-");
assert.deepEqual(trace.slice(0, 2), [
  "empty:second:#script_x-governmentContent",
  "off:*",
]);
assert.equal(document.documentElement.scrollTop, 37);
assert.equal(document.body.scrollTop, 37);

trace = [];
settings.buildGovernmentSettings({}, "x-");
assert.deepEqual(trace, ["section2:x-:government:Government"]);
assert.equal(sectionRegistration[5], settings.updateGovernmentSettingsContent);

trace = [];
sectionRegistration[4]();
assert.deepEqual(trace, ["intent:reset-government-settings:x-"]);

console.log("Government settings browser adapter tests passed");
