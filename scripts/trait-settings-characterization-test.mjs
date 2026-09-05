import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const Sortable = {
  create(element, options) {
    sortableHandlers.set(element.label, () => options.onUpdate());
    return { destroy() {} };
  },
  get: () => null,
};

const handlers = new Map();
const sortableHandlers = new Map();
const properties = new Map();
let trace = [];
let controls = [];
let sortableIds = [];

function compact(value) {
  return value.replace(/\s+/g, " ").trim();
}

function htmlLabel(value) {
  if (typeof value !== "string") {
    return value?.label ?? "<node>";
  }
  if (value.includes('id="script_traitSettings"')) {
    return "section:trait";
  }
  const background = value.match(/script_bg_([A-Za-z0-9_]+)/u)?.[1];
  if (background) {
    const type = value.includes("<select")
      ? "select"
      : value.includes('type="checkbox"')
        ? "toggle"
        : "number";
    return `control:${type}:${background}`;
  }
  const tableControl = value.match(/class="script_([A-Za-z0-9_]+)"/u)?.[1];
  if (tableControl) {
    return `${value.includes('type="checkbox"') ? "table-toggle" : "table-input"}:${tableControl}`;
  }
  const table = value.match(/<tbody id="([A-Za-z0-9_]+)"/u)?.[1];
  if (table) {
    return `table:${table}`;
  }
  const rowIds = [...value.matchAll(/id="([A-Za-z0-9_]+)"/gu)].map(
    (match) => match[1],
  );
  if (rowIds.length) {
    return `rows:${rowIds.join(",")}`;
  }
  if (value.startsWith("<tr")) {
    return "row";
  }
  if (value.includes("<span")) {
    return `label:${compact(value.replace(/<[^>]+>/gu, ""))}`;
  }
  return compact(value);
}

