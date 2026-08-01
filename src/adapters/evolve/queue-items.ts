import {
  isCostAffordable,
  type CostAffordabilityInput,
  type CostRequirement,
} from "../../domain/cost-affordability.ts";
import { isFiniteNumber, isNonArrayRecord } from "../validation.ts";

type QueueItemUnavailableReason =
  | "inaccessible-data"
  | "invalid-cost"
  | "invalid-item"
  | "invalid-resource"
  | "invalid-target";

export type CostAffordabilityReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<CostAffordabilityInput>;
    }
  | {
      readonly status: "unavailable";
      readonly reason: QueueItemUnavailableReason;
      readonly resourceId?: string;
    };

export interface ResolvedQueueTarget {
  readonly id: string;
  readonly title: string;
  readonly cost: Readonly<Record<string, number>>;
}

export type QueueTargetReadResult =
  | {
      readonly status: "ready";
      readonly target: ResolvedQueueTarget;
      readonly maximumAffordable: boolean;
    }
  | {
      readonly status: "missing";
      readonly itemId: string;
    }
  | {
      readonly status: "unavailable";
      readonly reason: QueueItemUnavailableReason;
      readonly itemId?: string;
      readonly resourceId?: string;
    };

interface QueueTargetAdapterDependencies {
  readonly resources: unknown;
  readonly poly: unknown;
  readonly mechManager: unknown;
  readonly buildingIds: unknown;
  readonly arpaIds: unknown;
}

function unavailableCost(
  reason: QueueItemUnavailableReason,
  resourceId?: string,
): CostAffordabilityReadResult {
  return Object.freeze(
    resourceId === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, resourceId },
  );
}

function unavailableTarget(
  reason: QueueItemUnavailableReason,
  context: { readonly itemId?: string; readonly resourceId?: string } = {},
): Extract<QueueTargetReadResult, { readonly status: "unavailable" }> {
  return Object.freeze({ status: "unavailable", reason, ...context });
}

/** Maps cost/resource values once; malformed numeric data fails closed. */
export function readCostAffordabilityInput(
  rawCost: unknown,
  rawResources: unknown,
  capacity: "current" | "maximum",
): CostAffordabilityReadResult {
  try {
    if (!isNonArrayRecord(rawCost)) return unavailableCost("invalid-cost");
    if (!isNonArrayRecord(rawResources))
      return unavailableCost("invalid-resource");

    const requirements: CostRequirement[] = [];
    for (const resourceId in rawCost) {
      const requiredQuantity = rawCost[resourceId];
      if (!isFiniteNumber(requiredQuantity) || requiredQuantity < 0) {
        return unavailableCost("invalid-cost", resourceId);
      }

      const rawResource = rawResources[resourceId];
      if (!isNonArrayRecord(rawResource)) {
        return unavailableCost("invalid-resource", resourceId);
      }
      const availableQuantity =
        capacity === "maximum"
          ? rawResource["maxQuantity"]
          : rawResource["currentQuantity"];
      if (!isFiniteNumber(availableQuantity)) {
        return unavailableCost("invalid-resource", resourceId);
      }

      requirements.push(
        Object.freeze({
          resourceId,
          requiredQuantity,
          availableQuantity,
        }),
      );
    }

    return Object.freeze({
      status: "ready",
      input: Object.freeze({ requirements: Object.freeze(requirements) }),
    });
  } catch {
    return unavailableCost("inaccessible-data");
  }
}

function validateCostMap(
  rawCost: unknown,
  itemId: string,
):
  | {
      readonly status: "ready";
      readonly cost: Readonly<Record<string, number>>;
    }
  | Extract<QueueTargetReadResult, { readonly status: "unavailable" }> {
  if (!isNonArrayRecord(rawCost))
    return unavailableTarget("invalid-cost", { itemId });

  const cost: Record<string, number> = {};
  for (const resourceId in rawCost) {
    const quantity = rawCost[resourceId];
    if (!isFiniteNumber(quantity) || quantity < 0) {
      return unavailableTarget("invalid-cost", { itemId, resourceId });
    }
    cost[resourceId] = quantity;
  }
  return Object.freeze({ status: "ready", cost: Object.freeze(cost) });
}

