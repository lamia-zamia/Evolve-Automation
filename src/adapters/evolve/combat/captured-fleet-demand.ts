/**
 * The current True Path ship cost, as fleet resource and storage demand.
 *
 * The demand is the yard's next ship, priced by the yard: `captured-outer-fleet-costs` reads the same
 * `#shipYardCosts` row the outer fleet reads, so the figures below are `shipCosts()`'s own answer and
 * not a copy of it. That holds wherever the price came from — a yard the player visited, preload mode
 * owning the real panel, or an off-tab price the game produced for this call — which is what lets the
 * save demand a ship cost without ever opening the shipyard.
 *
 * **The pool is carried, not recomputed.** `updateCosts()` writes the paying pool as `data-pool`
 * because the cost is drawn from one supply zone rather than from the combined totals, and every
 * storage and resource question this demand feeds is scoped by it. Reproducing that here would mean a
 * second `supplyPool()`, so the game's own answer travels with each cost instead.
 *
 * The capacity verdicts stay this module's own policy — `nextShipAffordable` asks whether each cost
 * fits the yard's current storage and `nextShipExpandable` whether an over-capacity resource can gain
 * storage — because those are questions about where the yard's resources can go, not about what the
 * ship costs.
 *
 * **The yard is touched only when the fleet demand is real.** `shipPlans` is captured on the player's
 * first visit, so a save that never opened the Civic tab could otherwise never ask what its next ship
 * costs; synthesizing a draw costs the player's Civic panel a moment, so that pass runs under the same
 * settings the prioritizer reads: Auto Fleet on, and outer-fleet priority not set to ignore. A save
 * with the fleet automation off never pays for a price it will not use.
 *
 * The gate is read first, before the yard is asked anything, because the settings decide whether this
 * demand exists at all. A yard that was captured earlier and has since gone off-tab answers `current()`
 * from the scratch probe — `shipPlans.setVal` per call, to be thrown away — so a mere price check
 * would be the expensive work all by itself, on a save whose fleet demand nothing keeps.
 */

import type { DemandFleet } from "../../../domain/economy/resources/demand-prioritization.ts";
import type { GameShipyardCosts } from "../../../ports/game-shipyard-costs.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type { CapturedOuterFleetShipyard } from "./captured-outer-fleet-shipyard.ts";
import { isRecord, readProperty } from "../../validation.ts";

export interface CapturedFleetDemandDependencies {
  readonly rootState: GameRootStateSource;
  /** The yard's own cost row, which is the only price this demand may quote. */
  readonly costs: GameShipyardCosts;
  /** The yard's controls, so a save that never rendered the shipyard can still be priced. */
  readonly shipyard: CapturedOuterFleetShipyard;
  readonly readSettings: () => unknown;
}

export interface CapturedFleetDemand {
  /** Returns undefined until the shipyard can price the design the yard is holding. */
  read(): CapturedFleetDemandSample | undefined;
}

export interface CapturedFleetDemandSample extends DemandFleet {
  /** Whether every cost fits now or each over-capacity resource can gain storage. */
  readonly nextShipExpandable: boolean;
}

/**
 * Whether the settings say the fleet's next ship is wanted at all, which is the same pair of gates
 * the prioritizer applies before it keeps a fleet cost. A demand with either off is not a demand for
 * a ship, so it is not a reason to touch the yard: not to draw it, and not to price it.
 */
function fleetDemandWanted(settingsValue: unknown): boolean {
  if (!isRecord(settingsValue)) return false;
  if (settingsValue["autoFleet"] !== true) return false;
  const priority = settingsValue["prioritizeOuterFleet"];
  return typeof priority === "string" && priority !== "ignore";
}

function readShipCapacityState(
  root: unknown,
  costs: readonly Readonly<{ resourceId: string; amount: number }>[],
): Readonly<{ affordable: boolean; expandable: boolean }> {
  const resources = readProperty(root, "resource");
  if (!isRecord(resources)) {
    return Object.freeze({ affordable: false, expandable: false });
  }
  let affordable = true;
  let expandable = true;
  for (const { resourceId, amount } of costs) {
    const resource = readProperty(resources, resourceId);
    const maximum = readProperty(resource, "max");
    if (typeof maximum !== "number" || !Number.isFinite(maximum)) {
      affordable = false;
      expandable = false;
      continue;
    }
    if (maximum >= amount) continue;
    affordable = false;
    // DeadSpace preserves Resource.hasStorage() as the `stackable` bit. If it is not initialized
    // or true, an over-capacity ship cost cannot be made payable with a crate/container expansion.
    if (readProperty(resource, "stackable") !== true) expandable = false;
  }
  return Object.freeze({ affordable, expandable });
}

export function createCapturedFleetDemand(
  dependencies: CapturedFleetDemandDependencies,
): CapturedFleetDemand {
  return Object.freeze({
    read(): CapturedFleetDemandSample | undefined {
      const root = dependencies.rootState.readRoot();
      const tech = readProperty(root, "tech");
      const race = readProperty(root, "race");
      const shipyard = readProperty(readProperty(root, "space"), "shipyard");
      const blueprint = readProperty(shipyard, "blueprint");
      if (
        !isRecord(tech) ||
        !isRecord(race) ||
        !isRecord(shipyard) ||
        !isRecord(blueprint) ||
        !(typeof tech["syndicate"] === "number" && tech["syndicate"] > 0) ||
        race["truepath"] !== true
      ) {
        return undefined;
      }
      const settings = dependencies.readSettings();
      if (!fleetDemandWanted(settings)) return undefined;
      if (!dependencies.shipyard.established(dependencies.shipyard.control())) {
        dependencies.shipyard.establish();
      }
      const sample = dependencies.costs.current();
      if (sample === undefined || sample.amounts.length === 0) return undefined;
      const cost = sample.amounts;
      const capacity = readShipCapacityState(root, cost);
      return Object.freeze({
        nextShipAffordable: capacity.affordable,
        nextShipExpandable: capacity.expandable,
        nextShipCost: Object.freeze(
          cost.map((entry) =>
            Object.freeze({
              resourceId: entry.resourceId,
              amount: entry.amount,
              ...(sample.pool === undefined ? {} : { pool: sample.pool }),
            }),
          ),
        ),
      });
    },
  });
}
