/**
 * How long one script cycle is, in the game's own periods, from the script's `tickRate` setting.
 *
 * Single owner of that conversion for the captured runtime. The period gate in the captured runtime
 * uses `readPeriodsPerScriptCycle` as its threshold, and every captured feature that turns a
 * per-second game rate into a per-cycle amount — crafting, the market, the farmer food projection —
 * reads `readScriptCyclesPerSecond` here rather than restating `4 / tickRate` for itself. Those
 * three had drifted into three spellings of one rule, two of which disagreed with the gate about
 * what a cycle even is.
 *
 * DeadSpace 1.5.0 has no accelerated time: `global.settings.at` is written to zero in `vars.js` and
 * read nowhere, so the compatibility doubling for it has no live input and is deliberately absent.
 * The game's real period length does move — `loopTimers` scales the 250 ms base by the `slow` and
 * `hyper` traits and by `driftRate` — which this does not model; see the backlog entry.
 */

import { normalizeTickRate } from "../../domain/override-resolution.ts";
import { readProperty } from "../validation.ts";

/**
 * The game's unmodified worker period is 250 ms (`loopTimers` in `functions.js`), so four game
 * periods complete per second.
 */
export const PERIODS_PER_SECOND = 4;

/** Matches the `tickRate` default in `computeGeneralDefaults`, for a blob that has never set it. */
const DEFAULT_TICK_RATE = 4;

/**
 * Game periods one working cycle covers. `normalizeTickRate` is the script's own normalizer for this
 * setting and allows half steps, but the script cannot act more often than the game wakes it, so a
 * rate below one period is floored here.
 */
export function readPeriodsPerScriptCycle(settings: unknown): number {
  const configured = readProperty(settings, "tickRate");
  const rate =
    configured === undefined
      ? DEFAULT_TICK_RATE
      : normalizeTickRate(configured);
  return Number.isFinite(rate) ? Math.max(1, rate) : DEFAULT_TICK_RATE;
}

/** Working cycles per second of unmodified game time, for converting the game's per-second rates. */
export function readScriptCyclesPerSecond(settings: unknown): number {
  return PERIODS_PER_SECOND / readPeriodsPerScriptCycle(settings);
}
