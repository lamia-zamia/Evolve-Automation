/**
 * Test doubles for `GameActionCostReader`, whose `readCost` answers a `GameActionPrice`
 * (`{ cost, pool }`) rather than a bare cost map: the game's own probe reports the supply pool an
 * action pays from alongside its adjusted price, and the capacity comparison needs both.
 *
 * Most fixtures care only about the price, so `pool` defaults to `undefined` — the game's own answer
 * below `tech.shadow >= 5`, where there are no regional pools, and for any action with no place of
 * its own. Pass one explicitly to exercise a partitioned cost.
 */

/** One action's price, with no pool unless the fixture names one. */
export function actionPrice(cost, pool = undefined) {
  return { cost, pool };
}

/**
 * A `readCost` over a plain `{ [actionId]: cost }` map, answering `undefined` for an id the map does
 * not hold — which is what the real reader does for an action the game cannot price.
 */
export function priceLookup(costsById, poolsById = {}) {
  return (actionId) =>
    actionId in costsById
      ? actionPrice(costsById[actionId], poolsById[actionId])
      : undefined;
}
