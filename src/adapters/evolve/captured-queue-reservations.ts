/**
 * The player's own build queue, read off the captured root and priced through the game's own cost
 * code, as resource reservations.
 *
 * A queued structure is an explicit commitment: the player asked for that thing next, and the game
 * will buy it as soon as it can. Spending those resources on something else does not make the
 * queued item cheaper, it just delays it. This turns that commitment into the `ReservedCostTarget`
 * values the pure cost-conflict policy already understands.
 *
 * Which entries reserve follows the game's own behaviour rather than a rule of this script's:
 * with `settings.qAny` off the game works strictly down the queue, so only the head entry is being
 * saved for; with it on the game buys whichever queued item it can afford next, so every entry is.
 * A hidden queue (`queue.display` false) reserves nothing, because the game is not buying from it.
 */

import type { ReservedCostTarget } from "../../domain/cost-conflicts.ts";
import type { GameActionCostReader } from "../../ports/game-action-costs.ts";
import type {
  CostReservationSample,
  CostReservationSource,
} from "../../ports/game-cost-reservations.ts";
import type { GameResourceSource } from "../../ports/game-world-state.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { readProperty } from "../validation.ts";

const NO_RESERVATIONS: CostReservationSample = Object.freeze({
  targets: Object.freeze([]),
  unavailable: false,
});

/** Every reservation this source produces is a queued structure. */
const QUEUE_CAUSE = "Queue";

export interface CapturedQueueReservationDependencies {
  readonly rootState: GameRootStateSource;
  readonly resources: GameResourceSource;
  readonly costs: GameActionCostReader;
  /** Reports a queued entry that could not be priced. The sample reports itself incomplete. */
  readonly onUnavailable?: (itemId: string, reason: string) => void;
}

interface QueuedItem {
  readonly id: string;
  readonly label: string;
}

function readQueuedItems(root: unknown): readonly QueuedItem[] | undefined {
  const queue = readProperty(root, "queue");
  // The game stops buying from a queue it is not showing, so it reserves nothing either.
  if (!readProperty(queue, "display")) return undefined;
  const entries = readProperty(queue, "queue");
  if (!Array.isArray(entries)) return undefined;
  const items: QueuedItem[] = [];
  for (const entry of entries) {
    const id = readProperty(entry, "id");
    if (typeof id !== "string" || id.length === 0) continue;
    const label = readProperty(entry, "label");
    items.push({ id, label: typeof label === "string" ? label : id });
  }
  return items;
}

/**
 * Whether storage could ever hold this cost. The game refuses to save for a queued item it can
 * never pay for, and reserving one anyway would stall every build that shares a resource with it.
 * An uncapped resource (`max` below zero) and one the game has not created yet both pass: neither
 * is a known ceiling.
 *
 * Regional supply pools can cap a payment below the civilisation-wide `max`, so this is the looser
 * of the two tests. Erring loose reserves an item the game would have written off, which delays a
 * build; erring tight would spend resources out from under one the game is genuinely saving for.
 */
function couldBeStored(
  resources: GameResourceSource,
  cost: Readonly<Record<string, number>>,
): boolean {
  const sample = resources.readResources(Object.keys(cost));
  if (sample === undefined) return false;
  for (const [id, amount] of Object.entries(cost)) {
    if (amount <= 0) continue;
    const view = sample.resources.get(id);
    if (view === undefined) continue;
    if (view.max > 0 && view.max < amount) return false;
  }
  return true;
}

export function createCapturedQueueReservationSource(
  dependencies: CapturedQueueReservationDependencies,
): CostReservationSource {
  const { rootState, resources, costs } = dependencies;
  const reportUnavailable = dependencies.onUnavailable ?? (() => {});

  return Object.freeze({
    readReservations(): CostReservationSample {
      const root = rootState.readRoot();
      if (root === undefined) return NO_RESERVATIONS;
      const items = readQueuedItems(root);
      if (items === undefined || items.length === 0) return NO_RESERVATIONS;
      const buyAnyQueued = Boolean(
        readProperty(readProperty(root, "settings"), "qAny"),
      );
      const considered = buyAnyQueued ? items : items.slice(0, 1);

      const targets: ReservedCostTarget[] = [];
      let unavailable = false;
      for (const item of considered) {
        const cost = costs.readCost(item.id);
        if (cost === undefined) {
          // Something is being saved for and this cannot say what. Reporting no reservation would
          // let the caller spend exactly the resources it cannot see the commitment to.
          reportUnavailable(item.id, "queued item could not be priced");
          unavailable = true;
          continue;
        }
        if (!couldBeStored(resources, cost)) continue;
        targets.push(
          Object.freeze({
            name: item.label,
            cause: QUEUE_CAUSE,
            cost: Object.freeze({ ...cost }),
          }),
        );
      }
      return Object.freeze({
        targets: Object.freeze(targets),
        unavailable,
      });
    },
  });
}
