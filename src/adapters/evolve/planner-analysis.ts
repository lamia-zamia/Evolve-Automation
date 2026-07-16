import type {
  PlannerLimitInput,
  PlannerRequirement,
  PlannerRun,
} from "../../domain/planner-analysis.ts";

type PlannerAnalysisUnavailableReason =
  | "inaccessible-data"
  | "invalid-game-state"
  | "invalid-resource"
  | "invalid-target";

export type PlannerLimitInputReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<PlannerLimitInput>;
    }
  | {
      readonly status: "unavailable";
      readonly reason: PlannerAnalysisUnavailableReason;
      readonly resourceId?: string;
    };

export type PlannerRunReadResult =
  | { readonly status: "ready"; readonly run: Readonly<PlannerRun> }
  | {
      readonly status: "unavailable";
      readonly reason: "inaccessible-data" | "invalid-game-state";
    };

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function unavailableLimit(
  reason: PlannerAnalysisUnavailableReason,
  resourceId?: string,
): PlannerLimitInputReadResult {
  return Object.freeze(
    resourceId === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, resourceId },
  );
}

/** Samples and validates all target/resource values needed by the pure limiter. */
export function readPlannerLimitInput(
  rawTarget: unknown,
  rawResources: unknown,
): PlannerLimitInputReadResult {
  try {
    if (
      !isRecord(rawTarget) ||
      typeof rawTarget["isAffordable"] !== "function"
    ) {
      return unavailableLimit("invalid-target");
    }

    const affordable = rawTarget["isAffordable"].call(rawTarget);
    if (typeof affordable !== "boolean") {
      return unavailableLimit("invalid-target");
    }
    if (affordable) {
      return Object.freeze({
        status: "ready",
        input: Object.freeze({ affordable, requirements: Object.freeze([]) }),
      });
    }

    const rawCosts = rawTarget["cost"];
    if (!isRecord(rawCosts)) return unavailableLimit("invalid-target");
    if (!isRecord(rawResources)) return unavailableLimit("invalid-resource");

    const requirements: PlannerRequirement[] = [];
    for (const resourceId of Object.keys(rawCosts)) {
      const requiredQuantity = rawCosts[resourceId];
      if (!isFiniteNumber(requiredQuantity) || requiredQuantity < 0) {
        return unavailableLimit("invalid-target", resourceId);
      }

      const rawResource = rawResources[resourceId];
      if (
        !isRecord(rawResource) ||
        typeof rawResource["title"] !== "string" ||
        typeof rawResource["isUnlocked"] !== "function"
      ) {
        return unavailableLimit("invalid-resource", resourceId);
      }
      const currentQuantity = rawResource["currentQuantity"];
      const maximumQuantity = rawResource["maxQuantity"];
      const income = rawResource["income"];
      if (
        !isFiniteNumber(currentQuantity) ||
        !isFiniteNumber(maximumQuantity) ||
        !isFiniteNumber(income)
      ) {
        return unavailableLimit("invalid-resource", resourceId);
      }

      const unlocked = rawResource["isUnlocked"].call(rawResource);
      if (typeof unlocked !== "boolean") {
        return unavailableLimit("invalid-resource", resourceId);
      }

      requirements.push(
        Object.freeze({
          resourceId,
          resourceTitle: rawResource["title"],
          requiredQuantity,
          currentQuantity,
          maximumQuantity,
          income,
          unlocked,
        }),
      );
    }

    return Object.freeze({
      status: "ready",
      input: Object.freeze({
        affordable,
        requirements: Object.freeze(requirements),
      }),
    });
  } catch {
    return unavailableLimit("inaccessible-data");
  }
}

export function readPlannerRun(rawGame: unknown): PlannerRunReadResult {
  try {
    if (!isRecord(rawGame)) {
      return Object.freeze({
        status: "unavailable",
        reason: "invalid-game-state",
      });
    }
    const global = rawGame["global"];
    const stats = isRecord(global) ? global["stats"] : undefined;
    if (!isRecord(stats)) {
      return Object.freeze({
        status: "unavailable",
        reason: "invalid-game-state",
      });
    }
    const day = stats["days"];
    const reset = stats["reset"];
    if (!isNonNegativeSafeInteger(day) || !isNonNegativeSafeInteger(reset)) {
      return Object.freeze({
        status: "unavailable",
        reason: "invalid-game-state",
      });
    }
    return Object.freeze({
      status: "ready",
      run: Object.freeze({ day, reset }),
    });
  } catch {
    return Object.freeze({
      status: "unavailable",
      reason: "inaccessible-data",
    });
  }
}
