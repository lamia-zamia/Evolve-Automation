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
import {
  bindingForBuildingElement,
  CAPTURED_BUILD_REGIONS,
  metadataForBuilding,
  readBuildingBindingByKey,
} from "./captured-building-metadata.ts";
import { isRecord, readProperty, splitActionId } from "../../../validation.ts";

export interface CapturedBuildingEntry {
  readonly binding: string;
  readonly elementId: string;
  readonly region: string;
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
): Readonly<Record<string, unknown>> | undefined {
  const parts = splitActionId(binding);
  if (parts === undefined || !CAPTURED_BUILD_REGIONS.has(parts.region)) {
    return undefined;
  }
  const candidate = readProperty(readProperty(root, parts.region), parts.id);
  if (isRecord(candidate) && (act === undefined || candidate === act)) {
    return candidate;
  }
  if (act !== undefined && isRecord(root)) {
    for (const region of Object.keys(root)) {
      const records = readProperty(root, region);
      if (!isRecord(records)) continue;
      for (const id of Object.keys(records)) {
        if (records[id] === act && isRecord(records[id])) return records[id];
      }
    }
  }
  return isRecord(candidate) ? candidate : undefined;
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
): readonly Readonly<CapturedBuildingEntry>[] {
  const entries: CapturedBuildingEntry[] = [];
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
    );
    if (state === undefined) continue;
    const metadata = metadataForBuilding(binding);
    const liveState = isRecord(act) ? act : state;
    entries.push(
      Object.freeze({
        binding,
        elementId,
        region: parts.region,
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
  }
  return Object.freeze(entries);
}

export function readCapturedBuildingBindingMap(
  entries: readonly Readonly<CapturedBuildingEntry>[],
): Record<string, string> {
  return readBuildingBindingByKey(entries.map((entry) => entry.binding));
}
