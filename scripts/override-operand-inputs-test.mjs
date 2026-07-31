import assert from "node:assert/strict";

import { createOverrideOperandInputs } from "../src/settings/override-operand-inputs.ts";

const buildingIds = {
  "city-farm": { name: "Farm", cost: { Money: 10, Lumber: 5 } },
  "city-mine": { name: "Mine", cost: { Money: 20 } },
};
const techIds = { "tech-mad": { name: "MAD", _vueBinding: "tech-mad" } };
const context = {
  buildingIds,
  techIds,
  game: {
    traits: { kindling_kindred: { name: "Kindling Kindred" } },
    races: {
      protoplasm: { name: "Protoplasm" },
      human: { name: "Human", type: "humanoid" },
      elven: { name: "Elf", type: "humanoid" },
      sharkin: { name: "Sharkin", type: "aquatic" },
      synth: { name: "Synth", type: "synthetic" },
      custom: { name: "Custom", type: "organism" },
    },
    loc: (key) => `loc:${key}`,
  },
  resources: {
    Money: { _id: "Money", name: "Money" },
    Lumber: { _id: "Lumber", name: "Lumber" },
  },
  arpaIds: {
    arpalaunch_facility: { _vueBinding: "arpalaunch_facility", name: "Launch" },
  },
  jobIds: {
    unemployed: {
      _originalId: "unemployed",
      _originalName: "Unemployed",
      is: {},
    },
    farmer: { _originalId: "farmer", _originalName: "Farmer", is: {} },
    servant: {
      _originalId: "servant",
      _originalName: "Servant",
      is: { serve: true },
    },
  },
  races: {
    human: { id: "human", name: "Human", desc: "A human" },
  },
  GovernmentManager: { Types: { anarchy: {}, democracy: {} } },
  universes: ["standard", "evil"],
  governors: ["soldier"],
  challenges: [
    [{ id: "junker", trait: "junker" }],
    [{ id: "joyless", trait: "joyless" }],
  ],
  biomeList: ["grassland", "oceanic"],
  traitList: ["none", "toxic", "mellow"],
};

const inputs = createOverrideOperandInputs({
  readGame: () => context.game,
  readBuildingIds: () => context.buildingIds,
  readResources: () => context.resources,
  readTechIds: () => context.techIds,
  readArpaIds: () => context.arpaIds,
  readJobIds: () => context.jobIds,
  readRaces: () => context.races,
  readGovernmentManager: () => context.GovernmentManager,
  readUniverses: () => context.universes,
  readGovernors: () => context.governors,
  readChallenges: () => context.challenges,
  readBiomeList: () => context.biomeList,
  readTraitList: () => context.traitList,
});

// Every entry declares an input control and a default, and the control kind decides how the editor
// reaches its options.
for (const [id, input] of Object.entries(inputs)) {
  assert.equal(typeof input.def, "string", `${id}.def`);
  assert.ok(
    ["list", "list_cb", "select_cb"].includes(input.arg),
    `${id}.arg is ${input.arg}`,
  );
  if (input.arg === "list") {
    assert.equal(typeof input.options.list, "object", `${id}.options.list`);
    assert.equal(typeof input.options.name, "string", `${id}.options.name`);
    assert.equal(typeof input.options.id, "string", `${id}.options.id`);
  } else {
    assert.equal(typeof input.options, "function", `${id}.options`);
  }
}

// One option per building/resource cost pair, labelled with both names.
assert.deepEqual(inputs.building_cost.options(), {
  "city-farm.Money": { name: "Farm (Money)", id: "city-farm.Money" },
  "city-farm.Lumber": { name: "Farm (Lumber)", id: "city-farm.Lumber" },
  "city-mine.Money": { name: "Mine (Money)", id: "city-mine.Money" },
});
assert.equal(inputs.building_cost.def, "city-farm.Money");

// TRANSITIONAL: `list` inputs capture the live catalog when the inputs are constructed, so a bag
// that is replaced afterwards is not seen. Mutating the captured bag is.
assert.equal(inputs.building.options.list, buildingIds);
assert.equal(inputs.research.options.list, techIds);
context.buildingIds = { ...buildingIds };
assert.equal(inputs.building.options.list, buildingIds);
assert.deepEqual(Object.keys(inputs.building_cost.options()), [
  "city-farm.Money",
  "city-farm.Lumber",
  "city-mine.Money",
]);

