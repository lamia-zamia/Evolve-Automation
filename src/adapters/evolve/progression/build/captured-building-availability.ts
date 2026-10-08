/** DeadSpace 6cc9ba8c: checkRequirements, checkTechQualifications, checkCityRequirements,
 * gridEnabled region gates and the retired Building's high-level visibility gates.
 * Action callbacks remain inside the mechanics adapter; no panel discovery is needed.
 */
import type {
  CapturedGameRead,
  CapturedGameMechanics,
  CapturedGameStructureDefinition,
} from "../../../../ports/captured-game-mechanics.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";
import { readCapturedBuildingEntries } from "./captured-building-catalog.ts";
import {
  readCapturedBuildingState,
  type CapturedBuildingState,
} from "./captured-building-state.ts";

export interface CapturedSemanticBuildingSample {
  readonly buildings: readonly CapturedBuildingState[];
  readCurrent(expected: {
    readonly id: string;
    readonly binding: string;
  }): CapturedBuildingState | undefined;
}

export function readCapturedActionAvailability(
  root: unknown,
  action: Readonly<Record<string, unknown>>,
  region: string,
  sector: string,
  struct: string,
  info: Readonly<Record<string, unknown>> | false,
): CapturedGameRead<boolean> {
  try {
    const race = readProperty(root, "race");
    const tech = readProperty(root, "tech");
    const genes = readProperty(root, "genes");
    const settings = readProperty(root, "settings");
    if (
      !isNonArrayRecord(race) ||
      !isNonArrayRecord(tech) ||
      !isNonArrayRecord(settings)
    )
      return { kind: "invalid" };
    const flag = (key: string) => Boolean(readProperty(race, key));
    const visibility: Readonly<Record<string, string>> = {
      city: "showCity",
      space: "showSpace",
      interstellar: "showDeep",
      galaxy: "showGalactic",
      portal: "showPortal",
      tauceti: "showTau",
      eden: "showEden",
    };
    const visible =
      region === "space" && info && readProperty(info, "zone") === "outer"
        ? "showOuter"
        : visibility[region];
    if (visible !== undefined && !readProperty(settings, visible))
      return { kind: "value", value: false };
    // gridEnabled keeps the racial replicator available on otherwise suppressed city paths.
    if (
      region === "city" &&
      !(struct === "replicator" && flag("replicator")) &&
      (flag("cataclysm") ||
        flag("orbit_decayed") ||
        readProperty(tech, "isolation") ||
        flag("warlord") ||
        flag("iceage"))
    ) {
      return { kind: "value", value: false };
    }
    if (
      region === "space" &&
      (readProperty(tech, "isolation") || flag("warlord") || flag("iceage"))
    )
      return { kind: "value", value: false };
    if (sector === "spc_moon" && flag("orbit_decayed"))
      return { kind: "value", value: false };
    const citySpecial =
      region === "city" && (flag("kindling_kindred") || flag("smoldering"));
    if (citySpecial && struct === "lumber")
      return { kind: "value", value: false };
    // checkCityRequirements offers stone directly for these races, before setAction qualifications.
    if (!(citySpecial && struct === "stone")) {
      const path = readProperty(action, "path");
      if (path !== undefined) {
        if (
          !Array.isArray(path) ||
          path.some((value) => typeof value !== "string")
        )
          return { kind: "invalid" };
        if (!path.includes(flag("truepath") ? "truepath" : "standard"))
          return { kind: "value", value: false };
      }
      const reqs = readProperty(action, "reqs");
      if (!isNonArrayRecord(reqs)) return { kind: "invalid" };
      for (const [key, required] of Object.entries(reqs)) {
        if (typeof required !== "number" || !Number.isFinite(required))
          return { kind: "invalid" };
        const current = readProperty(tech, key);
        if (
          current !== undefined &&
          (typeof current !== "number" || !Number.isFinite(current))
        )
          return { kind: "invalid" };
        if (!current || Number(current) < required)
          return { kind: "value", value: false };
      }
      const grant = readProperty(action, "grant");
      if (grant) {
        if (
          !Array.isArray(grant) ||
          typeof grant[0] !== "string" ||
          typeof grant[1] !== "number"
        )
          return { kind: "invalid" };
        const current = readProperty(tech, grant[0]);
        if (
          current !== undefined &&
          (typeof current !== "number" || !Number.isFinite(current))
        )
          return { kind: "invalid" };
        if (current && Number(current) >= grant[1])
          return { kind: "value", value: false };
      }
    }
    const condition = readProperty(action, "condition");
    if (condition !== undefined) {
      if (typeof condition !== "function") return { kind: "invalid" };
      const result: unknown = Reflect.apply(condition, action, []);
      if (result === undefined) return { kind: "invalid" };
      if (!result) return { kind: "value", value: false };
    }
    for (const [key, owner, required] of [
      ["not_trait", race, false],
      ["trait", race, true],
      ["not_gene", genes, false],
      ["gene", genes, true],
      ["not_tech", tech, false],
    ] as const) {
      const names = readProperty(action, key);
      if (names === undefined) continue;
      if (
        !Array.isArray(names) ||
        names.some((name) => typeof name !== "string") ||
        !isNonArrayRecord(owner)
      )
        return { kind: "invalid" };
      for (const name of names) {
        if (Boolean(readProperty(owner, name)) !== required)
          return { kind: "value", value: false };
      }
    }
    return { kind: "value", value: true };
  } catch {
    return { kind: "invalid" };
  }
}

