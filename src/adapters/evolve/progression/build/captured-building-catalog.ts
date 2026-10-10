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

interface CapturedBuildingStructureIndex {
  readonly structuresByBinding: ReadonlyMap<
    string,
    readonly CapturedBuildingStructureDefinition[]
  >;
  readonly statesByBinding: ReadonlyMap<
    string,
    readonly {
      readonly structure: CapturedBuildingStructureDefinition;
      readonly state: Readonly<Record<string, unknown>>;
    }[]
  >;
  readonly firstStructureByBindingAndState: ReadonlyMap<
    string,
    ReadonlyMap<
      Readonly<Record<string, unknown>>,
      CapturedBuildingStructureDefinition
    >
  >;
  readonly stateByStructure: ReadonlyMap<
    CapturedBuildingStructureDefinition,
    Readonly<Record<string, unknown>>
  >;
}

type CapturedBuildingStructuresByBinding = ReadonlyMap<
  string,
  readonly CapturedBuildingStructureDefinition[]
>;

function indexCapturedBuildingStructures(
  root: unknown,
  elementIds: readonly string[],
  structures: readonly CapturedBuildingStructureDefinition[],
  reusableStructuresByBinding?: CapturedBuildingStructuresByBinding,
): CapturedBuildingStructureIndex {
  const relevantBindings = new Set(CAPTURED_AUTOMATION_BUILDING_BINDINGS);
  for (const elementId of elementIds) {
    const binding = bindingForBuildingElement(elementId);
    const parts = splitActionId(binding);
    if (parts !== undefined && CAPTURED_BUILD_REGIONS.has(parts.region)) {
      relevantBindings.add(binding);
    }
  }
  let structuresByBinding: CapturedBuildingStructuresByBinding;
  if (reusableStructuresByBinding !== undefined) {
    structuresByBinding = reusableStructuresByBinding;
  } else {
    const indexed = new Map<string, CapturedBuildingStructureDefinition[]>();
    for (const structure of structures) {
      const binding = bindingForBuildingElement(structure.actionId);
      const matches = indexed.get(binding);
      if (matches === undefined) indexed.set(binding, [structure]);
      else matches.push(structure);
    }
    structuresByBinding = indexed;
  }

  const statesByBinding = new Map<
    string,
    {
      structure: CapturedBuildingStructureDefinition;
      state: Readonly<Record<string, unknown>>;
    }[]
  >();
  const firstStructureByBindingAndState = new Map<
    string,
    Map<Readonly<Record<string, unknown>>, CapturedBuildingStructureDefinition>
  >();
  const stateByStructure = new Map<
    CapturedBuildingStructureDefinition,
    Readonly<Record<string, unknown>>
  >();
  for (const [binding, matches] of structuresByBinding) {
    if (!relevantBindings.has(binding)) continue;
    const states: {
      structure: CapturedBuildingStructureDefinition;
      state: Readonly<Record<string, unknown>>;
    }[] = [];
    const firstStructureByState = new Map<
      Readonly<Record<string, unknown>>,
      CapturedBuildingStructureDefinition
    >();
    for (const structure of matches) {
      const region = readProperty(root, structure.region);
      const state = readProperty(region, structure.struct);
      if (!isRecord(state)) continue;
      states.push({ structure, state });
      if (!firstStructureByState.has(state)) {
        firstStructureByState.set(state, structure);
      }
      stateByStructure.set(structure, state);
    }
    if (states.length > 0) statesByBinding.set(binding, states);
    if (firstStructureByState.size > 0) {
      firstStructureByBindingAndState.set(binding, firstStructureByState);
    }
  }
  return {
    structuresByBinding,
    statesByBinding,
    firstStructureByBindingAndState,
    stateByStructure,
  };
}

function readCapturedBuildingRootStateRecord(
  root: unknown,
  binding: string,
  act: Readonly<Record<string, unknown>> | undefined,
  structureIndex: CapturedBuildingStructureIndex,
): Readonly<Record<string, unknown>> | undefined {
  const parts = splitActionId(binding);
  if (parts === undefined || !CAPTURED_BUILD_REGIONS.has(parts.region)) {
    return undefined;
  }
  const matches = structureIndex.structuresByBinding.get(binding) ?? [];
  const states = structureIndex.statesByBinding.get(binding) ?? [];
  const exactAct =
    act === undefined ? undefined : states.find(({ state }) => state === act);
  if (exactAct !== undefined) return exactAct.state;
  if (states.length === 1) return states[0]!.state;
  if (states.length > 1) return undefined;
  if (matches.length > 0) return undefined;

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
  reusableStructuresByBinding?: CapturedBuildingStructuresByBinding,
): readonly Readonly<CapturedBuildingEntry>[] {
  const entries: CapturedBuildingEntry[] = [];
  const seen = new Set<string>();
  const elementIds = controls.capturedElementIds();
  const structureIndex = indexCapturedBuildingStructures(
    root,
    elementIds,
    structures,
    reusableStructuresByBinding,
  );
  for (const elementId of elementIds) {
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
      structureIndex,
    );
    if (state === undefined) continue;
    const stateEntry = structureIndex.firstStructureByBindingAndState
      .get(binding)
      ?.get(state);
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

  // The mechanics registry is complete before Building controls are drawn. Add managed native
  // structures from that registry even when no control exists; registry membership alone still
  // does not add an automation entry. Priority ordering remains the shared stored-priority sorter.
  for (const structure of structures) {
    const binding = bindingForBuildingElement(structure.actionId);
    if (seen.has(binding)) continue;
    if (!CAPTURED_AUTOMATION_BUILDING_BINDINGS.has(binding)) continue;
    const parts = splitActionId(binding);
    if (parts === undefined || !CAPTURED_BUILD_REGIONS.has(parts.region)) {
      continue;
    }
    const state = structureIndex.stateByStructure.get(structure);
    if (state === undefined) continue;
    const title = structure.readTitle();
    const metadata = metadataForBuilding(binding);
    entries.push(
      Object.freeze({
        binding,
        entryKey: structure.entryKey,
        elementId: binding,
        region: parts.region,
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
