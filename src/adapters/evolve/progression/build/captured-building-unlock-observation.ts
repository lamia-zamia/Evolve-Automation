/** Minimal current root-state observations used only by the Building unlock reader. */

import type { CapturedGameStructureDefinition } from "../../../../ports/captured-game-mechanics.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export interface CapturedBuildingUnlockStateRecord {
  readonly entryKey: string;
  readonly state: Readonly<Record<string, unknown>>;
}

/**
 * Mirrors the no-controls native-entry pass in `readCapturedBuildingEntries`: for each binding,
 * the first native definition with a current object state is the sole identity witness. The
 * unlock reader needs no label, settings metadata, or all-state index.
 */
export function readCapturedBuildingUnlockStateRecords(
  root: unknown,
  structuresByBinding: ReadonlyMap<
    string,
    readonly CapturedGameStructureDefinition[]
  >,
  requestedBindings: ReadonlySet<string>,
): ReadonlyMap<string, Readonly<CapturedBuildingUnlockStateRecord>> {
  const records = new Map<
    string,
    Readonly<CapturedBuildingUnlockStateRecord>
  >();
  // Scope by requested action binding, not structure.region: native state addresses may live in
  // another root region than the action prefix that owns the offer.
  for (const binding of requestedBindings) {
    const structures = structuresByBinding.get(binding);
    if (structures === undefined) continue;
    for (const structure of structures) {
      const state = readProperty(
        readProperty(root, structure.region),
        structure.struct,
      );
      if (!isRecord(state)) continue;
      records.set(
        binding,
        Object.freeze({ entryKey: structure.entryKey, state }),
      );
      break;
    }
  }
  return records;
}
