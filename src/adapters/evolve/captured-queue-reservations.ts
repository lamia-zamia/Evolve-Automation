/**
 * The player's own queues — build and research — read off the captured root and priced through the
 * game's own cost code, as resource reservations.
 *
 * A queued item is an explicit commitment: the player asked for that thing next, and the game will
 * buy it as soon as it can. Spending those resources on something else does not make the queued
 * item cheaper, it just delays it. This turns that commitment into the `ReservedCostTarget` values
 * the pure cost-conflict policy already understands.
 *
 * Which entries reserve follows the game's own behaviour rather than a rule of this script's. Both
 * queue loops in `main.js` are shaped the same way:
 *
 * - a queue the game is not showing (`display` false) or has paused (`pause` true) is one it is not
 *   buying from, so it reserves nothing;
 * - with the queue's "buy any affordable" setting off (`settings.qAny`, `settings.qAny_res`) the
 *   game stops at the first entry it could buy, so only that entry is being saved for; with it on,
 *   every entry is.
 *
 * The research queue adds one condition of its own: the game skips an entry whose technology
 * requirements are not met and keeps scanning. It writes that judgement back into the entry as
 * `req` on every tick it runs the queue, which is the only captured route to it — the predicate
 * behind it, `checkTechRequirements`, is module-lexical.
 */

import type { ReservedCostTarget } from "../../domain/cost-conflicts.ts";
import type { GameActionCostReader } from "../../ports/game-action-costs.ts";
import type {
  CostReservationSample,
  CostReservationSource,
} from "../../ports/game-cost-reservations.ts";
import type { OfferedTech } from "../../ports/game-tech-catalog.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { costFitsStorage } from "./captured-affordability.ts";
import { readProperty } from "../validation.ts";

const NO_RESERVATIONS: CostReservationSample = Object.freeze({
  targets: Object.freeze([]),
  unavailable: false,
});

/** A queued structure the game is saving for. */
const QUEUE_CAUSE = "Queue";
/** A queued technology the game is saving for. */
const RESEARCH_QUEUE_CAUSE = "Research queue";

export interface CapturedQueueReservationDependencies {
  readonly rootState: GameRootStateSource;
  readonly costs: GameActionCostReader;
  /**
   * The technologies the game is offering, which is the only captured route to a technology's
   * price. Without it the research queue is not modelled at all: a caller that cannot price
   * technologies would otherwise report every cycle unavailable and buy nothing.
   *
   * It is called only when the research queue actually has an entry to reserve, so a player who
   * does not use that queue never pays for the discovery pass behind it.
   */
  readonly readOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  /** Reports a queued entry that could not be priced. The sample reports itself incomplete. */
  readonly onUnavailable?: (itemId: string, reason: string) => void;
}

interface QueuedItem {
  readonly id: string;
  readonly label: string;
  /** The game's own "requirements met" flag; always true for a build-queue entry. */
  readonly requirementsMet: boolean;
}

/** Entries of a queue the game is currently buying from, or `undefined` when it is not. */
function readQueueEntries(
  root: unknown,
  name: "queue" | "r_queue",
): readonly unknown[] | undefined {
  const queue = readProperty(root, name);
  if (!readProperty(queue, "display")) return undefined;
  if (readProperty(queue, "pause")) return undefined;
  const entries = readProperty(queue, "queue");
  return Array.isArray(entries) ? entries : undefined;
}

function readQueuedItems(root: unknown): readonly QueuedItem[] | undefined {
  const entries = readQueueEntries(root, "queue");
  if (entries === undefined) return undefined;
  const items: QueuedItem[] = [];
  for (const entry of entries) {
    const id = readProperty(entry, "id");
    if (typeof id !== "string" || id.length === 0) continue;
    const label = readProperty(entry, "label");
    items.push({
      id,
      label: typeof label === "string" ? label : id,
      requirementsMet: true,
    });
  }
  return items;
}

/**
 * Research-queue entries the game would buy from. An entry the game has written off as
 * unaffordable at any storage (`cna`) is skipped and does not stop the scan, exactly as the game's
 * loop skips it.
 */
