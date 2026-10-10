/** Building offers from retained native actions; no panel discovery is needed. */

import type {
  CapturedGameMechanics,
  CapturedGameRead,
  CapturedGameStructureDefinition,
} from "../../../../ports/captured-game-mechanics.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type {
  BuildingStateAddress,
  BuildingUnlockCatalog,
  GameBuildingUnlockCatalogReader,
} from "../../../../ports/game-building-unlocks.ts";
import { splitActionId } from "../../../validation.ts";
import {
  readCapturedBuildingEntries,
  type CapturedBuildingEntry,
} from "./captured-building-catalog.ts";
import {
  CAPTURED_BUILD_REGIONS,
  bindingForBuildingElement,
} from "./captured-building-metadata.ts";
import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "./captured-building-bindings.generated.ts";
import {
  readCapturedBuildingState,
  type CapturedBuildingState,
} from "./captured-building-state.ts";
import {
  createCountTally,
  type PhaseTimingSink,
} from "../../../../utils/performance.ts";

export interface CapturedBuildingUnlocksDependencies {
  readonly rootState: GameRootStateSource;
  readonly mechanics: CapturedGameMechanics;
  readonly controls: GameControlRegistry;
  readonly onSkipped?: (region: string, reason: string) => void;
  readonly diagnostics?: PhaseTimingSink | undefined;
}

export function createCapturedBuildingUnlocks(
  dependencies: CapturedBuildingUnlocksDependencies,
): GameBuildingUnlockCatalogReader {
  const { rootState, mechanics, controls, diagnostics } = dependencies;
  const reportSkipped = dependencies.onSkipped ?? (() => {});
  const bindingsByRegion = new Map<string, readonly string[]>();
  for (const binding of CAPTURED_AUTOMATION_BUILDING_BINDINGS) {
    const region = splitActionId(binding)?.region;
    if (region === undefined) continue;
    const bindings = bindingsByRegion.get(region) ?? [];
    bindingsByRegion.set(region, [...bindings, binding]);
  }
  let indexedStructures: readonly CapturedGameStructureDefinition[] | undefined;
  let structuresByBinding:
    ReadonlyMap<string, readonly CapturedGameStructureDefinition[]> | undefined;
  const readStructuresByBinding = (
    structures: readonly CapturedGameStructureDefinition[],
  ): ReadonlyMap<string, readonly CapturedGameStructureDefinition[]> => {
    if (indexedStructures === structures && structuresByBinding !== undefined)
      return structuresByBinding;
    const indexed = new Map<string, CapturedGameStructureDefinition[]>();
    for (const structure of structures) {
      const binding = bindingForBuildingElement(structure.actionId);
      if (!CAPTURED_AUTOMATION_BUILDING_BINDINGS.has(binding)) continue;
      const group = indexed.get(binding);
      if (group === undefined) indexed.set(binding, [structure]);
      else group.push(structure);
    }
    indexedStructures = structures;
    structuresByBinding = indexed;
    return indexed;
  };
  const stateAddressControls: GameControlRegistry = {
    ...controls,
    // Control captures are mutation capabilities. They must not decide which native
    // structures the semantic catalog can identify.
    capturedElementIds: () => [],
  };

  return Object.freeze({
    read(
      regions: ReadonlySet<string>,
    ): Readonly<BuildingUnlockCatalog> | undefined {
      if (regions.size === 0) return undefined;
      const tally = createCountTally(diagnostics);
      const root = rootState.readRoot();
      if (root === undefined) {
        reportSkipped("*", "the game root has not been captured yet");
        return undefined;
      }
      let structures: readonly CapturedGameStructureDefinition[] | undefined;
      try {
        structures = mechanics.readStructures();
      } catch {
        structures = undefined;
      }
      if (structures === undefined) {
        reportSkipped("*", "the native structure catalog is unavailable");
        return undefined;
      }

      const nativeStructuresByBinding = readStructuresByBinding(structures);
      let entries: readonly Readonly<CapturedBuildingEntry>[];
      try {
        entries = readCapturedBuildingEntries(
          root,
          stateAddressControls,
          structures,
          nativeStructuresByBinding,
        );
      } catch {
        reportSkipped("*", "the native structure state catalog is invalid");
        return undefined;
      }

      const unlocked = new Set<string>();
      const sampled = new Set<string>();
      const switches = new Map<string, Readonly<BuildingStateAddress>>();
      const entriesByBinding = new Map<
        string,
        Readonly<CapturedBuildingEntry>[]
      >();
      for (const entry of entries) {
        const group = entriesByBinding.get(entry.binding);
        if (group === undefined) entriesByBinding.set(entry.binding, [entry]);
        else group.push(entry);
      }
      for (const region of regions) {
        if (!CAPTURED_BUILD_REGIONS.has(region)) {
          reportSkipped(region, "not an automation Building region");
          continue;
        }
        const regionBindings = bindingsByRegion.get(region) ?? [];
        const regionUnlocked = new Set<string>();
        const regionSwitches = new Map<
          string,
          Readonly<BuildingStateAddress>
        >();
        let complete = true;
        for (const binding of regionBindings) {
          const candidates = nativeStructuresByBinding.get(binding) ?? [];
          const candidateEntries = (entriesByBinding.get(binding) ?? []).filter(
            (entry) => entry.entryKey !== undefined,
          );
          const joined =
            candidates.length === 1
              ? candidates
              : candidates.filter((structure) =>
                  candidateEntries.some(
                    (entry) => entry.entryKey === structure.entryKey,
                  ),
                );
          if (joined.length !== 1) {
            complete = false;
            tally.count("building-unlocks.unjoined-native-action");
            reportSkipped(
              region,
              candidates.length === 0
                ? `no captured native action for ${binding}`
                : `the captured native identity for ${binding} is ambiguous`,
            );
            break;
          }
          const structure = joined[0]!;
          const entry = candidateEntries.find(
            (candidate) => candidate.entryKey === structure.entryKey,
          );
          if (
            candidateEntries.length > 0 &&
            (entry === undefined || candidateEntries.length !== 1)
          ) {
            complete = false;
            tally.count("building-unlocks.unjoined-state-identity");
            reportSkipped(
              region,
              `the captured root state for ${binding} has no unique native entry key`,
            );
            break;
          }

          let availability: CapturedGameRead<boolean>;
          try {
            availability = structure.readAvailability(root);
          } catch {
            availability = { kind: "invalid" as const };
          }
          if (availability.kind !== "value") {
            complete = false;
            tally.count("building-unlocks.invalid-availability");
            reportSkipped(
              region,
              `native availability for ${binding} is ${availability.kind}`,
            );
            break;
          }
          tally.count(
            availability.value
              ? "building-unlocks.offered"
              : "building-unlocks.unavailable",
          );
          if (!availability.value) continue;

          regionUnlocked.add(binding);
          if (entry === undefined) continue;
          let state: Readonly<CapturedBuildingState> | undefined;
          try {
            state = readCapturedBuildingState(root, entry, structure, true);
          } catch {
            state = undefined;
          }
          if (state?.hasState === true) {
            regionSwitches.set(
              binding,
              Object.freeze({
                region: structure.region,
                type: structure.struct,
              }),
            );
          }
        }
        if (!complete) continue;
        for (const binding of regionUnlocked) unlocked.add(binding);
        for (const [binding, address] of regionSwitches)
          switches.set(binding, address);
        sampled.add(region);
      }
      if (sampled.size === 0) return undefined;
      return Object.freeze({
        unlocked,
        regions: sampled,
        switches,
      });
    },
  });
}
