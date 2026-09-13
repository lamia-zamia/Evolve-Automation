import assert from "node:assert/strict";

import {
  createDiscoveryScopeCache,
  sameOfferPrices,
  MIN_SAMPLE_AGE_MS,
  MAX_SAMPLE_AGE_MS,
} from "../src/adapters/evolve/discovery-scope-cache.ts";

function harness() {
  let epoch = "e1";
  let now = 0;
  let takes = 0;
  const cache = createDiscoveryScopeCache({
    readEpoch: () => epoch,
    nowMs: () => now,
  });
  return {
    cache,
    takes: () => takes,
    setEpoch: (value) => {
      epoch = value;
    },
    advance: (ms) => {
      now += ms;
    },
    take: (value) => () => {
      takes += 1;
      return value;
    },
  };
}

const OFFER = [{ elementId: "tech-mining", cost: { Knowledge: 6600 } }];
const SAME_OFFER = [{ elementId: "tech-mining", cost: { Knowledge: 6600 } }];
const DEARER = [{ elementId: "tech-mining", cost: { Knowledge: 9900 } }];

// --- the cached answer is served without a second take ---------------------

{
  const h = harness();
  assert.deepEqual(h.cache.read("research", h.take(OFFER)), OFFER);
  assert.deepEqual(h.cache.read("research", h.take(OFFER)), OFFER);
  assert.deepEqual(h.cache.read("research", h.take(OFFER)), OFFER);
  assert.equal(h.takes(), 1, "a held sample must not re-take within its age");
}

// Scopes are independent: one being current says nothing about another.
{
  const h = harness();
  h.cache.read("research", h.take(OFFER));
  h.cache.read("arpa", h.take(OFFER));
  assert.equal(h.takes(), 2);
  h.cache.read("research", h.take(OFFER));
  assert.equal(h.takes(), 2);
}

// --- progression invalidates -----------------------------------------------

{
  const h = harness();
  h.cache.read("research", h.take(OFFER));
  h.setEpoch("e2");
  h.cache.read("research", h.take(DEARER));
  assert.equal(h.takes(), 2, "an epoch change must re-take the sample");
}

// --- the age fallback catches what the epoch cannot -------------------------

{
  const h = harness();
  h.cache.read("research", h.take(OFFER));
  h.advance(MIN_SAMPLE_AGE_MS - 1);
  h.cache.read("research", h.take(OFFER));
  assert.equal(h.takes(), 1, "still inside the interval");
  h.advance(1);
  h.cache.read("research", h.take(OFFER));
  assert.equal(
    h.takes(),
    2,
    "an aged-out sample must be re-taken even with the epoch unchanged",
  );
}

// An unchanged resample doubles the interval; a changed one drops it back to the floor.
{
  const h = harness();
  h.cache.read("research", h.take(OFFER), sameOfferPrices);
  let expectedAge = MIN_SAMPLE_AGE_MS;
  for (let round = 0; round < 6; round += 1) {
    h.advance(expectedAge);
    h.cache.read("research", h.take(SAME_OFFER), sameOfferPrices);
    expectedAge = Math.min(expectedAge * 2, MAX_SAMPLE_AGE_MS);
    // One tick short of the widened interval must still be served from the cache.
    const takesBefore = h.takes();
    h.advance(expectedAge - 1);
    h.cache.read("research", h.take(SAME_OFFER), sameOfferPrices);
    assert.equal(
      h.takes(),
      takesBefore,
      `after ${round + 1} unchanged resamples the interval must be ${expectedAge}ms`,
    );
    h.advance(1 - expectedAge);
  }
  assert.equal(expectedAge, MAX_SAMPLE_AGE_MS, "the interval is bounded");

  // A resample that finds a different answer means progression the epoch missed: back to the floor.
  h.advance(MAX_SAMPLE_AGE_MS);
  h.cache.read("research", h.take(DEARER), sameOfferPrices);
  const takesBefore = h.takes();
  h.advance(MIN_SAMPLE_AGE_MS);
  h.cache.read("research", h.take(DEARER), sameOfferPrices);
  assert.equal(
    h.takes(),
    takesBefore + 1,
    "a changed answer resets the interval",
  );
}

// Without a comparator a scope never widens: it cannot tell whether its answer moved.
{
  const h = harness();
  h.cache.read("research", h.take(OFFER));
  for (let round = 0; round < 4; round += 1) {
    h.advance(MIN_SAMPLE_AGE_MS);
    h.cache.read("research", h.take(OFFER));
  }
  assert.equal(h.takes(), 5);
}

// --- a failed read is not an answer ----------------------------------------

{
  const h = harness();
  h.cache.read("research", h.take(OFFER));
  h.advance(MIN_SAMPLE_AGE_MS);
  assert.equal(
    h.cache.read("research", () => undefined),
    undefined,
    "a failed take is reported, never papered over with the held sample",
  );
  // And it must not have left the stale sample behind for the next caller either: the very next
  // read takes afresh rather than serving an offer set the game may already have withdrawn.
  assert.deepEqual(h.cache.read("research", h.take(DEARER)), DEARER);
  assert.equal(h.takes(), 2);
}

// --- explicit invalidation --------------------------------------------------

{
  const h = harness();
  h.cache.read("research", h.take(OFFER));
  h.cache.read("arpa", h.take(OFFER));
  h.cache.invalidate("research");
  h.cache.read("research", h.take(OFFER));
  assert.equal(h.takes(), 3);
  h.cache.read("arpa", h.take(OFFER));
  assert.equal(h.takes(), 3, "invalidating one scope leaves the others held");
  h.cache.invalidateAll();
  h.cache.read("arpa", h.take(OFFER));
  assert.equal(h.takes(), 4);
}

// --- what "the same answer" means ------------------------------------------

assert.equal(sameOfferPrices([], []), true);
assert.equal(sameOfferPrices(OFFER, SAME_OFFER), true);
assert.equal(sameOfferPrices(OFFER, DEARER), false);
assert.equal(sameOfferPrices(OFFER, []), false);
assert.equal(
  sameOfferPrices(OFFER, [
    { elementId: "tech-smelting", cost: { Knowledge: 6600 } },
  ]),
  false,
  "a different offer at the same price is a different answer",
);
assert.equal(
  sameOfferPrices(OFFER, [
    { elementId: "tech-mining", cost: { Knowledge: 6600, Iron: 375 } },
  ]),
  false,
  "an added cost resource is a different answer",
);
// Everything the caller restates from live state afterwards is deliberately not compared.
assert.equal(
  sameOfferPrices(
    [{ elementId: "arpa-lhc", cost: { Money: 100 }, rank: 2, generation: 7 }],
    [{ elementId: "arpa-lhc", cost: { Money: 100 }, rank: 9, generation: 1 }],
  ),
  true,
);

console.log("discovery-scope-cache ok");
