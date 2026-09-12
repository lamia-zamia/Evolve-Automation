/**
 * Upstream's trade-route price rules, mirrored over captured state.
 *
 * Mirrors `tradeSellPrice` and `tradeBuyPrice` from the game's `src/resources.js`, and the
 * sell-route rate `fastLoop` applies in `src/main.js` (DeadSpace `8b6d938b`). This is the single
 * owner of those three numbers; every trade-route reader calls it rather than comparing prices of
 * its own.
 *
 * The game's own answer is genuinely not reachable here, which is why these are restated. The drawn
 * `market-<res>` row exposes `aSell` and `aBuy`, but `aSell` only returns a localized sentence with
 * the figures interpolated into prose, and `aBuy` throws on every call: upstream's `resources.js`
 * references a bare `astroSign` that the module never declares. Debug Mode's `window.evolve`
 * carries both functions, but production must not depend on Debug Mode — it is a test oracle only.
 *
 * Three upstream terms are not restated, because each needs a subsystem this module has no reason
 * to own. `unsupportedTradePriceModifier` names whichever one is active so the caller's diagnostic
 * says what is missing instead of "not captured".
 */

import { finite, isRecord, readProperty } from "../../../validation.ts";

/** Upstream `tradeRatio`: the unit quantity one route moves, and the set of tradeable resources. */
export const TRADE_ROUTE_RATIO: Readonly<Record<string, number>> =
  Object.freeze({
    Food: 2,
    Lumber: 2,
    Chrysotile: 1,
    Stone: 2,
    Crystal: 0.4,
    Furs: 1,
    Copper: 1,
    Iron: 1,
    Aluminium: 1,
    Cement: 1,
    Coal: 1,
    Oil: 0.5,
    Uranium: 0.12,
    Steel: 0.5,
    Titanium: 0.25,
    Alloy: 0.2,
    Polymer: 0.2,
    Iridium: 0.1,
    Helium_3: 0.1,
    Deuterium: 0.1,
    Elerium: 0.02,
    Water: 2,
    Neutronium: 0.05,
    Adamantite: 0.05,
    Infernite: 0.01,
    Nano_Tube: 0.1,
    Graphene: 0.1,
    Stanene: 0.1,
    Bolognium: 0.12,
    Vitreloy: 0.12,
    Orichalcum: 0.05,
  });

/** The rank ladder every `traits.<trait>.vars(r)` switches on. */
const TRAIT_RANKS = Object.freeze([0.1, 0.25, 0.5, 1, 2, 3, 4]);

/** `traits.<trait>.vars()[0]` per rank, for the traits the two price rules read. */
const TRAIT_VALUES = Object.freeze({
  arrogant: Object.freeze([16, 14, 12, 10, 8, 6, 5]),
  merchant: Object.freeze([5, 10, 15, 25, 35, 40, 45]),
  conniving: Object.freeze([1, 2, 3, 5, 8, 10, 12]),
  asymmetrical: Object.freeze([35, 30, 25, 20, 15, 10, 5]),
  devious: Object.freeze([35, 30, 25, 20, 15, 10, 8]),
});

/** `traits.<trait>.val`, which decides whether Empowered reaches that trait. */
const TRAIT_VALS: Readonly<Record<keyof typeof TRAIT_VALUES, number>> =
  Object.freeze({
    arrogant: -2,
    merchant: 3,
    conniving: 4,
    asymmetrical: -3,
    devious: -4,
  });

/** `traits.empowered.vars()` per rank: the inclusive `val` window Empowered promotes. */
const EMPOWERED_RANGES = Object.freeze([
  Object.freeze([-1, 2]),
  Object.freeze([-2, 3]),
  Object.freeze([-3, 4]),
  Object.freeze([-4, 6]),
  Object.freeze([-6, 9]),
  Object.freeze([-8, 12]),
  Object.freeze([-99, 99]),
]);

