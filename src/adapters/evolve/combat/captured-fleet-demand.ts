/** Reads the current True Path shipyard cost surface for resource demand. */

import type { DemandFleet } from "../../../domain/economy/resources/demand-prioritization.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../validation.ts";

interface FleetCostElement {
  readonly attributes?: ArrayLike<{
    readonly name: string;
    readonly value: string;
  }>;
  querySelectorAll?(selector: string): ArrayLike<FleetCostElement>;
}

interface FleetCostDocument {
  querySelector(selector: string): FleetCostElement | null;
}

export interface CapturedFleetDemandDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
}

export interface CapturedFleetDemand {
  /** Returns undefined until the game has rendered and captured the shipyard. */
  read(): CapturedFleetDemandSample | undefined;
}

export interface CapturedFleetDemandSample extends DemandFleet {
  /** Whether every cost fits now or each over-capacity resource can gain storage. */
  readonly nextShipExpandable: boolean;
}

function fleetDocument(value: unknown): FleetCostDocument | undefined {
  return isRecord(value) && typeof value["querySelector"] === "function"
    ? (value as unknown as FleetCostDocument)
    : undefined;
}

function readCost(
  element: FleetCostElement,
): Readonly<Record<string, number>> | undefined {
  const names = new Set<string>();
  const amounts = new Map<string, string>();
  const collect = (candidate: FleetCostElement): void => {
    for (const attribute of Array.from(candidate.attributes ?? [])) {
      if (attribute.name === "class") {
        for (const token of attribute.value.split(/\s+/)) {
          if (token.startsWith("res-") && token.length > 4) {
            names.add(token.slice(4));
          }
        }
      } else if (attribute.name.startsWith("data-")) {
        amounts.set(attribute.name.slice(5), attribute.value);
      }
    }
  };
  collect(element);
  for (const descendant of Array.from(element.querySelectorAll?.("*") ?? [])) {
    collect(descendant);
  }
  const cost: Record<string, number> = {};
  for (const name of names) {
    const rawAmount = amounts.get(name.toLowerCase());
    if (rawAmount === undefined) return undefined;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return undefined;
    cost[name] = amount;
  }
  return Object.freeze(cost);
}

function readShipCapacityState(
  root: unknown,
  cost: Readonly<Record<string, number>>,
): Readonly<{ affordable: boolean; expandable: boolean }> {
  const resources = readProperty(root, "resource");
  if (!isRecord(resources)) {
    return Object.freeze({ affordable: false, expandable: false });
  }
  let affordable = true;
  let expandable = true;
  for (const [resourceId, amount] of Object.entries(cost)) {
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
        race["truepath"] !== true ||
        dependencies.controls.resolve("shipPlans") === undefined
      ) {
        return undefined;
      }
      const document = fleetDocument(dependencies.getDocument());
      const costsElement = document?.querySelector("#shipYardCosts");
      if (costsElement === null || costsElement === undefined) return undefined;
      const cost = readCost(costsElement);
      if (cost === undefined || Object.keys(cost).length === 0)
        return undefined;
      const capacity = readShipCapacityState(root, cost);
      return Object.freeze({
        nextShipAffordable: capacity.affordable,
        nextShipExpandable: capacity.expandable,
        nextShipCost: Object.freeze(
          Object.entries(cost).map(([resourceId, amount]) =>
            Object.freeze({ resourceId, amount }),
          ),
        ),
      });
    },
  });
}
