/**
 * Adapts the captured `shipPlans` Vue control to the narrow fleet-controls port: which parts are
 * offered, how a blueprint is written, whether it has the power to build, and the build itself.
 *
 * The captured component's `s` field is the live shipyard object, and it is the only captured value
 * that can prove a build appended a ship; the root state is the game's pre-period clone and cannot
 * serve as an execution postcondition. Sending that ship onward is not a panel method and is not
 * here — it is the ship's own dispatch closure, behind its own capture.
 */

import type {
  GameFleetBuildRequest,
  GameFleetBuildResult,
  GameFleetControlsPort,
  GameFleetPartRequest,
  GameFleetStepRequest,
} from "../../../ports/game-fleet-controls.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import { matchesStringRecordFields, readProperty } from "../../validation.ts";
import { capturedOuterFleetShipList } from "./captured-outer-fleet-shipyard.ts";

export interface CapturedFleetControlsDependencies {
  readonly controls: GameControlRegistry;
}

const NOT_ACTIONABLE: GameFleetBuildResult = Object.freeze({
  actionable: false,
  builtIndex: null,
});

function methodValue(
  dependencies: CapturedFleetControlsDependencies,
  elementId: string,
  method: string,
  args: readonly unknown[] = [],
): { readonly ok: boolean; readonly value: unknown } {
  const handle = dependencies.controls.resolve(elementId);
  if (handle === undefined || !handle.methods.includes(method)) {
    return { ok: false, value: undefined };
  }
  const result = dependencies.controls.invoke(handle, method, args);
  return result.ok ? result : { ok: false, value: undefined };
}

function step(
  dependencies: CapturedFleetControlsDependencies,
  request: GameFleetStepRequest,
  method: "add" | "sub",
): boolean {
  if (request.count <= 0) return true;
  return methodValue(dependencies, request.elementId, method, [
    request.region,
    request.ship,
  ]).ok;
}

export function createCapturedFleetControls(
  dependencies: CapturedFleetControlsDependencies,
): GameFleetControlsPort {
  return Object.freeze({
    isRendered(elementId: string): boolean {
      return dependencies.controls.resolve(elementId) !== undefined;
    },

    isPartAvailable(request: GameFleetPartRequest): boolean {
      if (request.index === undefined) return false;
      const result = methodValue(dependencies, request.elementId, "avail", [
        request.type,
        request.index,
        request.part,
      ]);
      return result.ok && result.value === true;
    },

    setPart(request: GameFleetPartRequest): boolean {
      return methodValue(dependencies, request.elementId, "setVal", [
        request.type,
        request.part,
      ]).ok;
    },

    hasShipPower(elementId: string): boolean {
      const result = methodValue(dependencies, elementId, "powerText");
      return (
        result.ok &&
        typeof result.value === "string" &&
        !result.value.includes("danger")
      );
    },

    buildShip(request: GameFleetBuildRequest): GameFleetBuildResult {
      const handle = dependencies.controls.resolve(request.elementId);
      if (handle === undefined || !handle.methods.includes("build")) {
        return NOT_ACTIONABLE;
      }
      if (
        request.expectedBlueprint !== undefined &&
        !matchesStringRecordFields(
          readProperty(readProperty(handle.data, "s"), "blueprint"),
          request.expectedBlueprint,
        )
      ) {
        return NOT_ACTIONABLE;
      }
      const beforeList = capturedOuterFleetShipList(handle);
      if (beforeList === undefined) return NOT_ACTIONABLE;
      const before = [...beforeList];
      const result = dependencies.controls.invoke(handle, "build");
      if (!result.ok) return NOT_ACTIONABLE;
      const after = capturedOuterFleetShipList(handle);
      if (after === undefined || after.length <= before.length) {
        // The game may have accepted the click by queueing a future order. No ship began its
        // outer-fleet action yet, so the caller must not report a dispatched fleet.
        return { actionable: true, builtIndex: null };
      }
      const newIndex = after.findIndex(
        (ship) =>
          !before.includes(ship) &&
          (request.expectedBlueprint === undefined ||
            matchesStringRecordFields(ship, request.expectedBlueprint)),
      );
      return {
        actionable: true,
        builtIndex:
          newIndex >= 0
            ? newIndex
            : request.expectedBlueprint === undefined
              ? after.length - 1
              : null,
      };
    },

    addShips(request: GameFleetStepRequest): boolean {
      return step(dependencies, request, "add");
    },

    subShips(request: GameFleetStepRequest): boolean {
      return step(dependencies, request, "sub");
    },
  });
}