/** Upstream `traitRank`'s promotion, one rung per entry of `TRAIT_RANKS`. */
const EMPOWERED_RANK = Object.freeze([0.25, 0.5, 1, 2, 3, 4, 4]);

/**
 * The goblin and imp fathom terms pass `vars(1)` explicitly, so they read the rank-1 row and are
 * never promoted by Empowered.
 */
const GOBLIN_SELL_DIVISOR_PERCENT = 25;
const IMP_BUY_PERCENT = 5;

/** Upstream `rivalCollapsed()`. */
function rivalCollapsed(root: unknown): boolean {
  const shadow = finite(readProperty(readProperty(root, "tech"), "shadow"));
  return shadow !== undefined && shadow >= 3;
}

/**
 * Upstream `traits[trait].vars()[0]`, resolved through `traitRank` so Empowered's promotion
 * applies. Returns `0` for an inactive trait and `undefined` for a rank the ladder does not carry.
 */
function traitPercent(
  race: Record<PropertyKey, unknown>,
  trait: keyof typeof TRAIT_VALUES,
): number | undefined {
  if (!race[trait]) return 0;
  const rank = finite(race[trait]);
  if (rank === undefined) return undefined;
  let index = TRAIT_RANKS.indexOf(rank);
  if (index < 0) return undefined;
  if (race["empowered"]) {
    const empowered = finite(race["empowered"]);
    if (empowered === undefined) return undefined;
    const empoweredIndex = TRAIT_RANKS.indexOf(empowered);
    if (empoweredIndex < 0) return undefined;
    const range = EMPOWERED_RANGES[empoweredIndex];
    const val = TRAIT_VALS[trait];
    if (range !== undefined && val >= range[0]! && val <= range[1]!) {
      const promoted = TRAIT_RANKS.indexOf(EMPOWERED_RANK[index]!);
      if (promoted < 0) return undefined;
      index = promoted;
    }
  }
  return TRAIT_VALUES[trait][index];
}

/** Upstream `fathomCheck(target)`. */
function fathom(
  root: unknown,
  race: Record<PropertyKey, unknown>,
  target: string,
): number | undefined {
  if (!race["unfathomable"]) return 0;
  const city = readProperty(root, "city");
  const dwellers = readProperty(city, "surfaceDwellers");
  if (!Array.isArray(dwellers) || !dwellers.includes(target)) return 0;
  const housing = readProperty(city, "captive_housing");
  const workers = finite(
    readProperty(
      readProperty(readProperty(root, "civic"), "torturer"),
      "workers",
    ),
  );
  const index = dwellers.indexOf(target);
  const active = finite(readProperty(housing, `race${index}`));
  const nightmare = readProperty(
    readProperty(readProperty(root, "stats"), "achieve"),
    "nightmare",
  );
  const mg = finite(readProperty(nightmare, "mg"));
  if (workers === undefined || active === undefined) return undefined;
  let adjusted = Math.min(active, 100);
  if (adjusted > workers) adjusted -= Math.ceil((adjusted - workers) / 3);
  return (adjusted / 100) * ((mg ?? 0) / 5);
}

/**
 * A structure's count, which stays absent until the structure is unlocked. Upstream tests the
 * container itself (`if (global.city['wharf'])`), so an absent one contributes nothing.
 */
function structureCount(container: unknown, id: string): number | undefined {
  const structure = readProperty(container, id);
  if (structure === undefined || structure === false) return 0;
  const count = finite(readProperty(structure, "count"));
  return count === undefined ? undefined : count;
}

/** The achievement level upstream reads as `global.stats.achieve[id].l`. */
function achievementLevel(root: unknown, id: string): number | undefined {
  const achieve = readProperty(readProperty(root, "stats"), "achieve");
  const entry = readProperty(achieve, id);
  if (entry === undefined) return 0;
  const level = finite(readProperty(entry, "l"));
  return level === undefined ? 0 : level;
}

