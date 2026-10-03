/**
 * A pinned compatibility transcription of DeadSpace's `ships.js:shipCrewSize(ship)`.
 *
 * **This is not captured mechanics authority, and the reason is reachability rather than principle.**
 * The shipped game bundles every module into one esbuild IIFE, so it has no runtime module graph and
 * `shipCrewSize` cannot be imported, observed, or asked for — and unlike Syndicate it has no read-only
 * display anywhere in the game, because its five call sites only move `global.civic.garrison.crew`.
 * Syndicate is read from the running game itself, through the `#<region>synd` binding
 * `src/space.js` draws behind `syndicateActive()`; see
 * `src/adapters/evolve/captured-syndicate-mechanics.ts`. There is no equivalent surface for crew, so
 * a transcription is the only way to answer "how many crew does this hull need", and this file is the
 * last of the Truepath mechanics that needed one.
 *
 * What makes the transcription safe rather than merely duplicated:
 *
 * - it is derived from the pinned upstream source, and
 *   `scripts/captured-ship-crew-compat-test.mjs` characterizes the selected hull requirements,
 *   truthiness and job scaling using repository-owned inputs;
 * - it holds no combat, sensor or piracy arithmetic — one table and the game's own job scaling.
 *
 * Nothing else may grow here.
 */

import { readCapturedJobStackMultiplier } from "../civic/captured-job-catalog.ts";
import { readProperty } from "../../validation.ts";

/**
 * One hull's crew requirement, as `shipCrewSize` switches on it: `crew` under an ordinary race and
 * `grenadier` under Grenadier. Upstream has no Grenadier branch for the two light hulls, so their two
 * entries are equal rather than absent.
 *
 * `corsair` is here because upstream gives it the Destroyer's requirement, and a hull this table has
 * never heard of is a hull it must refuse rather than crew at zero.
 */
interface CapturedShipCrew {
  readonly crew: number;
  readonly grenadier: number;
}

const CAPTURED_SHIP_CREW: Readonly<Record<string, CapturedShipCrew>> =
  Object.freeze({
    corvette: Object.freeze({ crew: 2, grenadier: 1 }),
    frigate: Object.freeze({ crew: 3, grenadier: 2 }),
    destroyer: Object.freeze({ crew: 4, grenadier: 3 }),
    corsair: Object.freeze({ crew: 4, grenadier: 3 }),
    cruiser: Object.freeze({ crew: 6, grenadier: 4 }),
    battlecruiser: Object.freeze({ crew: 8, grenadier: 5 }),
    dreadnought: Object.freeze({ crew: 10, grenadier: 6 }),
    explorer: Object.freeze({ crew: 10, grenadier: 6 }),
    freighter: Object.freeze({ crew: 1, grenadier: 1 }),
    supply_ship: Object.freeze({ crew: 1, grenadier: 1 }),
  });

/**
 * How many crew this hull's design costs the player's garrison, or `undefined` when the answer is
 * not available.
 *
 * `jobStack` is the game's own high-population scaling, read from the live root rather than
 * transcribed: `jobStack(num)` is `Math.round(jobScale(num))` and `jobScale` is the race's
 * `high_pop` trait variable, which `readCapturedJobStackMultiplier` already resolves for every job
 * this script schedules.
 *
 * `grenadier` is read for truth, not compared to `true`: upstream writes
 * `global.race['grenadier'] ? … : …`, so any truthy value takes the reduced requirement and the
 * race field is not guaranteed to be a boolean.
 *
 * An unknown hull and an unreadable job scale are both `undefined` rather than an exception, because
 * this is asked from ordinary planning and a hull upstream has since added must not stop the tick.
 */
export function capturedShipCrewSize(
  root: unknown,
  shipClass: string,
): number | undefined {
  const entry = CAPTURED_SHIP_CREW[shipClass];
  if (entry === undefined) return undefined;
  const crew = readProperty(readProperty(root, "race"), "grenadier")
    ? entry.grenadier
    : entry.crew;
  const jobStack = readCapturedJobStackMultiplier(root);
  if (jobStack === undefined) return undefined;
  const total = Math.round(crew * jobStack);
  return total > 0 ? total : undefined;
}
