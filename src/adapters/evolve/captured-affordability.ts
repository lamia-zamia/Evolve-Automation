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
 * `Troops`, `Structs`, `Custom`, `Bool`, `Spent_Fossil` and the prestige
 * currencies each have their own branch upstream, most of them behind a function no capture
 * reaches. Rather than guess at those, a cost naming anything the captured root does not hold as a
 * resource is reported as unjudgeable.
 */

import { finite, isRecord, readProperty } from "../validation.ts";
import type { ResourceView } from "../../domain/game-world.ts";
import { ABSENT_RESOURCE } from "../../domain/game-world.ts";

/**
 * Whether the game has split its resources into per-region supply pools — upstream `supplyMode()`
 * requires both `supplyUnlocked()` and `race.supplySplit`. Below it `poolCap` is the civilization's
 * own `max` for every resource, whatever pool is named.
 */
export function isRegionalSupply(root: unknown): boolean {
  const shadow = finite(readProperty(readProperty(root, "tech"), "shadow"));
  return (
    shadow !== undefined &&
    shadow >= 5 &&
    readProperty(readProperty(root, "race"), "supplySplit") === true
  );
}

/** The game's sentinel pool for a cost that draws on the whole civilization; research uses it. */
export const ANYWHERE_POOL = "*";

function hasRegionalLedger(resource: Record<PropertyKey, unknown>): boolean {
  return (
    isRecord(readProperty(resource, "reg")) ||
    isRecord(readProperty(resource, "regMax")) ||
    isRecord(readProperty(resource, "regDiff"))
  );
}

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
 * table nothing captures. The `reg`, `regMax`, and `regDiff` ledgers are written only for
 * partitioned resources, so their presence is the captured proof that a named pool is meaningful.
 * An empty ledger is still a known partitioned ledger for amount reads; an absent ledger falls
 * back to the civilization-wide value for resources that are not partitioned or not initialized.
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
  if (
    !regional ||
    pool === undefined ||
    pool === ANYWHERE_POOL ||
    !hasRegionalLedger(resource)
  )
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
  if (
    !regional ||
    pool === undefined ||
    pool === ANYWHERE_POOL ||
    !hasRegionalLedger(resource)
  ) {
    return finite(readProperty(resource, "amount"));
  }
  const ledger = readProperty(resource, "reg");
  if (!isRecord(ledger)) return 0;
  const amount = readProperty(ledger, pool);
  return amount === undefined ? 0 : finite(amount);
}

function capturedPoolRate(
  resource: Record<PropertyKey, unknown>,
  pool: string | undefined,
  regional: boolean,
): number | undefined {
  if (
    !regional ||
    pool === undefined ||
    pool === ANYWHERE_POOL ||
    !hasRegionalLedger(resource)
  ) {
    return finite(readProperty(resource, "diff"));
  }
  const ledger = readProperty(resource, "regDiff");
  if (!isRecord(ledger)) return 0;
  const rate = readProperty(ledger, pool);
  return rate === undefined ? 0 : finite(rate);
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
    if (key === "Supply") {
      const portal = readProperty(root, "portal");
      if (!isRecord(portal)) return undefined;
      const purifier = readProperty(portal, "purifier");
      if (!isRecord(purifier)) return false;
      const capacity = finite(readProperty(purifier, "sup_max"));
      if (capacity === undefined) return undefined;
      if (capacity < amount) return false;
      continue;
    }
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
 * The game's special `Supply` branch reads the purifier's current balance directly. Other special
 * costs remain unanswered because their upstream branches do not read an ordinary captured
 * resource record.
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
    if (key === "Supply") {
      const portal = readProperty(root, "portal");
      if (!isRecord(portal)) return undefined;
      const purifier = readProperty(portal, "purifier");
      if (!isRecord(purifier)) return false;
      const held = finite(readProperty(purifier, "supply"));
      if (held === undefined) return undefined;
      if (amount > held) return false;
      continue;
    }
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

/** Read one resource through the same pool ledger used by the game's affordability comparison. */
export function readCapturedResourceView(
  root: unknown,
  key: string,
  pool?: string,
): ResourceView {
  const resourceId = resolveCostResourceId(root, key);
  const resource =
    resourceId === undefined
      ? undefined
      : readProperty(readProperty(root, "resource"), resourceId);
  if (!isRecord(resource)) return ABSENT_RESOURCE;
  const regional = isRegionalSupply(root);
  // Resource records are created before all of their numeric fields are initialized. Keep the
  // world's lenient Number(undefined) behavior for that state; affordability itself remains
  // strict and reports an unjudgeable comparison for the same fields.
  const amount = capturedPoolAmount(resource, pool, regional) ?? Number.NaN;
  const max = capturedPoolCap(resource, pool, regional) ?? Number.NaN;
  const rateOfChange = capturedPoolRate(resource, pool, regional) ?? Number.NaN;
  return Object.freeze({
    unlocked: Boolean(readProperty(resource, "display")),
    amount,
    max,
    rateOfChange,
    storageRatio: max > 0 ? amount / max : 0,
  });
}
