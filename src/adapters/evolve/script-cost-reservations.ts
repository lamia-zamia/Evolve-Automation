/**
 * Script-owned commitments that do not exist in the upstream game root.
 *
 * Priority-target planning writes these reservations after it samples the game and the script's
 * settings. The captured construction cycle consumes them through the narrow reservation port;
 * it does not receive the mutable state bag or re-run the planner. Queue commitments stay in the
 * captured queue source, so this adapter deliberately omits both queue causes.
 */

import type {
  CostReservationSample,
  CostReservationSource,
} from "../../ports/game-cost-reservations.ts";
import { isFiniteNumber, isRecord } from "../validation.ts";

const NO_RESERVATIONS: CostReservationSample = Object.freeze({
  targets: Object.freeze([]),
  unavailable: false,
});
const UNAVAILABLE: CostReservationSample = Object.freeze({
  targets: Object.freeze([]),
  unavailable: true,
});

const QUEUE_CAUSES = new Set(["Queue", "Research queue"]);

export interface ScriptCostReservationDependencies {
  readonly getState: () => unknown;
}

function readCost(
  value: unknown,
): Readonly<Record<string, number>> | undefined {
  if (!isRecord(value)) return undefined;
  const cost: Record<string, number> = {};
  for (const [resourceId, rawAmount] of Object.entries(value)) {
    if (!isFiniteNumber(rawAmount) || rawAmount <= 0) return undefined;
    cost[resourceId] = rawAmount;
  }
  return Object.freeze(cost);
}

/** Reads non-queue reservations already produced by the script's priority-target pass. */
export function createScriptCostReservationSource(
  dependencies: ScriptCostReservationDependencies,
): CostReservationSource {
  return Object.freeze({
    readReservations(): CostReservationSample {
      const state = dependencies.getState();
      if (!isRecord(state) || !Array.isArray(state["conflictTargets"])) {
        return UNAVAILABLE;
      }

      const targets = [];
      for (const rawTarget of state["conflictTargets"]) {
        if (!isRecord(rawTarget)) {
          return UNAVAILABLE;
        }
        const name = rawTarget["name"];
        const cause = rawTarget["cause"];
        if (typeof name !== "string" || typeof cause !== "string") {
          return UNAVAILABLE;
        }
        if (QUEUE_CAUSES.has(cause)) {
          // The planner records this sentinel when the queue could not be priced. The captured
          // queue source owns normal queue targets, but this failure must still stop spending.
          if (name === "Queue data unavailable") return UNAVAILABLE;
          continue;
        }
        const cost = readCost(rawTarget["cost"]);
        if (cost === undefined) {
          return UNAVAILABLE;
        }
        targets.push(Object.freeze({ name, cause, cost }));
      }

      return targets.length === 0
        ? NO_RESERVATIONS
        : Object.freeze({
            targets: Object.freeze(targets),
            unavailable: false,
          });
    },
  });
}
