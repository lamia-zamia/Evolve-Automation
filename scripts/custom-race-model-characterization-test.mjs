import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setCustomRaceModelTestContext, "function");
for (const name of [
  "customRaceRankCost",
  "customRaceGeneBalance",
  "customRaceRankOptions",
  "customRaceTraitEffect",
  "customRaceEditorTraits",
  "customRaceDraftFromPreset",
]) {
  assert.equal(
    typeof hooks.customRaceModel?.[name],
    "function",
    `${name} missing`,
  );
}

const traits = {
  base: {
    val: 2,
    taxonomy: "genus",
    origin: "human",
    type: "major",
    name: "Base",
  },
  positive: {
    val: 3,
    taxonomy: "body",
    origin: "human",
    type: "major",
    name: "Zeta",
    vars: (rank) => [rank * 2],
    desc: "positive fallback",
  },
  negative: {
    val: -2,
    taxonomy: "mind",
    origin: "fungi",
    type: "major",
    name: "Alpha",
    vars: () => [5],
    desc: () => "negative fallback",
  },
  locked: {
    val: 1,
    taxonomy: "body",
    origin: "other",
    type: "major",
    name: "Beta",
  },
  minor: {
    val: 1,
    taxonomy: "body",
    origin: "human",
    type: "minor",
    name: "Minor",
  },
};
const game = {
  global: {
    stats: {
      achieve: {
        ascended: { l: 2, h: 1 },
        technophobe: { l: 1 },
        extinct_human: { l: 5 },
        extinct_fungi: { l: 1 },
      },
    },
    race: {
      species: "human",
      universe: "standard",
      high_pop: false,
      srace: "human",
    },
    civic: { govern: { type: "democracy" } },
    custom: {
      race0: { name: "Saved", genus: "fungi", home: "Saved Home" },
    },
  },
  traits,
  races: {
    human: { type: "humanoid", name: "Human", traits: { positive: 1 } },
    fungi: { type: "fungi", name: "Fungi", traits: { negative: 1 } },
    other: { type: "avian", name: "Other", traits: { locked: 1 } },
  },
  actions: {
    city: {
      coal_power: { powered: () => -4 },
      oil_power: { powered: () => -6 },
    },
  },
  loc: (id) => id,
};
const poly = {
  genus_traits: { humanoid: { base: true }, fungi: { spores: true } },
  loc: (id, vars = []) => `${id}:${vars.join("|")}`,
};
const resources = {
  Lumber: { name: "Lumber" },
  Plywood: { name: "Plywood" },
  Furs: { name: "Furs" },
  Soul_Gem: { name: "Soul Gem" },
};
hooks.setCustomRaceModelTestContext({
  game,
  poly,
  resources,
  races: { human: { genus: "humanoid" } },
});

assert.equal(hooks.customRaceModel.customRaceRankCost(3, 0.1, true), 1);
assert.equal(hooks.customRaceModel.customRaceRankCost(3, 2, true), 5);
assert.equal(hooks.customRaceModel.customRaceRankCost(-2, 3, false), 0);
assert.equal(
  hooks.customRaceModel.customRaceGeneBalance({
    genus: "humanoid",
    traitlist: ["positive", "negative"],
    ranks: { positive: 2 },
  }),
  2,
);
assert.deepEqual(
  Array.from(hooks.customRaceModel.customRaceRankOptions("positive")),
  [0.1, 0.25, 0.5, 1, 2, 3, 4],
);
assert.equal(
  hooks.customRaceModel.customRaceTraitEffect("positive", 2),
  "wiki_trait_effect_positive:4",
);
assert.equal(hooks.customRaceModel.customRaceTraitEffect("missing", 1), "");

const editorTraits = hooks.customRaceModel.customRaceEditorTraits({
  traitlist: ["positive"],
});
assert.deepEqual(
  Array.from(editorTraits, ([id, trait]) => [id, trait.name]),
  [
    ["positive", "Zeta"],
    ["negative", "Alpha"],
  ],
);

const validDraft = hooks.customRaceModel.customRaceDraftFromPreset({
  json: JSON.stringify({
    name: "Preset",
    genus: "humanoid",
    traits: ["positive", "positive", "negative"],
    ranks: { positive: 2 },
    fanaticism: "yes",
  }),
});
assert.deepEqual(
  {
    name: validDraft.name,
    genus: validDraft.genus,
    traitlist: Array.from(validDraft.traitlist),
    ranks: { ...validDraft.ranks },
    fanaticism: validDraft.fanaticism,
  },
  {
    name: "Preset",
    genus: "humanoid",
    traitlist: ["positive", "negative"],
    ranks: { positive: 2 },
    fanaticism: "yes",
  },
);
const fallbackDraft = hooks.customRaceModel.customRaceDraftFromPreset({
  json: "not json",
});
assert.equal(fallbackDraft.name, "Saved");
assert.equal(fallbackDraft.genus, "fungi");
assert.equal(fallbackDraft.home, "Saved Home");

console.log("Custom race model bundled characterization tests passed");