/** Upstream's `1 + (global.tech.railway * boost)` / `boost ** global.tech.railway` exponent. */
function railwayLevel(root: unknown): number | undefined {
  const railway = readProperty(readProperty(root, "tech"), "railway");
  if (!railway) return 0;
  return finite(railway);
}

/** The Truepath hostility term both prices scale by, or `0` when it does not apply. */
function hostility(root: unknown, race: Record<PropertyKey, unknown>) {
  if (!race["truepath"] || race["lone_survivor"] || rivalCollapsed(root)) {
    return 0;
  }
  const gov3 = readProperty(
    readProperty(readProperty(root, "civic"), "foreign"),
    "gov3",
  );
  const hstl = finite(readProperty(gov3, "hstl"));
  return hstl === undefined ? undefined : hstl;
}

/** Upstream's Witch Hunter suspicion term, as the excess over the 50 it ignores. */
function suspicionExcess(
  root: unknown,
  race: Record<PropertyKey, unknown>,
): number | undefined {
  if (!race["witch_hunter"]) return 0;
  const amount = finite(
    readProperty(readProperty(readProperty(root, "resource"), "Sus"), "amount"),
  );
  if (amount === undefined) return undefined;
  return amount > 50 ? amount - 50 : 0;
}

/** Upstream's `global.race['inflation']` level, which is `false` or absent while unchallenged. */
function inflationLevel(
  race: Record<PropertyKey, unknown>,
): number | undefined {
  const inflation = race["inflation"];
  if (inflation === undefined || inflation === false) return 0;
  return finite(inflation);
}

/**
 * The one upstream term whose rank this module cannot resolve: a slotted Cunning gene. Genetics 2.0
 * reads its rank off `race.geneSlots` and halves it unless the rung is bonded to its matching
 * partner, which needs the whole pairing subsystem. An unslotted Cunning contributes nothing, so
 * only a slotted one blocks the buy price — `global.genes.cunning` alone does not.
 */
function cunningSlotted(root: unknown): boolean {
  const slots = readProperty(readProperty(root, "race"), "geneSlots");
  if (!Array.isArray(slots)) return false;
  return slots.some(
    (slot) => isRecord(slot) && readProperty(slot, "g") === "cunning",
  );
}

/** Whether `production('psychic_cash')` can return anything but `1`. */
function psychicCashActive(root: unknown): boolean {
  const race = readProperty(root, "race");
  const powers = readProperty(race, "psychicPowers");
  return Boolean(
    readProperty(readProperty(root, "tech"), "psychic") &&
    readProperty(race, "psychic") &&
    isRecord(powers) &&
    Object.hasOwn(powers, "cash"),
  );
}

/**
 * Which upstream price term is active but not restated here, or `undefined` when both prices can be
 * answered. Each entry is a deliberate omission, not an oversight:
 *
 * - `genes.cunning`: see `cunningSlotted`.
 * - psychic cash: `production('psychic_cash')` needs the psychic-power and Nightmare-rank chain.
 * - `underground.trade` is restated, so it is absent from this list.
 */
export function unsupportedTradePriceModifier(
  root: unknown,
): string | undefined {
  if (cunningSlotted(root)) return "a slotted Cunning gene";
  if (psychicCashActive(root)) return "the psychic cash power";
  return undefined;
}

/**
 * Mirrors `tradeSellPrice(res)` and `tradeBuyPrice(res)` for one resource. `undefined` means a
 * captured field was present but unusable, which the caller treats as "do not act this tick".
 */
