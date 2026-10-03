/**
 * Adapts the captured `shipPlans` Vue control to the narrow fleet-controls port: which parts are
 * offered, how a blueprint is written, what design the yard holds, and the native build outcome.
 *
 * The captured component's `s` field is the live shipyard object, and it is the only captured value
 * that can prove a build appended a ship; the root state is the game's pre-period clone and cannot
 * serve as an execution postcondition. Sending that ship onward is not a panel method and is not
 * here — it is the ship's own dispatch closure, behind its own capture.
 *
 * **The option index belongs to the yard, not to the caller.** `avail(type, index, value)` is
 * upstream `shipPartAvailable(part, idx, value, shipClass)`, which reads that index as the unlock
 * level it is testing against, so a caller that named its own would be asking a different question
 * from the one the yard asks. The position is therefore resolved here, out of the yard's own option
 * markup, and a part the markup never offered is not available — which is also what keeps a part
 * upstream has since added working without anything here knowing it exists. `setVal(type, value)`
 * takes no index and is given none.
 */

import type {
  GameFleetBuildRequest,
  GameFleetBuildResult,
  GameFleetControlsPort,
  GameFleetPartRequest,
  GameFleetStepRequest,
} from "../../../ports/game-fleet-controls.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameShipyardPartCatalogSource } from "../../../ports/game-shipyard-parts.ts";
import {
  isRecord,
  matchesStringRecordFields,
  readProperty,
} from "../../validation.ts";
import { capturedOuterFleetShipList } from "./captured-outer-fleet-shipyard.ts";

export interface CapturedFleetControlsDependencies {
  readonly controls: GameControlRegistry;
  /** The yard's own option markup, which is what gives a part its position. */
  readonly parts: GameShipyardPartCatalogSource;
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
      const option = dependencies.parts
        .catalog()
        ?.optionFor(request.type, request.part);
      if (option === undefined) return false;
      const result = methodValue(dependencies, request.elementId, "avail", [
        request.type,
        option.index,
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

    currentDesign(
      elementId: string,
    ): Readonly<Record<string, unknown>> | undefined {
      const handle = dependencies.controls.resolve(elementId);
      const blueprint = readProperty(
        readProperty(handle?.data, "s"),
        "blueprint",
      );
      // A copy, because this is what the yard holds rather than a bag a caller could hold on to and
      // find changed under it; the yard itself keeps writing the original.
      return isRecord(blueprint) ? Object.freeze({ ...blueprint }) : undefined;
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
      if (
        after === undefined ||
        after.length !== before.length + 1 ||
        before.some((ship) => !after.includes(ship))
      ) {
        // Native refusal and queueing both append nothing. Any unproven list transition also
        // fails closed; the caller must not report a build or dispatch from invocation alone.
        return { actionable: true, builtIndex: null };
      }
      // A native draw may reorder the list, so identify the new ship by identity rather than its
      // position. Exactly one new identity must exist, and it must be the requested native design.
      const appended = after.filter((ship) => !before.includes(ship));
      const intended = appended[0];
      const matches =
        appended.length === 1 &&
        (request.expectedBlueprint === undefined ||
          matchesStringRecordFields(intended, request.expectedBlueprint));
      return {
        actionable: true,
        builtIndex: matches ? after.indexOf(intended) : null,
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
