import type {
  CostConflictInput,
  CostConflictResource,
  ReservedCostTarget,
  ResourceCostMap,
} from "../../domain/cost-conflicts.ts";
import { isFiniteNumber, isRecord } from "../validation.ts";

export type CostConflictUnavailableReason =
  | "inaccessible-data"
  | "invalid-action"
  | "invalid-resource"
  | "invalid-state"
  | "invalid-target";

export type CostConflictInputReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<CostConflictInput>;
    }
  | {
      readonly status: "unavailable";
      readonly reason: CostConflictUnavailableReason;
      readonly resourceId?: string;
      readonly targetIndex?: number;
    };

function unavailable(
  reason: CostConflictUnavailableReason,
  context: { readonly resourceId?: string; readonly targetIndex?: number } = {},
): CostConflictInputReadResult {
  return Object.freeze({ status: "unavailable", reason, ...context });
}

function freezeCostMap(
  rawCost: Record<PropertyKey, unknown>,
  allowZero: boolean,
): ResourceCostMap | undefined {
  const entries: [string, number][] = [];
  for (const resourceId of Object.keys(rawCost)) {
    const cost = rawCost[resourceId];
    if (!isFiniteNumber(cost) || (allowZero ? cost < 0 : cost <= 0)) {
      return undefined;
    }
    entries.push([resourceId, cost]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

/** Samples and validates one complete cost-reservation decision input. */
export function readCostConflictInput(
  rawState: unknown,
  rawResources: unknown,
  rawAction: unknown,
): CostConflictInputReadResult {
  try {
    if (!isRecord(rawState) || !Array.isArray(rawState["conflictTargets"])) {
      return unavailable("invalid-state");
    }

    const rawTargets = rawState["conflictTargets"];
    if (rawTargets.length === 0) {
      return readyInput({}, [], {});
    }
    if (!isRecord(rawResources)) return unavailable("invalid-resource");
    if (!isRecord(rawAction) || !isRecord(rawAction["cost"])) {
      return unavailable("invalid-action");
    }
    const actionCost = freezeCostMap(rawAction["cost"], true);
    if (actionCost === undefined) return unavailable("invalid-action");

    const reservedTargets: ReservedCostTarget[] = [];
    const resources: Record<string, CostConflictResource> = {};

    for (let targetIndex = 0; targetIndex < rawTargets.length; targetIndex++) {
      const rawTarget = rawTargets[targetIndex];
      if (
        !isRecord(rawTarget) ||
        typeof rawTarget["name"] !== "string" ||
        !isRecord(rawTarget["cost"])
      ) {
        return unavailable("invalid-target", { targetIndex });
      }
      const cost = freezeCostMap(rawTarget["cost"], false);
      if (cost === undefined) {
        return unavailable("invalid-target", { targetIndex });
      }

      for (const resourceId of Object.keys(cost)) {
        if (resources[resourceId] !== undefined) continue;
        const rawResource = rawResources[resourceId];
        if (
          !isRecord(rawResource) ||
          typeof rawResource["name"] !== "string" ||
          !isFiniteNumber(rawResource["currentQuantity"])
        ) {
          return unavailable("invalid-resource", {
            resourceId,
            targetIndex,
          });
        }
        resources[resourceId] = Object.freeze({
          name: rawResource["name"],
          currentQuantity: rawResource["currentQuantity"],
        });
      }

      reservedTargets.push(
        Object.freeze({
          name: rawTarget["name"],
          cause:
            typeof rawTarget["cause"] === "string" ? rawTarget["cause"] : "",
          cost,
        }),
      );
    }

    return readyInput(actionCost, reservedTargets, resources);
  } catch {
    return unavailable("inaccessible-data");
  }
}

function readyInput(
  actionCost: ResourceCostMap,
  reservedTargets: readonly ReservedCostTarget[],
  resources: Readonly<Record<string, CostConflictResource | undefined>>,
): CostConflictInputReadResult {
  return Object.freeze({
    status: "ready",
    input: Object.freeze({
      actionCost,
      reservedTargets: Object.freeze(reservedTargets),
      resources: Object.freeze(resources),
    }),
  });
}
