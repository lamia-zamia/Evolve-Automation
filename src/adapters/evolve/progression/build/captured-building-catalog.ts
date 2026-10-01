/**
 * Projects captured action controls into the Building settings catalog.
 *
 * This is intentionally a read-only adapter boundary. The game supplies the current root state,
 * element ids, and localized titles; the script supplies only its stable setting identity and
 * smart-management metadata. No manager, entity bridge, or compatibility object is consulted.
 */

import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../../ports/game-control-registry.ts";
import { readCapturedControlLabel } from "../../captured-control-label.ts";
import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "./captured-building-bindings.generated.ts";
import {
  bindingForBuildingElement,
  CAPTURED_BUILD_REGIONS,
  metadataForBuilding,
  readBuildingBindingByKey,
} from "./captured-building-metadata.ts";
import { isRecord, readProperty, splitActionId } from "../../../validation.ts";

export interface CapturedBuildingStructureDefinition {
  readonly entryKey: string;
  readonly region: string;
  readonly sector: string;
  readonly struct: string;
  readonly actionId: string;
  readTitle(): {
    readonly kind: "value" | "absent" | "invalid";
    readonly value?: string;
  };
}

export interface CapturedBuildingEntry {
  readonly binding: string;
  /** Full captured structure identity; short structure ids repeat across regions/sectors. */
  readonly entryKey: string | undefined;
  readonly elementId: string;
  readonly region: string;
  readonly sector: string | undefined;
  readonly id: string;
  readonly label: string;
  readonly switchable: boolean;
  readonly smart: boolean;
  readonly knowledge: boolean;
  readonly smartLinkedIds?: readonly string[];
  /** The current root record, retained only inside the adapter for filter predicates. */
  readonly state: Readonly<Record<string, unknown>>;
}

function readCapturedBuildingRootStateRecord(
  root: unknown,
  binding: string,
  act: Readonly<Record<string, unknown>> | undefined,
  structures: readonly CapturedBuildingStructureDefinition[],
): Readonly<Record<string, unknown>> | undefined {
  const parts = splitActionId(binding);
  if (parts === undefined || !CAPTURED_BUILD_REGIONS.has(parts.region)) {
    return undefined;
  }
  const matches = structures.filter(
    (structure) =>
      structure.actionId === binding &&
      structure.region === parts.region &&
      structure.struct === parts.id,
  );
  const states = matches.flatMap((structure) => {
    const region = readProperty(root, structure.region);
    const state = readProperty(region, structure.struct);
    return isRecord(state) ? [{ structure, state }] : [];
  });
  const exactAct =
    act === undefined ? undefined : states.find(({ state }) => state === act);
  if (exactAct !== undefined) return exactAct.state;
  if (states.length === 1) return states[0]!.state;
  if (states.length > 1) return undefined;

  // Some captured control records hold the live state while the structure is not yet present in
  // its region grid. Preserve that existing catalog behavior when no mechanics entry can join it.
  const candidate = readProperty(readProperty(root, parts.region), parts.id);
  return isRecord(candidate) && (act === undefined || candidate === act)
    ? candidate
    : undefined;
}

function readCapturedBuildingControlData(
  handle: GameControlHandle | undefined,
): Readonly<Record<string, unknown>> | undefined {
  const data = handle?.data;
  return isRecord(data) ? data : undefined;
}

export function readCapturedBuildingEntries(
  root: unknown,
  controls: GameControlRegistry,
  structures: readonly CapturedBuildingStructureDefinition[] = [],
): readonly Readonly<CapturedBuildingEntry>[] {
  const entries: CapturedBuildingEntry[] = [];
  const seen = new Set<string>();
  for (const elementId of controls.capturedElementIds()) {
    const binding = bindingForBuildingElement(elementId);
    const parts = splitActionId(binding);
    if (parts === undefined || !CAPTURED_BUILD_REGIONS.has(parts.region)) {
      continue;
    }
    const handle = controls.resolve(elementId);
    const data = readCapturedBuildingControlData(handle);
    const act = readProperty(data, "act");
    const state = readCapturedBuildingRootStateRecord(
      root,
      binding,
      isRecord(act) ? act : undefined,
      structures,
    );
    if (state === undefined) continue;
    const stateEntry = structures.find((structure) => {
      const region = readProperty(root, structure.region);
      return (
        structure.actionId === binding &&
        readProperty(region, structure.struct) === state
      );
    });
    const metadata = metadataForBuilding(binding);
    const liveState = isRecord(act) ? act : state;
    entries.push(
      Object.freeze({
        binding,
        entryKey: stateEntry?.entryKey,
        elementId,
        region: parts.region,
        sector: stateEntry?.sector,
        id: parts.id,
        label:
          handle === undefined
            ? binding
            : readCapturedControlLabel(handle, binding),
        switchable: Object.hasOwn(liveState, "on"),
        smart: metadata.smart,
        knowledge: metadata.knowledge,
        ...(metadata.smartLinkedIds === undefined
          ? {}
          : { smartLinkedIds: metadata.smartLinkedIds }),
        state,
      }),
    );
    seen.add(binding);
  }

  // Building controls are captured as their panels are drawn, while the mechanics registry is
  // complete from game startup. Fill still-undrawn actions only when the automation owns that
  // Building: registry membership alone does not add an automation entry. Priority ordering
  // remains the shared stored-priority sorter used by Building settings.
  for (const structure of structures) {
    const binding = structure.actionId;
    if (seen.has(binding)) continue;
    if (!CAPTURED_AUTOMATION_BUILDING_BINDINGS.has(binding)) continue;
    const parts = splitActionId(binding);
    if (
      parts === undefined ||
      !CAPTURED_BUILD_REGIONS.has(parts.region) ||
      parts.region !== structure.region
    ) {
      continue;
    }
    const region = readProperty(root, structure.region);
    const state = readProperty(region, structure.struct);
    if (!isRecord(state)) continue;
    const title = structure.readTitle();
    const metadata = metadataForBuilding(binding);
    entries.push(
      Object.freeze({
        binding,
        entryKey: structure.entryKey,
        elementId: binding,
        region: structure.region,
        sector: structure.sector,
        id: structure.struct,
        label: title.kind === "value" && title.value ? title.value : binding,
        switchable: Object.hasOwn(state, "on"),
        smart: metadata.smart,
        knowledge: metadata.knowledge,
        ...(metadata.smartLinkedIds === undefined
          ? {}
          : { smartLinkedIds: metadata.smartLinkedIds }),
        state,
      }),
    );
    seen.add(binding);
  }
  return Object.freeze(entries);
}

export function readCapturedBuildingBindingMap(
  entries: readonly Readonly<CapturedBuildingEntry>[],
): Record<string, string> {
  return readBuildingBindingByKey(entries.map((entry) => entry.binding));
}