export function tradeRoutePrices(
  root: unknown,
  resourceId: string,
  resource: Record<PropertyKey, unknown>,
): { readonly buy: number; readonly sell: number } | undefined {
  const ratio = TRADE_ROUTE_RATIO[resourceId];
  const value = finite(resource["value"]);
  const race = readProperty(root, "race");
  if (ratio === undefined || value === undefined || value <= 0)
    return undefined;
  if (!isRecord(race)) return undefined;
  if (unsupportedTradePriceModifier(root) !== undefined) return undefined;

  const arrogant = traitPercent(race, "arrogant");
  const conniving = traitPercent(race, "conniving");
  const merchant = traitPercent(race, "merchant");
  const asymmetrical = traitPercent(race, "asymmetrical");
  const devious = traitPercent(race, "devious");
  const goblin = fathom(root, race, "goblin");
  const imp = fathom(root, race, "imp");
  const wharf = structureCount(readProperty(root, "city"), "wharf");
  const gps = structureCount(readProperty(root, "space"), "gps");
  const underground = structureCount(
    readProperty(root, "underground"),
    "trade",
  );
  const railway = railwayLevel(root);
  const banana = achievementLevel(root, "banana");
  const hstl = hostility(root, race);
  const suspicion = suspicionExcess(root, race);
  const inflation = inflationLevel(race);
  const quarantine = finite(race["quarantine"] ?? 0);
  if (
    arrogant === undefined ||
    conniving === undefined ||
    merchant === undefined ||
    asymmetrical === undefined ||
    devious === undefined ||
    goblin === undefined ||
    imp === undefined ||
    wharf === undefined ||
    gps === undefined ||
    underground === undefined ||
    railway === undefined ||
    banana === undefined ||
    hstl === undefined ||
    suspicion === undefined ||
    inflation === undefined ||
    quarantine === undefined
  ) {
    return undefined;
  }

  // Upstream reads the same Railway boost from the Banana achievement for both directions.
  const railwayBuyBoost = banana >= 1 ? 0.97 : 0.98;
  const railwaySellBoost = banana >= 1 ? 0.03 : 0.02;
  // Only four or more GPS satellites pay out; below that the constellation is incomplete.
  const gpsActive = gps > 3 ? gps : 0;

  let buy = value * (1 + arrogant / 100) * (1 - conniving / 100);
  buy *= 1 - (imp * IMP_BUY_PERCENT) / 100;
  buy *= ratio;
  buy *= 0.99 ** wharf;
  buy *= 0.99 ** gpsActive;
  buy *= railwayBuyBoost ** railway;
  buy *= 1 + hstl / 101;
  buy *= 1 + inflation / 300;
  if (race["quarantine"]) buy *= 1 + Math.round(quarantine ** 3.5);
  buy *= 1 + suspicion / 8;
  buy *= 0.99 ** underground;

  let divide = 4;
  divide *= 1 - merchant / 100;
  divide *= 1 - (goblin * GOBLIN_SELL_DIVISOR_PERCENT) / 100;
  divide *= 1 + asymmetrical / 100;
  divide *= 1 + devious / 100;
  if (race["conniving"]) divide -= 1;
  if (!(divide > 0)) return undefined;
  let sell = (value * ratio) / divide;
  sell *= 1 + wharf * 0.01;
  sell *= 1 + gpsActive * 0.01;
  sell *= 1 + railway * railwaySellBoost;
  sell *= 1 - hstl / 101;
  sell *= 1 + inflation / 500;
  sell *= 1 - suspicion / 52;

  // Upstream rounds both prices to one decimal before charging them.
  const buyPrice = Number(buy.toFixed(1));
  const sellPrice = Number(sell.toFixed(1));
  return Number.isFinite(buyPrice) && Number.isFinite(sellPrice)
    ? Object.freeze({ buy: buyPrice, sell: sellPrice })
    : undefined;
}

/**
 * How much of a resource one export route moves, as `fastLoop`'s sell branch computes it: the
 * upstream ratio discounted by the Trade achievement, whose rank caps at five.
 */
export function tradeRouteSellQuantity(
  root: unknown,
  resourceId: string,
): number | undefined {
  const ratio = TRADE_ROUTE_RATIO[resourceId];
  if (ratio === undefined) return undefined;
  const level = achievementLevel(root, "trade");
  if (level === undefined) return undefined;
  const rank = Math.min(5, level);
  const quantity = ratio * (1 - rank / 100);
  return quantity > 0 ? quantity : undefined;
}
