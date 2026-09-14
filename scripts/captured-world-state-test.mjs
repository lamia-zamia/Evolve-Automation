import assert from "node:assert/strict";

import {
  canAfford,
  hasPlanetTrait,
  hasTech,
  hasTrait,
  isFeatureVisible,
  resourceView,
  techLevel,
  traitRank,
} from "../src/domain/game-world.ts";
import {
  createCapturedGameSettingsSource,
  createCapturedIdentitySource,
  createCapturedRaceTraitSource,
  createCapturedResourceSource,
  createCapturedTechSource,
} from "../src/adapters/evolve/captured-world-state.ts";

/** A root source over a plain object, or over nothing at all before the game creates its state. */
function rootSource(root) {
  return {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
}

const NO_ROOT = rootSource(undefined);

function fullRoot() {
  return {
    race: {
      species: "sharkin",
      universe: "antimatter",
      gods: "human",
      old_gods: "elven",
      carnivore: 1,
      high_pop: 3,
      truepath: true,
      governor: { g: { bg: "noble" } },
      inactiveTraits: {},
    },
    city: { biome: "oceanic", ptrait: ["unstable", "trashed"] },
    stats: { reset: 7, days: 412, tdays: 9001 },
    settings: {
      pause: false,
      showCity: true,
      showSpace: false,
      showMarket: true,
      theme: "gruvboxDark",
      autoShow: true,
    },
    tech: { housing: 3, foundry: 1 },
    resource: {
      Money: { display: true, amount: 5000, max: 25000, diff: 12 },
      Lumber: { display: true, amount: 100, max: -1, diff: -3 },
      Plywood: { display: false, amount: 0, max: 0, diff: 0 },
    },
  };
}

// --- identity -------------------------------------------------------------

{
  const identity = createCapturedIdentitySource(
    rootSource(fullRoot()),
  ).readIdentity();
  assert.equal(identity.species, "sharkin");
  assert.equal(identity.universe, "antimatter");
  assert.equal(identity.biome, "oceanic");
  assert.deepEqual([...identity.planetTraits], ["unstable", "trashed"]);
  assert.equal(identity.gods, "human");
  assert.equal(identity.oldGods, "elven");
  assert.equal(identity.resets, 7);
  assert.equal(identity.days, 412);
  assert.equal(identity.totalDays, 9001);
  assert.equal(hasPlanetTrait(identity, "unstable"), true);
  assert.equal(hasPlanetTrait(identity, "toxic"), false);
}

{
  // The uninitialized game: race, city and stats exist long before any of these fields do.
  const identity = createCapturedIdentitySource(
    rootSource({ race: {}, city: {}, stats: {} }),
  ).readIdentity();
  assert.deepEqual(
    { ...identity, planetTraits: [...identity.planetTraits] },
    {
      species: "",
      universe: "",
      biome: "",
      planetTraits: [],
      gods: "",
      oldGods: "",
      resets: 0,
      days: 0,
      totalDays: 0,
    },
  );
}

{
  // A pre-1.2.12 ptrait string never reaches this build; it reports no traits rather than one.
  const identity = createCapturedIdentitySource(
    rootSource({ city: { ptrait: "none" } }),
  ).readIdentity();
  assert.deepEqual([...identity.planetTraits], []);
}

assert.equal(createCapturedIdentitySource(NO_ROOT).readIdentity(), undefined);

// --- game settings and static feature visibility ---------------------------

{
  const settings = createCapturedGameSettingsSource(
    rootSource(fullRoot()),
  ).readGameSettings();
  assert.equal(settings.paused, false);
  assert.equal(isFeatureVisible(settings, "showCity"), true);
  assert.equal(isFeatureVisible(settings, "showMarket"), true);
  // Switched off, and never switched on, are the same answer.
  assert.equal(isFeatureVisible(settings, "showSpace"), false);
  assert.equal(isFeatureVisible(settings, "showPortal"), false);
  // "show" has to start the key, not merely appear in it.
  assert.equal(settings.visibleFeatures.has("autoShow"), false);
  assert.equal(settings.visibleFeatures.has("theme"), false);
}

{
  // global.settings itself does not exist until the game builds it.
  const settings = createCapturedGameSettingsSource(
    rootSource({}),
  ).readGameSettings();
  assert.equal(settings.paused, false);
  assert.equal(settings.visibleFeatures.size, 0);
}

{
  const settings = createCapturedGameSettingsSource(
    rootSource({ settings: { pause: true } }),
  ).readGameSettings();
  assert.equal(settings.paused, true);
}

assert.equal(
  createCapturedGameSettingsSource(NO_ROOT).readGameSettings(),
  undefined,
);

// --- tech ------------------------------------------------------------------

{
  const tech = createCapturedTechSource(rootSource(fullRoot())).readTech([
    "housing",
    "foundry",
    "wheel",
  ]);
  assert.equal(techLevel(tech, "housing"), 3);
  // Unresearched tech has no entry at all, which is the game's own level 0.
  assert.equal(techLevel(tech, "wheel"), 0);
  assert.equal(hasTech(tech, "foundry"), true);
  assert.equal(hasTech(tech, "housing", 3), true);
  assert.equal(hasTech(tech, "housing", 4), false);
  assert.equal(hasTech(tech, "wheel"), false);
  // A sample answers only for what it was asked to read.
  assert.throws(() => techLevel(tech, "mining"), /tech mining was not sampled/);
}

assert.equal(
  createCapturedTechSource(NO_ROOT).readTech(["housing"]),
  undefined,
);

// --- race traits -----------------------------------------------------------

{
  const traits = createCapturedRaceTraitSource(
    rootSource(fullRoot()),
  ).readRaceTraits([
    "carnivore",
    "high_pop",
    "truepath",
    "herbivore",
    "governor",
    "species",
  ]);
  assert.equal(traitRank(traits, "carnivore"), 1);
  assert.equal(traitRank(traits, "high_pop"), 3);
  // A flag stored as true ranks 1, the way the game's own truth test reads it.
  assert.equal(traitRank(traits, "truepath"), 1);
  assert.equal(traitRank(traits, "herbivore"), 0);
  // Non-trait members of the same bag are not traits.
  assert.equal(traitRank(traits, "governor"), 0);
  assert.equal(traitRank(traits, "species"), 0);
  assert.equal(hasTrait(traits, "carnivore"), true);
  assert.equal(hasTrait(traits, "herbivore"), false);
  assert.throws(
    () => traitRank(traits, "smoldering"),
    /trait smoldering was not sampled/,
  );
}

assert.equal(
  createCapturedRaceTraitSource(NO_ROOT).readRaceTraits(["carnivore"]),
  undefined,
);

// --- resources -------------------------------------------------------------

{
  const sample = createCapturedResourceSource(
    rootSource(fullRoot()),
  ).readResources(["Money", "Lumber", "Plywood", "Morale"]);
  assert.deepEqual(resourceView(sample, "Money"), {
    unlocked: true,
    amount: 5000,
    max: 25000,
    rateOfChange: 12,
    storageRatio: 0.2,
  });
  // An uncapped resource is stored as max -1 and is never near a ceiling.
  assert.equal(resourceView(sample, "Lumber").storageRatio, 0);
  assert.equal(resourceView(sample, "Plywood").unlocked, false);
  // A cost key that names no stored resource reports as absent rather than throwing.
  assert.deepEqual(resourceView(sample, "Morale"), {
    unlocked: false,
    amount: 0,
    max: 0,
    rateOfChange: 0,
    storageRatio: 0,
  });
  assert.throws(
    () => resourceView(sample, "Stone"),
    /resource Stone was not sampled/,
  );

  assert.equal(canAfford(sample, { Money: 5000, Lumber: 100 }), true);
  assert.equal(canAfford(sample, { Money: 5001 }), false);
  // A zero-or-negative requirement is not a requirement, even for an unsampled key.
  assert.equal(canAfford(sample, { Money: 10, Knowledge: 0 }), true);
  // Synthetic requirements make the cost unaffordable rather than being waved through.
  assert.equal(canAfford(sample, { Morale: 1 }), false);
}

// Regional construction reads the paying pool rather than the civilization-wide total.
{
  const sample = createCapturedResourceSource(
    rootSource({
      tech: { shadow: 5 },
      race: { supplySplit: true },
      resource: {
        Money: {
          display: true,
          amount: 950,
          max: 10000,
          diff: 30,
          reg: { spc_home: 50, spc_moon: 900 },
          regMax: { spc_home: 100, spc_moon: 1000 },
          regDiff: { spc_home: 2, spc_moon: 28 },
        },
      },
    }),
  ).readResources(["Money"], { pool: "spc_home" });
  assert.deepEqual(resourceView(sample, "Money"), {
    unlocked: true,
    amount: 50,
    max: 100,
    rateOfChange: 2,
    storageRatio: 0.5,
  });
}

{
  // A resource the game has created but not yet filled in reads leniently, not as a rejection.
  const sample = createCapturedResourceSource(
    rootSource({ resource: { Food: {} } }),
  ).readResources(["Food"]);
  const view = resourceView(sample, "Food");
  assert.equal(view.unlocked, false);
  assert.ok(Number.isNaN(view.amount));
  assert.equal(view.storageRatio, 0);
}

// `Species` is the game's own alias for the current race's population resource, and several
// portal buildings and two technologies are priced in it. `setData` hands the alias back
// unresolved, so a sample that read it literally would report nothing held and make every
// `Species`-priced action permanently unaffordable.
{
  const sample = createCapturedResourceSource(
    rootSource({
      race: { species: "human" },
      resource: { human: { display: true, amount: 42, max: 60, diff: 1 } },
    }),
  ).readResources(["Species"]);
  const view = resourceView(sample, "Species");
  assert.equal(view.amount, 42);
  assert.equal(view.max, 60);
  assert.equal(view.unlocked, true);
}
// The alias follows the race, and a race whose own resource the game has not created reads as
// absent rather than throwing.
{
  const sample = createCapturedResourceSource(
    rootSource({ race: { species: "sludge" }, resource: {} }),
  ).readResources(["Species"]);
  assert.equal(resourceView(sample, "Species").amount, 0);
}
// Nothing else is aliased: a resource genuinely named in the bag still wins.
{
  const sample = createCapturedResourceSource(
    rootSource({
      race: { species: "human" },
      resource: {
        human: { amount: 42 },
        Money: { display: true, amount: 7, max: 9, diff: 0 },
      },
    }),
  ).readResources(["Money"]);
  assert.equal(resourceView(sample, "Money").amount, 7);
}

assert.equal(
  createCapturedResourceSource(NO_ROOT).readResources(["Money"]),
  undefined,
);

console.log("captured world state contracts verified");
