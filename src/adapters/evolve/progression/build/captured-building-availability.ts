/** DeadSpace db38e2af: checkRequirements, checkTechQualifications, checkCityRequirements,
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
import {
  SPACE_TAB_ACTION_LOCATIONS,
  SPACE_TAB_INDEX,
  SPACE_TAB_SHOWN_BY,
} from "../../captured-tab-discovery.ts";
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

interface CapturedActionAvailabilityOptions {
  readonly ignoreOuterTabVisibility?: boolean;
}

export function readCapturedActionAvailability(
  root: unknown,
  action: Readonly<Record<string, unknown>>,
  region: string,
  sector: string,
  struct: string,
  info: Readonly<Record<string, unknown>> | false,
  options: Readonly<CapturedActionAvailabilityOptions> = {},
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
    if (
      visible !== undefined &&
      !readProperty(settings, visible) &&
      !(options.ignoreOuterTabVisibility && visible === "showOuter")
    )
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

const SPACE_SECTOR_PANEL_PREFIX = "spc_";

function capturedSpaceSectorSetting(sector: string): string {
  // DeadSpace `renderSpace()` derives the user-facing panel toggle by removing this prefix.
  return sector.startsWith(SPACE_SECTOR_PANEL_PREFIX)
    ? sector.slice(SPACE_SECTOR_PANEL_PREFIX.length)
    : sector;
}

interface CapturedBuildingControlRendererGate {
  readonly sectorPrefix: string;
  readonly settingsKey: string;
  readonly techGate?: {
    readonly key: string;
    readonly minimumLevel: number;
  };
}

/** The exact per-region gates used by these DeadSpace renderers before their action loop. */
const CAPTURED_BUILD_CONTROL_RENDERER_GATES: Readonly<
  Record<string, CapturedBuildingControlRendererGate>
> = Object.freeze({
  interstellar: Object.freeze({ sectorPrefix: "int_", settingsKey: "space" }),
  galaxy: Object.freeze({ sectorPrefix: "gxy_", settingsKey: "space" }),
  portal: Object.freeze({
    sectorPrefix: "prtl_",
    settingsKey: "portal",
    techGate: Object.freeze({ key: "portal", minimumLevel: 2 }),
  }),
  tauceti: Object.freeze({
    sectorPrefix: "tau_",
    settingsKey: "tau",
    techGate: Object.freeze({ key: "tauceti", minimumLevel: 2 }),
  }),
  eden: Object.freeze({
    sectorPrefix: "eden_",
    settingsKey: "eden",
    techGate: Object.freeze({ key: "edenic", minimumLevel: 3 }),
  }),
});

function readCapturedBuildingControlRendererGate(
  root: unknown,
  sector: string,
  gate: Readonly<CapturedBuildingControlRendererGate>,
): CapturedGameRead<boolean> {
  if (gate.techGate !== undefined) {
    const tech = readProperty(root, "tech");
    if (!isNonArrayRecord(tech)) return { kind: "invalid" };
    const level = readProperty(tech, gate.techGate.key);
    // The pinned `portal`, `tauceti`, and `edenic` renderer gates treat an uninitialized tech
    // field as hidden through `if (!global.tech[field] || global.tech[field] < N)`.
    if (level === undefined || level === 0)
      return { kind: "value", value: false };
    if (typeof level !== "number" || !Number.isFinite(level))
      return { kind: "invalid" };
    if (level < gate.techGate.minimumLevel)
      return { kind: "value", value: false };
  }

  const settings = readProperty(root, "settings");
  const regions = readProperty(settings, gate.settingsKey);
  if (!isNonArrayRecord(regions)) return { kind: "invalid" };
  const key = sector.replace(gate.sectorPrefix, "");
  // Each native renderer uses `if (settings.<regions>[show])`; a missing key is hidden.
  return {
    kind: "value",
    value: Boolean(readProperty(regions, key)),
  };
}

