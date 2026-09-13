/**
 * The game's morale figures, read from the one place upstream keeps them.
 *
 * There is no `resource.Morale`: upstream's `loadResource` never defines one, and "Morale" appears
 * in the game only as a non-resource cost key. The live figures are written by `main.js` into
 * `global.city.morale` — `current`, `cap` and `potential` — and `vars.js` creates that record with
 * every key present before any save is applied. Every captured reader of morale comes through here,
 * so an upstream rename is one edit rather than a grep.
 */

import { finite, isRecord, readProperty } from "../../validation.ts";

export interface CapturedMorale {
  /** `global.city.morale.current` — the legacy `Morale.currentQuantity`. */
  readonly current: number;
  /** `global.city.morale.cap` — the legacy `Morale.maxQuantity`. */
  readonly maximum: number;
  /** `global.city.morale.potential` — the legacy `Morale.rateOfChange`. */
  readonly potential: number;
}

export function readCapturedMorale(
  root: unknown,
): Readonly<CapturedMorale> | undefined {
  const morale = readProperty(readProperty(root, "city"), "morale");
  if (!isRecord(morale)) return undefined;
  const current = finite(readProperty(morale, "current"));
  const maximum = finite(readProperty(morale, "cap"));
  const potential = finite(readProperty(morale, "potential"));
  if (current === undefined || maximum === undefined || potential === undefined)
    return undefined;
  return Object.freeze({ current, maximum, potential });
}