function readQueuedResearch(root: unknown): readonly QueuedItem[] | undefined {
  // The queue exists only once its own technology does; before that the game never runs the loop.
  if (!readProperty(readProperty(root, "tech"), "r_queue")) return undefined;
  const entries = readQueueEntries(root, "r_queue");
  if (entries === undefined) return undefined;
  const items: QueuedItem[] = [];
  for (const entry of entries) {
    const id = readProperty(entry, "id");
    if (typeof id !== "string" || id.length === 0) continue;
    if (readProperty(entry, "cna") === true) continue;
    const label = readProperty(entry, "label");
    items.push({
      id,
      label: typeof label === "string" ? label : id,
      requirementsMet: readProperty(entry, "req") === true,
    });
  }
  return items;
}

/**
 * Whether storage could ever hold this cost, which is the game's own `checkMaxCosts` judgement:
 * the game refuses to save for a queued item it can never pay for (writing `cna` on the entry),
 * and reserving one anyway would stall every build that shares a resource with it.
 *
 * This is the looser of the two storage tests on purpose. A zero capacity is not read as a
 * ceiling, and a cost the comparison cannot judge at all still reserves: neither is a known
 * ceiling. Erring loose reserves an item the game would have written off, which delays a build;
 * erring tight would spend resources out from under one the game is genuinely saving for.
 */
function couldBeStored(
  root: unknown,
  cost: Readonly<Record<string, number>>,
): boolean {
  return costFitsStorage(root, cost, { zeroCapIsCeiling: false }) !== false;
}

export function createCapturedQueueReservationSource(
  dependencies: CapturedQueueReservationDependencies,
): CostReservationSource {
  const { rootState, costs } = dependencies;
  const readOfferedTechs = dependencies.readOfferedTechs;
  const reportUnavailable = dependencies.onUnavailable ?? (() => {});

  /**
   * The entries a queue is actually saving for. The game stops at the first entry it could buy
   * unless the queue's "buy any affordable" setting is on, in which case every entry is a
   * commitment it may spend on next.
   */
  function reserving(
    items: readonly QueuedItem[],
    buyAnyQueued: boolean,
  ): readonly QueuedItem[] {
    const eligible = items.filter((item) => item.requirementsMet);
    return buyAnyQueued ? eligible : eligible.slice(0, 1);
  }

  return Object.freeze({
    readReservations(): CostReservationSample {
      const root = rootState.readRoot();
      if (root === undefined) return NO_RESERVATIONS;
      const settings = readProperty(root, "settings");
      const targets: ReservedCostTarget[] = [];
      let unavailable = false;

      function reserve(
        item: QueuedItem,
        cause: string,
        cost: Readonly<Record<string, number>> | undefined,
        reason: string,
      ): void {
        if (cost === undefined) {
          // Something is being saved for and this cannot say what. Reporting no reservation would
          // let the caller spend exactly the resources it cannot see the commitment to.
          reportUnavailable(item.id, reason);
          unavailable = true;
          return;
        }
        if (!couldBeStored(root, cost)) return;
        targets.push(
          Object.freeze({
            name: item.label,
            cause,
            cost: Object.freeze({ ...cost }),
          }),
        );
      }

      for (const item of reserving(
        readQueuedItems(root) ?? [],
        Boolean(readProperty(settings, "qAny")),
      )) {
        reserve(
          item,
          QUEUE_CAUSE,
          costs.readCost(item.id),
          "queued item could not be priced",
        );
      }

      if (readOfferedTechs !== undefined) {
        const queued = reserving(
          readQueuedResearch(root) ?? [],
          Boolean(readProperty(settings, "qAny_res")),
        );
        // Only ask for the offered technologies once something is waiting on one of them: reading
        // that catalog costs a discovery pass, and an unused research queue must not buy one.
        if (queued.length > 0) {
          const offered = readOfferedTechs();
          const prices =
            offered === undefined
              ? undefined
              : new Map(offered.map((tech) => [tech.elementId, tech.cost]));
          for (const item of queued) {
            reserve(
              item,
              RESEARCH_QUEUE_CAUSE,
              prices?.get(item.id),
              prices === undefined
                ? "offered technologies could not be read"
                : "queued technology is not currently offered",
            );
          }
        }
      }

      if (targets.length === 0 && !unavailable) return NO_RESERVATIONS;
      return Object.freeze({
        targets: Object.freeze(targets),
        unavailable,
      });
    },
  });
}
