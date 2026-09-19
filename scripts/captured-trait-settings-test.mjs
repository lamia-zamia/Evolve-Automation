import assert from "node:assert/strict";

import {
  buildTraitBoostOptions,
  buildTraitGenusOptions,
  buildTraitImitateOptions,
  buildTraitPsychicOptions,
  buildTraitWishOptions,
  CAPTURED_TRAIT_BOOST_RESOURCES,
  CAPTURED_TRAIT_GAINABLE,
  CAPTURED_TRAIT_GENUS_TYPES,
  CAPTURED_TRAIT_MINOR,
  CAPTURED_TRAIT_MUTABLE,
  CAPTURED_TRAIT_NEG_ROLL,
  CAPTURED_TRAIT_OCULAR,
  CAPTURED_TRAIT_PSYCHIC,
  CAPTURED_TRAIT_RACES,
  CAPTURED_TRAIT_STATIC_CONTROLS,
  CAPTURED_TRAIT_WISH_MAJOR,
  CAPTURED_TRAIT_WISH_MINOR,
  readCapturedMinorTraitContext,
  readCapturedMutableTraitContext,
} from "../src/adapters/evolve/traits/captured-trait-settings-catalog.ts";
import { createCapturedTraitSettingsAdapter } from "../src/adapters/evolve/traits/captured-trait-settings.ts";
import {
  readCapturedMutationBaseCost,
  readCapturedMutationMultipliedBaseCost,
  readCapturedMutationTraitValue,
} from "../src/adapters/evolve/traits/captured-mutation-cost.ts";
import { createRecordSettingsLifecycle } from "./test-support/captured-settings.mjs";

// Upstream id sets, in upstream order.
assert.equal(CAPTURED_TRAIT_RACES.length, 67);
assert.equal(CAPTURED_TRAIT_RACES[0].id, "protoplasm");
assert.equal(CAPTURED_TRAIT_RACES[1].id, "human");
assert.equal(CAPTURED_TRAIT_RACES[1].name, "Human");
assert.deepEqual(
  CAPTURED_TRAIT_GENUS_TYPES.map((genus) => genus.id),
  [
    "humanoid",
    "carnivore",
    "herbivore",
    "omnivore",
    "small",
    "giant",
    "reptilian",
    "avian",
    "plant",
    "fungi",
    "insectoid",
    "aquatic",
    "fey",
    "heat",
    "polar",
    "sand",
    "demonic",
    "angelic",
    "eldritch",
    "primordial",
    "hybrid",
  ],
);
assert.deepEqual(
  CAPTURED_TRAIT_PSYCHIC.map((power) => power.id),
  ["boost", "murder", "assault", "profit", "stun", "mind_break"],
);
assert.equal(CAPTURED_TRAIT_BOOST_RESOURCES.length, 46);
assert.equal(CAPTURED_TRAIT_BOOST_RESOURCES[0].id, "Food");
assert.deepEqual(
  CAPTURED_TRAIT_OCULAR.map((power) => power.id),
  ["disintegration", "petrification", "wound", "telekinesis", "fear", "charm"],
);
assert.equal(CAPTURED_TRAIT_WISH_MINOR.length, 8);
assert.equal(CAPTURED_TRAIT_WISH_MAJOR.length, 8);
assert.equal(CAPTURED_TRAIT_WISH_MINOR[0].label, "Wish for Knowledge");
assert.equal(CAPTURED_TRAIT_MINOR.length, 54);
assert.equal(CAPTURED_TRAIT_MINOR[0].id, "tactical");
assert.equal(CAPTURED_TRAIT_MINOR[52].id, "fortify");
assert.equal(CAPTURED_TRAIT_MINOR[53].id, "mastery");
assert.equal(CAPTURED_TRAIT_MUTABLE.length, 185);
assert.deepEqual(CAPTURED_TRAIT_MUTABLE[0], {
  id: "adaptable",
  type: "genus",
  source: "humanoid",
  label: "Adaptable",
  hint: CAPTURED_TRAIT_MUTABLE[0].hint,
});
assert.ok(
  CAPTURED_TRAIT_MUTABLE.every(
    (trait) =>
      (trait.type === "major" || trait.type === "genus") &&
      trait.source.length > 0 &&
      trait.label !== trait.id,
  ),
);
assert.ok(!CAPTURED_TRAIT_MUTABLE.some((trait) => trait.id === "xenophobic"));
assert.ok(!CAPTURED_TRAIT_MUTABLE.some((trait) => trait.id === "rigid"));
assert.ok(!CAPTURED_TRAIT_MUTABLE.some((trait) => trait.id === "soul_eater"));
assert.ok(CAPTURED_TRAIT_GAINABLE.has("creative"));
assert.ok(!CAPTURED_TRAIT_GAINABLE.has("soul_eater"));
assert.ok(CAPTURED_TRAIT_NEG_ROLL.has("angry"));
assert.ok(!CAPTURED_TRAIT_NEG_ROLL.has("tactical"));
// The shared values table covers every mutable trait.
assert.ok(
  CAPTURED_TRAIT_MUTABLE.every(
    (trait) => readCapturedMutationTraitValue(trait.id) !== undefined,
  ),
);
assert.equal(readCapturedMutationTraitValue("adaptable"), 3);
// The displayed cost and the reserve arithmetic read one owner, species multiplier included.
assert.equal(readCapturedMutationBaseCost("adaptable"), 15);
assert.equal(readCapturedMutationBaseCost("adaptable", "human"), 15);
assert.equal(readCapturedMutationBaseCost("adaptable", "ultra_sludge"), 150);
assert.equal(readCapturedMutationMultipliedBaseCost("adaptable"), 150);
assert.equal(readCapturedMutationBaseCost("mystery"), undefined);
assert.equal(readCapturedMutationMultipliedBaseCost("mystery"), undefined);

