/** A cheap witness for Building keys; it avoids materializing native action readers. */

import type { CapturedGameStructureIdentity } from "../../../../ports/captured-game-mechanics.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { isRecord, readProperty, splitActionId } from "../../../validation.ts";
import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "./captured-building-bindings.generated.ts";
import {
  bindingForBuildingElement,
  CAPTURED_BUILD_REGIONS,
} from "./captured-building-metadata.ts";

function capturedBuildingGenerationControlFacts(
  root: unknown,
  elementIds: readonly string[],
  controls: Pick<GameControlRegistry, "resolve">,
): readonly (readonly unknown[])[] {
  const facts: (readonly unknown[])[] = [];
  for (const elementId of elementIds) {
    const binding = bindingForBuildingElement(elementId);
    const parts = splitActionId(binding);
    if (parts === undefined || !CAPTURED_BUILD_REGIONS.has(parts.region)) {
      continue;
    }
    const data = controls.resolve(elementId)?.data;
    const act = readProperty(data, "act");
    const actRecord = isRecord(act) ? act : undefined;
    const candidate = readProperty(readProperty(root, parts.region), parts.id);
    const candidateRecord = isRecord(candidate) ? candidate : undefined;
    facts.push([
      binding,
      actRecord !== undefined,
      actRecord !== undefined && Object.hasOwn(actRecord, "on"),
      candidateRecord !== undefined,
      candidateRecord !== undefined && Object.hasOwn(candidateRecord, "on"),
      act === undefined || candidate === act,
    ]);
  }
  // Order is only a conservative generation witness: a registry reorder can request another
  // idempotent defaults sweep, while every newly discovered binding remains represented here.
  return facts;
}

function capturedBuildingGenerationNativeFacts(
  root: unknown,
  elementIds: readonly string[],
  identities: readonly CapturedGameStructureIdentity[] | undefined,
): readonly (readonly unknown[])[] | null {
  if (identities === undefined) return null;
  const capturedBindings = new Set(elementIds.map(bindingForBuildingElement));
  const facts: (readonly unknown[])[] = [];
  for (const identity of identities) {
    const binding = bindingForBuildingElement(identity.actionId);
    const parts = splitActionId(binding);
    if (
      parts === undefined ||
      !CAPTURED_BUILD_REGIONS.has(parts.region) ||
      (!CAPTURED_AUTOMATION_BUILDING_BINDINGS.has(binding) &&
        !capturedBindings.has(binding))
    ) {
      continue;
    }
    const state = readProperty(
      readProperty(root, identity.region),
      identity.struct,
    );
    const liveState = isRecord(state) ? state : undefined;
    facts.push([
      identity.entryKey,
      identity.region,
      identity.sector,
      identity.struct,
      binding,
      liveState !== undefined,
      liveState !== undefined && Object.hasOwn(liveState, "on"),
    ]);
  }
  // Each fact carries its native entry identity, so additions and shape changes remain visible.
  return facts;
}

export function readCapturedBuildingGenerationWitness(
  root: unknown,
  controls: Pick<GameControlRegistry, "resolve">,
  elementIds: readonly string[],
  identities: readonly CapturedGameStructureIdentity[] | undefined,
): string {
  return JSON.stringify([
    capturedBuildingGenerationControlFacts(root, elementIds, controls),
    capturedBuildingGenerationNativeFacts(root, elementIds, identities),
  ]);
}

export function readCapturedBuildingControlWitness(
  root: unknown,
  controls: Pick<GameControlRegistry, "resolve">,
  elementIds: readonly string[],
): string {
  return JSON.stringify(
    capturedBuildingGenerationControlFacts(root, elementIds, controls),
  );
}

export function readCapturedBuildingNativeWitness(
  root: unknown,
  elementIds: readonly string[],
  identities: readonly CapturedGameStructureIdentity[],
): string {
  return JSON.stringify(
    capturedBuildingGenerationNativeFacts(root, elementIds, identities),
  );
}

/**
 * Establishes Vue dependencies for exactly the Building facts represented above. At pinned
 * DeadSpace `db38e2af`, `vars.js` creates game state as object literals and `save.js` restores
 * JSON-parsed records before `functions.js` wraps that same state with Vue. Native Building records
 * therefore do not inherit `on`; Vue's named `in` dependency matches the witness's own-property test
 * without tracking every structural key or ordinary numeric writes.
 */
export function trackCapturedBuildingGenerationStructure(
  root: unknown,
  controls: Pick<GameControlRegistry, "resolve">,
  elementIds: readonly string[],
  identities: readonly CapturedGameStructureIdentity[],
): readonly (() => unknown)[] {
  const sources: Array<() => unknown> = [];
  const structuresByRegion = new Map<string, Set<string>>();
  for (const identity of identities) {
    const binding = bindingForBuildingElement(identity.actionId);
    const parts = splitActionId(binding);
    if (
      parts === undefined ||
      !CAPTURED_BUILD_REGIONS.has(parts.region) ||
      (!CAPTURED_AUTOMATION_BUILDING_BINDINGS.has(binding) &&
        !elementIds.some(
          (elementId) => bindingForBuildingElement(elementId) === binding,
        ))
    )
      continue;
    let structures = structuresByRegion.get(identity.region);
    if (structures === undefined) {
      structures = new Set<string>();
      structuresByRegion.set(identity.region, structures);
    }
    structures.add(identity.struct);
  }
  for (const elementId of elementIds) {
    const parts = splitActionId(bindingForBuildingElement(elementId));
    if (parts !== undefined && CAPTURED_BUILD_REGIONS.has(parts.region)) {
      let structures = structuresByRegion.get(parts.region);
      if (structures === undefined) {
        structures = new Set<string>();
        structuresByRegion.set(parts.region, structures);
      }
      structures.add(parts.id);
    }
  }
  for (const [regionName, structureNames] of structuresByRegion) {
    // Vue tracks GET for each exact native region and structure key, including a missing key, so
    // additions, deletion, and same-count substitutions are observed without iterating catalogs.
    sources.push(() => readProperty(root, regionName));
    for (const structureName of structureNames) {
      sources.push(() => {
        const region = readProperty(root, regionName);
        return readProperty(region, structureName);
      });
      sources.push(() => {
        const region = readProperty(root, regionName);
        const structure = readProperty(region, structureName);
        return isRecord(structure) && "on" in structure;
      });
    }
  }
  // Resolve each handle inside the source on every evaluation. The registry may replace a
  // control during redraw, so retaining its current data object would leave a stale subscription.
  for (const elementId of elementIds) {
    const parts = splitActionId(bindingForBuildingElement(elementId));
    if (parts === undefined || !CAPTURED_BUILD_REGIONS.has(parts.region))
      continue;
    sources.push(() => readProperty(controls.resolve(elementId)?.data, "act"));
    sources.push(() => {
      const act = readProperty(controls.resolve(elementId)?.data, "act");
      return isRecord(act) && "on" in act;
    });
  }
  return sources;
}
