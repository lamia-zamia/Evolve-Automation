import assert from "node:assert/strict";

import {
  costFitsNow,
  costFitsStorage,
  isRegionalSupply,
} from "../src/adapters/evolve/captured-affordability.ts";

const root = {
  race: { species: "human" },
  resource: {
    Money: { amount: 250, max: 1000, display: true },
    Lumber: { amount: 100, max: 5000, display: true },
    // The game's "no limit" capacity, which every cost fits under.
    Soul_Gem: { amount: 0, max: -1, display: true },
    // Stored but not being shown: the game refuses a positive cost in it whatever its capacity.
    Nanite: { amount: 0, max: 10000, display: false },
    human: { amount: 4, max: 12, display: true },
  },
};

// Every positive cost has to fit under its resource's capacity.
assert.equal(costFitsStorage(root, { Money: 900 }), true);
assert.equal(costFitsStorage(root, { Money: 1000 }), true);
assert.equal(costFitsStorage(root, { Money: 1001 }), false);
assert.equal(costFitsStorage(root, { Money: 900, Lumber: 4000 }), true);
assert.equal(costFitsStorage(root, { Money: 900, Lumber: 6000 }), false);
// Capacity, not holdings: a cost far above the current amount still fits.
assert.equal(costFitsStorage(root, { Lumber: 4000 }), true);
// A negative capacity is the game's "unlimited".
assert.equal(costFitsStorage(root, { Soul_Gem: 1e9 }), true);
// A positive cost in a resource the game is not displaying is refused.
assert.equal(costFitsStorage(root, { Nanite: 1 }), false);
// A zero cost is never refused, even in a resource that is not displayed.
assert.equal(costFitsStorage(root, { Nanite: 0 }), true);
assert.equal(costFitsStorage(root, {}), true);
// `Species` is the game's alias for the current race's own resource.
assert.equal(costFitsStorage(root, { Species: 12 }), true);
assert.equal(costFitsStorage(root, { Species: 13 }), false);

// A zero capacity is a ceiling by default, matching upstream `cap >= 0`.
assert.equal(
  costFitsStorage(
    { resource: { Money: { max: 0, display: true } } },
    { Money: 1 },
  ),
  false,
);
assert.equal(
  costFitsStorage(
    { resource: { Money: { max: 0, display: true } } },
    { Money: 0 },
  ),
  true,
);
// The queue-reservation test opts out: a resource with no capacity yet is not a known ceiling.
assert.equal(
  costFitsStorage(
    { resource: { Money: { max: 0, display: true } } },
    { Money: 1 },
    { zeroCapIsCeiling: false },
  ),
  true,
);
assert.equal(
  costFitsStorage(root, { Money: 1001 }, { zeroCapIsCeiling: false }),
  false,
  "an ordinary ceiling still refuses under the loose comparison",
);
assert.equal(
  costFitsStorage(root, { Soul_Gem: 1e9 }, { zeroCapIsCeiling: false }),
  true,
);
assert.equal(
  costFitsStorage(root, { Nanite: 1 }, { zeroCapIsCeiling: false }),
  false,
  "the loose comparison only relaxes the zero cap, not the display refusal",
);
// A cost the comparison cannot make is unjudgeable, never false: the special upstream branches for
// Morale, Army, Troops, Structs and the prestige currencies read state this does not hold.
assert.equal(costFitsStorage(root, { Morale: 5 }), undefined);
assert.equal(costFitsStorage(root, { Army: 100 }), undefined);
assert.equal(costFitsStorage(root, { Plasmid: 10 }), undefined);
assert.equal(costFitsStorage(root, { Money: 10, Structs: 1 }), undefined);
// A resource the root has no entry for cannot be judged either.
assert.equal(costFitsStorage(root, { Elerium: 1 }), undefined);
assert.equal(costFitsStorage(root, { Money: Number.NaN }), undefined);
// A refusal is reported even when another key in the same cost is unjudgeable, only when the
// refusal is reached first — the walk stops at whichever it meets, so order decides.
assert.equal(costFitsStorage({ resource: {} }, { Money: 1 }), undefined);

// `checkCosts` adds on-hand holdings to the same capacity comparison.
assert.equal(costFitsNow(root, { Money: 250 }), true);
assert.equal(costFitsNow(root, { Money: 251 }), false);
assert.equal(costFitsNow(root, { Lumber: 101 }), false);
assert.equal(costFitsNow(root, { Lumber: 5000 }), false);
assert.equal(costFitsNow(root, { Soul_Gem: 0 }), true);
assert.equal(costFitsNow(root, { Soul_Gem: 1 }), false);
assert.equal(costFitsNow(root, { Nanite: 1 }), false);
assert.equal(costFitsNow(root, { Species: 4 }), true);
assert.equal(costFitsNow(root, { Species: 5 }), false);
assert.equal(costFitsNow(root, { Morale: 1 }), undefined);
assert.equal(costFitsNow(root, { Elerium: 1 }), undefined);

// Regional holdings and caps use the paying pool's own ledgers; an absent pool reads as zero.
assert.equal(
  costFitsNow(
    {
      tech: { shadow: 5 },
      race: { supplySplit: true },
      resource: {
        Money: {
          amount: 900,
          max: 10000,
          display: true,
          reg: { spc_home: 50, spc_moon: 900 },
          regMax: { spc_home: 100, spc_moon: 1000 },
        },
      },
    },
    { Money: 50 },
    { pool: "spc_home" },
  ),
  true,
);
assert.equal(
  costFitsNow(
    {
      tech: { shadow: 5 },
      race: { supplySplit: true },
      resource: {
        Money: {
          amount: 900,
          max: 10000,
          display: true,
          reg: { spc_home: 50, spc_moon: 900 },
          regMax: { spc_home: 100, spc_moon: 1000 },
        },
      },
    },
    { Money: 51 },
    { pool: "spc_home" },
  ),
  false,
);
assert.equal(
  costFitsNow(
    {
      tech: { shadow: 5 },
      race: { supplySplit: true },
      resource: {
        Money: { amount: 900, max: 10000, display: true, reg: {} },
      },
    },
    { Money: 1 },
    { pool: "spc_moon" },
  ),
  false,
);

// Below `tech.shadow >= 5` the civilization-wide comparison is the game's own.
assert.equal(isRegionalSupply(root), false);
assert.equal(isRegionalSupply({ tech: {} }), false);
assert.equal(isRegionalSupply({ tech: { shadow: 4 } }), false);
// At and above it the game checks the paying region's share instead.
assert.equal(
  isRegionalSupply({ tech: { shadow: 5 }, race: { supplySplit: false } }),
  false,
);
assert.equal(
  isRegionalSupply({ tech: { shadow: 5 }, race: { supplySplit: true } }),
  true,
);
assert.equal(
  isRegionalSupply({ tech: { shadow: 6 }, race: { supplySplit: true } }),
  true,
);
assert.equal(isRegionalSupply(undefined), false);

console.log("captured-affordability ok");
