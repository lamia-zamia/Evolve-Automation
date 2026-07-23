import assert from "node:assert/strict";

import { createPlanetSettingsBrowserAdapter } from "../src/adapters/browser/planet-settings.ts";
import { createPlanetSettingsReadModel } from "../src/domain/progression/evolution/planet-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 24 },
};
let jqueryContext = "first";
let trace = [];
let sectionRegistration;
const rowNodes = new Map();

const readModel = createPlanetSettingsReadModel({
  biomes: [
    { label: "Biome One", settingName: "biome_w_one" },
    { label: "Biome Two", settingName: "biome_w_two" },
  ],
  traits: [{ label: "None", settingName: "trait_w_none" }],
  extras: [
    { label: "Extra One", settingName: "extra_w_one" },
    { label: "Extra Two", settingName: "extra_w_two" },
    { label: "Extra Three", settingName: "extra_w_three" },
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
    append(content) {
      trace.push(`append:${selector}:${String(content)}`);
      return this;
    },
    next() {
      return this;
    },
  };
}

function makeRowNodes(index) {
  const cells = Array.from({ length: 6 }, (_, cellIndex) => ({
    append(content) {
      trace.push(`row${index}:append${cellIndex}:${String(content)}`);
      return this;
    },
    next() {
      return cells[Math.min(cellIndex + 1, cells.length - 1)];
    },
  }));
  return cells[0];
}

function getJQuery(selector) {
  if (typeof selector === "string" && selector.startsWith("#script_planet_")) {
    const index = Number(selector.slice("#script_planet_".length));
    if (!rowNodes.has(index)) rowNodes.set(index, makeRowNodes(index));
    return rowNodes.get(index);
  }
  return makeNode(selector);
}

const actions = {
  buildSettingsSection(...args) {
    sectionRegistration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addTableInput(_node, settingName) {
    trace.push(`input:${settingName}`);
  },
  buildTableLabel(label) {
    return `label:${label}`;
  },
};

const settings = createPlanetSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => getJQuery,
  getReadModel: () => readModel,
  intents: { handle: (intent) => trace.push(`intent:${intent.type}`) },
  getActions: () => actions,
});

settings.updatePlanetSettingsContent();
assert.ok(trace.includes("input:biome_w_one"));
assert.ok(trace.includes("input:trait_w_none"));
assert.ok(trace.includes("input:extra_w_one"));
assert.ok(trace.includes("input:biome_w_two"));
assert.ok(trace.includes("input:extra_w_two"));
assert.ok(trace.includes("input:extra_w_three"));
assert.equal(trace.filter((entry) => entry.startsWith("input:")).length, 6);
assert.equal(document.documentElement.scrollTop, 24);
assert.equal(document.body.scrollTop, 24);

document = {
  documentElement: { scrollTop: 39 },
  body: { scrollTop: 8 },
};
jqueryContext = "second";
trace = [];
rowNodes.clear();
settings.updatePlanetSettingsContent();
assert.deepEqual(trace.slice(0, 2), [
  "empty:second:#script_planetContent",
  "off:*",
]);
assert.equal(document.documentElement.scrollTop, 39);
assert.equal(document.body.scrollTop, 39);

trace = [];
settings.buildPlanetSettings();
assert.deepEqual(trace, ["section:planet:Planet Weighting"]);
assert.equal(sectionRegistration[3], settings.updatePlanetSettingsContent);

trace = [];
sectionRegistration[2]();
assert.deepEqual(trace, ["intent:reset-planet-settings"]);

console.log("Planet settings browser adapter tests passed");
