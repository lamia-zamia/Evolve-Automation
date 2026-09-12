/**
 * The game's own affordability comparisons, over captured state and an already-adjusted cost.
 *
 * `checkAffordable(c_action, max)` prices the action with `adjustCosts` and then asks one of two
 * questions: `checkMaxCosts` for "could this ever be paid for", against storage capacity, and
 * `checkCosts` for "can it be paid for now", against what is on hand. Both are reproduced here
 * against the captured root, and both take a cost map that is already adjusted — which is what the
 * build-queue probe and the drawn `data-<Resource>` attributes both produce.
 *
 * A cost map can name things that are not ordinary resources — `Morale`, `Army`, `HellArmy`,
 * `Troops`, `Structs`, `Supply`, `Custom`, `Bool`, `Spent_Fossil` and the prestige
 * currencies each have their own branch upstream, most of them behind a function no capture
 * reaches. Rather than guess at those, a cost naming anything the captured root does not hold as a
 * resource is reported as unjudgeable.
 */

import { finite, isRecord, readProperty } from "../validation.ts";

/**
 * Whether the game has split its resources into per-region supply pools. Above this technology
 * level `poolCap`/`regAmount` answer for the paying region instead of the civilization, and
 * neither the pool an action draws from nor the `atomic_mass` table that decides which resources
 * are split is captured — so every comparison here stops being exact.
 */
export function isRegionalSupply(root: unknown): boolean {
  const shadow = finite(readProperty(readProperty(root, "tech"), "shadow"));
  return shadow !== undefined && shadow >= 5;
}

/** The resource a cost key names. `Species` is the game's alias for the current race's own id. */
function costResource(root: unknown, key: string): unknown {
  const resourceId =
    key === "Species"
      ? readProperty(readProperty(root, "race"), "species")
      : key;
  if (typeof resourceId !== "string") return undefined;
  return readProperty(readProperty(root, "resource"), resourceId);
}

/**
 * Strictness of the capacity comparison. Upstream `checkMaxCosts` compares `cap >= 0`, so a
 * zero capacity is a ceiling there. The queue-reservation test passes `false`: a resource the
 * game reports with no capacity yet is not a known ceiling, and erring loose there only delays
 * a build while erring tight would spend resources out from under something the game is
 * genuinely saving for.
 */
export interface StorageFitOptions {
  readonly zeroCapIsCeiling?: boolean;
}

/**
 * The game's `checkMaxCosts` in global-pool mode: every positive cost must name a resource the
 * game is displaying, and must fit under that resource's capacity. A negative capacity is the
 * game's "no limit" and passes.
 *
 * `undefined` means the comparison cannot be made — a cost key that is not an ordinary resource,
 * or one the root has no entry for. Callers that only need a safe answer can read that as "no".
 */
export function costFitsStorage(
  root: unknown,
  cost: Readonly<Record<string, number>>,
  options?: StorageFitOptions,
): boolean | undefined {
  const zeroCapIsCeiling = options?.zeroCapIsCeiling ?? true;
  for (const [key, amount] of Object.entries(cost)) {
    if (!Number.isFinite(amount)) return undefined;
    // A zero cost is never refused, whatever the resource's state.
    if (amount === 0) continue;
    const entry = costResource(root, key);
    if (!isRecord(entry)) return undefined;
    if (amount > 0 && readProperty(entry, "display") !== true) return false;
    const capacity = finite(readProperty(entry, "max"));
    if (capacity === undefined) return undefined;
    const isCeiling = zeroCapIsCeiling ? capacity >= 0 : capacity > 0;
    if (isCeiling && amount > capacity) return false;
  }
  return true;
}
