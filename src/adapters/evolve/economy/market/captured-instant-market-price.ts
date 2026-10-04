import { finite, isRecord, readProperty } from "../../../validation.ts";

/**
 * Policy sizing estimate mirroring the pinned resources.js marketItem purchase()/sell() pricing.
 * Their buy()/sell_f() presentation methods differ from the mutation formulas. Native methods
 * own each trade, and the Market executor checks their observable postconditions.
 */
const TRAIT_VALUES: Readonly<{
  readonly arrogant: readonly number[];
  readonly merchant: readonly number[];
  readonly connivingBuy: readonly number[];
  readonly connivingSell: readonly number[];
  readonly asymmetrical: readonly number[];
}> = Object.freeze({
  arrogant: Object.freeze([16, 14, 12, 10, 8, 6, 5]),
  merchant: Object.freeze([5, 10, 15, 25, 35, 40, 45]),
  connivingBuy: Object.freeze([1, 2, 3, 5, 8, 10, 12]),
  connivingSell: Object.freeze([6, 8, 10, 15, 20, 24, 28]),
  asymmetrical: Object.freeze([35, 30, 25, 20, 15, 10, 5]),
});

const TRAIT_RANKS: readonly number[] = Object.freeze([
  0.1, 0.25, 0.5, 1, 2, 3, 4,
]);

function readMultiplier(
  race: Record<PropertyKey, unknown>,
  trait: string,
  values: readonly number[],
  increase: boolean,
): number | undefined {
  if (!race[trait]) return 1;
  // DeadSpace's traitRank can remap every market trait when Empowered is active. The captured
  // root does not expose empowered.vars(), so refusing this one case is safer than pricing a
  // trade with a rank that differs from the game's closure.
  if (race["empowered"]) return undefined;
  const rank = finite(race[trait]);
  if (rank === undefined) return undefined;
  const index = TRAIT_RANKS.indexOf(rank);
  const value = index >= 0 ? values[index] : undefined;
  return value === undefined
    ? undefined
    : 1 + (increase ? value : -value) / 100;
}

function readFathom(
  root: unknown,
  race: Record<PropertyKey, unknown>,
  target: string,
): number | undefined {
  if (!race["unfathomable"]) return 0;
  const city = readProperty(root, "city");
  const dwellers = readProperty(city, "surfaceDwellers");
  if (!Array.isArray(dwellers) || !dwellers.includes(target)) return 0;
  const housing = readProperty(city, "captive_housing");
  const civic = readProperty(root, "civic");
  const torturer = readProperty(civic, "torturer");
  const workers = finite(readProperty(torturer, "workers"));
  const index = dwellers.indexOf(target);
  const active = finite(readProperty(housing, `race${index}`));
  if (workers === undefined || active === undefined) return undefined;
  let adjusted = Math.min(active, 100);
  if (adjusted > workers) {
    adjusted -= Math.ceil((adjusted - workers) / 3);
  }
  const nightmare = readProperty(readProperty(root, "stats"), "achieve");
  const mg = finite(readProperty(readProperty(nightmare, "nightmare"), "mg"));
  return (adjusted / 100) * ((mg ?? 0) / 5);
}

export function readUnitPrices(
  root: unknown,
  resource: Record<PropertyKey, unknown>,
): { readonly buy: number; readonly sell: number } | undefined {
  const value = finite(resource["value"]);
  const race = readProperty(root, "race");
  if (value === undefined || value <= 0 || !isRecord(race)) return undefined;

  const arrogant = readMultiplier(
    race,
    "arrogant",
    TRAIT_VALUES.arrogant,
    true,
  );
  const connivingBuy = readMultiplier(
    race,
    "conniving",
    TRAIT_VALUES.connivingBuy,
    false,
  );
  const merchant = readMultiplier(
    race,
    "merchant",
    TRAIT_VALUES.merchant,
    false,
  );
  const asymmetrical = readMultiplier(
    race,
    "asymmetrical",
    TRAIT_VALUES.asymmetrical,
    true,
  );
  const connivingSell = readMultiplier(
    race,
    "conniving",
    TRAIT_VALUES.connivingSell,
    false,
  );
  const impFathom = readFathom(root, race, "imp");
  const goblinFathom = readFathom(root, race, "goblin");
  if (
    arrogant === undefined ||
    connivingBuy === undefined ||
    merchant === undefined ||
    asymmetrical === undefined ||
    connivingSell === undefined ||
    impFathom === undefined ||
    goblinFathom === undefined
  ) {
    return undefined;
  }

  const buy = value * arrogant * connivingBuy * (1 - (impFathom * 5) / 100);
  const sellDivide =
    4 *
    merchant *
    (1 - (goblinFathom * 25) / 100) *
    asymmetrical *
    connivingSell *
    (1 - (impFathom * 15) / 100);
  const sell = value / sellDivide;
  return Number.isFinite(buy) && Number.isFinite(sell) && sellDivide > 0
    ? Object.freeze({ buy, sell })
    : undefined;
}
