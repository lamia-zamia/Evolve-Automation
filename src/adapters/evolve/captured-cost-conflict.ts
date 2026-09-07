/**
 * Whether spending on an action would take a resource below what an existing commitment is saving
 * for, evaluated over the captured surface.
 *
 * The decision is `src/domain/cost-conflicts.ts`; this only assembles its input — the reservations
 * in force and the holdings behind every resource either side names — so that build, research and
 * every later family ask the same question the same way rather than each growing its own copy.
 */

import type { CostConflict } from "../../domain/cost-conflicts.ts";
import { findCostConflict } from "../../domain/cost-conflicts.ts";
import type { CostConflictResource } from "../../domain/cost-conflicts.ts";
import { resourceView } from "../../domain/game-world.ts";
import type { CostReservationSource } from "../../ports/game-cost-reservations.ts";
import type { GameResourceSource } from "../../ports/game-world-state.ts";

export type CapturedCostConflict =
  | { readonly status: "none" }
  | {
      /** A commitment exists that could not be priced, so spending is not known to be safe. */
      readonly status: "unavailable";
    }
  | { readonly status: "conflict"; readonly conflict: Readonly<CostConflict> };

const NONE: CapturedCostConflict = Object.freeze({ status: "none" });
const UNAVAILABLE: CapturedCostConflict = Object.freeze({
  status: "unavailable",
});

export interface CapturedCostConflictDependencies {
  readonly resources: GameResourceSource;
  readonly reservations: CostReservationSource;
  /** Script-owned commitments not represented by the captured game root. */
  readonly additionalReservations?: CostReservationSource;
}

export interface CapturedCostConflictReader {
  evaluate(cost: Readonly<Record<string, number>>): CapturedCostConflict;
}

export function createCapturedCostConflictReader(
  dependencies: CapturedCostConflictDependencies,
): CapturedCostConflictReader {
  const { resources, reservations } = dependencies;
  const additionalReservations = dependencies.additionalReservations;

  return Object.freeze({
    evaluate(cost: Readonly<Record<string, number>>): CapturedCostConflict {
      const sample = reservations.readReservations();
      const additional = additionalReservations?.readReservations();
      if (sample.unavailable || additional?.unavailable) return UNAVAILABLE;
      const targets = [...sample.targets, ...(additional?.targets ?? [])];
      if (targets.length === 0) return NONE;

      // One holdings sample covers the action's own cost and every reserved cost, so the
      // arithmetic reads one consistent set of numbers.
      const wanted = new Set<string>(Object.keys(cost));
      for (const target of targets) {
        for (const id of Object.keys(target.cost)) wanted.add(id);
      }
      const held = resources.readResources(wanted);
      if (held === undefined) return NONE;
      const holdings: Record<string, CostConflictResource> = {};
      for (const id of wanted) {
        // The game's display names are localized strings with no captured route, so a reservation
        // reports the resource id it reserved.
        holdings[id] = Object.freeze({
          name: id,
          currentQuantity: resourceView(held, id).amount,
        });
      }
      const conflict = findCostConflict({
        actionCost: cost,
        reservedTargets: targets,
        resources: Object.freeze(holdings),
      });
      return conflict === null
        ? NONE
        : Object.freeze({ status: "conflict", conflict });
    },
  });
}
