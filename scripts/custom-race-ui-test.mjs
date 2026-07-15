import assert from "node:assert/strict";

import { createCustomRaceUI } from "../src/ui/custom-race-ui.ts";

const trace = [];
let labButton = null;
const statusMessages = [];

function makeNode(label, length = 1) {
  return {
    length,
    empty() {
      return this;
    },
    each(callback) {
      callback.call(this);
      return this;
    },
    val(value) {
      if (arguments.length === 0) return this.value ?? "";
      this.value = value;
      return this;
    },
    text(value) {
      if (arguments.length === 0) return this.textValue ?? "";
      this.textValue = value;
      if (label.includes("ImportStatus")) statusMessages.push(value);
      return this;
    },
    toggleClass() {
      return this;
    },
    before() {
      trace.push(`before:${label}`);
      return this;
    },
    appendTo() {
      return this;
    },
  };
}

function jquery(value) {
  const label = String(value);
  if (label === "#scriptCustomRaceImportStatus") return makeNode(label, 0);
  return makeNode(label);
}

const validTemplate = {
  name: "Automata",
  desc: "A test race",
  entity: "machines",
  home: "Origin",
  red: "Rust",
  hell: "Furnace",
  gas: "Cloud",
  gas_moon: "Moon",
  dwarf: "Dwarf",
  titan: "Titan X",
  genus: "humanoid",
  traitlist: ["smart"],
  ranks: { smart: 2 },
  fanaticism: "smart",
};
const settingsRaw = {
  prestigeCustomRacePresets: [
    { name: "Imported", json: JSON.stringify(validTemplate) },
  ],
  prestigeCustomRacePreset: "0",
};
let settings = {
  ...settingsRaw,
  masterScriptToggle: true,
  autoPrestige: true,
  prestigeType: "ascension",
  prestigeCustomRaceMode: "import",
};
const state = { customRaceImportAttempt: null, goal: "" };
const lab = {
  g: { genus: "humanoid", ranks: { old: 3 }, genes: 0 },
  geneEdit() {
    trace.push("geneEdit");
    this.g.genes = 2;
  },
};
const game = {
  global: {
    stats: { achieve: {} },
    custom: {},
  },
};
const document = {
  querySelector(selector) {
    if (selector === "#celestialLab .create button") return labButton;
    if (selector === "#celestialLab .tsmart") return {};
    return null;
  },
};

const ui = createCustomRaceUI({
  getContext: () => ({
    $: jquery,
    document,
    settingsRaw,
    settings,
    state,
    game,
    poly: { genus_traits: {} },
    customRaceDraftFromPreset: () => ({}),
    customRaceEditorTraits: () => [],
    customRaceRankOptions: () => [1, 2],
    customRaceTraitEffect: () => "",
    customRaceGeneBalance: () => 0,
    updateSettingsFromState: () => trace.push("persist"),
    updateOverrides: () => trace.push("overrides"),
    getVueById: () => lab,
    alert: (message) => trace.push(`alert:${message}`),
  }),
});

assert.deepEqual(ui.getCustomRacePreset(), {
  name: "Imported",
  json: JSON.stringify(validTemplate),
});
assert.equal(ui.importCustomRaceIntoLab(), true);
assert.equal(lab.g.name, "Automata");
assert.equal(lab.g.desc, "A test race");
assert.deepEqual(lab.g.traitlist, ["smart"]);
assert.deepEqual(lab.g.ranks, { smart: 2 });
assert.equal(lab.g.fanaticism, "smart");
assert.ok(trace.includes("geneEdit"));

settingsRaw.prestigeCustomRacePresets[0].json = JSON.stringify({
  ...validTemplate,
  traitlist: ["smart", "smart"],
});
state.customRaceImportAttempt = null;
assert.equal(ui.importCustomRaceIntoLab(), false);
assert.match(statusMessages.at(-1), /duplicates/);

settingsRaw.prestigeCustomRacePresets[0].json = JSON.stringify(validTemplate);
state.customRaceImportAttempt = null;
labButton = { click: () => trace.push("click") };
ui.automateLab();
assert.equal(state.goal, "GameOverMan");
assert.ok(trace.includes("overrides"));
assert.ok(trace.includes("click"));

trace.length = 0;
settings = { ...settings, prestigeCustomRaceMode: "pause" };
ui.automateLab();
assert.equal(trace.includes("click"), false);
assert.match(statusMessages.at(-1), /Pause in lab/);

trace.length = 0;
settings = { ...settings, prestigeCustomRaceMode: "reuse" };
ui.automateLab();
assert.equal(trace.includes("click"), false);
assert.match(statusMessages.at(-1), /no saved custom race/);

console.log("Custom race UI module tests passed");
