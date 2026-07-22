import assert from "node:assert/strict";

import { createTraitSettings } from "../src/adapters/browser/trait-settings.ts";

let settingsRaw = { imitateRace: "human" };
let state = { evolutionTarget: "first" };
let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 19 },
};
let sorterHelper = "sorter:first";
let sortableIds = [];
let minorSorts = 0;
let mutableSorts = 0;
let trace = [];
let sectionRegistration;
const handlers = new Map();
const sortableHandlers = new Map();
const properties = new Map();

function makeNode(label) {
  return {
    label,
    empty() {
      trace.push(`empty:${label}`);
      return this;
    },
    off() {
      return this;
    },
    append(value) {
      trace.push(`append:${label}:${value?.label ?? value}`);
      return this;
    },
    appendTo(node) {
      trace.push(`appendTo:${label}:${node.label}`);
      return this;
    },
    on(event, ...args) {
      const delegated = typeof args[0] === "string" ? args[0] : "";
      handlers.set(`${label}:${event}:${delegated}`, args.at(-1));
      return this;
    },
    find(selector) {
      return makeNode(`${label}|find:${selector}`);
    },
    first() {
      return makeNode(`${label}|first`);
    },
    next() {
      return makeNode(`${label}>next`);
    },
    html(value) {
      trace.push(`html:${label}:${value}`);
      return this;
    },
    prop(name, value) {
      const key = `${label}:${name}`;
      if (arguments.length === 1) {
        return properties.get(key) ?? false;
      }
      properties.set(key, value);
      trace.push(`prop:${label}:${name}:${value}`);
      return this;
    },
    sortable(arg) {
      if (typeof arg === "string") {
        return sortableIds;
      }
      sortableHandlers.set(label, arg.update);
      trace.push(`sorter:${label}:${arg.helper}`);
      return this;
    },
  };
}

const game = {
  global: { stats: { synth: { human: true } } },
  races: { human: { type: "humanoid" } },
  loc: (key) => `loc:${key}`,
};
const races = {
  human: { id: "human", name: "Human", desc: "Human" },
};
const resources = {
  Iron: { id: "Iron", title: "Iron", atomicMass: 5 },
};
const poly = {
  loc: (key) => `poly:${key}`,
  neg_roll_traits: ["frail"],
};
let MinorTraitManager = {
  priorityList: [{ traitName: "smart" }],
  sortByPriority: () => minorSorts++,
};
let MutableTraitManager = {
  priorityList: [
    {
      traitName: "frail",
      source: "humanoid",
      type: "genus",
      name: "Frail",
      baseCost: 1,
      isPositive: false,
      isGainable: () => false,
    },
  ],
  sortByPriority: () => mutableSorts++,
};

const traitSettings = createTraitSettings({
  getSettingsRaw: () => settingsRaw,
  getState: () => state,
  getGame: () => game,
  getRaces: () => races,
  getResources: () => resources,
  getPoly: () => poly,
  getMinorTraitManager: () => MinorTraitManager,
  getMutableTraitManager: () => MutableTraitManager,
  getOcularPowerData: () => [
    { id: "charm", locParam: [] },
    { id: "fear", locParam: [] },
  ],
  getWishData: () => ({
    minor: [{ id: "Know", loc: "knowledge" }],
    major: [{ id: "Power", loc: "power" }],
  }),
  getMutationCostMultipliers: () => ({ custom: { gain: 2 } }),
  getDocument: () => document,
  getJQuery: () => (value) => makeNode(String(value)),
  getSorterHelper: () => sorterHelper,
  resetMinorTraitSettings: (reset) => trace.push(`resetMinor:${reset}`),
  resetMutableTraitSettings: (reset) => trace.push(`resetMutable:${reset}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (...keys) => trace.push(`resetCheckbox:${keys.join(",")}`),
  buildSettingsSection: (...args) => {
    sectionRegistration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addStandardHeading: (_node, heading) => trace.push(`heading:${heading}`),
  addSettingsSelect: (_node, key) => {
    trace.push(`select:${key}`);
    return makeNode(`control:${key}`);
  },
  addSettingsNumber: (_node, key) => trace.push(`number:${key}`),
  addSettingsToggle: (_node, key) => trace.push(`toggle:${key}`),
  addTableToggle: (_node, key) => trace.push(`tableToggle:${key}`),
  addTableInput: (_node, key) => trace.push(`tableInput:${key}`),
  buildTableLabel: (note) => ({ label: `label:${note}` }),
});

traitSettings.updateTraitSettingsContent();
assert.deepEqual(
  trace.filter((entry) => entry.startsWith("heading:")),
  [
    "heading:Major Traits",
    "heading:Ocular Powers",
    "heading:Minor Traits",
    "heading:Trait Mutation",
  ],
);
assert.ok(trace.includes("tableToggle:ocularPower_charm"));
assert.ok(trace.includes("tableInput:ocularPower_p_fear"));
assert.ok(trace.includes("tableToggle:mTrait_smart"));
assert.ok(trace.includes("tableToggle:mutableTrait_purge_frail"));
assert.ok(trace.includes("tableToggle:mutableTrait_reset_frail"));
assert.ok(trace.includes("sorter:#script_minorTraitTableBody:sorter:first"));
assert.equal(document.documentElement.scrollTop, 19);
assert.equal(document.body.scrollTop, 19);

state = { evolutionTarget: "replacement" };
handlers.get("control:imitateRace:change:select")();
assert.equal(state.evolutionTarget, null);

settingsRaw = { imitateRace: "human" };
sortableIds = ["smart"];
sortableHandlers.get("#script_minorTraitTableBody")();
assert.equal(settingsRaw.mTrait_p_smart, 0);
assert.equal(minorSorts, 1);

settingsRaw = { imitateRace: "human" };
sortableIds = ["frail"];
MutableTraitManager = {
  ...MutableTraitManager,
  sortByPriority: () => (mutableSorts += 10),
};
sortableHandlers.get("#script_mutateTraitTableBody")();
assert.equal(settingsRaw.mutableTrait_p_frail, 0);
assert.equal(mutableSorts, 10);

sorterHelper = "sorter:second";
trace = [];
traitSettings.updateTraitSettingsContent();
assert.ok(trace.includes("sorter:#script_minorTraitTableBody:sorter:second"));

const switch1 = makeNode("switch1");
const switch2 = makeNode("switch2");
properties.set("switch1:checked", true);
properties.set("switch2:checked", true);
settingsRaw = { first: true, second: true, imitateRace: "human" };
traitSettings.makeToggleSwitchesMutuallyExclusive(
  switch1,
  "first",
  switch2,
  "second",
);
handlers.get("switch1:change:")();
assert.equal(settingsRaw.second, false);
assert.equal(properties.get("switch2:checked"), false);

trace = [];
traitSettings.buildTraitSettings();
assert.deepEqual(trace, ["section:trait:Traits"]);
assert.equal(sectionRegistration[3], traitSettings.updateTraitSettingsContent);

trace = [];
sectionRegistration[2]();
assert.equal(trace[0], "resetMinor:true");
assert.equal(trace[1], "resetMutable:true");
assert.equal(trace[2], "persist");
assert.equal(
  trace.at(-1),
  "resetCheckbox:autoMinorTrait,autoMutateTraits,autoGenetics",
);

console.log("Trait settings module tests passed");
