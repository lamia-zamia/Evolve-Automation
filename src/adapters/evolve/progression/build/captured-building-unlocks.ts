/** Building offers from retained native actions; no panel discovery is needed. */

import type {
  CapturedGameMechanics,
  CapturedGameRead,
  CapturedGameStructureDefinition,
} from "../../../../ports/captured-game-mechanics.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type {
  BuildingStateAddress,
  BuildingUnlockCatalog,
  GameBuildingUnlockCatalogReader,
} from "../../../../ports/game-building-unlocks.ts";
import { splitActionId } from "../../../validation.ts";
import { readCapturedBuildingUnlockStateRecords } from "./captured-building-unlock-observation.ts";
import {
  CAPTURED_BUILD_REGIONS,
  bindingForBuildingElement,
} from "./captured-building-metadata.ts";
import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "./captured-building-bindings.generated.ts";
import { readCapturedBuildingState } from "./captured-building-state.ts";
import {
  createCountTally,
  type PhaseTimingSink,
} from "../../../../utils/performance.ts";

export interface CapturedBuildingUnlocksDependencies {
  readonly rootState: GameRootStateSource;
  readonly mechanics: CapturedGameMechanics;
  readonly onSkipped?: (region: string, reason: string) => void;
  readonly diagnostics?: PhaseTimingSink | undefined;
}

export function createCapturedBuildingUnlocks(
  dependencies: CapturedBuildingUnlocksDependencies,
): GameBuildingUnlockCatalogReader {
  const { rootState, mechanics, diagnostics } = dependencies;
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
      let stateRecords: ReadonlyMap<
        string,
        Readonly<{ entryKey: string; state: Readonly<Record<string, unknown>> }>
      >;
      try {
        stateRecords = readCapturedBuildingUnlockStateRecords(
          root,
          nativeStructuresByBinding,
        );
      } catch {
        reportSkipped("*", "the native structure state catalog is invalid");
        return undefined;
      }

      const unlocked = new Set<string>();
      const sampled = new Set<string>();
      const switches = new Map<string, Readonly<BuildingStateAddress>>();
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
          const stateRecord = stateRecords.get(binding);
          const joined =
            candidates.length === 1
              ? candidates
              : stateRecord === undefined
                ? []
                : candidates.filter(
                    (structure) => structure.entryKey === stateRecord.entryKey,
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
          const entry = stateRecord?.entryKey === structure.entryKey;

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
          if (!entry || stateRecord === undefined) continue;
          let hasState: boolean | undefined;
          try {
            hasState = readCapturedBuildingState(
              root,
              { binding, state: stateRecord.state },
              structure,
              true,
            )?.hasState;
          } catch {
            hasState = undefined;
          }
          if (hasState === true) {
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
