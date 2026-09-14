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
 * Whether the game has split its resources into per-region supply pools — upstream `supplyMode()`,
 * which is `'regional'` at exactly this technology level. Below it `poolCap` is the civilization's
 * own `max` for every resource, whatever pool is named.
 */
export function isRegionalSupply(root: unknown): boolean {
  const shadow = finite(readProperty(readProperty(root, "tech"), "shadow"));
  return shadow !== undefined && shadow >= 5;
}

/** The game's sentinel pool for a cost that draws on the whole civilization; research uses it. */
const ANYWHERE_POOL = "*";

/**
 * The resource id a cost key names. `Species` is the game's own alias for the current race's
 * population resource — `res === 'Species' ? global.race.species : res`, which upstream repeats at
 * every point it charges a cost. Nothing else is aliased.
 *
 * This is the single owner of that rule. The build queue's `setData` hands the alias back
 * unresolved, and the drawn action rows carry it unresolved too, so every reader that turns a cost
 * key into holdings has to resolve it or report a `Species`-priced action as costing an absent
 * resource.
 */
export function resolveCostResourceId(
  root: unknown,
  key: string,
): string | undefined {
  if (key !== "Species") return key;
  const species = readProperty(readProperty(root, "race"), "species");
  return typeof species === "string" ? species : undefined;
}

/** The resource record a cost key names, through the alias above. */
function costResource(root: unknown, key: string): unknown {
  const resourceId = resolveCostResourceId(root, key);
  if (resourceId === undefined) return undefined;
  return readProperty(readProperty(root, "resource"), resourceId);
}

/**
 * The game's `poolCap(res, pool)`: the ceiling the named pool can hold, or the civilization's own
 * when the resource is not split between pools. `-1` (any negative) is the game's "no limit".
 *
 * Upstream reads `atomic_mass[res]` to decide whether a resource is partitioned, a module-level
 * table nothing captures. The `regMax` ledger stands in for it: its only writer is `setRegCaps`,
 * called from the storage pass under exactly `regional && atomic_mass[res]`, so a ledger with any
 * entry in it is upstream's own `capsKnown` and proves the resource is split. An empty ledger is
 * ambiguous — a resource that is not split, or one whose first storage pass since `shadow` reached
 * 5 has not run — and is answered with the civilization's `max`. That is exact in the first case
 * and, in the second, the same optimistic answer this comparison gave before pools existed, which
 * upstream resolves within one storage pass. It is never looser than upstream's own transient `-1`.
 */
function capturedPoolCap(
  resource: Record<PropertyKey, unknown>,
  pool: string | undefined,
  regional: boolean,
): number | undefined {
  const capacity = finite(readProperty(resource, "max"));
  if (capacity === undefined) return undefined;
  // `poolCap` falls straight through to `max` with no pool named, and `regMax` answers the
  // civilization total for the ANYWHERE sentinel and for an uncapped resource.
  if (!regional || pool === undefined || pool === ANYWHERE_POOL)
    return capacity;
  if (capacity < 0) return capacity;
  const ledger = readProperty(resource, "regMax");
  if (!isRecord(ledger)) return capacity;
  const entries = Object.keys(ledger);
  if (entries.length === 0) return capacity;
  // `regMax` reads a pool the ledger does not name as holding nothing at all.
  const share = finite(readProperty(ledger, pool));
  return share ?? 0;
}

/** The game's `regAmount(res, pool)`, without creating a ledger on a read-only capture. */
function capturedPoolAmount(
  resource: Record<PropertyKey, unknown>,
  pool: string | undefined,
  regional: boolean,
): number | undefined {
  if (!regional || pool === undefined || pool === ANYWHERE_POOL) {
    return finite(readProperty(resource, "amount"));
  }
  const ledger = readProperty(resource, "reg");
  if (!isRecord(ledger)) return 0;
  const amount = readProperty(ledger, pool);
  return amount === undefined ? 0 : finite(amount);
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
  /**
   * The pool the action pays from, as the game's own cost probe reported it. Supplying it is what
   * makes the comparison exact once the game has split its resources; without it the comparison is
   * civilization-wide, which is right below `tech.shadow >= 5` and optimistic above it.
   */
  readonly pool?: string | undefined;
}

/**
 * The game's `checkMaxCosts`: every positive cost must name a resource the game is displaying, and
 * must fit under the capacity of the pool that would pay for it. A negative capacity is the game's
 * "no limit" and passes.
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
  const regional = isRegionalSupply(root);
  for (const [key, amount] of Object.entries(cost)) {
    if (!Number.isFinite(amount)) return undefined;
    // A zero cost is never refused, whatever the resource's state.
    if (amount === 0) continue;
    const entry = costResource(root, key);
    if (!isRecord(entry)) return undefined;
    if (amount > 0 && readProperty(entry, "display") !== true) return false;
    const capacity = capturedPoolCap(entry, options?.pool, regional);
    if (capacity === undefined) return undefined;
    const isCeiling = zeroCapIsCeiling ? capacity >= 0 : capacity > 0;
    if (isCeiling && amount > capacity) return false;
  }
  return true;
}

/**
 * The game's `checkCosts`: every positive cost must be on hand in its paying pool and still fit
 * under that pool's capacity. Unlike `checkMaxCosts`, this branch does not consult `display`.
 * Special costs remain unanswered because their upstream
 * branches do not read an ordinary captured resource record.
 */
export function costFitsNow(
  root: unknown,
  cost: Readonly<Record<string, number>>,
  options?: StorageFitOptions,
): boolean | undefined {
  const regional = isRegionalSupply(root);
  for (const [key, amount] of Object.entries(cost)) {
    if (!Number.isFinite(amount)) return undefined;
    if (amount === 0) continue;
    const entry = costResource(root, key);
    if (!isRecord(entry)) return undefined;
    const held = capturedPoolAmount(entry, options?.pool, regional);
    if (held === undefined) return undefined;
    if (amount > held) return false;
    const capacity = capturedPoolCap(entry, options?.pool, regional);
    if (capacity === undefined) return undefined;
    if (capacity >= 0 && amount > capacity) return false;
  }
  return true;
}