/**
 * DeadSpace `renderSpace()` first applies action qualification, then `settings.space[show]`, and
 * only filters `info.zone` when `race.truepath` draws separate inner/outer panels. On standard
 * routes, the inner render can contain rows whose info zone is outer.
 */
export function readCapturedActionControlAvailabilityForTab(
  root: unknown,
  action: Readonly<Record<string, unknown>>,
  region: string,
  sector: string,
  struct: string,
  info: Readonly<Record<string, unknown>> | false,
  tabIndex: number,
): CapturedGameRead<boolean> {
  const location = SPACE_TAB_ACTION_LOCATIONS[tabIndex];
  if (location === undefined) return { kind: "invalid" };
  if (location.region !== region) return { kind: "value", value: false };
  const settings = readProperty(root, "settings");
  if (!isNonArrayRecord(settings)) return { kind: "invalid" };
  const shownBy = SPACE_TAB_SHOWN_BY[tabIndex];
  if (shownBy === undefined) return { kind: "invalid" };
  // The discovery sweep only draws a native Civilization sub-tab the game currently exposes.
  if (!readProperty(settings, shownBy)) return { kind: "value", value: false };
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  const truepath = Boolean(readProperty(race, "truepath"));
  // DeadSpace `renderSpace()` deliberately leaves the home panel without action rows on cataclysm
  // runs and on orbit-decayed runs until Resettle restores Earth.
  if (
    region === "space" &&
    sector === "spc_home" &&
    (Boolean(readProperty(race, "cataclysm")) ||
      (Boolean(readProperty(race, "orbit_decayed")) &&
        !readProperty(tech, "resettle")))
  )
    return { kind: "value", value: false };

  const rendererGate = CAPTURED_BUILD_CONTROL_RENDERER_GATES[region];
  if (rendererGate !== undefined) {
    const renderability = readCapturedBuildingControlRendererGate(
      root,
      sector,
      rendererGate,
    );
    if (renderability.kind !== "value" || !renderability.value)
      return renderability;
  }

  const ignoreOuterTabVisibility =
    region === "space" && tabIndex === SPACE_TAB_INDEX.space && !truepath;
  const availability = readCapturedActionAvailability(
    root,
    action,
    region,
    sector,
    struct,
    info,
    { ignoreOuterTabVisibility },
  );
  if (availability.kind !== "value" || !availability.value) return availability;
  if (region !== "space") return availability;
  if (!readProperty(settings, "showSpace"))
    return { kind: "value", value: false };

  if (!truepath && tabIndex !== SPACE_TAB_INDEX.space)
    return { kind: "value", value: false };
  if (truepath) {
    if (info === false) return { kind: "invalid" };
    const rawZone = readProperty(info, "zone");
    if (rawZone === undefined) return { kind: "value", value: false };
    if (rawZone !== "inner" && rawZone !== "outer") return { kind: "invalid" };
    if (location.zone !== rawZone) return { kind: "value", value: false };
  }

  const sectorSettings = readProperty(settings, "space");
  if (!isNonArrayRecord(sectorSettings)) return { kind: "invalid" };
  const show = capturedSpaceSectorSetting(sector);
  // Upstream uses `if (global.settings.space[show])`; a lazy absent sector flag is hidden.
  return {
    kind: "value",
    value: Boolean(readProperty(sectorSettings, show)),
  };
}

export function readCapturedSemanticBuildingSample(
  root: unknown,
  controls: GameControlRegistry,
  mechanics: CapturedGameMechanics,
  isCurrent: () => boolean = () => true,
): CapturedSemanticBuildingSample | undefined {
  const structures = mechanics.readStructures();
  if (structures === undefined) return undefined;
  return readCapturedSemanticBuildingSampleFromStructures(
    root,
    controls,
    structures,
    isCurrent,
  );
}

export function readCapturedSemanticBuildingSampleFromStructures(
  root: unknown,
  controls: GameControlRegistry,
  structures: readonly CapturedGameStructureDefinition[],
  isCurrent: () => boolean = () => true,
): CapturedSemanticBuildingSample | undefined {
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
  if (!isCurrent()) return undefined;
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