function syntheticTarget(
  itemId: string,
  label: string,
  rawCost: unknown,
  resources: unknown,
): QueueTargetReadResult {
  const costResult = validateCostMap(rawCost, itemId);
  if (costResult.status === "unavailable") return costResult;
  const { cost } = costResult;

  const affordability = readCostAffordabilityInput(cost, resources, "maximum");
  if (affordability.status === "unavailable") {
    return unavailableTarget(
      affordability.reason,
      affordability.resourceId === undefined
        ? { itemId }
        : { itemId, resourceId: affordability.resourceId },
    );
  }

  return Object.freeze({
    status: "ready",
    target: Object.freeze({ id: itemId, name: label, title: label, cost }),
    maximumAffordable: isCostAffordable(affordability.input),
  });
}

function readCatalogTarget(
  itemId: string,
  rawTarget: unknown,
): QueueTargetReadResult {
  if (rawTarget === undefined || rawTarget === null) {
    return Object.freeze({ status: "missing", itemId });
  }
  if (
    !isNonArrayRecord(rawTarget) ||
    typeof rawTarget["id"] !== "string" ||
    typeof rawTarget["title"] !== "string" ||
    typeof rawTarget["isAffordable"] !== "function"
  ) {
    return unavailableTarget("invalid-target", { itemId });
  }
  const costResult = validateCostMap(rawTarget["cost"], itemId);
  if (costResult.status === "unavailable") return costResult;

  const maximumAffordable = rawTarget["isAffordable"].call(rawTarget, true);
  if (typeof maximumAffordable !== "boolean") {
    return unavailableTarget("invalid-target", { itemId });
  }

  // Identity is required by legacy queue consumers; the adapter validates but
  // deliberately does not clone ordinary building/project catalog objects.
  return Object.freeze({
    status: "ready",
    target: rawTarget as unknown as ResolvedQueueTarget,
    maximumAffordable,
  });
}

/** Resolves one Evolve queue item and samples its maximum affordability once. */
export function readQueueTarget(
  rawItem: unknown,
  dependencies: QueueTargetAdapterDependencies,
): QueueTargetReadResult {
  try {
    if (!isNonArrayRecord(rawItem) || typeof rawItem["id"] !== "string") {
      return unavailableTarget("invalid-item");
    }
    const itemId = rawItem["id"];
    const action = rawItem["action"];

    if (action === "tp-ship") {
      if (
        typeof rawItem["label"] !== "string" ||
        !isNonArrayRecord(dependencies.poly)
      ) {
        return unavailableTarget("invalid-item", { itemId });
      }
      const shipCosts = dependencies.poly["shipCosts"];
      if (typeof shipCosts !== "function") {
        return unavailableTarget("invalid-target", { itemId });
      }
      return syntheticTarget(
        itemId,
        rawItem["label"],
        shipCosts.call(dependencies.poly, rawItem["type"]),
        dependencies.resources,
      );
    }

    if (action === "hell-mech") {
      if (
        typeof rawItem["label"] !== "string" ||
        !isNonArrayRecord(dependencies.mechManager)
      ) {
        return unavailableTarget("invalid-item", { itemId });
      }
      const getMechCost = dependencies.mechManager["getMechCost"];
      if (typeof getMechCost !== "function") {
        return unavailableTarget("invalid-target", { itemId });
      }
      const rawMechCost = getMechCost.call(
        dependencies.mechManager,
        rawItem["type"],
      );
      if (!Array.isArray(rawMechCost) || rawMechCost.length < 2) {
        return unavailableTarget("invalid-cost", { itemId });
      }
      return syntheticTarget(
        itemId,
        rawItem["label"],
        { Soul_Gem: rawMechCost[0], Supply: rawMechCost[1] },
        dependencies.resources,
      );
    }

    if (
      !isNonArrayRecord(dependencies.buildingIds) ||
      !isNonArrayRecord(dependencies.arpaIds)
    ) {
      return unavailableTarget("invalid-target", { itemId });
    }
    const rawTarget =
      dependencies.buildingIds[itemId] || dependencies.arpaIds[itemId];
    return readCatalogTarget(itemId, rawTarget);
  } catch {
    const itemId =
      isNonArrayRecord(rawItem) && typeof rawItem["id"] === "string"
        ? rawItem["id"]
        : undefined;
    return unavailableTarget(
      "inaccessible-data",
      itemId === undefined ? {} : { itemId },
    );
  }
}