// Option builders mirror the compat selects.
const genusOptions = buildTraitGenusOptions();
assert.deepEqual(
  genusOptions.map((option) => option.val),
  ["ignore", "none", ...CAPTURED_TRAIT_GENUS_TYPES.map((genus) => genus.id)],
);
const imitateOptions = buildTraitImitateOptions(new Set(["human"]));
assert.equal(imitateOptions[0].val, "ignore");
assert.equal(imitateOptions[1].val, "protoplasm");
assert.equal(imitateOptions[1].label, "--Protoplasm--");
assert.equal(
  imitateOptions.find((option) => option.val === "human").label,
  "Human",
);
assert.equal(buildTraitPsychicOptions().length, 8);
assert.equal(buildTraitBoostOptions()[0].val, "auto");
assert.equal(buildTraitBoostOptions().length, 47);
assert.deepEqual(
  buildTraitWishOptions("minor").map((option) => option.val),
  ["none", ...CAPTURED_TRAIT_WISH_MINOR.map((wish) => wish.id)],
);
assert.deepEqual(
  buildTraitWishOptions("major").map((option) => option.val),
  ["none", ...CAPTURED_TRAIT_WISH_MAJOR.map((wish) => wish.id)],
);

// Reset contexts follow the catalog order.
const minorContext = readCapturedMinorTraitContext();
assert.equal(minorContext.traitNames.length, 54);
assert.equal(minorContext.traitNames[0], "tactical");
assert.deepEqual(minorContext.ocularPowerIds, [
  "disintegration",
  "petrification",
  "wound",
  "telekinesis",
  "fear",
  "charm",
]);
const mutableContext = readCapturedMutableTraitContext();
assert.equal(mutableContext.traits.length, 185);
assert.deepEqual(mutableContext.traits[0], {
  traitName: "adaptable",
  type: "genus",
  genus: "humanoid",
  isGainable: false,
  isNegRoll: false,
});
assert.ok(mutableContext.genusOrder[0], "humanoid");
assert.ok(
  mutableContext.traits.every(
    (trait) => typeof trait.genus === "string" && trait.genus.length > 0,
  ),
);

