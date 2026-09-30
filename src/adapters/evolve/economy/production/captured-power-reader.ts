/** Strict Power sampling over the live root and the captured DeadSpace mechanics port. */

import type {
  PowerCycleInput,
  PowerSettingsInput,
  PowerWarnBuildingInput,
} from "../../../../domain/economy/production/power.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type {
  CapturedGameMechanics,
  CapturedGameStructureDefinition,
} from "../../../../ports/captured-game-mechanics.ts";
import type { PowerReader } from "../../../../ports/power.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

export interface CapturedPowerReaderRuntimeOptions {
  readonly settings: PowerSettingsInput;
  readonly debug: boolean;
  readonly consumptionBalanceMinimum: number;
}

export interface CapturedPowerReaderDependencies {
  readonly rootState: GameRootStateSource;
  readonly mechanics: CapturedGameMechanics;
  /** Script settings and debug/threshold values that do not live on the game root. */
  readonly readRuntimeOptions: () =>
    CapturedPowerReaderRuntimeOptions | undefined;
  /** Warning rows are sampled by the existing warning DOM adapter. */
  readonly readWarnings: (
    domIds: readonly string[],
  ) => readonly PowerWarnBuildingInput[];
}

/**
 * The game reads structure state from `global[region][struct].on`; a region or structure can be
 * absent before it is initialized, which the normal Power pass treats as off. `binding` is the
 * complete captured grid key, so duplicate short structure names in different sectors stay
 * distinct.
 */
function readCapturedPowerStateOn(
  root: unknown,
  structure: CapturedGameStructureDefinition,
): number | undefined {
  const region = readProperty(root, structure.region);
  const state = readProperty(region, structure.struct);
  if (state === undefined) return 0;
  if (!isRecord(state)) return undefined;
  const rawOn = readProperty(state, "on");
  if (rawOn === undefined) return 0;
  return finite(rawOn);
}

function readCapturedPowerStructures(
  root: unknown,
  mechanics: CapturedGameMechanics,
): readonly CapturedGameStructureDefinition[] | undefined {
  const readOrder = mechanics.readPowerOrder(root);
  if (readOrder.kind !== "value") return undefined;
  for (const structure of readOrder.value) {
    if (readCapturedPowerStateOn(root, structure) === undefined) {
      return undefined;
    }
  }
  return readOrder.value;
}

function readCapturedSupportSemantics(
  root: unknown,
  mechanics: CapturedGameMechanics,
  structures: readonly CapturedGameStructureDefinition[],
): boolean {
  const supportTypes = new Set<string>();
  for (const structure of structures) {
    const typesRead = structure.readSupportTypes();
    if (typesRead.kind === "invalid") return false;
    if (typesRead.kind === "value") {
      for (const type of typesRead.value) supportTypes.add(type);
    }
    const providerRead = structure.readSupportProvider();
    if (providerRead.kind === "invalid") return false;
    const topologyRead = structure.readSupportTopology();
    if (topologyRead.kind !== "value") return false;
    if (topologyRead.value.enabled.kind === "invalid") return false;
  }

  // Root support arrays, like root.power, define live order. The captured registry is only used
  // to resolve those full keys. Read each ordered list before using any support action facts.
  for (const type of supportTypes) {
    const ordered = mechanics.readSupportOrder(root, type);
    if (ordered.kind !== "value") return false;
    for (const structure of ordered.value) {
      const supportValue = structure.readSupportValue(type);
      if (supportValue.kind !== "value") return false;
      const fuel = structure.readSupportFuel();
      if (fuel.kind === "invalid") return false;
      const adjusted = structure.readSupportFuelAdjustmentDisabled();
      if (adjusted.kind === "invalid") return false;
    }
  }
  return true;
}

/**
 * Captures exact structure state, root-defined ordering, and support semantics for the next
 * Power reader extension. This slice deliberately declines to produce a planner input until the
 * mechanics port also captures the complete resource/building catalog and the effective runtime
 * values used by `main.js`. Those gaps include adjusted generator/support output, adjusted fuel,
 * inactive structures' consumes/produces definitions, and the special-rule observations; the
 * production ledger alone cannot answer those questions.
 */
export function createCapturedPowerReader({
  rootState,
  mechanics,
  readRuntimeOptions,
  readWarnings,
}: CapturedPowerReaderDependencies): PowerReader {
  return Object.freeze({
    readCycle(): PowerCycleInput | undefined {
      const root = rootState.readRoot();
      if (root === undefined) return undefined;

      let runtimeOptions: CapturedPowerReaderRuntimeOptions | undefined;
      try {
        runtimeOptions = readRuntimeOptions();
      } catch {
        return undefined;
      }
      if (
        runtimeOptions === undefined ||
        !Number.isFinite(runtimeOptions.consumptionBalanceMinimum)
      ) {
        return undefined;
      }

      const registry = mechanics.readStructures();
      const production = mechanics.readProductionBreakdown();
      const ordered = readCapturedPowerStructures(root, mechanics);
      if (
        registry === undefined ||
        production === undefined ||
        ordered === undefined ||
        !readCapturedSupportSemantics(root, mechanics, registry)
      ) {
        return undefined;
      }

      // Keep the captures live and exact while the remaining narrow semantics are added. In
      // particular, do not turn raw powered()/p_fuel() values or whichever ledger entries happen
      // to exist this tick into approximations of the missing effective/catalog values.
      void ordered;
      void production;
      return undefined;
    },

    readWarnings(domIds: readonly string[]): readonly PowerWarnBuildingInput[] {
      return readWarnings(domIds);
    },

    readStateOn(binding: string): number {
      const root = rootState.readRoot();
      const structures = mechanics.readStructures();
      if (root === undefined || structures === undefined) {
        throw new TypeError("captured Power structure registry is unavailable");
      }
      const matches = structures.filter(
        (structure) => structure.entryKey === binding,
      );
      const structure = matches[0];
      if (matches.length !== 1 || structure === undefined) {
        throw new TypeError(`captured Power binding ${binding} is unavailable`);
      }
      const stateOn = readCapturedPowerStateOn(root, structure);
      if (stateOn === undefined) {
        throw new TypeError(`captured Power state for ${binding} is invalid`);
      }
      return stateOn;
    },
  });
}