function makeWrapper(label, parent = null) {
  return {
    label,
    length: 1,
    ready() {
      return this;
    },
    empty() {
      trace.push(`empty:${label}`);
      return this;
    },
    off(events) {
      trace.push(`off:${label}:${events}`);
      return this;
    },
    append(value) {
      trace.push(`append:${label}:${htmlLabel(value)}`);
      return this;
    },
    appendTo(node) {
      trace.push(`appendTo:${label}:${node.label}`);
      return this;
    },
    toggleClass() {
      return this;
    },
    addClass() {
      return this;
    },
    on(event, ...args) {
      const delegated = typeof args[0] === "string" ? args[0] : "";
      handlers.set(`${label}:${event}:${delegated}`, args.at(-1));
      return this;
    },
    find(selector) {
      return makeWrapper(`${label}|find:${selector}`, this);
    },
    first() {
      return makeWrapper(`${label}|first`);
    },
    end() {
      return parent ?? this;
    },
    val() {
      return this;
    },
    next() {
      return makeWrapper(`${label}>next`);
    },
    is() {
      return true;
    },
    html(value) {
      trace.push(`html:${label}:${htmlLabel(value)}`);
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
    0: {
      label,
      get children() {
        return sortableIds.map((id) => ({
          matches: () => true,
          getAttribute: () => id,
        }));
      },
    },
    remove() {
      return this;
    },
  };
}

function jquery(value) {
  const label = htmlLabel(value);
  if (label.startsWith("control:")) {
    controls.push(label);
  }
  trace.push(`select:${label}`);
  return makeWrapper(label);
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: () => null,
  getElementById: () => ({
    classList: { toggle() {} },
    nextElementSibling: { style: {} },
  }),
};
const stored = new Map();
const { hooks } = await loadCharacterizationBundle({
  Sortable,
  console,
  document,
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem(key, value) {
      stored.set(key, value);
      trace.push(`store:${key}`);
    },
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

const settingsRaw = {
  overrides: {},
  triggers: [],
  traitSettingsCollapsed: true,
  imitateRace: "human",
};
const state = { evolutionTarget: "old-target" };
const races = {
  human: { id: "human", name: "Human", desc: "Human race" },
  elf: { id: "elf", name: "Elf", desc: "Elf race" },
};
const game = {
  global: { stats: { synth: { human: true, elf: false } } },
  races: {
    human: { type: "humanoid" },
    elf: { type: "humanoid" },
    imp: { type: "demonic" },
    ooze: { type: "organism" },
    placeholder: {},
  },
  loc: (key) => `loc:${key}`,
};
const resources = {
  Knowledge: { id: "Knowledge", title: "Knowledge", atomicMass: 2 },
  Iron: { id: "Iron", title: "Iron", atomicMass: 5 },
  Mana: { id: "Mana", title: "Mana", atomicMass: 0 },
};
const poly = {
  loc: (key, args) => (args ? `${key}(${args.join("|")})` : `poly:${key}`),
  neg_roll_traits: ["frail"],
  genus_traits: { humanoid: {}, demonic: {} },
};
let minorSorts = 0;
let mutableSorts = 0;
const MinorTraitManager = {
  priorityList: [{ traitName: "smart" }, { traitName: "strong" }],
  sortByPriority: () => minorSorts++,
};
const mutableTrait = (overrides) => ({
  traitName: "brute",
  source: "human",
  type: "major",
  name: "Brute",
  baseCost: 2,
  isPositive: true,
  isGainable: () => true,
  ...overrides,
});
const MutableTraitManager = {
  priorityList: [
    mutableTrait({}),
    mutableTrait({
      traitName: "frail",
      source: "humanoid",
      type: "genus",
      name: "Frail",
      isPositive: false,
      isGainable: () => false,
    }),
  ],
  sortByPriority: () => mutableSorts++,
};

hooks.setTraitSettingsTestContext({
  settingsRaw,
  state,
  game,
  races,
  resources,
  poly,
  MinorTraitManager,
  MutableTraitManager,
});
assert.deepEqual(Object.keys(hooks.traitSettings), [
  "buildTraitSettings",
  "updateImitateWarning",
  "updateTraitSettingsContent",
  "makeToggleSwitchesMutuallyExclusive",
]);

trace = [];
controls = [];
document.documentElement.scrollTop = 51;
document.body.scrollTop = 7;
hooks.traitSettings.updateTraitSettingsContent();

assert.deepEqual(controls, [
  "control:select:shifterGenus",
  "control:select:imitateRace",
  "control:select:buildingShrineType",
  "control:number:slaveIncome",
  "control:select:psychicPower",
  "control:select:psychicBoostRes",
  "control:select:wishMinor",
  "control:select:wishMajor",
  "control:toggle:jobScalePop",
  "control:select:geneticsSequence",
  "control:select:geneticsBoost",
  "control:select:geneticsAssemble",
  "control:toggle:doNotGoBelowPlasmidSoftcap",
  "control:number:minimumPlasmidsToPreserve",
]);
assert.deepEqual(
  trace
    .filter((entry) => entry.startsWith("append:#script_traitContent:label:"))
    .map((entry) => entry.replace("append:#script_traitContent:label:", "")),
  ["Major Traits", "Ocular Powers", "Minor Traits", "Trait Mutation"],
);
assert.ok(
  trace.includes(
    "html:#script_imitate_warning:label:You have completed an AI Apocalypse with this race and can imitate it.",
  ),
);
for (const id of [
  "disintegration",
  "petrification",
  "wound",
  "telekinesis",
  "fear",
  "charm",
]) {
  assert.ok(trace.includes(`select:table-toggle:ocularPower_${id}`));
  assert.ok(trace.includes(`select:table-input:ocularPower_p_${id}`));
}
assert.ok(trace.includes("select:table-toggle:mTrait_smart"));
assert.ok(trace.includes("select:table-input:mTrait_w_strong"));
assert.ok(trace.includes("select:table-toggle:mutableTrait_gain_brute"));
assert.ok(trace.includes("select:table-toggle:mutableTrait_purge_frail"));
assert.ok(trace.includes("select:table-toggle:mutableTrait_reset_frail"));
assert.equal(document.documentElement.scrollTop, 51);
assert.equal(document.body.scrollTop, 51);

sortableIds = ["strong", "smart"];
sortableHandlers.get("#script_minorTraitTableBody")();
assert.equal(settingsRaw.mTrait_p_strong, 0);
assert.equal(settingsRaw.mTrait_p_smart, 1);
assert.equal(minorSorts, 1);

sortableIds = ["frail", "brute"];
sortableHandlers.get("#script_mutateTraitTableBody")();
assert.equal(settingsRaw.mutableTrait_p_frail, 0);
assert.equal(settingsRaw.mutableTrait_p_brute, 1);
assert.equal(mutableSorts, 1);
assert.ok(trace.includes("store:settings"));

settingsRaw.imitateRace = "elf";
hooks.traitSettings.updateImitateWarning();
assert.ok(
  trace.includes(
    "html:#script_imitate_warning:label:Warning! You have NOT completed an AI Apocalypse with this race, and cannot imitate it.",
  ),
);
settingsRaw.imitateRace = "missing";
hooks.traitSettings.updateImitateWarning();
assert.ok(trace.includes("empty:#script_imitate_warning"));

trace = [];
hooks.traitSettings.buildTraitSettings();
assert.ok(trace.includes("append:#script_settings:section:trait"));

console.log("Trait settings bundled characterization tests passed");
