import assert from "node:assert/strict";

import { createMagicSettingsBrowserAdapter } from "../src/adapters/browser/magic-settings.ts";
import { createMagicSettingsReadModel } from "../src/domain/magic-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 25 },
};
const trace = [];
let sectionRegistration;

const readModel = createMagicSettingsReadModel({
  alchemyRows: [
    {
      id: "Iron",
      label: "Iron",
      color: "has-text-info",
      enabledSettingName: "res_alchemy_Iron",
      weightingSettingName: "res_alchemy_w_Iron",
    },
    {
      id: "Steel",
      label: "Steel",
      color: "has-text-advanced",
      enabledSettingName: "res_alchemy_Steel",
      weightingSettingName: "res_alchemy_w_Steel",
    },
  ],
  pylonRows: [
    {
      id: "farmer",
      label: "Farmer",
      weightingSettingName: "spell_w_farmer",
    },
    {
      id: "science",
      label: "Science",
      weightingSettingName: "spell_w_science",
    },
  ],
});

function makeCell(rowIndex, cellIndex) {
  const cell = {
    append(content) {
      trace.push(`append:${rowIndex}:${cellIndex}:${String(content)}`);
      return cell;
    },
    next() {
      return makeCell(rowIndex, cellIndex + 1);
    },
  };
  return cell;
}

function makeNode(selector) {
  return {
    empty() {
      trace.push(`empty:${selector}`);
      return this;
    },
    off(events) {
      trace.push(`off:${selector}:${events}`);
      return this;
    },
    append(content) {
      trace.push(`append:${selector}:${String(content).slice(0, 10)}`);
      return this;
    },
    next() {
      return this;
    },
  };
}

function getJQuery(selector) {
  if (selector === "#script_alchemy_Iron") return makeCell(0, 0);
  if (selector === "#script_alchemy_Steel") return makeCell(1, 0);
  if (selector === "#script_pylon_farmer") return makeCell(2, 0);
  if (selector === "#script_pylon_science") return makeCell(3, 0);
  return makeNode(String(selector));
}

const actions = {
  buildSettingsSection(...args) {
    sectionRegistration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addStandardHeading(_node, heading) {
    trace.push(`heading:${heading}`);
  },
  addSettingsNumber(_node, settingName) {
    trace.push(`number:${settingName}`);
  },
  addSettingsToggle(_node, settingName) {
    trace.push(`toggle:${settingName}`);
  },
  addTableToggle(_node, settingName) {
    trace.push(`table-toggle:${settingName}`);
  },
  addTableInput(_node, settingName) {
    trace.push(`table-input:${settingName}`);
  },
  buildTableLabel(label, _title, color) {
    trace.push(`label:${label}:${color ?? "default"}`);
    return `label:${label}`;
  },
};

let intents = [];
const settings = createMagicSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => getJQuery,
  getReadModel: () => readModel,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});

settings.updateMagicSettingsContent();
assert.deepEqual(
  trace.filter((entry) =>
    /^(heading|number|toggle|table-(?:toggle|input)|label):/.test(entry),
  ),
  [
    "heading:Alchemy",
    "number:magicAlchemyManaUse",
    "toggle:magicFullmetalHelper",
    "label:Iron:has-text-info",
    "table-toggle:res_alchemy_Iron",
    "table-input:res_alchemy_w_Iron",
    "label:Steel:has-text-advanced",
    "table-toggle:res_alchemy_Steel",
    "table-input:res_alchemy_w_Steel",
    "heading:Pylon",
    "number:productionRitualManaUse",
    "toggle:productionRitualSafe",
    "label:Farmer:default",
    "table-input:spell_w_farmer",
    "label:Science:default",
    "table-input:spell_w_science",
  ],
);
assert.equal(document.documentElement.scrollTop, 25);
assert.equal(document.body.scrollTop, 25);

trace.length = 0;
intents = [];
settings.buildMagicSettings();
assert.deepEqual(trace, ["section:magic:Magic"]);
assert.equal(sectionRegistration[3], settings.updateMagicSettingsContent);
sectionRegistration[2]();
assert.deepEqual(intents, [{ type: "reset-magic-settings" }]);

console.log("Magic settings browser adapter tests passed");
