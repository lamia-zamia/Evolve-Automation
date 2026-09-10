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
  read(): DemandFleet | undefined;
}

function fleetDocument(value: unknown): FleetCostDocument | undefined {
  return isRecord(value) && typeof value["querySelector"] === "function"
    ? (value as unknown as FleetCostDocument)
    : undefined;
}

function readCost(element: FleetCostElement): Readonly<Record<string, number>> {
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
    const amount = Number(amounts.get(name.toLowerCase()));
    if (Number.isFinite(amount) && amount > 0) cost[name] = amount;
  }
  return Object.freeze(cost);
}

function readResourceMaximums(
  root: unknown,
  cost: Readonly<Record<string, number>>,
): boolean {
  const resources = readProperty(root, "resource");
  if (!isRecord(resources)) return false;
  return Object.entries(cost).every(([resourceId, amount]) => {
    const maximum = readProperty(readProperty(resources, resourceId), "max");
    return (
      typeof maximum === "number" &&
      Number.isFinite(maximum) &&
      maximum >= amount
    );
  });
}

export function createCapturedFleetDemand(
  dependencies: CapturedFleetDemandDependencies,
): CapturedFleetDemand {
  return Object.freeze({
    read(): DemandFleet | undefined {
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
      if (Object.keys(cost).length === 0) return undefined;
      return Object.freeze({
        nextShipAffordable: readResourceMaximums(root, cost),
        nextShipCost: Object.freeze(
          Object.entries(cost).map(([resourceId, amount]) =>
            Object.freeze({ resourceId, amount }),
          ),
        ),
      });
    },
  });
}