export function readCapturedSemanticBuildingSample(
  root: unknown,
  controls: GameControlRegistry,
  mechanics: CapturedGameMechanics,
  isCurrent: () => boolean = () => true,
): CapturedSemanticBuildingSample | undefined {
  const structures = mechanics.readStructures();
  if (structures === undefined) return undefined;
  const structuresByAction = new Map<
    string,
    CapturedGameStructureDefinition[]
  >();
  const structuresByActionAndEntryKey = new Map<
    string,
    Map<string, CapturedGameStructureDefinition[]>
  >();
  for (const structure of structures) {
    const actionMatches = structuresByAction.get(structure.actionId);
    if (actionMatches === undefined)
      structuresByAction.set(structure.actionId, [structure]);
    else actionMatches.push(structure);
    let keyedMatches = structuresByActionAndEntryKey.get(structure.actionId);
    if (keyedMatches === undefined) {
      keyedMatches = new Map();
      structuresByActionAndEntryKey.set(structure.actionId, keyedMatches);
    }
    const entryMatches = keyedMatches.get(structure.entryKey);
    if (entryMatches === undefined)
      keyedMatches.set(structure.entryKey, [structure]);
    else entryMatches.push(structure);
  }
  const result: CapturedBuildingState[] = [];
  const statesByBinding = new Map<string, CapturedBuildingState>();
  // The complete registry defines Power identities and discovery fallback order. Controls do not
  // promote unmanaged actions or mutate native grid order.
  const semanticCatalog = readCapturedBuildingEntries(
    root,
    { ...controls, capturedElementIds: () => [] },
    structures,
  );
  for (const entry of semanticCatalog) {
    const candidates =
      entry.entryKey === undefined
        ? structuresByAction.get(entry.binding)
        : structuresByActionAndEntryKey.get(entry.binding)?.get(entry.entryKey);
    if (candidates === undefined || candidates.length !== 1) return undefined;
    const structure = candidates[0]!;
    const available = structure.readAvailability(root);
    if (available.kind !== "value") return undefined;
    const state = readCapturedBuildingState(
      root,
      entry,
      structure,
      available.value,
    );
    if (state === undefined) return undefined;
    if (statesByBinding.has(entry.binding)) return undefined;
    statesByBinding.set(entry.binding, state);
    result.push(state);
  }
  const buildings = Object.freeze(result);
  return Object.freeze({
    buildings,
    readCurrent(expected: {
      readonly id: string;
      readonly binding: string;
    }): CapturedBuildingState | undefined {
      if (!isCurrent()) return undefined;
      const sampled = statesByBinding.get(expected.binding);
      const structure = sampled?.structure;
      if (
        sampled === undefined ||
        sampled.catalog.id !== expected.id ||
        structure === undefined ||
        !structure.matchesCurrentIdentity()
      )
        return undefined;
      const liveState = readProperty(
        readProperty(root, structure.region),
        structure.struct,
      );
      if (liveState !== sampled.catalog.state) return undefined;
      const currentAvailability = structure.readAvailability(root);
      if (currentAvailability.kind !== "value") return undefined;
      const current = readCapturedBuildingState(
        root,
        sampled.catalog,
        structure,
        currentAvailability.value,
      );
      return current !== undefined &&
        isCurrent() &&
        structure.matchesCurrentIdentity()
        ? current
        : undefined;
    },
  });
}

export function readCapturedSemanticBuildingStates(
  root: unknown,
  controls: GameControlRegistry,
  mechanics: CapturedGameMechanics,
): readonly CapturedBuildingState[] | undefined {
  return readCapturedSemanticBuildingSample(root, controls, mechanics)
    ?.buildings;
}
