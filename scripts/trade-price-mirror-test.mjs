import assert from "node:assert/strict";

import {
  TRADE_ROUTE_RATIO,
  tradeRoutePrices,
  tradeRouteSellQuantity,
  unsupportedTradePriceModifier,
} from "../src/adapters/evolve/economy/market/trade-price-mirror.ts";

/**
 * The expected numbers below are characterized against the game's own `tradeBuyPrice` and
 * `tradeSellPrice`, not derived here a second time. `node tools/trade-price-oracle.mjs --scenarios`
 * re-runs that comparison over a real save and every injectable price term.
 */
const characterized = {
  race: { arrogant: 1 },
  tech: { trade: 3, railway: 1 },
  city: { wharf: { count: 9 } },
  space: { gps: { count: 5 } },
  stats: { achieve: {} },
  resource: {
    Iron: { value: 95.82000000000014 },
    Coal: { value: 55.74000000000013 },
  },
};

for (const [id, expected] of [
  ["Iron", { buy: 89.7, sell: 28 }],
  ["Coal", { buy: 52.2, sell: 16.3 }],
]) {
  assert.deepEqual(
    tradeRoutePrices(characterized, id, characterized.resource[id]),
    expected,
    `${id} must price as the game does`,
  );
}

// A bare root still prices: every structure, tech and achievement term is lazily absent until the
// game creates it, and upstream treats an absent container as "no modifier".
const bare = { race: {}, resource: { Iron: { value: 100 } } };
assert.deepEqual(tradeRoutePrices(bare, "Iron", bare.resource.Iron), {
  buy: 100,
  sell: 25,
});

// Wharves and Railway are the two terms that used to disable the whole feature; both belong to the
// script's own build and research, so they must price rather than bail.
assert.equal(unsupportedTradePriceModifier(characterized), undefined);
assert.equal(
  unsupportedTradePriceModifier({ city: { wharf: { count: 12 } } }),
  undefined,
);
assert.equal(
  unsupportedTradePriceModifier({ tech: { railway: 4 } }),
  undefined,
);
// `global.genes.cunning` is not what upstream reads; an unslotted gene contributes nothing.
assert.equal(
  unsupportedTradePriceModifier({ genes: { cunning: 1 }, race: {} }),
  undefined,
);

// The two terms the mirror deliberately does not restate.
assert.equal(
  unsupportedTradePriceModifier({
    race: { geneSlots: [{ g: "cunning", r: 1 }] },
  }),
  "a slotted Cunning gene",
);
assert.equal(
  unsupportedTradePriceModifier({
    tech: { psychic: 4 },
    race: { psychic: 1, psychicPowers: { cash: 1 } },
  }),
  "the psychic cash power",
);
assert.equal(
  tradeRoutePrices(
    { race: { geneSlots: [{ g: "cunning", r: 1 }] }, resource: {} },
    "Iron",
    { value: 100 },
  ),
  undefined,
);
// An idle psychic with no cash power is not a blocked price.
assert.equal(
  unsupportedTradePriceModifier({
    tech: { psychic: 4 },
    race: { psychic: 1, psychicPowers: { boost: { r: 0 } } },
  }),
  undefined,
);

/**
 * Truepath hostility. Injecting `race.truepath` into a standard save crashes the game, so this term
 * is verified against upstream's source rather than its runtime: hostility raises the buy price and
 * lowers the sell price by `hstl / 101`, and stops applying once the rival has collapsed.
 */
const truepath = (extra) => ({
  race: { truepath: 1, ...extra },
  tech: { trade: 3, ...(extra?.tech ?? {}) },
  civic: { foreign: { gov3: { hstl: 50 } } },
  resource: { Iron: { value: 100 } },
});
const hostile = tradeRoutePrices(truepath(), "Iron", { value: 100 });
assert.deepEqual(hostile, {
  buy: Number((100 * (1 + 50 / 101)).toFixed(1)),
  sell: Number((25 * (1 - 50 / 101)).toFixed(1)),
});
const collapsed = { ...truepath(), tech: { trade: 3, shadow: 3 } };
assert.deepEqual(tradeRoutePrices(collapsed, "Iron", { value: 100 }), {
  buy: 100,
  sell: 25,
});
assert.deepEqual(
  tradeRoutePrices(truepath({ lone_survivor: 1 }), "Iron", { value: 100 }),
  { buy: 100, sell: 25 },
);

// Empowered promotes a trait one rung up the rank ladder, so Arrogant rank 1 prices as rank 2.
const arrogantRank1 = tradeRoutePrices(
  { race: { arrogant: 1 }, resource: {} },
  "Iron",
  { value: 100 },
);
const arrogantRank2 = tradeRoutePrices(
  { race: { arrogant: 2 }, resource: {} },
  "Iron",
  { value: 100 },
);
const arrogantEmpowered = tradeRoutePrices(
  { race: { arrogant: 1, empowered: 1 }, resource: {} },
  "Iron",
  { value: 100 },
);
assert.notDeepEqual(arrogantRank1, arrogantRank2);
assert.deepEqual(arrogantEmpowered, arrogantRank2);

// A rank the ladder does not carry is unusable rather than silently treated as rank 1.
assert.equal(
  tradeRoutePrices({ race: { arrogant: 7 }, resource: {} }, "Iron", {
    value: 100,
  }),
  undefined,
);

// An export route moves the upstream ratio, discounted by the Trade achievement to a cap of five.
assert.equal(tradeRouteSellQuantity({}, "Iron"), TRADE_ROUTE_RATIO.Iron);
assert.equal(
  tradeRouteSellQuantity({ stats: { achieve: { trade: { l: 3 } } } }, "Iron"),
  TRADE_ROUTE_RATIO.Iron * 0.97,
);
assert.equal(
  tradeRouteSellQuantity({ stats: { achieve: { trade: { l: 9 } } } }, "Iron"),
  TRADE_ROUTE_RATIO.Iron * 0.95,
);
assert.equal(tradeRouteSellQuantity({}, "Knowledge"), undefined);

// A resource the game does not trade has no price at all.
assert.equal(tradeRoutePrices(bare, "Knowledge", { value: 100 }), undefined);
// A resource whose value has not been computed yet is not priced as free.
assert.equal(tradeRoutePrices(bare, "Iron", { value: 0 }), undefined);

console.log("trade-price-mirror tests passed");
