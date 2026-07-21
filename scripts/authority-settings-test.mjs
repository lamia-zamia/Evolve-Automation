import assert from "node:assert/strict";

import { createAuthoritySettingsBrowserAdapter } from "../src/adapters/browser/authority-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 18 },
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
  addSettingsToggle(_node, key, label, hint) {
    controls.push({ kind: "toggle", key, label, hint });
    trace.push(`toggle:${key}`);
  },
  addSettingsNumber(_node, key, label, hint) {
    controls.push({ kind: "number", key, label, hint });
    trace.push(`number:${key}`);
  },
};

const settings = createAuthoritySettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => (selector) => makeNode(selector),
  intents: { handle: (intent) => trace.push(`intent:${intent.type}`) },
  getActions: () => actions,
});

settings.updateAuthoritySettingsContent();
assert.deepEqual(
  controls.map(({ kind, key }) => ({ kind, key })),
  [
    { kind: "toggle", key: "authorityManage" },
    { kind: "number", key: "generalMinimumAuthority" },
    { kind: "number", key: "generalAuthorityMinPatrolPercent" },
    { kind: "number", key: "buildingWeightingAuthority" },
  ],
);
assert.equal(document.documentElement.scrollTop, 18);
assert.equal(document.body.scrollTop, 18);

document = {
  documentElement: { scrollTop: 33 },
  body: { scrollTop: 6 },
};
jqueryContext = "second";
trace = [];
controls = [];
settings.updateAuthoritySettingsContent();
assert.deepEqual(trace.slice(0, 2), [
  "empty:second:#script_authorityContent",
  "off:*",
]);
assert.equal(document.documentElement.scrollTop, 33);
assert.equal(document.body.scrollTop, 33);
assert.equal(controls[0].label, "Manage Authority");

trace = [];
settings.buildAuthoritySettings();
assert.deepEqual(trace, ["section:authority:Authority"]);
assert.equal(sectionRegistration[3], settings.updateAuthoritySettingsContent);

trace = [];
sectionRegistration[2]();
assert.deepEqual(trace, ["intent:reset-authority-settings"]);

console.log("Authority settings browser adapter tests passed");
