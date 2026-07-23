import assert from "node:assert/strict";

import { createWeightingSettingsBrowserAdapter } from "../src/adapters/browser/weighting-settings.ts";
import { getWeightingSettingsReadModel } from "../src/domain/economy/resources/weighting-settings.ts";

const readModel = getWeightingSettingsReadModel();
assert.equal(Object.isFrozen(readModel), true);
assert.equal(readModel.controls.length, 1);
assert.equal(readModel.rules.length, 27);
assert.equal(readModel.rules[0].settingName, "buildingWeightingNew");
assert.equal(
  readModel.rules.at(-1).settingName,
  "buildingWeightingRetirementPrep",
);

const trace = [];
let document = { documentElement: { scrollTop: 0 }, body: { scrollTop: 21 } };
const nodes = new Map();

function makeNode(label) {
  const node = {
    empty() {
      trace.push(`empty:${label}`);
      return node;
    },
    off(events) {
      trace.push(`off:${label}:${events}`);
      return node;
    },
    append(content) {
      trace.push(`append:${label}:${String(content).slice(0, 12)}`);
      return node;
    },
    find(selector) {
      return makeNode(`${label}.${selector}`);
    },
  };
  return node;
}

function jquery(selector) {
  const label = String(selector);
  const node = makeNode(label);
  nodes.set(label, node);
  return node;
}

const actions = {
  registration: undefined,
  buildSettingsSection(...args) {
    this.registration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsToggle(_node, settingName) {
    trace.push(`toggle:${settingName}`);
  },
  addTableInput(node, settingName) {
    trace.push(`input:${settingName}:${String(node)}`);
  },
};

const intents = [];
const settings = createWeightingSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => jquery,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});

settings.updateWeightingSettingsContent();
assert.deepEqual(
  trace.filter((entry) => /^(toggle|input):/.test(entry)),
  [
    "toggle:buildingBuildIfStorageFull",
    ...readModel.rules.map((rule) => `input:${rule.settingName}:`),
  ].map((entry) =>
    entry.endsWith(":")
      ? trace.find((actual) => actual.startsWith(entry))
      : entry,
  ),
);
assert.ok(
  trace.some((entry) => entry.startsWith("append:#script_weightingContent:")),
);
assert.equal(document.documentElement.scrollTop, 21);
assert.equal(document.body.scrollTop, 21);

trace.length = 0;
settings.buildWeightingSettings();
assert.deepEqual(trace, ["section:weighting:AutoBuild Weighting"]);
actions.registration[2]();
assert.deepEqual(intents, [{ type: "reset-weighting-settings" }]);

console.log("Weighting settings browser adapter tests passed");
