/** A cheap witness for Building keys; it avoids materializing native action readers. */

import type { CapturedGameStructureIdentity } from "../../../../ports/captured-game-mechanics.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { isRecord, readProperty, splitActionId } from "../../../validation.ts";
import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "./captured-building-bindings.generated.ts";
import {
  bindingForBuildingElement,
  CAPTURED_BUILD_REGIONS,
} from "./captured-building-metadata.ts";

function sortBuildingGenerationFacts(
  facts: (readonly unknown[])[],
): readonly (readonly unknown[])[] {
  facts.sort((left, right) => {
    const leftKey = JSON.stringify(left);
    const rightKey = JSON.stringify(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return facts;
}

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
  return sortBuildingGenerationFacts(facts);
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
  return sortBuildingGenerationFacts(facts);
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
