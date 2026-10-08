/** Checks whether the current native offers already have the controls Building can act through. */

import type {
  CapturedGameMechanics,
  CapturedGameStructureDefinition,
} from "../../../../ports/captured-game-mechanics.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { SPACE_TAB_ACTION_LOCATIONS } from "../../captured-tab-discovery.ts";
import { splitActionId } from "../../../validation.ts";
import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "./captured-building-bindings.generated.ts";
import { bindingForBuildingElement } from "./captured-building-metadata.ts";

export type CapturedBuildControlCoverage =
  | { readonly kind: "complete" }
  | { readonly kind: "missing"; readonly bindings: readonly string[] }
  | { readonly kind: "unknown" };

const CAPTURED_BUILD_ACTION_METHOD = "action";
const CAPTURED_BUILD_ON_CAP_METHOD = "on_cap";

function isCapturedStructureOnTab(
  structure: Readonly<CapturedGameStructureDefinition>,
  tabIndex: number,
): boolean | undefined {
  const location = SPACE_TAB_ACTION_LOCATIONS[tabIndex];
  if (location === undefined) return undefined;
  return structure.region === location.region;
}

/**
 * Reads native action availability and only asks for a panel draw when a currently offered
 * automation building lacks the captured action method (or its native switch method).
 * Availability is evaluated through the captured game-owned rule; future unlocks are checked on
 * the next call, without using a work-cycle counter as a success epoch.
 */
export function readCapturedBuildControlCoverage(
  root: unknown,
  tabIndex: number,
  controls: Pick<GameControlRegistry, "resolve">,
  mechanics: CapturedGameMechanics,
): CapturedBuildControlCoverage {
  if (SPACE_TAB_ACTION_LOCATIONS[tabIndex] === undefined)
    return Object.freeze({ kind: "unknown" });
  const structures = mechanics.readStructures();
  if (structures === undefined || structures.length === 0)
    return Object.freeze({ kind: "unknown" });

  const missing = new Set<string>();
  for (const structure of structures) {
    const binding = bindingForBuildingElement(structure.actionId);
    if (!CAPTURED_AUTOMATION_BUILDING_BINDINGS.has(binding)) continue;
    const parts = splitActionId(binding);
    if (parts === undefined || parts.region !== structure.region)
      return Object.freeze({ kind: "unknown" });
    const onTab = isCapturedStructureOnTab(structure, tabIndex);
    if (onTab === undefined) return Object.freeze({ kind: "unknown" });
    if (!onTab) continue;

    try {
      if (!structure.matchesCurrentIdentity())
        return Object.freeze({ kind: "unknown" });
      // The native id is the captured registry key; `binding` is a policy alias for actions such
      // as DeadSpace's `undefined-food` and `undefined-stone`.
      const handle = controls.resolve(structure.actionId);
      const hasAction =
        handle?.methods.includes(CAPTURED_BUILD_ACTION_METHOD) ?? false;
      let missingOnCap = false;
      if (
        hasAction &&
        !handle?.methods.includes(CAPTURED_BUILD_ON_CAP_METHOD)
      ) {
        const switchable = structure.readSwitchable();
        if (switchable.kind === "invalid")
          return Object.freeze({ kind: "unknown" });
        missingOnCap = switchable.kind === "value" && switchable.value;
      }
      if (hasAction && !missingOnCap) continue;

      // Existing complete controls are already authoritative; run the native offer check only
      // when a missing method could make a currently rendered action useful to automation.
      const availability = structure.readControlAvailabilityForTab(
        root,
        tabIndex,
      );
      if (availability.kind !== "value")
        return Object.freeze({ kind: "unknown" });
      if (availability.value) missing.add(binding);
    } catch {
      return Object.freeze({ kind: "unknown" });
    }
  }

  if (missing.size === 0) return Object.freeze({ kind: "complete" });
  return Object.freeze({
    kind: "missing",
    bindings: Object.freeze([...missing].sort()),
  });
}
