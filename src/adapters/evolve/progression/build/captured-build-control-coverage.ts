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

export interface CapturedBuildControlCoverageReader {
  readonly read: (
    root: unknown,
    tabIndex: number,
  ) => CapturedBuildControlCoverage;
}

interface IndexedCapturedBuildControlCandidate {
  readonly structure: Readonly<CapturedGameStructureDefinition>;
  readonly binding: string;
}

const CAPTURED_BUILD_ACTION_METHOD = "action";
const CAPTURED_BUILD_ON_CAP_METHOD = "on_cap";
const UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE = Object.freeze({
  kind: "unknown" as const,
});
const COMPLETE_CAPTURED_BUILD_CONTROL_COVERAGE = Object.freeze({
  kind: "complete" as const,
});

/**
 * Reads native action availability and only asks for a panel draw when a currently offered
 * automation building lacks the captured action method (or its native switch method).
 * Availability is evaluated through the captured game-owned rule; future unlocks are checked on
 * the next call, without using a work-cycle counter as a success epoch.
 */
export function createIndexedCapturedBuildControlCoverageReader(
  tabIndexes: readonly number[],
  controls: Pick<GameControlRegistry, "resolve">,
  mechanics: CapturedGameMechanics,
): CapturedBuildControlCoverageReader {
  const requestedTabs = new Set<number>();
  const requestedRegions = new Set<string>();
  for (const tabIndex of tabIndexes) {
    const location = SPACE_TAB_ACTION_LOCATIONS[tabIndex];
    if (location === undefined) continue;
    requestedTabs.add(tabIndex);
    requestedRegions.add(location.region);
  }
  if (requestedTabs.size === 0) {
    return Object.freeze({
      read: () => UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE,
    });
  }

  let structures: readonly CapturedGameStructureDefinition[] | undefined;
  try {
    structures = mechanics.readStructures();
  } catch {
    structures = undefined;
  }
  if (structures === undefined || structures.length === 0) {
    return Object.freeze({
      read: () => UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE,
    });
  }

  const mutableStructuresByRegion = new Map<
    string,
    IndexedCapturedBuildControlCandidate[]
  >();
  const inconsistentRegions = new Set<string>();
  try {
    for (const structure of structures) {
      const binding = bindingForBuildingElement(structure.actionId);
      if (!CAPTURED_AUTOMATION_BUILDING_BINDINGS.has(binding)) continue;
      const parts = splitActionId(binding);
      const nativeRegion = structure.region;
      if (parts === undefined || parts.region !== nativeRegion) {
        if (requestedRegions.has(nativeRegion))
          inconsistentRegions.add(nativeRegion);
        if (parts !== undefined && requestedRegions.has(parts.region))
          inconsistentRegions.add(parts.region);
        continue;
      }
      if (!requestedRegions.has(nativeRegion)) continue;

      const candidates = mutableStructuresByRegion.get(nativeRegion);
      const candidate = Object.freeze({ structure, binding });
      if (candidates === undefined)
        mutableStructuresByRegion.set(nativeRegion, [candidate]);
      else candidates.push(candidate);
    }
  } catch {
    return Object.freeze({
      read: () => UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE,
    });
  }

  const structuresByRegion = new Map<
    string,
    readonly IndexedCapturedBuildControlCandidate[]
  >();
  for (const [region, candidates] of mutableStructuresByRegion)
    structuresByRegion.set(region, Object.freeze(candidates));

  const readIndexedCapturedBuildControlCoverage = (
    root: unknown,
    tabIndex: number,
  ): CapturedBuildControlCoverage => {
    if (!requestedTabs.has(tabIndex))
      return UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE;
    const location = SPACE_TAB_ACTION_LOCATIONS[tabIndex];
    if (location === undefined || inconsistentRegions.has(location.region))
      return UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE;

    const missing = new Set<string>();
    for (const { structure, binding } of structuresByRegion.get(
      location.region,
    ) ?? []) {
      try {
        if (!structure.matchesCurrentIdentity())
          return UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE;
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
            return UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE;
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
          return UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE;
        if (availability.value) missing.add(binding);
      } catch {
        return UNKNOWN_CAPTURED_BUILD_CONTROL_COVERAGE;
      }
    }

    if (missing.size === 0) return COMPLETE_CAPTURED_BUILD_CONTROL_COVERAGE;
    return Object.freeze({
      kind: "missing",
      bindings: Object.freeze([...missing].sort()),
    });
  };

  return Object.freeze({
    read: readIndexedCapturedBuildControlCoverage,
  });
}

export function readCapturedBuildControlCoverage(
  root: unknown,
  tabIndex: number,
  controls: Pick<GameControlRegistry, "resolve">,
  mechanics: CapturedGameMechanics,
): CapturedBuildControlCoverage {
  return createIndexedCapturedBuildControlCoverageReader(
    [tabIndex],
    controls,
    mechanics,
  ).read(root, tabIndex);
}
