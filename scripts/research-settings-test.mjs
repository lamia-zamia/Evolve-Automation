import assert from "node:assert/strict";

import { createResearchSettingsBrowserAdapter } from "../src/adapters/browser/research-settings.ts";
import { createResearchSettingsReadModel } from "../src/domain/progression/research/research-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 20 },
};
let jqueryContext = "first";
let trace = [];
let controls = [];
let sectionRegistration;

const technologies = {
  "tech-anthropology": {
    _vueBinding: "tech-anthropology",
    name: "Anthropology",
  },
  "tech-fanaticism": {
    _vueBinding: "tech-fanaticism",
    name: "Fanaticism",
  },
};

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
  buildSettingsSection(...args) {
    sectionRegistration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsSelect(_node, key, label, hint, options) {
    controls.push({ kind: "select", key, label, hint, options });
    trace.push(`select:${key}`);
  },
  addSettingsList(_node, key, label, hint, list) {
    controls.push({ kind: "list", key, label, hint, list });
    trace.push(`list:${key}`);
  },
};

const settings = createResearchSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => (selector) => makeNode(selector),
  getReadModel: () =>
    createResearchSettingsReadModel({
      localize: (key) => `localized:${key}`,
      technologies,
    }),
  intents: { handle: (intent) => trace.push(`intent:${intent.type}`) },
  getActions: () => actions,
});

settings.updateResearchSettingsContent();
assert.deepEqual(
  controls.map(({ kind, key, label }) => ({ kind, key, label })),
  [
    {
      kind: "select",
      key: "userResearchTheology_1",
      label: "Target Theology 1",
    },
    {
      kind: "select",
      key: "userResearchTheology_2",
      label: "Target Theology 2",
    },
    { kind: "list", key: "researchIgnore", label: "Ignored researches" },
  ],
);
assert.deepEqual(
  controls[0].options.map(({ val, label, hint }) => ({ val, label, hint })),
  [
    {
      val: "auto",
      label: "Script Managed",
      hint: "Picks Anthropology for MAD prestige, and Fanaticism for others. Achieve-worthy combos are exception, on such runs Fanaticism will be always picked.",
    },
    {
      val: "tech-anthropology",
      label: "localized:tech_anthropology",
      hint: "localized:tech_anthropology_effect",
    },
    {
      val: "tech-fanaticism",
      label: "localized:tech_fanaticism",
      hint: "localized:tech_fanaticism_effect",
    },
  ],
);
assert.deepEqual(Object.keys(controls[2].list), [
  "tech-anthropology",
  "tech-fanaticism",
]);
assert.equal(document.documentElement.scrollTop, 20);
assert.equal(document.body.scrollTop, 20);

document = {
  documentElement: { scrollTop: 35 },
  body: { scrollTop: 7 },
};
jqueryContext = "second";
trace = [];
controls = [];
settings.updateResearchSettingsContent();
assert.deepEqual(trace.slice(0, 2), [
  "empty:second:#script_researchContent",
  "off:*",
]);
assert.equal(document.documentElement.scrollTop, 35);
assert.equal(document.body.scrollTop, 35);

trace = [];
settings.buildResearchSettings();
assert.deepEqual(trace, ["section:research:Research"]);
assert.equal(sectionRegistration[3], settings.updateResearchSettingsContent);

trace = [];
sectionRegistration[2]();
assert.deepEqual(trace, ["intent:reset-research-settings"]);

console.log("Research settings browser adapter tests passed");