const rootState = {
  readRoot: () => ({ stats: { synth: { human: 1 } } }),
  isReactivitySuppressed: () => false,
  subscribeRootReplaced: () => () => {},
};
const raw = {
  imitateRace: "human",
  mTrait_p_tactical: 1,
  mTrait_p_analytical: 0,
  mutableTrait_p_creative: 1,
  mutableTrait_p_adaptable: 0,
};
const adapter = createCapturedTraitSettingsAdapter({
  rootState,
  getSettingsRaw: () => raw,
});
const model = adapter.readTraitSettingsReadModel();
assert.equal(model.sectionId, "trait");
assert.equal(model.sectionName, "Traits");
assert.deepEqual(
  model.controls.map((control) => control.settingName),
  [
    "shifterGenus",
    "imitateRace",
    "buildingShrineType",
    "slaveIncome",
    "psychicPower",
    "psychicBoostRes",
    "wishMinor",
    "wishMajor",
    "jobScalePop",
    "geneticsSequence",
    "geneticsBoost",
    "geneticsAssemble",
    "doNotGoBelowPlasmidSoftcap",
    "minimumPlasmidsToPreserve",
  ],
);
assert.equal(
  model.controls.length,
  2 + CAPTURED_TRAIT_STATIC_CONTROLS.length + 4,
);
assert.equal(model.imitateRaceId, "human");
assert.equal(model.imitateRaceCompleted, true);
assert.deepEqual(
  model.minorRows.map((row) => row.id),
  ["analytical", "tactical"],
);
assert.equal(
  model.minorRows.find((row) => row.id === "tactical").label,
  "Tactical",
);
assert.deepEqual(
  model.mutableRows.map((row) => row.id),
  ["adaptable", "creative"],
);
const adaptable = model.mutableRows.find((row) => row.id === "adaptable");
assert.equal(adaptable.sourceLabel, "Humanoid");
assert.equal(adaptable.sourceHint, "Genus");
assert.equal(adaptable.sourceColor, "has-text-special");
assert.equal(adaptable.traitLabel, "Adaptable");
assert.equal(adaptable.traitColor, "has-text-success");
assert.equal(adaptable.costLabel, "15");
assert.equal(
  adaptable.costHint,
  "150 for Custom, Hybrid, Sludge and Ultra Sludge species",
);
assert.equal(adaptable.gainable, false);
const creative = model.mutableRows.find((row) => row.id === "creative");
assert.equal(creative.sourceLabel, "Human");
assert.equal(creative.sourceHint, "Major");
assert.equal(creative.costLabel, "40");
assert.equal(creative.gainable, true);
// Unknown ids degrade to id labels rather than crashing.
const strange = createCapturedTraitSettingsAdapter({
  rootState,
  getSettingsRaw: () => ({
    mTrait_p_mystery: 0,
    mutableTrait_p_mystery: 0,
  }),
}).readTraitSettingsReadModel();
assert.equal(strange.minorRows[0].label, "mystery");
assert.equal(strange.mutableRows[0].traitLabel, "mystery");
assert.equal(strange.mutableRows[0].costLabel, "?");
// An unknown imitate id leaves the warning unset, as compat does.
const unknownRace = createCapturedTraitSettingsAdapter({
  rootState,
  getSettingsRaw: () => ({ imitateRace: "mystery" }),
}).readTraitSettingsReadModel();
assert.equal(unknownRace.imitateRaceCompleted, undefined);

// Writers round-trip through the settings record.
adapter.reorderMinorTraits(["tactical", "analytical"]);
assert.equal(raw.mTrait_p_tactical, 0);
assert.equal(raw.mTrait_p_analytical, 1);
adapter.reorderMutableTraits(["creative", "adaptable"]);
assert.equal(raw.mutableTrait_p_creative, 0);
assert.equal(raw.mutableTrait_p_adaptable, 1);
adapter.setBoolean("mTrait_tactical", false);
assert.equal(raw.mTrait_tactical, false);
const sectionLifecycle = createRecordSettingsLifecycle({
  raw,
  rootState,
  controls: { resolve: () => undefined, capturedElementIds: () => [] },
});

sectionLifecycle.resetSection("minortrait");
assert.equal(raw.shifterGenus, "ignore");
assert.equal(raw.imitateRace, "ignore");
assert.equal(raw.mTrait_tactical, true);
assert.equal(raw.mTrait_p_tactical, 0);
assert.equal(raw.ocularPower_disintegration, true);
sectionLifecycle.resetSection("mutabletrait");
assert.equal(raw.mutableTrait_p_adaptable, 0);
assert.equal(raw.mutableTrait_purge_adaptable, false);

// A missing record is a no-op rather than a crash.
const missing = createCapturedTraitSettingsAdapter({
  rootState: {
    readRoot: () => undefined,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  getSettingsRaw: () => undefined,
});
assert.equal(
  missing.readTraitSettingsReadModel().imitateRaceCompleted,
  undefined,
);
missing.reorderMinorTraits(["tactical"]);
missing.reorderMutableTraits(["adaptable"]);
missing.setBoolean("mTrait_tactical", true);

console.log("captured trait settings ok");
