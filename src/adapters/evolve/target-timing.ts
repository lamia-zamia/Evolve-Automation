import type {
  TargetTimingInput,
  TargetTimingRequirement,
} from "../../domain/target-timing.ts";
import { isFiniteNumber, isRecord } from "../validation.ts";

type TargetTimingUnavailableReason =
  | "inaccessible-data"
  | "invalid-game-state"
  | "invalid-target"
  | "invalid-resource";

export type TargetTimingReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<TargetTimingInput>;
    }
  | {
      readonly status: "unavailable";
      readonly reason: TargetTimingUnavailableReason;
      readonly resourceId?: string;
    };

function unavailable(
  reason: TargetTimingUnavailableReason,
  resourceId?: string,
): TargetTimingReadResult {
  return Object.freeze(
    resourceId === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, resourceId },
  );
}

/** Maps live Evolve target/resource data into one validated immutable timing input. */
export function readTargetTimingInput(
  rawGame: unknown,
  rawTarget: unknown,
  isProject: boolean,
): TargetTimingReadResult {
  try {
    if (!isRecord(rawTarget) || !isRecord(rawTarget["cost"])) {
      return unavailable("invalid-target");
    }

    const remainingSegments = isProject
      ? projectSegmentsRemaining(rawTarget)
      : segmentedTargetSegmentsRemaining(rawTarget);
    if (remainingSegments === undefined) {
      return unavailable("invalid-target");
    }

    if (!isRecord(rawGame)) return unavailable("invalid-game-state");
    const global = rawGame["global"];
    if (!isRecord(global) || !isRecord(global["resource"])) {
      return unavailable("invalid-game-state");
    }

    const costs = rawTarget["cost"];
    const gameResources = global["resource"];
    const requirements: TargetTimingRequirement[] = [];

    for (const resourceId of Object.keys(costs)) {
      const costPerSegment = costs[resourceId];
      if (!isFiniteNumber(costPerSegment)) {
        return unavailable("invalid-target", resourceId);
      }

      const rawResource = gameResources[resourceId];
      if (!isRecord(rawResource)) {
        return unavailable("invalid-resource", resourceId);
      }
      const currentQuantity = rawResource["amount"];
      const rateOfChange = rawResource["diff"];
      if (!isFiniteNumber(currentQuantity) || !isFiniteNumber(rateOfChange)) {
        return unavailable("invalid-resource", resourceId);
      }

      requirements.push(
        Object.freeze({
          resourceId,
          costPerSegment,
          currentQuantity,
          rateOfChange,
        }),
      );
    }

    return Object.freeze({
      status: "ready",
      input: Object.freeze({
        remainingSegments,
        requirements: Object.freeze(requirements),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

function projectSegmentsRemaining(
  target: Record<PropertyKey, unknown>,
): number | undefined {
  const progress = target["progress"];
  const currentStep = target["currentStep"];
  if (!isFiniteNumber(progress) || !isFiniteNumber(currentStep)) {
    return undefined;
  }
  return (100 - progress) / currentStep;
}

function segmentedTargetSegmentsRemaining(
  target: Record<PropertyKey, unknown>,
): number | undefined {
  const gameMax = target["gameMax"];
  const count = target["count"];
  if (!isFiniteNumber(gameMax) || !isFiniteNumber(count)) return undefined;
  return gameMax - count;
}
