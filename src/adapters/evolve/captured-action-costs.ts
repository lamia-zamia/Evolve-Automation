/**
 * Prices any catalog action through the game's own cost code, with no panel rendered and no
 * Debug Mode.
 *
 * The build queue's `setData(index, prefix)` method resolves the id of a queued item against the
 * game's private `actions` catalog and runs its private `adjustCosts` on the entry, returning
 * `{ "<prefix>-<Resource>": amount }`. It is captured like any other control method, and the game
 * binds `#buildQueue` unconditionally during startup, so it is available from the first tick
 * whether or not the queue tech is unlocked.
 *
 * Driving it means putting an item in the queue, which is player-visible state. The probe entry is
 * therefore appended and removed inside one synchronous step: nothing the game runs can interleave
 * — its loops all arrive on worker messages — and Vue's own scheduler flushes on a microtask, by
 * which time the entry is gone again.
 */

import type {
  GameActionCostReader,
  GameActionPrice,
} from "../../ports/game-action-costs.ts";
import type { GameControlRegistry } from "../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { isRecord, readProperty, splitActionId } from "../validation.ts";

const QUEUE_ELEMENT_ID = "buildQueue";
/**
 * `data`, not the `res` this used to pass, because the game adds the paying supply pool to the
 * result for exactly that prefix: `if (prefix === 'data'){ ... final_costs['data-pool'] = pool }`.
 * The prefix changes nothing else about what `setData` computes — it only names the keys — so the
 * pool comes free in the one invocation the probe already makes.
 */
const COST_PREFIX = "data";
/** The game's own key for the paying pool inside that result, alongside the `data-<Resource>` prices. */
const POOL_KEY = "data-pool";

export interface CapturedActionCostsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  /** Reports a probe that could not run. Costs are simply unavailable for that call. */
  readonly onUnavailable?: (actionId: string, reason: string) => void;
}

function readQueueArray(rootState: GameRootStateSource): unknown[] | undefined {
  const queue = readProperty(rootState.readRoot(), "queue");
  const entries = readProperty(queue, "queue");
  return Array.isArray(entries) ? entries : undefined;
}

/** `city-basic_housing` is queued as id `city-basic_housing`, type `basic_housing`. */
function probeEntry(actionId: string): Record<string, unknown> {
  // No dash names no region: the whole id stands in for both halves, exactly as before, so the
  // probe fails the same way at the game's own lookup. A leading dash keeps the whole id too —
  // the old split read an empty action there, and both end at "cost unavailable".
  const parts = splitActionId(actionId);
  const type = parts?.id ?? actionId;
  const action = parts?.region ?? actionId;
  return {
    id: actionId,
    action,
    type,
    label: actionId,
    cna: false,
    time: 0,
    t_max: 0,
    q: 1,
    qs: 1,
    bres: false,
  };
}

function parsePrice(value: unknown): GameActionPrice | undefined {
  if (!isRecord(value)) return undefined;
  const costs: Record<string, number> = {};
  for (const key of Object.keys(value)) {
    if (key === POOL_KEY) continue;
    const amount = value[key];
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
    const name = key.startsWith(`${COST_PREFIX}-`)
      ? key.slice(COST_PREFIX.length + 1)
      : key;
    if (name.length > 0) costs[name] = amount;
  }
  // `actionPool` answers `false` in global mode and for an action with no place of its own, and the
  // game then omits the key entirely; anything but a name is no pool.
  const pool = value[POOL_KEY];
  return Object.freeze({
    cost: Object.freeze(costs),
    pool: typeof pool === "string" && pool.length > 0 ? pool : undefined,
  });
}

export function createCapturedActionCostReader(
  dependencies: CapturedActionCostsDependencies,
): GameActionCostReader {
  const { rootState, controls } = dependencies;
  const reportUnavailable = dependencies.onUnavailable ?? (() => {});

  return Object.freeze({
    readCost(actionId: string): GameActionPrice | undefined {
      const handle = controls.resolve(QUEUE_ELEMENT_ID);
      if (handle === undefined) {
        reportUnavailable(actionId, "build queue control not captured");
        return undefined;
      }
      const entries = readQueueArray(rootState);
      if (entries === undefined) {
        reportUnavailable(actionId, "game queue unavailable");
        return undefined;
      }
      const index = entries.length;
      entries.push(probeEntry(actionId));
      let result;
      try {
        result = controls.invoke(handle, "setData", [index, COST_PREFIX]);
      } finally {
        // Remove by identity rather than by index: a defensive splice of the wrong slot would
        // delete a player's queued item.
        if (entries.length > index)
          entries.splice(index, entries.length - index);
      }
      if (!result.ok) {
        reportUnavailable(actionId, `${result.reason}: ${result.detail ?? ""}`);
        return undefined;
      }
      const price = parsePrice(result.value);
      if (price === undefined) {
        reportUnavailable(actionId, "cost result was not a record");
        return undefined;
      }
      return price;
    },
  });
}