assert.deepEqual(inputs.trait.options(), {
  kindling_kindred: { name: "Kindling Kindred", id: "kindling_kindred" },
});

// Genus lists are deduplicated in catalog order. Both drop `organism`; the mimic list also drops
// `synthetic`, and each has its own leading option.
assert.deepEqual(inputs.genus.options(), [
  { val: "organism", label: "loc:race_protoplasm" },
  { val: "humanoid", label: "loc:genelab_genus_humanoid" },
  { val: "aquatic", label: "loc:genelab_genus_aquatic" },
  { val: "synthetic", label: "loc:genelab_genus_synthetic" },
]);
assert.deepEqual(inputs.genus_ss.options(), [
  { val: "none", label: "loc:genelab_genus_none" },
  { val: "humanoid", label: "loc:genelab_genus_humanoid" },
  { val: "aquatic", label: "loc:genelab_genus_aquatic" },
]);

assert.deepEqual(inputs.project.options(), [
  { val: "arpalaunch_facility", label: "Launch" },
]);
assert.deepEqual(inputs.job.options(), [
  { val: "unemployed", label: "Unemployed" },
  { val: "farmer", label: "Farmer" },
  { val: "servant", label: "Servant" },
]);
assert.deepEqual(inputs.job_servant.options(), [
  { val: "servant", label: "Servant" },
]);
assert.deepEqual(inputs.resource.options(), [
  { val: "Money", label: "Money" },
  { val: "Lumber", label: "Lumber" },
]);

// The race list keeps its five script-defined entries ahead of the game's races.
const raceOptions = inputs.race.options();
assert.deepEqual(
  raceOptions.map((option) => option.val),
  ["species", "gods", "old_gods", "srace", "protoplasm", "human"],
);
assert.deepEqual(raceOptions.at(-1), {
  val: "human",
  label: "Human",
  hint: "A human",
});

// Challenges arrive grouped and are flattened into one list.
assert.deepEqual(inputs.challenge.options(), [
  {
    val: "junker",
    label: "loc:evo_challenge_junker",
    hint: "loc:evo_challenge_junker_effect",
  },
  {
    val: "joyless",
    label: "loc:evo_challenge_joyless",
    hint: "loc:evo_challenge_joyless_effect",
  },
]);

assert.deepEqual(
  inputs.universe.options().map((option) => option.val),
  ["bigbang", "standard", "evil"],
);
assert.deepEqual(
  inputs.governor.options().map((option) => option.val),
  ["none", "soldier"],
);
assert.deepEqual(inputs.government.options(), [
  {
    val: "anarchy",
    label: "loc:govern_anarchy",
    hint: "loc:govern_anarchy_desc",
  },
  {
    val: "democracy",
    label: "loc:govern_democracy",
    hint: "loc:govern_democracy_desc",
  },
]);
assert.deepEqual(inputs.biome.options(), [
  { val: "grassland", label: "loc:biome_grassland_name" },
  { val: "oceanic", label: "loc:biome_oceanic_name" },
]);

// The first planet trait is the game's "no trait" entry, which the editor spells itself.
assert.deepEqual(inputs.ptrait.options(), [
  { val: "", label: "None", hint: "Planet have no trait" },
  { val: "toxic", label: "loc:planet_toxic" },
  { val: "mellow", label: "loc:planet_mellow" },
]);
assert.equal(inputs.ptrait.def, "");

// Fixed lists do not read the game at all.
assert.deepEqual(
  inputs.queue.options().map((option) => option.val),
  ["queue", "r_queue", "evo"],
);
assert.deepEqual(
  inputs.industry.options().map((option) => option.val),
  ["smelters", "factories"],
);
assert.ok(inputs.soldiers.options().some((option) => option.val === "crew"));
assert.ok(inputs.other.options().some((option) => option.val === "mrelay"));
assert.deepEqual(inputs.tab.options()[0], {
  val: "civTabs0",
  label: "loc:tab_evolve",
});

console.log("Override operand input tests passed");
