/** Strict Power sampling from the live root, captured Building catalog and DeadSpace mechanics. */

import type {
  PowerBuildingInput,
  PowerBuildingRule,
  PowerConsumptionInput,
  PowerCycleInput,
  PowerBeltConsumerInput,
  PowerLakeInput,
  PowerResourceInput,
  PowerSupportInput,
  PowerSupportChangeInput,
  PowerSettingsInput,
  PowerSpireBuildingInput,
  PowerSpireInput,
  PowerWarnBuildingInput,
} from "../../../../domain/economy/production/power.ts";
import { sortByStoredPriority } from "../../../../domain/settings-priority-order.ts";
import { type CapturedBuildingState } from "../../progression/build/captured-building-state.ts";
import { readCapturedSemanticBuildingSampleFromStructures } from "../../progression/build/captured-building-availability.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type {
  CapturedGameMechanics,
  CapturedGameStructureDefinition,
  CapturedFuelAdjustmentMode,
  CapturedProductionBreakdown,
} from "../../../../ports/captured-game-mechanics.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import type { ResourceView } from "../../../../domain/game-world.ts";
import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import { capturedPowerProducerCapability } from "./captured-power-producer-capability.ts";
import type { CapturedMechState } from "../../../../domain/combat/mech-state.ts";
import type {
  PowerReader,
  PowerUnavailableReason,
} from "../../../../ports/power.ts";
import type { PhaseTimingSink } from "../../../../utils/performance.ts";
import {
  createCountTally,
  createPhaseMeasure,
} from "../../../../utils/performance.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import { readCapturedResourceLabel } from "../../captured-resource-metadata.ts";
import {
  readCapturedJobStackMultiplier,
  readCapturedHighPopulationPercent,
  readCapturedPopulationResource,
  readCapturedPoweredTraitValue,
  readCapturedHumongousEffectMultiplier,
  type CapturedJobCountSnapshot,
} from "../../civic/captured-job-catalog.ts";
import { readCapturedGovernorTaskActive } from "../../civic/captured-tax.ts";
import { calculateRequiredAuthorityGarrison } from "../../../../domain/civic/authority.ts";
import { readAuthorityPolicyView } from "../../civic/authority.ts";
import type { CapturedDemandSample } from "../../economy/resources/captured-resource-demand.ts";
import { readCapturedSupplyRateAdjustment } from "../../economy/resources/captured-supply.ts";
import { readCapturedEjectRateAdjustment } from "../../economy/resources/captured-ejector.ts";
import { readCapturedControlLabel } from "../../captured-control-label.ts";
import { readCapturedUniverseAffix } from "../../captured-achievements.ts";
import { readCapturedBuildQueueEntryCount } from "../../captured-queue-reservations.ts";
import { isPillarFinished } from "../../../../domain/progression/prestige/prestige-eligibility.ts";
import { readCapturedAscensionLevel } from "../../ascension-level.ts";
import {
  capturedMechSupplyHold,
  designAutoChoice,
  readCapturedMechPotential,
} from "../../../../domain/combat/mech-auto-choice.ts";
import { getCitadelPowerConsumption } from "../../../../domain/economy/production/power.ts";
import type { CapturedBuildingEntry } from "../../progression/build/captured-building-catalog.ts";
import {
  capturedPowerMetadataForBinding,
  capturedPowerSmartEnabled,
} from "./captured-power-metadata.ts";
import {
  POWER_IDLE_CONSUMPTION_SOURCES,
  readPowerNativeConsumption,
} from "./captured-power-consumption.ts";

export interface CapturedPowerReaderRuntimeOptions {
  readonly settings: PowerSettingsInput;
  readonly debug: boolean;
  readonly consumptionBalanceMinimum: number;
}

export interface CapturedPowerReaderDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly mechanics: CapturedGameMechanics;
  readonly diagnostics?: PhaseTimingSink;
  readonly readJobCounts?: (
    root: unknown,
    jobIds: readonly string[],
  ) => CapturedJobCountSnapshot | undefined;
  readonly readProspectiveSpaceMiners?: (root: unknown) => number | undefined;
  readonly resources: GameResourceSource;
  /** Resource commitments and largest observed build cost from the shared demand phase. */
  readonly readDemand: () => CapturedDemandSample | undefined;
  readonly readDemandUnavailableReason?: () => string | undefined;
  /** The current fleet planner's `neededShips`, when that result is available. */
  readonly readFleetNeededShips?: () =>
    Readonly<Record<string, number>> | null | undefined;
  /** Current game-owned action costs, used by Spire and lake support rules. */
  readonly costs?: GameActionCostReader;
  /** The page-local date used by the retired reader's astrology bonus. */
  /** Previous Power-cycle description emitted for the Spire purifier. */
  readonly readPurifierDescription?: () => string | undefined;
  /** The current typed Mech reader state, including the queue-key sample. */
  readonly readMechState?: () => CapturedMechState;
  readonly readMechSaveSupply?: () => boolean;
  /** Stored automation settings, including the managed-building priorities and state flags. */
  readonly readSettingsRaw: () => unknown;
  readonly readRuntimeOptions: () =>
    CapturedPowerReaderRuntimeOptions | undefined;
  readonly readWarnings: (
    domIds: readonly string[],
  ) => readonly PowerWarnBuildingInput[];
}

const TAU_WHALING_EFFECT_ACTIONS = Object.freeze({
  station: Object.freeze({
    entryKey: "tau_gas:whaling_station",
    actionId: "tauceti-whaling_station",
  }),
  ship: Object.freeze({
    entryKey: "tau_roid:whaling_ship",
    actionId: "tauceti-whaling_ship",
  }),
});

/** Pinned truepath.js effects expose production before rounding, with no HTML interpretation. */
export function readCapturedTauWhalingProduction(
  mechanics: CapturedGameMechanics,
  structures: readonly CapturedGameStructureDefinition[],
  isCurrent: () => boolean,
):
  | {
      readonly nativeStationProduction: number;
      readonly nativeShipProduction: number;
    }
  | undefined {
  const observe = (entryKey: string, actionId: string) => {
    if (
      structures.filter(
        (structure) =>
          structure.entryKey === entryKey || structure.actionId === actionId,
      ).length !== 1 ||
      !structures.some(
        (structure) =>
          structure.entryKey === entryKey && structure.actionId === actionId,
      )
    )
      return undefined;
    try {
      const result = mechanics.readEffectRoundedValues(entryKey, isCurrent);
      return result.kind === "value" ? result.value : undefined;
    } catch {
      return undefined;
    }
  };
  const station = observe(
    TAU_WHALING_EFFECT_ACTIONS.station.entryKey,
    TAU_WHALING_EFFECT_ACTIONS.station.actionId,
  );
  const ship = observe(
    TAU_WHALING_EFFECT_ACTIONS.ship.entryKey,
    TAU_WHALING_EFFECT_ACTIONS.ship.actionId,
  );
  const valid = (value: { receiver: number; digits: number; text: string }) =>
    Number.isFinite(value.receiver) &&
    value.receiver >= 0 &&
    value.text.trim().length > 0 &&
    Number.isFinite(Number(value.text));
  let rootCurrent: boolean;
  try {
    rootCurrent = isCurrent();
  } catch {
    return undefined;
  }
  if (
    station?.length !== 3 ||
    ship?.length !== 2 ||
    station[0]?.digits !== 2 ||
    station[1]?.digits !== 2 ||
    station[2]?.digits !== 2 ||
    ship[0]?.digits !== 1 ||
    ship[1]?.digits !== 2 ||
    !station.every(valid) ||
    !ship.every(valid) ||
    !rootCurrent ||
    station[0]!.receiver <= 0
  )
    return undefined;
  // Pinned station effect rounds production, stored blubber, then powered() via powerCostMod.
  // Ship effect rounds adjusted support fuel, then production. The receiver retains native precision.
  return Object.freeze({
    nativeStationProduction: station[0]!.receiver,
    nativeShipProduction: ship[1]!.receiver,
  });
}

// Retired Power disables lake automation when either managed building fails its gate;
// these remaining fields are inert because the planner reads them only while enabled.
const EMPTY_LAKE: PowerLakeInput = Object.freeze({
  enabled: false,
  bloodSpireLevel: 0,
  biremeId: "",
  biremeBinding: "",
  biremeCount: 0,
  biremeStateOn: 0,
  transportId: "",
  transportBinding: "",
  transportCount: 0,
  transportStateOn: 0,
});

// Disabled Spire groups do not issue building operations, so these legacy zero values are inert.
const EMPTY_SPIRE_BUILDING: PowerSpireBuildingInput = Object.freeze({
  buildingId: "",
  binding: "",
  count: 0,
  stateOn: 0,
  autoMaximum: 0,
  autoBuildable: false,
  smartManaged: false,
  moneyCost: 0,
  supplyCost: 0,
});

// Keep auxiliary Spire policy absent when the current native facts are unavailable.
const EMPTY_SPIRE: PowerSpireInput = Object.freeze({
  available: false,
  stateBalancingEnabled: false,
  autoBuild: false,
  autoMech: false,
  mechActive: false,
  autoPrestige: false,
  prestigeType: "",
  prestigeDemonicFloor: 0,
  towerCount: 0,
  moneyMaximum: 0,
  supplyCurrent: 0,
  supportedSupplyCapacity: 0,
  mechQueued: false,
  purifierQueued: false,
  purifierDescription: "",
  expectedSaveSupply: false,
  mechBay: EMPTY_SPIRE_BUILDING,
  port: EMPTY_SPIRE_BUILDING,
  camp: EMPTY_SPIRE_BUILDING,
  purifier: EMPTY_SPIRE_BUILDING,
});

function asNumber(value: unknown): number | undefined {
  try {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  } catch {
    return undefined;
  }
}

function readGameNumber(
  owner: unknown,
  key: string,
  fallback = 0,
): number | undefined {
  const value = readProperty(owner, key);
  return value === undefined || value === null ? fallback : asNumber(value);
}

function readGamePath(root: unknown, path: readonly string[]): unknown {
  let value = root;
  for (const key of path) value = readProperty(value, key);
  return value;
}

function readGamePathNumber(
  root: unknown,
  path: readonly string[],
  fallback = 0,
): number | undefined {
  const value = readGamePath(root, path);
  return value === undefined || value === null ? fallback : asNumber(value);
}

/** DeadSpace src/truepath.js `womlingFarmFood()` at 6cc9ba8. */
export function readCapturedWomlingFarmFood(root: unknown): number | undefined {
  const tech = readProperty(root, "tech");
  const population = readProperty(tech, "womling_pop");
  const gene = readProperty(tech, "womling_gene");
  if (
    (population !== undefined &&
      (typeof population !== "number" ||
        !Number.isFinite(population) ||
        population < 0)) ||
    (gene !== undefined &&
      (typeof gene !== "number" || !Number.isFinite(gene) || gene < 0))
  )
    return undefined;
  return (population ? (population >= 3 ? 20 : 16) : 12) + (gene ? 4 : 0);
}

export function readCapturedMiningPitWorkers(
  structures: readonly CapturedGameStructureDefinition[],
  binding: string,
): number | undefined {
  const pit = structures.find((structure) => structure.actionId === binding);
  const workers = pit?.readWorkers();
  return workers?.kind === "value" &&
    Number.isFinite(workers.value) &&
    workers.value > 0
    ? workers.value
    : undefined;
}

function readCapturedStructureState(
  root: unknown,
  structure: CapturedGameStructureDefinition,
): unknown {
  const region = readProperty(root, structure.region);
  // `initStructureGrids()` and the normal Power/support passes read state as
  // global[entry.region][entry.struct]; `sector` identifies the grid and its
  // action definition, not a nested state bucket.
  return readProperty(region, structure.struct);
}

interface CapturedPowerMechanicsSnapshot {
  readonly structures: readonly CapturedGameStructureDefinition[];
  readonly byEntryKey: ReadonlyMap<string, CapturedGameStructureDefinition>;
  readonly isCurrent: () => boolean;
}

interface CapturedPowerMechanicsOrdering {
  readonly ordered: readonly CapturedGameStructureDefinition[];
  readonly supportOrders: ReadonlyMap<
    string,
    readonly CapturedGameStructureDefinition[]
  >;
}

function createCapturedPowerMechanicsSnapshot(
  structures: readonly CapturedGameStructureDefinition[],
  root: unknown,
  rootState: GameRootStateSource,
): CapturedPowerMechanicsSnapshot | undefined {
  const byEntryKey = new Map<string, CapturedGameStructureDefinition>();
  for (const structure of structures) {
    if (byEntryKey.has(structure.entryKey)) return undefined;
    byEntryKey.set(structure.entryKey, structure);
  }
  const isCurrent = () =>
    rootState.readRoot() === root &&
    structures.every((structure) => structure.matchesCurrentIdentity());
  return Object.freeze({ structures, byEntryKey, isCurrent });
}

function readOrderedMechanics(
  root: unknown,
  mechanics: CapturedGameMechanics,
  snapshot: CapturedPowerMechanicsSnapshot,
  count: (name: string) => void,
): CapturedPowerMechanicsOrdering | undefined {
  const powerOrder = mechanics.readPowerOrder(root, snapshot.byEntryKey);
  count("autoPower.readCycle.powerOrderResolutions");
  if (powerOrder.kind !== "value") return undefined;

  const types = new Set<string>();
  for (const structure of snapshot.structures) {
    const support = structure.readSupport();
    if (support.kind === "invalid") return undefined;
    if (support.kind === "absent") continue;
    const supportTypes = structure.readSupportTypes();
    if (supportTypes.kind === "invalid") return undefined;
    if (supportTypes.kind === "value") {
      for (const type of supportTypes.value) types.add(type);
    }
    const provider = structure.readSupportProvider();
    const topology = structure.readSupportTopology();
    if (provider.kind === "invalid" || topology.kind !== "value")
      return undefined;
    if (topology.value.enabled.kind === "invalid") return undefined;
  }
  const ordered: CapturedGameStructureDefinition[] = [];
  const supportOrders = new Map<
    string,
    readonly CapturedGameStructureDefinition[]
  >();
  const seen = new Set<string>();
  const add = (structure: CapturedGameStructureDefinition) => {
    if (!seen.has(structure.entryKey)) {
      ordered.push(structure);
      seen.add(structure.entryKey);
    }
  };
  powerOrder.value.forEach(add);
  for (const type of types) {
    const supportOrder = mechanics.readSupportOrder(
      root,
      type,
      snapshot.byEntryKey,
    );
    count("autoPower.readCycle.supportOrderResolutions");
    if (supportOrder.kind !== "value") return undefined;
    supportOrders.set(type, supportOrder.value);
    for (const structure of supportOrder.value) {
      if (structure.readSupportValue(type).kind !== "value") return undefined;
      add(structure);
    }
  }
  // Generators and support providers have no saved user order in initStructureGrids().
  // Its captured registry supplies their native discovery order.
  snapshot.structures.forEach(add);
  return Object.freeze({
    ordered: Object.freeze(ordered),
    supportOrders,
  });
}

function readCrewReserve(raw: unknown, population: number): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw !== "string") return 0;
  const value = raw.trim();
  if (value.endsWith("%")) {
    const percent = Number(value.slice(0, -1));
    return Number.isFinite(percent) ? (population * percent) / 100 : 0;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function fuelModeFor(
  region: string,
  resourceId: string,
): CapturedFuelAdjustmentMode | undefined {
  if (!["Oil", "Helium_3", "Super_Fuel"].includes(resourceId)) {
    return undefined;
  }
  if (["space", "underground", "surface"].includes(region)) {
    return "space";
  }
  // Upstream's non-solar path selects int_fuel_adjust() for every other region.
  return "interstellar";
}

function readFuelRate(
  mechanics: CapturedGameMechanics,
  resourceId: string,
  amount: number,
  mode: CapturedFuelAdjustmentMode,
): number | undefined {
  const adjustment = mechanics.readAdjustedFuelFactor(mode, resourceId);
  return adjustment.kind === "value" ? amount * adjustment.value : undefined;
}

// Literal Ice Age building loop in DeadSpace src/main.js at 6cc9ba8.
// Membership only: action support_fuel() remains the amount authority.
const ICEAGE_SPECIAL_FUEL_BINDINGS = new Set([
  "underground-bonfire",
  "underground-mineshaft_vator",
  "underground-core_mine",
  "underground-core_forge",
  "underground-core_blacksmith",
  "underground-core_refinery",
  "surface-watch_tower",
  "surface-water_pipe",
  "surface-surface_farm",
  "surface-surface_zoo",
]);

export function readCapturedPowerConsumptions(
  root: unknown,
  mechanics: CapturedGameMechanics,
  structure: CapturedGameStructureDefinition,
  production: CapturedProductionBreakdown,
  stateOn: number,
  role: "consumer" | "generator" | "none",
  nativeSupportParticipant: boolean,
  invalidFallbacks: Set<string>,
): readonly PowerConsumptionInput[] | undefined {
  const binding = structure.actionId;
  const powerFuel = structure.readFuel();
  if (powerFuel.kind === "invalid") return undefined;
  const iceAgeSpecialFuel = ICEAGE_SPECIAL_FUEL_BINDINGS.has(binding);
  const supportFuel =
    nativeSupportParticipant || iceAgeSpecialFuel
      ? structure.readSupportFuel()
      : null;
  if (supportFuel?.kind === "invalid") return undefined;
  const title = structure.readTitle();
  const result = new Map<string, PowerConsumptionInput>();
  const nativeEffective =
    role === "generator" &&
    powerFuel.kind === "value" &&
    powerFuel.value !== false
      ? mechanics.readEffectivePowerCount?.(root, structure.entryKey)
      : null;
  const observed = (resourceId: string, source: string): number | undefined =>
    readPowerNativeConsumption(production, resourceId, source);
  const append = (
    resourceId: string,
    rate: number,
    source: string | null,
    ledgerCredit: "safe" | "observation-only",
    adjustmentDisabled = false,
    adjustmentMode: CapturedFuelAdjustmentMode | undefined = undefined,
    marginalKnown = true,
    nativeGeneratorFuel = false,
  ) => {
    const adjustedRate =
      adjustmentDisabled || adjustmentMode === undefined
        ? rate
        : readFuelRate(mechanics, resourceId, rate, adjustmentMode);
    const currentTotal =
      source === null ? undefined : observed(resourceId, source);
    const enableRate =
      marginalKnown &&
      adjustedRate !== undefined &&
      Number.isFinite(adjustedRate) &&
      adjustedRate >= 0 &&
      currentTotal !== undefined
        ? adjustedRate
        : null;
    const previous = result.get(resourceId);
    const appliedGeneratorFuel = nativeGeneratorFuel
      ? nativeEffective?.kind === "value" && enableRate !== null
        ? nativeEffective.value * enableRate
        : null
      : undefined;
    result.set(
      resourceId,
      Object.freeze({
        resourceId,
        currentTotal: (previous?.currentTotal ?? 0) + (currentTotal ?? 0),
        unwindCredit:
          (previous?.unwindCredit ?? 0) +
          (ledgerCredit === "safe" ? (currentTotal ?? 0) : 0),
        enableRate:
          enableRate === null || previous?.enableRate === null
            ? null
            : previous === undefined
              ? enableRate
              : previous.enableRate + enableRate,
        ...(nativeGeneratorFuel
          ? {
              appliedGeneratorFuel:
                appliedGeneratorFuel === null ||
                previous?.appliedGeneratorFuel === null
                  ? null
                  : (previous?.appliedGeneratorFuel ?? 0) +
                    (appliedGeneratorFuel ?? 0),
            }
          : previous?.appliedGeneratorFuel === undefined
            ? {}
            : { appliedGeneratorFuel: previous.appliedGeneratorFuel }),
      }),
    );
  };
  if (
    powerFuel.kind === "value" &&
    powerFuel.value !== false &&
    role !== "none"
  ) {
    // DeadSpace src/main.js at 6cc9ba8: generators and powered consumers have
    // different source identities and different p_fuel adjustment gates.
    const powerAdjustmentRequested =
      role === "generator" ? structure.readFuelAdjustmentRequested() : null;
    if (powerAdjustmentRequested?.kind === "invalid") return undefined;
    const powerAdjustmentEnabled =
      role === "generator" &&
      powerAdjustmentRequested?.kind === "value" &&
      powerAdjustmentRequested.value &&
      structure.sector !== "city";
    for (const fuel of powerFuel.value) {
      const mode =
        role === "consumer"
          ? structure.region === "space" ||
            structure.region === "underground" ||
            structure.region === "surface"
            ? fuelModeFor(structure.region, fuel.resourceId)
            : undefined
          : powerAdjustmentEnabled
            ? fuelModeFor(structure.region, fuel.resourceId)
            : undefined;
      append(
        fuel.resourceId,
        fuel.amount,
        title.kind === "value"
          ? role === "consumer"
            ? `${title.value}+${structure.actionId}`
            : title.value
          : null,
        role === "consumer" ? "safe" : "observation-only",
        false,
        mode,
        true,
        role === "generator",
      );
    }
  }
  if (
    nativeSupportParticipant &&
    supportFuel?.kind === "value" &&
    supportFuel.value !== false
  ) {
    const supportAdjustmentDisabled =
      structure.readSupportFuelAdjustmentDisabled();
    if (supportAdjustmentDisabled.kind === "invalid") return undefined;
    const adjustmentDisabled =
      supportAdjustmentDisabled.kind === "value" &&
      supportAdjustmentDisabled.value;
    for (const fuel of supportFuel.value) {
      const mode = adjustmentDisabled
        ? undefined
        : fuelModeFor(structure.region, fuel.resourceId);
      append(
        fuel.resourceId,
        fuel.amount,
        title.kind === "value" ? `${title.value}+${structure.actionId}` : null,
        "observation-only",
        adjustmentDisabled,
        mode,
      );
    }
  }
  if (
    iceAgeSpecialFuel &&
    supportFuel?.kind === "value" &&
    supportFuel.value !== false
  ) {
    for (const fuel of supportFuel.value) {
      append(
        fuel.resourceId,
        fuel.amount,
        title.kind === "value" ? title.value : null,
        "observation-only",
        true,
        undefined,
        binding !== "underground-bonfire",
      );
    }
  }
  for (const fallback of POWER_IDLE_CONSUMPTION_SOURCES[binding] ?? []) {
    // An action-owned declaration wins: the metadata must not reserve it twice.
    if (result.has(fallback.resourceId)) continue;
    const source =
      fallback.sourceKey === "@title"
        ? title.kind === "value"
          ? title.value
          : null
        : fallback.sourceKey === null
          ? null
          : mechanics.readLocalizedText(fallback.sourceKey);
    const sourceLabel =
      typeof source === "string"
        ? source
        : source?.kind === "value"
          ? source.value
          : null;
    const currentTotal =
      sourceLabel === null ? 0 : observed(fallback.resourceId, sourceLabel);
    const validCurrent = sourceLabel !== null && currentTotal !== undefined;
    // DeadSpace's Food pass emits its own Fasting suppression row as -100%.
    const nativeFoodSuppressed =
      fallback.resourceId === "Food" &&
      Object.values(production.production.Food ?? {}).includes("-100%");
    const observedCost =
      fallback.observation === null
        ? null
        : mechanics.readEffectLocalizedNumericInputs?.(
            structure.entryKey,
            fallback.observation.upstreamLocalizationKey,
          );
    const observedIndex =
      observedCost?.kind === "value" && fallback.observation !== null
        ? fallback.observation.variableIndex
        : -1;
    let enableRate: number | null =
      observedCost?.kind === "value" &&
      observedIndex >= 0 &&
      typeof observedCost.value[observedIndex] === "number" &&
      Number.isFinite(observedCost.value[observedIndex]) &&
      observedCost.value[observedIndex]! >= 0
        ? observedCost.value[observedIndex]!
        : null;
    if (enableRate !== null && fallback.rounded) {
      const rounded = mechanics.readEffectRoundedValues?.(structure.entryKey);
      const matches =
        rounded?.kind === "value"
          ? rounded.value.filter(
              (item) =>
                Number.isFinite(item.receiver) &&
                Number.isFinite(Number(item.text)) &&
                Number(item.text) === enableRate,
            )
          : [];
      enableRate = matches.length === 1 ? matches[0]!.receiver : null;
    }
    const gateKey =
      fallback.gate === "stargate"
        ? "int_blackhole:s_gate"
        : fallback.gate === "fob"
          ? "spc_triton:fob"
          : null;
    const gate =
      gateKey === null ? 1 : mechanics.readEffectivePowerCount?.(root, gateKey);
    const gateValue =
      typeof gate === "number"
        ? gate
        : gate?.kind === "value"
          ? gate.value
          : null;
    if (enableRate !== null && gateValue !== null) enableRate *= gateValue;
    else enableRate = null;
    if (
      !validCurrent ||
      gateValue === 0 ||
      fallback.clamped ||
      nativeFoodSuppressed
    )
      enableRate = null;
    if (stateOn > 0 && currentTotal === 0 && gateValue !== 0) enableRate = null;
    const driftKey = `${binding}:${fallback.resourceId}`;
    if (invalidFallbacks.has(driftKey)) enableRate = null;
    if (
      !fallback.clamped &&
      gateValue !== null &&
      gateValue > 0 &&
      stateOn > 0 &&
      validCurrent &&
      currentTotal > 0 &&
      enableRate !== null &&
      Math.abs(currentTotal - stateOn * enableRate) >
        1e-6 * Math.max(1, currentTotal)
    ) {
      invalidFallbacks.add(driftKey);
      enableRate = null;
    }
    result.set(
      fallback.resourceId,
      Object.freeze({
        resourceId: fallback.resourceId,
        currentTotal: currentTotal ?? 0,
        unwindCredit:
          fallback.ledgerCredit === "safe" ? (currentTotal ?? 0) : 0,
        enableRate,
      }),
    );
  }
  return Object.freeze([...result.values()]);
}

export function readNativePowerSupports(
  root: unknown,
  mechanics: CapturedGameMechanics,
  structures: readonly CapturedGameStructureDefinition[],
  supportOrders?: ReadonlyMap<
    string,
    readonly CapturedGameStructureDefinition[]
  >,
  byEntryKey?: ReadonlyMap<string, CapturedGameStructureDefinition>,
): readonly PowerSupportInput[] | undefined {
  const groups = new Map<string, CapturedGameStructureDefinition[]>();
  for (const structure of structures) {
    const support = structure.readSupport();
    if (support.kind === "invalid") return undefined;
    if (support.kind === "absent") continue;
    const types = structure.readSupportTypes();
    if (types.kind === "invalid") return undefined;
    if (types.kind !== "value") continue;
    for (const type of types.value) {
      const group = groups.get(type) ?? [];
      group.push(structure);
      groups.set(type, group);
    }
  }
  const supports: PowerSupportInput[] = [];
  for (const [type, members] of groups) {
    // An infiltrated provider needs the game's private infiltratorFactor result. Without an
    // oracle, leave this whole grid in the native baseline rather than copying its penalty.
    const infiltrators = readProperty(
      readProperty(readProperty(root, "race"), "alien"),
      "infiltrators",
    );
    let infiltrated = false;
    for (const member of members) {
      const support = member.readSupportValue(type);
      if (support.kind !== "value") return undefined;
      if (support.value <= 0) continue;
      const sector = readProperty(infiltrators, member.sector);
      const assignment = readProperty(sector, member.struct);
      if (
        assignment !== undefined &&
        (typeof assignment !== "number" ||
          !Number.isFinite(assignment) ||
          assignment > 0)
      )
        infiltrated = true;
    }
    if (infiltrated) continue;
    const resolvedOrder =
      supportOrders === undefined
        ? (() => {
            const result = mechanics.readSupportOrder(root, type, byEntryKey);
            return result.kind === "value" ? result.value : undefined;
          })()
        : supportOrders.get(type);
    if (resolvedOrder === undefined) return undefined;
    const consumers: CapturedGameStructureDefinition[] = [];
    let anchorKey: string | null = null;
    let unlimited = false;
    let enabled = true;
    for (const member of members) {
      const generic = member.readSupport();
      if (generic.kind !== "value") return undefined;
      if (generic.value >= 0) continue;
      consumers.push(member);
      const topology = member.readSupportTopology();
      if (topology.kind !== "value" || topology.value.enabled.kind !== "value")
        return undefined;
      if (anchorKey === null && topology.value.anchorEntryKey !== null) {
        anchorKey = topology.value.anchorEntryKey;
        unlimited = topology.value.unlimited;
        enabled = topology.value.enabled.value;
      }
    }
    if (
      resolvedOrder.length !== consumers.length ||
      resolvedOrder.some(
        (member) =>
          !consumers.some((consumer) => consumer.entryKey === member.entryKey),
      )
    )
      return undefined;
    const anchor =
      byEntryKey?.get(anchorKey ?? "") ??
      (byEntryKey === undefined
        ? structures.find((member) => member.entryKey === anchorKey)
        : undefined);
    const state =
      anchor === undefined
        ? undefined
        : readCapturedStructureState(root, anchor);
    let current = 0;
    let maximum = 0;
    if (state !== undefined && state !== null) {
      if (!isRecord(state)) return undefined;
      const readCurrent = readGameNumber(state, "support");
      const readMaximum =
        type === "belt" ? anchor?.readSupportValue(type) : null;
      const effective =
        type === "belt" && anchor !== undefined
          ? mechanics.readEffectivePowerCount(root, anchor.entryKey)
          : null;
      const nativeMaximum =
        type === "belt"
          ? readMaximum?.kind === "value" && effective?.kind === "value"
            ? readMaximum.value * effective.value
            : undefined
          : readGameNumber(state, "s_max");
      if (readCurrent === undefined || nativeMaximum === undefined)
        return undefined;
      current = readCurrent;
      maximum = nativeMaximum;
    }
    supports.push(
      Object.freeze({
        type,
        title: type,
        current,
        maximum,
        available: maximum - current,
        unlocked:
          anchor !== undefined &&
          state !== undefined &&
          state !== null &&
          enabled,
        allocation: unlimited || !enabled ? "unconstrained" : "strict",
      }),
    );
  }
  return Object.freeze(supports);
}

export function readCapturedPowerOrdinaryResourceState(
  root: unknown,
  id: string,
  settings: Readonly<Record<string, unknown>>,
  demand: CapturedDemandSample,
  production: CapturedProductionBreakdown,
  view: ResourceView | undefined,
  decaySource = "",
): PowerResourceInput | undefined {
  const current = view?.present ? asNumber(view.amount) : 0;
  const rawMaximum = view?.present ? asNumber(view.max) : 0;
  const rawRate = view?.present ? asNumber(view.rateOfChange) : 0;
  if (
    current === undefined ||
    rawMaximum === undefined ||
    rawRate === undefined
  )
    return undefined;
  const maximum = rawMaximum < 0 ? Number.MAX_SAFE_INTEGER : rawMaximum;
  const storageRatio = maximum > 0 ? current / maximum : 1;
  const tradeDiff = asNumber(production.consumption[id]?.Trade) ?? 0;
  const sell =
    settings["autoMarket"] === true && tradeDiff < 0 ? -tradeDiff : 0;
  let decay = 0;
  if (readProperty(readProperty(root, "race"), "decay") === true) {
    if (decaySource.length === 0) return undefined;
    const cell = production.consumption[id]?.[decaySource];
    if (current > 50) {
      const value =
        typeof cell === "number"
          ? cell
          : typeof cell === "string" && /^-[\d,]+(?:\.\d+)?$/u.test(cell)
            ? Number(cell.replaceAll(",", ""))
            : Number.NaN;
      if (!Number.isFinite(value) || value >= 0) return undefined;
      decay = -value;
    } else if (cell !== undefined) {
      return undefined;
    }
  }
  const supply =
    view?.unlocked === true
      ? readCapturedSupplyRateAdjustment(root, settings, id)
      : 0;
  const eject =
    view?.unlocked === true
      ? readCapturedEjectRateAdjustment(root, settings, id)
      : 0;
  const storeOverflow = settings[`res_storage_o_${id}`] === true;
  const maxStorage = asNumber(settings[`res_max_store${id}`]) ?? 0;
  return Object.freeze({
    id,
    title: readCapturedResourceLabel(root, id),
    currentQuantity: current,
    maxQuantity: maximum,
    rateOfChange: rawRate + sell + decay + supply + eject,
    storageRatio,
    unlocked: view?.present === true ? view.unlocked : false,
    useful:
      storageRatio < 0.99 ||
      demand.isDemanded(id) ||
      eject > 0 ||
      supply > 0 ||
      (storeOverflow && current < maxStorage),
    // `income` removes sell, decay, Supply, and Ejector adjustments while retaining the game's
    // original diff. Trade buys are separately excluded by Resource.calculateRateOfChange.
    income: rawRate,
  });
}

function readLegacySyntheticUseful(
  id: string,
  current: number,
  storageRatio: number,
  settings: Readonly<Record<string, unknown>>,
  demand: CapturedDemandSample,
): boolean {
  return (
    storageRatio < 0.99 ||
    demand.requestedQuantity(id) > current ||
    (settings[`res_storage_o_${id}`] === true &&
      current < (asNumber(settings[`res_max_store${id}`]) ?? 0))
  );
}

// Pinned src/main.js Discharge branch for the Powered citizens draw at 6cc9ba8.
const POWERED_DISCHARGE_MULTIPLIER = 1.25;
const POWERED_DISCHARGE_DIGITS = 3;

// Pinned `discharge && discharge > 0` branch selection: a missing field is inactive, a finite
// number at or below zero is inactive, and any other state is malformed rather than a branch.
function readCapturedDischargeActive(root: unknown): boolean | undefined {
  const discharge = readProperty(readProperty(root, "race"), "discharge");
  if (discharge === undefined || discharge === null || discharge === false)
    return false;
  if (typeof discharge !== "number" || !Number.isFinite(discharge))
    return undefined;
  return discharge > 0;
}

/**
 * Additional Power for a Powered population that does not exist yet.
 *
 * DeadSpace src/main.js at 6cc9ba8 draws `traits.powered.vars()[0] * amount` and, while Discharge
 * is active, raises the whole population draw to 125% and rounds that total to three decimals. The
 * captured `city.power` already contains the current draw, so the reserve is the difference between
 * the full-population draw and the current one. Discharge rounding applies to each total, so a
 * per-citizen multiplier is not equivalent.
 */
export function readCapturedPoweredPopulationReserve(
  root: unknown,
): number | undefined {
  const population = readCapturedPopulationResource(root);
  // The species counters are lazily absent before the population resource initializes; that state
  // keeps the zero coercion, as does a non-numeric field. A negative maximum keeps the uncapped
  // sentinel, which leaves both headcounts finite and nonnegative.
  const current = asNumber(readProperty(population, "amount")) ?? 0;
  const rawMaximum = asNumber(readProperty(population, "max")) ?? 0;
  const maximum = rawMaximum < 0 ? Number.MAX_SAFE_INTEGER : rawMaximum;
  if (current < 0) return undefined;
  const traitValue = readCapturedPoweredTraitValue(root);
  if (traitValue === undefined) return undefined;
  const dischargeActive = readCapturedDischargeActive(root);
  if (dischargeActive === undefined) return undefined;
  const draw = (headcount: number): number => {
    const citizens = traitValue * headcount;
    return dischargeActive
      ? +(citizens * POWERED_DISCHARGE_MULTIPLIER).toFixed(
          POWERED_DISCHARGE_DIGITS,
        )
      : citizens;
  };
  return draw(maximum) - draw(current);
}

function readPowerResourceState(
  root: unknown,
  id: string,
  settings: Readonly<Record<string, unknown>>,
  demand: CapturedDemandSample,
  production: CapturedProductionBreakdown,
  view: ResourceView | undefined,
  buildingStates: readonly CapturedBuildingState[],
  decaySource: string,
): PowerResourceInput | undefined {
  if (id === "Power") {
    const city = readProperty(root, "city");
    const unlocked = readProperty(city, "powered") === true;
    if (!unlocked) {
      // Power.updateData() leaves its constructor's zero state while city.powered is false.
      return Object.freeze({
        id,
        title: id,
        currentQuantity: 0,
        maxQuantity: 0,
        rateOfChange: 0,
        storageRatio: 1,
        unlocked: false,
        useful: false,
        income: 0,
      });
    }
    const replicatorTask =
      readCapturedGovernorTaskActive(root, "replicate") === true;
    const replicatorPower = replicatorTask
      ? (asNumber(
          readProperty(
            readProperty(readProperty(root, "race"), "replicator"),
            "pow",
          ),
        ) ?? 0)
      : 0;
    const current =
      (asNumber(readProperty(city, "power")) ?? 0) + replicatorPower;
    let maximum = 0;
    if (readProperty(readProperty(root, "race"), "powered")) {
      const reserve = readCapturedPoweredPopulationReserve(root);
      if (reserve === undefined) return undefined;
      maximum += reserve;
    }
    for (const building of buildingStates) {
      const { count, stateOn: on, powered } = building;
      let missing = building.stateOff;
      if (missing <= 0) continue;
      const binding = building.catalog.binding;
      const autoMaximum = asNumber(settings[`bld_m_${binding}`]);
      if (
        autoMaximum !== undefined &&
        autoMaximum < count &&
        settings["masterScriptToggle"] === true &&
        settings["autoPower"] === true &&
        settings[`bld_s_${binding}`] === true &&
        settings["buildingsLimitPowered"] === true
      ) {
        missing -= count - autoMaximum;
      }
      if (missing <= 0) continue;
      if (binding === "interstellar-citadel") {
        const electromagneticField = Boolean(
          readProperty(readProperty(root, "race"), "emfield"),
        );
        maximum +=
          getCitadelPowerConsumption(on + missing, electromagneticField) -
          getCitadelPowerConsumption(on, electromagneticField);
      } else {
        maximum += missing * powered;
      }
    }
    return Object.freeze({
      id,
      title: id,
      currentQuantity: current,
      maxQuantity: maximum,
      rateOfChange: current,
      storageRatio: maximum > 0 ? current / maximum : 1,
      unlocked,
      useful: readLegacySyntheticUseful(
        id,
        current,
        maximum > 0 ? current / maximum : 1,
        settings,
        demand,
      ),
      income: current,
    });
  }
  if (id === "Supply") {
    const portal = readProperty(root, "portal");
    if (!isRecord(portal) || !Object.hasOwn(portal, "purifier")) {
      // Supply stays locked and zeroed before portal.purifier is initialized, as in its wrapper.
      return Object.freeze({
        id,
        title: id,
        currentQuantity: 0,
        maxQuantity: 0,
        rateOfChange: 0,
        storageRatio: 1,
        unlocked: false,
        useful: false,
        income: 0,
      });
    }
    const purifier = readProperty(portal, "purifier");
    // A new purifier lazily fills these fields; the old wrapper coerced them to zero.
    const current = asNumber(readProperty(purifier, "supply")) ?? 0;
    const maximum = asNumber(readProperty(purifier, "sup_max")) ?? 0;
    const rate = asNumber(readProperty(purifier, "diff")) ?? 0;
    return Object.freeze({
      id,
      title: id,
      currentQuantity: current,
      maxQuantity: maximum,
      rateOfChange: rate,
      storageRatio: maximum > 0 ? current / maximum : 1,
      unlocked: true,
      useful: readLegacySyntheticUseful(
        id,
        current,
        maximum > 0 ? current / maximum : 1,
        settings,
        demand,
      ),
      income: rate,
    });
  }
  if (id === "Population") {
    // The species resource can exist before its counters are initialized; preserve wrapper zeros.
    const raw = readCapturedPopulationResource(root);
    const species = readProperty(readProperty(root, "race"), "species");
    const actualId =
      typeof species === "string" && species.length > 0
        ? species
        : "Population";
    const current = asNumber(readProperty(raw, "amount")) ?? 0;
    const rawMaximum = asNumber(readProperty(raw, "max")) ?? 0;
    const maximum = rawMaximum < 0 ? Number.MAX_SAFE_INTEGER : rawMaximum;
    const rate = asNumber(readProperty(raw, "diff")) ?? 0;
    return Object.freeze({
      id: actualId,
      title: readCapturedResourceLabel(root, actualId),
      currentQuantity: current,
      maxQuantity: maximum,
      rateOfChange: rate,
      storageRatio: maximum > 0 ? current / maximum : 1,
      unlocked: Boolean(readProperty(raw, "display")),
      useful: readLegacySyntheticUseful(
        actualId,
        current,
        maximum > 0 ? current / maximum : 1,
        settings,
        demand,
      ),
      income: rate,
    });
  }
  return readCapturedPowerOrdinaryResourceState(
    root,
    id,
    settings,
    demand,
    production,
    view,
    decaySource,
  );
}

function readPowerResourceInputs(
  root: unknown,
  ids: readonly string[],
  settings: Readonly<Record<string, unknown>>,
  demand: CapturedDemandSample,
  production: CapturedProductionBreakdown,
  resources: GameResourceSource,
  buildingStates: readonly CapturedBuildingState[],
  decaySource: string,
): readonly PowerResourceInput[] | undefined {
  const synthetic = new Set(["Power", "Population", "Supply"]);
  const ordinaryIds = ids.filter((id) => !synthetic.has(id));
  const sample =
    ordinaryIds.length === 0
      ? { resources: new Map<string, ResourceView>() }
      : resources.readResources(ordinaryIds);
  if (sample === undefined) return undefined;
  const result: PowerResourceInput[] = [];
  for (const id of ids) {
    const input = readPowerResourceState(
      root,
      id,
      settings,
      demand,
      production,
      sample.resources.get(id),
      buildingStates,
      decaySource,
    );
    if (input === undefined) return undefined;
    result.push(input);
  }
  return Object.freeze(result);
}

function readCellNumber(value: string | number | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const match = value.match(/^[+-]?[\d,]+(?:\.\d+)?/u);
  if (match === null) return 0;
  const parsed = Number(match[0].replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readObservedProduction(
  resourceId: string,
  production: CapturedProductionBreakdown,
  sourceTitle: string,
): number {
  let produced = 0;
  let found = false;
  for (const [label, cell] of Object.entries(
    production.production[resourceId] ?? {},
  )) {
    const raw = typeof cell === "string" ? cell : String(cell);
    if (!raw.includes("%")) {
      if (found) break;
      if (label === sourceTitle) {
        produced += readCellNumber(cell);
        found = true;
      }
    } else if (found) {
      produced *= 1 + readCellNumber(cell) / 100;
    }
  }
  let globalModifier = 1;
  for (const cell of Object.values(production.production.Global ?? {})) {
    globalModifier *= 1 + readCellNumber(cell) / 100;
  }
  return produced * globalModifier;
}

const POWER_BUSY_SOURCE_LOCALIZATION_KEY: Readonly<Record<string, string>> =
  Object.freeze({
    "galaxy-vitreloy_plant": "galaxy_vitreloy_plant_bd",
    "galaxy-armed_miner": "galaxy_armed_miner_bd",
  });

function readLocalizedProductionSource(
  sourceBinding: string,
  structures: readonly CapturedGameStructureDefinition[],
  controls: GameControlRegistry,
  mechanics: CapturedGameMechanics,
): string {
  if (sourceBinding === "job_space_miner") {
    const localized = mechanics.readLocalizedText("job_space_miner");
    return localized.kind === "value" &&
      typeof localized.value === "string" &&
      localized.value.trim() !== ""
      ? localized.value
      : "";
  }
  const localizationKey = POWER_BUSY_SOURCE_LOCALIZATION_KEY[sourceBinding];
  if (localizationKey !== undefined) {
    const localized = mechanics.readLocalizedText(localizationKey);
    if (localized.kind === "value") return localized.value;
  }
  const structure = structures.find(
    (candidate) => candidate.actionId === sourceBinding,
  );
  if (structure !== undefined) {
    const title = structure.readTitle();
    if (title.kind === "value") return title.value;
  }
  const handle = controls.resolve(sourceBinding);
  return handle === undefined ? "" : readCapturedControlLabel(handle, "");
}

function readBuildingRule(
  root: unknown,
  binding: string,
  metadataRule: string,
  nativeProducedResources: readonly string[],
  powered: number,
  production: CapturedProductionBreakdown,
  demand: CapturedDemandSample,
  resources: ReadonlyMap<string, PowerResourceInput>,
  supports: ReadonlyMap<string, PowerSupportInput>,
  buildingCounts: ReadonlyMap<string, number>,
  buildingOns: ReadonlyMap<string, number>,
  buildingStates: readonly CapturedBuildingState[],
  settings: Readonly<Record<string, unknown>>,
  structures: readonly CapturedGameStructureDefinition[],
  controls: GameControlRegistry,
  dependencies: CapturedPowerReaderDependencies,
  mechState: CapturedMechState | undefined,
  jobCounts: CapturedJobCountSnapshot | undefined,
): PowerBuildingRule | undefined {
  const race = readProperty(root, "race");
  const jobCount = (id: string): number | undefined => {
    if (jobCounts === undefined) return undefined;
    let count: number | undefined;
    try {
      count = jobCounts.readCount(id);
    } catch {
      return undefined;
    }
    return count !== undefined && Number.isFinite(count) && count >= 0
      ? count
      : undefined;
  };
  const resource = (id: string) => resources.get(id);
  const obs = (
    id: string,
    sourceBinding = [
      "space-iridium_ship",
      "space-iron_ship",
      "space-elerium_ship",
    ].includes(binding)
      ? "job_space_miner"
      : binding,
  ) => {
    const value = resource(id);
    return Object.freeze({
      resourceId: id,
      useful: value?.useful ?? false,
      production: readObservedProduction(
        id,
        production,
        readLocalizedProductionSource(
          sourceBinding,
          structures,
          controls,
          dependencies.mechanics,
        ),
      ),
      income: value?.income ?? 0,
    });
  };
  if (metadataRule === "ordinary" && nativeProducedResources.length === 1) {
    return Object.freeze({
      kind: "busy-resource",
      active: true,
      savingOnly: powered < 0,
      observation: obs(nativeProducedResources[0]!),
    });
  }
  switch (metadataRule) {
    case "neutron-citadel":
      return Object.freeze({
        kind: metadataRule,
        electromagneticField: Boolean(readProperty(race, "emfield")),
      });
    case "belt-space-station": {
      const station = structures.find(
        (candidate) => candidate.actionId === binding,
      );
      if (station === undefined) return undefined;
      const support = station.readSupportValue("belt");
      const effective = dependencies.mechanics.readEffectivePowerCount(
        root,
        station.entryKey,
      );
      const stationTitle = readLocalizedProductionSource(
        "space-space_station",
        structures,
        controls,
        dependencies.mechanics,
      );
      const capacity = production.capacity?.Elerium?.[stationTitle];
      const stationStorage = readCellNumber(capacity);
      if (
        demand.maxCost === undefined ||
        support.kind !== "value" ||
        !Number.isFinite(support.value) ||
        support.value < 0 ||
        effective.kind !== "value" ||
        !Number.isFinite(effective.value) ||
        effective.value < 0
      )
        return undefined;
      return Object.freeze({
        kind: metadataRule,
        stationStorage,
        eleriumMaximum: resource("Elerium")?.maxQuantity ?? 0,
        eleriumMaximumCost: demand.maxCost("Elerium"),
        beltSupportPerStation: support.value,
        effectiveStations: effective.value,
      });
    }
    case "job-dependent": {
      const jobId =
        binding === "city-cement_plant"
          ? "cement_worker"
          : binding === "city-coal_mine"
            ? "coal_miner"
            : "miner";
      const count = jobCount(jobId);
      if (count === undefined) return undefined;
      return Object.freeze({
        kind: metadataRule,
        jobCount: count,
      });
    }
    case "lake-cooling-tower":
      return Object.freeze({
        kind: metadataRule,
        harborCount: buildingCounts.get("portal-harbor") ?? 0,
        electromagneticField: Boolean(readProperty(race, "emfield")),
      });
    case "lake-harbor":
      return Object.freeze({ kind: metadataRule });
    case "busy-resource": {
      const sourceBinding = binding;
      const selector: Readonly<
        Record<string, readonly [string, string, boolean]>
      > = {
        "space-iridium_ship": ["Iridium", "job_space_miner", false],
        "space-iron_ship": ["Iron", "job_space_miner", false],
        "space-elerium_ship": ["Elerium", "job_space_miner", false],
      };
      const selected = selector[sourceBinding];
      if (selected === undefined) return undefined;
      if (
        readLocalizedProductionSource(
          selected[1],
          structures,
          controls,
          dependencies.mechanics,
        ) === ""
      )
        return Object.freeze({ kind: "unavailable-production" });
      const active =
        sourceBinding === "space-iridium_ship" ||
        sourceBinding === "space-iron_ship"
          ? Boolean(resource("Elerium")?.unlocked)
          : true;
      return Object.freeze({
        kind: metadataRule,
        active,
        savingOnly: selected[2],
        observation: obs(selected[0], selected[1]),
      });
    }
    case "triton-lander": {
      const authorityResource = resource("Authority");
      const authorityView =
        authorityResource === undefined
          ? undefined
          : readAuthorityPolicyView(
              { global: root },
              settings,
              { Authority: authorityResource },
              () => readCapturedHighPopulationPercent(root),
            );
      const garrisonHandle =
        controls.resolve("garrison") ?? controls.resolve("c_garrison");
      const currentCityGarrisonResult =
        garrisonHandle === undefined
          ? undefined
          : controls.invoke(garrisonHandle, "hell");
      const currentCityGarrison = currentCityGarrisonResult?.ok
        ? asNumber(currentCityGarrisonResult.value)
        : undefined;
      const currentSoldiers =
        (readGamePathNumber(root, ["civic", "garrison", "workers"], 0) ?? 0) -
        (readGamePathNumber(root, ["civic", "garrison", "crew"], 0) ?? 0);
      let authorityReserve = 0;
      if (
        readProperty(readProperty(root, "race"), "universe") === "evil" &&
        authorityResource?.unlocked === true
      ) {
        if (
          authorityView?.status !== "ready" ||
          currentCityGarrison === undefined
        ) {
          authorityReserve = currentSoldiers;
        } else {
          const required = calculateRequiredAuthorityGarrison(
            authorityView.view,
            currentCityGarrison,
          );
          authorityReserve = Math.min(
            currentSoldiers,
            required.requiredGarrison,
          );
        }
      }
      return Object.freeze({
        kind: metadataRule,
        fobOn: buildingOns.get("space-fob") ?? 0,
        // WarManager.currentSoldiers/wounded are the current city garrison values, not
        // `global.eden.army`, which belongs to the True Path campaign army.
        currentSoldiers,
        wounded:
          readGamePathNumber(root, ["civic", "garrison", "wounded"], 0) ?? 0,
        highPopulationMultiplier: readCapturedJobStackMultiplier(root) ?? 1,
        authorityReserve,
      });
    }
    case "ascension-trigger": {
      const species = readProperty(race, "species");
      const speciesPillarLevel =
        typeof species === "string"
          ? asNumber(readProperty(readProperty(root, "pillars"), species))
          : undefined;
      return Object.freeze({
        kind: metadataRule,
        pillarFinished: isPillarFinished({
          settings: {
            requirePillar: settings["prestigeAscensionPillar"] !== false,
          },
          game: {
            universe:
              typeof readProperty(readProperty(root, "race"), "universe") ===
              "string"
                ? (readProperty(
                    readProperty(root, "race"),
                    "universe",
                  ) as string)
                : "",
            ascensionLevel: readCapturedAscensionLevel(root) ?? 0,
            ...(speciesPillarLevel === undefined ? {} : { speciesPillarLevel }),
          },
          resources: {
            harmony: resource("Harmony")?.currentQuantity ?? 0,
          },
        }),
        prestigeType:
          typeof settings["prestigeType"] === "string"
            ? settings["prestigeType"]
            : "",
      });
    }
    case "terraformer":
      return Object.freeze({
        kind: metadataRule,
        prestigeType:
          typeof settings["prestigeType"] === "string"
            ? settings["prestigeType"]
            : "",
      });
    case "badlands-attractor":
      return Object.freeze({
        kind: metadataRule,
        threat:
          readGamePathNumber(root, ["portal", "fortress", "threat"], 0) ?? 0,
        bottomThreat:
          readGameNumber(settings, "hellAttractorBottomThreat", 0) ?? 0,
        topThreat: readGameNumber(settings, "hellAttractorTopThreat", 0) ?? 0,
        hellAssigned:
          readGamePathNumber(root, ["portal", "fortress", "assigned"], 0) ?? 0,
      });
    case "tourist-center":
      return Object.freeze({
        kind: metadataRule,
        hungryRace: Boolean(readProperty(race, "hungry")),
        foodStorageRatio: resource("Food")?.storageRatio ?? 1,
        moneyUseful: resource("Money")?.useful ?? false,
        observation: obs("Money", "tech-tourism"),
      });
    case "mill": {
      const farmer = jobCount("farmer");
      const hunter = jobCount("hunter");
      if (farmer === undefined || hunter === undefined) return undefined;
      return Object.freeze({
        kind: metadataRule,
        foodStorageRatio: resource("Food")?.storageRatio ?? 1,
        foodWorkers: farmer + hunter,
        sampledPower: resource("Power")?.currentQuantity ?? 0,
      });
    }
    case "chthonian-mine-layer": {
      const minelayer = structures.find(
        (structure) => structure.actionId === "galaxy-minelayer",
      );
      const rating = minelayer?.readShipRating();
      if (rating?.kind !== "value") return undefined;
      return Object.freeze({
        kind: metadataRule,
        raiderOn: buildingOns.get("galaxy-raider") ?? 0,
        excavatorOn: buildingOns.get("galaxy-excavator") ?? 0,
        starbaseOn: buildingOns.get("galaxy-starbase") ?? 0,
        piracy:
          readGamePathNumber(root, ["galaxy", "gxy_chthonian", "piracy"], 0) ??
          0,
        armada:
          readGamePathNumber(root, ["galaxy", "gxy_chthonian", "armada"], 0) ??
          0,
        rating: rating.value,
      });
    }
    case "ruins-guard-post": {
      const highPopulation = readCapturedJobStackMultiplier(root);
      const postControl = controls.resolve("portal-guard_post");
      const postRead = dependencies.mechanics.readGuardPostRating(
        root,
        () => dependencies.rootState.readRoot() === root,
      );
      if (
        postControl?.generation !==
        controls.resolve("portal-guard_post")?.generation
      )
        return undefined;
      const postRating = postRead.kind === "value" ? postRead.value : undefined;
      const ruinsControl = controls.resolve("prtl_ruins");
      const gateControl = controls.resolve("prtl_gate");
      const readSuppressionRating = (
        handle: ReturnType<GameControlRegistry["resolve"]>,
      ) => {
        if (handle === undefined || !handle.methods.includes("filter"))
          return undefined;
        const result = controls.invoke(handle, "filter", [0, "army"]);
        return result.ok ? asNumber(result.value) : undefined;
      };
      const ruinsRating = readSuppressionRating(ruinsControl);
      const gateRating = readSuppressionRating(gateControl);
      if (
        postControl?.generation !==
          controls.resolve("portal-guard_post")?.generation ||
        ruinsControl?.generation !==
          controls.resolve("prtl_ruins")?.generation ||
        gateControl?.generation !== controls.resolve("prtl_gate")?.generation
      )
        return undefined;
      if (
        highPopulation === undefined ||
        postRating === undefined ||
        ruinsRating === undefined ||
        gateRating === undefined
      )
        return undefined;
      const gateUnlocked =
        Number(readProperty(readProperty(root, "tech"), "hell_gate") ?? 0) > 0;
      const archaeologists = jobCount("archaeologist");
      const assignedScarletite = readGamePathNumber(
        root,
        ["city", "foundry", "Scarletite"],
        0,
      );
      const skilledScarletite = readGamePathNumber(
        root,
        ["race", "servants", "sjobs", "Scarletite"],
        0,
      );
      if (
        archaeologists === undefined ||
        assignedScarletite === undefined ||
        skilledScarletite === undefined
      )
        return undefined;
      return Object.freeze({
        kind: metadataRule,
        suppressionUseful:
          archaeologists > 0 ||
          assignedScarletite > 0 ||
          skilledScarletite > 0 ||
          (buildingOns.get("portal-arcology") ?? 0) > 0 ||
          (buildingOns.get("portal-infernite_mine") ?? 0) > 0,
        postRating,
        ruinsRating,
        gateUnlocked,
        gateRating,
      });
    }
    case "spire-waygate": {
      const settingsType = settings["prestigeType"];
      if (typeof settingsType !== "string") return undefined;
      const affix = readCapturedUniverseAffix(root);
      const spireStats = readGamePath(root, ["stats", "spire"]);
      const affixStats = readProperty(spireStats, affix);
      let mechPotentialTooHigh = false;
      if (settings["autoMech"] === true) {
        if (mechState === undefined) return undefined;
        const potential = readCapturedMechPotential(mechState);
        const configuredPotential = asNumber(settings["mechWaygatePotential"]);
        if (potential === null || configuredPotential === undefined)
          return undefined;
        mechPotentialTooHigh = potential > configuredPotential;
      }
      const protectPrestigeFloor =
        settings["autoPrestige"] === true && settingsType === "demonic";
      const rawPrestigeFloor = asNumber(settings["prestigeDemonicFloor"]);
      if (protectPrestigeFloor && rawPrestigeFloor === undefined)
        return undefined;
      const towerCount = buildingCounts.get("portal-spire") ?? 0;
      if (affix === undefined) return undefined;
      return Object.freeze({
        kind: metadataRule,
        cleared:
          Number(readProperty(readProperty(root, "tech"), "waygate") ?? 0) >= 3,
        demonicBombReady:
          settings["prestigeDemonicBomb"] === true &&
          settingsType === "demonic" &&
          (asNumber(readProperty(affixStats, "dlstr")) ?? 0) > 0,
        mechPotentialTooHigh: mechPotentialTooHigh,
        prestigeFloorProtected:
          protectPrestigeFloor &&
          rawPrestigeFloor !== undefined &&
          towerCount >= rawPrestigeFloor,
      });
    }
    case "early-galaxy-ship":
      return Object.freeze({
        kind: metadataRule,
        piracyUnlocked: Boolean(
          readProperty(readProperty(root, "tech"), "piracy"),
        ),
        embassyUnlocked: Boolean(buildingCounts.get("galaxy-embassy")),
      });
    case "armed-miner":
      return Object.freeze({
        kind: metadataRule,
        observations: Object.freeze([
          obs("Bolognium", "galaxy-armed_miner"),
          obs("Adamantite", "galaxy-armed_miner"),
          obs("Iridium", "galaxy-armed_miner"),
        ]) as unknown as readonly [
          ReturnType<typeof obs>,
          ReturnType<typeof obs>,
          ReturnType<typeof obs>,
        ],
      });
    case "bolognium-ship": {
      const missionBinding = "galaxy-gorddon_mission";
      const mission = buildingStates.find(
        (building) => building.catalog.binding === missionBinding,
      );
      const missionMaximum = asNumber(settings[`bld_m_${missionBinding}`]);
      const missionCount = mission?.count ?? 0;
      const missionUnlocked = mission?.available === true;
      const missionBuildable =
        missionUnlocked &&
        settings[`bat${missionBinding}`] === true &&
        (asNumber(settings[`bld_w_${missionBinding}`]) ?? 0) > 0 &&
        missionCount <
          (missionMaximum !== undefined && missionMaximum >= 0
            ? missionMaximum
            : Number.MAX_SAFE_INTEGER);
      return Object.freeze({
        kind: metadataRule,
        missionBuildable,
        scoutCount: buildingCounts.get("galaxy-scout_ship") ?? 0,
        corvetteCount: buildingCounts.get("galaxy-corvette_ship") ?? 0,
        gatewaySupportMaximum: supports.get("gateway")?.maximum ?? 0,
        observation: obs("Bolognium", "galaxy-bolognium_ship"),
      });
    }
    case "chthonian-raider":
      return Object.freeze({
        kind: metadataRule,
        starbaseOn: buildingOns.get("galaxy-starbase") ?? 0,
        observations: Object.freeze([
          obs("Vitreloy", "galaxy-raider"),
          obs("Polymer", "galaxy-raider"),
          obs("Neutronium", "galaxy-raider"),
          obs("Deuterium", "galaxy-raider"),
        ]) as unknown as readonly [
          ReturnType<typeof obs>,
          ReturnType<typeof obs>,
          ReturnType<typeof obs>,
          ReturnType<typeof obs>,
        ],
      });
    case "dual-resource":
      return Object.freeze({
        kind: metadataRule,
        observations: Object.freeze([
          obs("Deuterium", "interstellar-harvester"),
          obs("Helium_3", "interstellar-harvester"),
        ]) as unknown as readonly [
          ReturnType<typeof obs>,
          ReturnType<typeof obs>,
        ],
      });
    case "womling-farm": {
      const cropPerFarm = readCapturedWomlingFarmFood(root);
      if (cropPerFarm === undefined) return undefined;
      return Object.freeze({
        kind: metadataRule,
        supportMaximum: supports.get("tau_red")?.maximum ?? 0,
        cropPerFarm,
      });
    }
    case "womling-overseer": {
      const overseer = structures.find(
        (structure) => structure.actionId === binding,
      );
      const value = overseer?.readValue();
      const multiplier = readCapturedHumongousEffectMultiplier(root);
      if (
        value?.kind !== "value" ||
        value.value <= 0 ||
        multiplier === undefined
      )
        return undefined;
      const contribution = value.value * multiplier;
      if (!Number.isFinite(contribution) || contribution <= 0) return undefined;
      // DeadSpace src/main.js at 6cc9ba8 applies hugeAdjust() outside the
      // already-adjusted native val() and subtracts current miners.
      const loyaltyBase = readProperty(race, "womling_friend")
        ? 25
        : readProperty(race, "womling_god")
          ? 75
          : 0;
      const miners = readGamePathNumber(
        root,
        ["tauceti", "womling_mine", "miners"],
        0,
      );
      if (miners === undefined) return undefined;
      return Object.freeze({
        kind: metadataRule,
        requiredBuildings: Math.ceil(
          (100 - (loyaltyBase - miners)) / contribution,
        ),
      });
    }
    case "womling-fun": {
      const fun = structures.find(
        (structure) => structure.actionId === binding,
      );
      const value = fun?.readValue();
      const multiplier = readCapturedHumongousEffectMultiplier(root);
      if (
        value?.kind !== "value" ||
        value.value <= 0 ||
        multiplier === undefined
      )
        return undefined;
      const contribution = value.value * multiplier;
      if (!Number.isFinite(contribution) || contribution <= 0) return undefined;
      const moraleBase = readProperty(race, "womling_friend")
        ? 75
        : readProperty(race, "womling_god")
          ? 40
          : readProperty(race, "womling_lord")
            ? 30
            : 0;
      const miners = readGamePathNumber(
        root,
        ["tauceti", "womling_mine", "miners"],
        0,
      );
      const farmers = readGamePathNumber(
        root,
        ["tauceti", "womling_farm", "farmers"],
        0,
      );
      const injured = readGamePathNumber(
        root,
        ["tauceti", "overseer", "injured"],
        0,
      );
      if (
        miners === undefined ||
        farmers === undefined ||
        injured === undefined
      )
        return undefined;
      return Object.freeze({
        kind: metadataRule,
        requiredBuildings: Math.ceil(
          (100 - (moraleBase - miners - farmers - injured)) / contribution,
        ),
      });
    }
    case "tau-whaling-station": {
      if (!capturedPowerSmartEnabled(binding, settings))
        return Object.freeze({ kind: "ordinary" });
      const native = readCapturedTauWhalingProduction(
        dependencies.mechanics,
        structures,
        () => dependencies.rootState.readRoot() === root,
      );
      if (native === undefined)
        return Object.freeze({ kind: "unavailable-production" });
      return Object.freeze({
        kind: metadataRule,
        whalingShipsOn: buildingOns.get("tauceti-whaling_ship") ?? 0,
        ...native,
      });
    }
    case "tau-mining-pit": {
      const workersPerPit = readCapturedMiningPitWorkers(structures, binding);
      if (workersPerPit === undefined) return undefined;
      return Object.freeze({
        kind: metadataRule,
        populationMaximum: resource("Population")?.maxQuantity ?? 0,
        workersPerPit,
      });
    }
    case "exotic-zoo":
      return Object.freeze({ kind: metadataRule });
    default:
      return Object.freeze({ kind: "ordinary" });
  }
}

function makeSpireBuilding(
  binding: string,
  allRecords: readonly CapturedBuildingEntry[],
  settings: Readonly<Record<string, unknown>>,
  costs: GameActionCostReader | undefined,
  buildingStates: readonly CapturedBuildingState[],
): PowerSpireBuildingInput | undefined {
  const entry = allRecords.find((item) => item.binding === binding);
  if (entry === undefined) return undefined;
  const snapshot = buildingStates.find(
    (building) => building.catalog.binding === binding,
  );
  const count = snapshot?.count ?? 0;
  const on = snapshot?.stateOn ?? 0;
  const autoMaximumRaw = asNumber(settings[`bld_m_${binding}`]);
  const autoMaximum =
    autoMaximumRaw !== undefined && autoMaximumRaw >= 0
      ? Math.min(autoMaximumRaw, Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
  const unlocked = snapshot?.available === true;
  const weighting = asNumber(settings[`bld_w_${binding}`]) ?? 0;
  const autoBuildable =
    unlocked &&
    settings[`bat${binding}`] === true &&
    weighting > 0 &&
    count < autoMaximum;
  const price = costs?.readCost(entry.elementId);
  if (price === undefined) return undefined;
  const smartManaged =
    settings["autoPower"] === true &&
    unlocked &&
    settings[`bld_s_${binding}`] === true &&
    settings[`bld_s2_${binding}`] === true;
  return Object.freeze({
    buildingId: entry.id,
    binding,
    count,
    stateOn: on,
    autoMaximum,
    autoBuildable,
    smartManaged,
    moneyCost: price.cost["Money"] ?? 0,
    supplyCost: price.cost["Supply"] ?? 0,
  });
}

function isPowerGroupSmartManagementEnabled(
  root: unknown,
  binding: string,
  settings: Readonly<Record<string, unknown>>,
  buildingStates: readonly CapturedBuildingState[],
): boolean {
  const snapshot = buildingStates.find(
    (building) => building.catalog.binding === binding,
  );
  if (snapshot === undefined) return false;
  const entry = snapshot.catalog;
  const unlocked = snapshot.available;
  const gameSettings = readProperty(root, "settings");
  const visible =
    entry.region === "portal"
      ? readProperty(gameSettings, "showPortal") === true
      : entry.region === "space"
        ? readProperty(gameSettings, "showSpace") === true ||
          readProperty(gameSettings, "showOuter") === true
        : entry.region === "galaxy"
          ? readProperty(gameSettings, "showGalactic") === true
          : entry.region === "interstellar"
            ? readProperty(gameSettings, "showDeep") === true
            : entry.region === "tauceti"
              ? readProperty(gameSettings, "showTau") === true
              : true;
  return (
    visible &&
    unlocked &&
    settings["autoPower"] === true &&
    settings[`bld_s_${binding}`] === true &&
    capturedPowerSmartEnabled(binding, settings)
  );
}

function readLakeAndSpire(
  root: unknown,
  settings: Readonly<Record<string, unknown>>,
  runtime: CapturedPowerReaderRuntimeOptions,
  allRecords: readonly CapturedBuildingEntry[],
  resourceMap: ReadonlyMap<string, PowerResourceInput>,
  dependencies: CapturedPowerReaderDependencies,
  mechState: CapturedMechState | undefined,
  buildingStates: readonly CapturedBuildingState[],
  structures: readonly CapturedGameStructureDefinition[],
  lakeEnabled: boolean,
  spireAvailable: boolean,
  spireStateBalancingEnabled: boolean,
): { readonly lake: PowerLakeInput; readonly spire: PowerSpireInput } {
  const lakeBireme = allRecords.find(
    (entry) => entry.binding === "portal-bireme",
  );
  const lakeTransport = allRecords.find(
    (entry) => entry.binding === "portal-transport",
  );
  const lake: PowerLakeInput =
    lakeEnabled && lakeBireme !== undefined && lakeTransport !== undefined
      ? Object.freeze({
          enabled: true,
          bloodSpireLevel: readGamePathNumber(root, ["blood", "spire"], 0) ?? 0,
          biremeId: lakeBireme.id,
          biremeBinding: lakeBireme.binding,
          biremeCount:
            buildingStates.find(
              (building) => building.catalog.binding === lakeBireme.binding,
            )?.count ?? 0,
          biremeStateOn:
            buildingStates.find(
              (building) => building.catalog.binding === lakeBireme.binding,
            )?.stateOn ?? 0,
          transportId: lakeTransport.id,
          transportBinding: lakeTransport.binding,
          transportCount:
            buildingStates.find(
              (building) => building.catalog.binding === lakeTransport.binding,
            )?.count ?? 0,
          transportStateOn:
            buildingStates.find(
              (building) => building.catalog.binding === lakeTransport.binding,
            )?.stateOn ?? 0,
        })
      : EMPTY_LAKE;
  let spire: PowerSpireInput = EMPTY_SPIRE;
  if (spireAvailable) {
    const spireMech = makeSpireBuilding(
      "portal-mechbay",
      allRecords,
      settings,
      dependencies.costs,
      buildingStates,
    );
    const port = makeSpireBuilding(
      "portal-port",
      allRecords,
      settings,
      dependencies.costs,
      buildingStates,
    );
    const camp = makeSpireBuilding(
      "portal-base_camp",
      allRecords,
      settings,
      dependencies.costs,
      buildingStates,
    );
    const purifier = makeSpireBuilding(
      "portal-purifier",
      allRecords,
      settings,
      dependencies.costs,
      buildingStates,
    );
    if (
      spireMech === undefined ||
      port === undefined ||
      camp === undefined ||
      purifier === undefined
    )
      return Object.freeze({ lake, spire });
    const autoMech = settings["autoMech"] === true;
    if (autoMech && mechState === undefined)
      return Object.freeze({ lake, spire });
    const prestigeType = settings["prestigeType"];
    if (typeof prestigeType !== "string") return Object.freeze({ lake, spire });
    const prestigeFloor = asNumber(settings["prestigeDemonicFloor"]);
    if (
      settings["autoPrestige"] === true &&
      prestigeType === "demonic" &&
      prestigeFloor === undefined
    )
      return Object.freeze({ lake, spire });
    const money = resourceMap.get("Money");
    const supply = resourceMap.get("Supply");
    if (money === undefined || supply === undefined)
      return Object.freeze({ lake, spire });
    const supportedSupplyCapacity = asNumber(
      readGamePath(root, ["portal", "purifier", "sup_max"]),
    );
    if (supportedSupplyCapacity === undefined || supportedSupplyCapacity < 0)
      return Object.freeze({ lake, spire });
    const design =
      autoMech && mechState !== undefined
        ? designAutoChoice(mechState, () => 0)
        : null;
    let purifierDescription = dependencies.readPurifierDescription?.();
    if (purifierDescription === undefined) {
      const purifierDefinition = structures.find(
        (structure) => structure.actionId === "portal-purifier",
      );
      const description = purifierDefinition?.readDescription();
      if (description?.kind !== "value") return Object.freeze({ lake, spire });
      purifierDescription = description.value;
    }
    const mechQueued =
      readCapturedBuildQueueEntryCount(root, spireMech.binding) > 0;
    const purifierQueued =
      readCapturedBuildQueueEntryCount(root, purifier.binding) > 0;
    spire = Object.freeze({
      available: true,
      stateBalancingEnabled: spireStateBalancingEnabled,
      autoBuild: settings["autoBuild"] === true,
      autoMech,
      mechActive:
        (asNumber(readGamePath(root, ["portal", "mechbay", "active"])) ?? 0) >
        0,
      autoPrestige: settings["autoPrestige"] === true,
      prestigeType,
      // An absent floor is inert unless demonic auto-prestige is active; that case is validated above.
      prestigeDemonicFloor: prestigeFloor ?? 0,
      towerCount:
        buildingStates.find(
          (building) => building.catalog.binding === "portal-spire",
        )?.count ?? 0,
      moneyMaximum: money.maxQuantity,
      supplyCurrent: supply.currentQuantity,
      supportedSupplyCapacity,
      mechQueued,
      purifierQueued,
      purifierDescription,
      expectedSaveSupply:
        dependencies.readMechSaveSupply?.() ??
        (design === null || mechState === undefined
          ? false
          : capturedMechSupplyHold(
              mechState,
              false,
              design.teamPower,
              design.cost.space,
            )),
      mechBay: spireMech,
      port,
      camp,
      purifier,
    });
  }
  void runtime;
  return Object.freeze({ lake, spire });
}

function readPowerCycle(
  root: unknown,
  dependencies: CapturedPowerReaderDependencies,
  runtime: CapturedPowerReaderRuntimeOptions,
  settings: Readonly<Record<string, unknown>>,
  invalidFallbacks: Set<string>,
  unavailable: (
    authority: PowerUnavailableReason["authority"],
    message: string,
  ) => undefined,
): PowerCycleInput | undefined {
  const measure = createPhaseMeasure(dependencies.diagnostics);
  const tally = createCountTally(dependencies.diagnostics);
  let jobCounts: CapturedJobCountSnapshot | undefined;
  try {
    jobCounts = dependencies.readJobCounts?.(root, [
      "cement_worker",
      "miner",
      "coal_miner",
      "farmer",
      "hunter",
      "archaeologist",
      "space_miner",
    ]);
  } catch {
    return unavailable("job-counts", "job counts unavailable");
  }
  if (dependencies.rootState.readRoot() !== root)
    return unavailable("root", "root changed during sampling");
  const structures = measure("autoPower.readCycle.structures", () => {
    const captured = dependencies.mechanics.readStructures();
    tally.count("autoPower.readCycle.structureRegistryReads");
    return captured;
  });
  const production = dependencies.mechanics.readProductionBreakdown();
  const demand = dependencies.readDemand();
  if (demand === undefined)
    return unavailable(
      "exact-demand",
      `exact demand unavailable: ${dependencies.readDemandUnavailableReason?.() ?? "unknown prerequisite"}`,
    );
  if (structures === undefined)
    return unavailable("structures", "captured structures unavailable");
  const snapshot = createCapturedPowerMechanicsSnapshot(
    structures,
    root,
    dependencies.rootState,
  );
  if (snapshot === undefined)
    return unavailable("structures", "captured structure identities ambiguous");
  const nativeOrdering = measure("autoPower.readCycle.nativeOrdering", () =>
    readOrderedMechanics(root, dependencies.mechanics, snapshot, tally.count),
  );
  if (production === undefined)
    return unavailable("production", "production breakdown unavailable");
  if (nativeOrdering === undefined)
    return unavailable(
      "native-order",
      "native Power/support order unavailable",
    );
  const buildingSample = measure("autoPower.readCycle.semanticBuildings", () =>
    readCapturedSemanticBuildingSampleFromStructures(
      root,
      dependencies.controls,
      snapshot.structures,
      snapshot.isCurrent,
    ),
  );
  const buildingStates = buildingSample?.buildings;
  if (buildingStates === undefined)
    return unavailable("building-state", "Building semantic state unavailable");
  const allCatalog = buildingStates.map((building) => building.catalog);
  const managed = sortByStoredPriority(
    buildingStates.filter(
      (
        building,
      ): building is CapturedBuildingState & {
        readonly structure: CapturedGameStructureDefinition;
      } =>
        building.structure !== undefined &&
        building.hasState &&
        settings["bld_s_" + building.catalog.binding] === true &&
        building.count > 0,
    ),
    settings,
    (building) => `bld_p_${building.catalog.binding}`,
  );
  const supports = measure("autoPower.readCycle.nativeSupports", () =>
    readNativePowerSupports(
      root,
      dependencies.mechanics,
      snapshot.structures,
      nativeOrdering.supportOrders,
      snapshot.byEntryKey,
    ),
  );
  if (supports === undefined)
    return unavailable("native-support", "native support snapshot unavailable");
  const supportMap = new Map(supports.map((item) => [item.type, item]));
  const nativeSupportParticipants: {
    readonly structure: CapturedGameStructureDefinition;
    readonly supportTypes: readonly string[];
    readonly supportChanges: readonly PowerSupportChangeInput[];
  }[] = [];
  const unsafeSupportTypes = new Set<string>();
  let unsafeEverySupportType = false;
  const beltConsumers: PowerBeltConsumerInput[] = [];
  for (const structure of structures) {
    const state = readCapturedStructureState(root, structure);
    if (state === undefined || state === null) continue;
    const support = structure.readSupport();
    if (support.kind === "absent") continue;
    const readTypes = structure.readSupportTypes();
    const supportTypes =
      readTypes.kind === "value" ? readTypes.value : Object.freeze([]);
    if (readTypes.kind === "invalid") {
      if (supportTypes.length === 0) unsafeEverySupportType = true;
      for (const type of supportTypes) unsafeSupportTypes.add(type);
    }
    if (support.kind === "invalid") {
      if (supportTypes.length === 0) unsafeEverySupportType = true;
      for (const type of supportTypes) unsafeSupportTypes.add(type);
      nativeSupportParticipants.push({
        structure,
        supportTypes,
        supportChanges: Object.freeze([]),
      });
      continue;
    }
    if (!isRecord(state)) {
      if (supportTypes.length === 0) unsafeEverySupportType = true;
      for (const type of supportTypes) unsafeSupportTypes.add(type);
      nativeSupportParticipants.push({
        structure,
        supportTypes,
        supportChanges: Object.freeze([]),
      });
      continue;
    }
    const grids = structure.readNativeSupportGrids(root);
    if (grids.kind !== "value") {
      if (supportTypes.length === 0) unsafeEverySupportType = true;
      for (const type of supportTypes) unsafeSupportTypes.add(type);
      nativeSupportParticipants.push({
        structure,
        supportTypes,
        supportChanges: Object.freeze([]),
      });
      continue;
    }
    const participantTypes = new Set(supportTypes);
    const supportChanges: PowerSupportChangeInput[] = [];
    for (const grid of grids.value) {
      if (!isRecord(grid)) {
        if (participantTypes.size === 0) unsafeEverySupportType = true;
        for (const type of participantTypes) unsafeSupportTypes.add(type);
        continue;
      }
      const type = readProperty(grid, "type");
      const contribution = readProperty(grid, "contribution");
      const consumer = readProperty(grid, "consumer");
      const provider = readProperty(grid, "provider");
      if (typeof type === "string" && type.length > 0)
        participantTypes.add(type);
      if (
        typeof type !== "string" ||
        type.length === 0 ||
        typeof contribution !== "number" ||
        !Number.isFinite(contribution) ||
        typeof consumer !== "boolean" ||
        typeof provider !== "boolean" ||
        (!consumer && !provider && contribution !== 0) ||
        (consumer && support.value >= 0) ||
        (provider && contribution < 0)
      ) {
        if (typeof type === "string" && type.length > 0)
          unsafeSupportTypes.add(type);
        else if (participantTypes.size === 0) unsafeEverySupportType = true;
        else
          for (const participantType of participantTypes)
            unsafeSupportTypes.add(participantType);
        continue;
      }
      if (provider) {
        supportChanges.push(Object.freeze({ type, amount: -contribution }));
      }
      const consumerAmount = consumer ? -support.value : 0;
      if (consumer) {
        supportChanges.push(Object.freeze({ type, amount: consumerAmount }));
      }
      if (!consumer && !provider) {
        supportChanges.push(Object.freeze({ type, amount: 0 }));
      }
      if (type === "belt" && consumer && consumerAmount > 0) {
        const configured = readGameNumber(state, "on");
        if (configured === undefined || configured < 0) {
          unsafeSupportTypes.add(type);
          continue;
        }
        beltConsumers.push(
          Object.freeze({
            binding: structure.actionId,
            configured,
            supportPerUnit: consumerAmount,
            managed: settings[`bld_s_${structure.actionId}`] === true,
          }),
        );
      }
    }
    nativeSupportParticipants.push({
      structure,
      supportTypes: Object.freeze([...participantTypes]),
      supportChanges: Object.freeze(supportChanges),
    });
  }
  if (unsafeEverySupportType)
    for (const support of supports) unsafeSupportTypes.add(support.type);
  const candidates: {
    readonly record: (typeof managed)[number];
    readonly role: "consumer" | "generator" | "none";
    readonly supportTypes: readonly string[];
    readonly supportChanges: readonly PowerSupportChangeInput[];
  }[] = [];
  const beltConsumerByBinding = new Map(
    beltConsumers.map((consumer) => [consumer.binding, consumer]),
  );
  for (const record of managed) {
    const role = record.structure.readPowerGridRole(root, record.powered);
    const participant = nativeSupportParticipants.find(
      (candidate) => candidate.structure.entryKey === record.structure.entryKey,
    );
    const beltConsumer = beltConsumerByBinding.get(record.catalog.binding);
    const powerlessBeltConsumer =
      role.kind === "invalid" &&
      record.powered === 0 &&
      beltConsumer !== undefined &&
      participant?.supportTypes.includes("belt") === true;
    if (role.kind !== "value" && !powerlessBeltConsumer) continue;
    const nativeRole = role.kind === "value" ? role.value : "none";
    const supportTypes = participant?.supportTypes ?? Object.freeze([]);
    const nativeSupportChanges =
      participant?.supportChanges ?? Object.freeze([]);
    if (
      nativeRole === "none" &&
      nativeSupportChanges.length === 0 &&
      beltConsumer === undefined
    )
      continue;
    const hasNativeBeltConsumer = nativeSupportChanges.some(
      (change) => change.type === "belt" && change.amount > 0,
    );
    const supportChanges =
      beltConsumer !== undefined && !hasNativeBeltConsumer
        ? Object.freeze([
            ...nativeSupportChanges,
            Object.freeze({
              type: "belt",
              amount: beltConsumer.supportPerUnit,
            }),
          ])
        : nativeSupportChanges;
    candidates.push({
      record,
      // Belt miners draw no Power. Their captured native support demand stays eligible for
      // prospective planning even when the Power-grid role probe is invalid in the disabled state.
      role:
        nativeRole === "none" && beltConsumer !== undefined
          ? "consumer"
          : nativeRole,
      supportTypes,
      supportChanges,
    });
  }
  if (unsafeEverySupportType)
    for (const support of supports) unsafeSupportTypes.add(support.type);
  for (const participant of nativeSupportParticipants) {
    for (const type of participant.supportTypes) {
      if (!supportMap.has(type)) unsafeSupportTypes.add(type);
    }
  }
  for (const support of supports) {
    let modeledMaximum = 0;
    let modeledCurrent = 0;
    const hasNativeProviderModel = nativeSupportParticipants.some(
      (participant) =>
        participant.supportChanges.some(
          (change) => change.type === support.type && change.amount < 0,
        ),
    );
    for (const participant of nativeSupportParticipants) {
      for (const change of participant.supportChanges) {
        if (change.type !== support.type) continue;
        if (change.amount < 0) {
          const effective = dependencies.mechanics.readEffectivePowerCount(
            root,
            participant.structure.entryKey,
          );
          if (
            effective.kind !== "value" ||
            !Number.isFinite(effective.value) ||
            effective.value < 0
          ) {
            unsafeSupportTypes.add(support.type);
            continue;
          }
          modeledMaximum -= change.amount * effective.value;
        } else if (change.amount > 0) {
          // Pinned main.js uses native p_on for provider capacity and private support_on for
          // consumers actually served. Configured on remains the prospective Belt demand below.
          const effective = dependencies.mechanics.readEffectiveSupportCount(
            root,
            participant.structure.entryKey,
          );
          if (
            effective.kind !== "value" ||
            !Number.isFinite(effective.value) ||
            effective.value < 0
          ) {
            unsafeSupportTypes.add(support.type);
            continue;
          }
          modeledCurrent += change.amount * effective.value;
        }
      }
    }
    if (
      (hasNativeProviderModel &&
        Math.abs(modeledMaximum - support.maximum) > 1e-9) ||
      Math.abs(modeledCurrent - support.current) > 1e-9
    ) {
      unsafeSupportTypes.add(support.type);
    }
  }
  const supportSafe = candidates.filter(
    (candidate) =>
      !candidate.supportTypes.some(
        (type) => unsafeSupportTypes.has(type) || !supportMap.has(type),
      ),
  );
  const autoFleet = settings["autoFleet"] === true;
  const fleetCapRelevant =
    autoFleet &&
    candidates.some(
      ({ record }) =>
        record.structure.region === "galaxy" &&
        record.catalog.smart &&
        capturedPowerSmartEnabled(record.catalog.binding, settings),
    );
  const fleetNeededShipsSample = autoFleet
    ? dependencies.readFleetNeededShips?.()
    : null;
  if (fleetCapRelevant && fleetNeededShipsSample === undefined)
    return unavailable("fleet", "Fleet needed-ships unavailable");
  const fleetNeededShips = fleetNeededShipsSample ?? null;

  const powers: PowerBuildingInput[] = [];
  const supportSafeBindings = new Set(
    supportSafe.map(({ record }) => record.catalog.binding),
  );
  const lakeGroupManaged =
    supportSafeBindings.has("portal-bireme") &&
    supportSafeBindings.has("portal-transport") &&
    isPowerGroupSmartManagementEnabled(
      root,
      "portal-bireme",
      settings,
      buildingStates,
    ) &&
    isPowerGroupSmartManagementEnabled(
      root,
      "portal-transport",
      settings,
      buildingStates,
    );
  const spireStateBalancingEnabled =
    supportSafeBindings.has("portal-mechbay") &&
    supportSafeBindings.has("portal-port") &&
    supportSafeBindings.has("portal-base_camp") &&
    isPowerGroupSmartManagementEnabled(
      root,
      "portal-mechbay",
      settings,
      buildingStates,
    ) &&
    isPowerGroupSmartManagementEnabled(
      root,
      "portal-port",
      settings,
      buildingStates,
    ) &&
    isPowerGroupSmartManagementEnabled(
      root,
      "portal-base_camp",
      settings,
      buildingStates,
    );
  const spirePolicyCandidate =
    settings["autoPower"] === true &&
    readProperty(readProperty(root, "settings"), "showPortal") === true;
  const waygateNeedsMechState = supportSafe.some(
    ({ record }) => record.catalog.binding === "portal-waygate",
  );
  const requiresMechState =
    settings["autoMech"] === true &&
    (spirePolicyCandidate || waygateNeedsMechState);
  const mechState = requiresMechState
    ? dependencies.readMechState?.()
    : undefined;
  if (
    settings["autoMech"] === true &&
    waygateNeedsMechState &&
    mechState === undefined
  )
    return unavailable("mech", "Mech state unavailable");
  const spireAvailable =
    spirePolicyCandidate &&
    (settings["autoMech"] !== true || mechState !== undefined);
  const decayLabel = dependencies.mechanics.readLocalizedText(
    "evo_challenge_decay",
  );
  if (
    readProperty(readProperty(root, "race"), "decay") === true &&
    decayLabel.kind !== "value"
  )
    return unavailable("localization", "required localization unavailable");
  const decaySource = decayLabel.kind === "value" ? decayLabel.value : "";
  const resourceIds = new Set<string>(["Power", "Population", "Supply"]);
  if (spireAvailable) resourceIds.add("Money");
  const gameResources = readProperty(root, "resource");
  if (!isRecord(gameResources))
    return unavailable("resources", "resource snapshot unavailable");
  const speciesId = readProperty(readProperty(root, "race"), "species");
  for (const resourceId of Object.keys(gameResources)) {
    if (resourceId !== speciesId && !resourceId.endsWith("_Support"))
      resourceIds.add(resourceId);
  }
  for (const candidate of supportSafe) {
    const { record, role, supportChanges } = candidate;
    const binding = record.catalog.binding;
    const metadata = capturedPowerMetadataForBinding(binding);
    const consumptions = readCapturedPowerConsumptions(
      root,
      dependencies.mechanics,
      record.structure,
      production,
      record.stateOn,
      role,
      supportChanges.length > 0,
      invalidFallbacks,
    );
    const produces = capturedPowerProducerCapability(binding);
    const powered = record.powered;
    const title = record.structure.readTitle();
    const description = record.structure.readDescription();
    if (
      consumptions === undefined ||
      powered === undefined ||
      title.kind === "invalid" ||
      description.kind === "invalid"
    )
      return unavailable(
        "building-rule",
        `building-specific rule authority unavailable: ${binding}`,
      );
    for (const consumption of consumptions)
      resourceIds.add(consumption.resourceId);
    for (const resourceId of produces) resourceIds.add(resourceId);
    const state = readCapturedStructureState(root, record.structure);
    const autoMaximumRaw = asNumber(settings[`bld_m_${binding}`]);
    let fleetMaximum: number | null = null;
    if (
      autoFleet &&
      fleetNeededShips !== null &&
      Object.hasOwn(fleetNeededShips, record.structure.struct)
    ) {
      const needed = asNumber(fleetNeededShips[record.structure.struct]);
      if (needed === undefined)
        return unavailable(
          "fleet",
          `Fleet needed-ships unavailable: ${record.structure.struct}`,
        );
      fleetMaximum = needed;
    }
    const input: PowerBuildingInput = Object.freeze({
      index: powers.length,
      id: record.structure.struct,
      binding,
      count: record.count,
      stateOn: record.stateOn,
      powered,
      autoMaximum:
        autoMaximumRaw !== undefined && autoMaximumRaw >= 0
          ? autoMaximumRaw
          : Number.MAX_SAFE_INTEGER,
      tab: record.structure.region,
      smartCategory: record.catalog.smart,
      smartEnabled: capturedPowerSmartEnabled(binding, settings),
      autoStateManaged: settings[`bld_s_${binding}`] === true,
      crewShip: typeof readProperty(state, "crew") === "number",
      crewValueRank: metadata.crewValueRank,
      singleState: metadata.singleState,
      ignorePositivePowerCap: metadata.ignorePositivePowerCap,
      skipGroup:
        metadata.skipGroup === "spire" && spireStateBalancingEnabled
          ? "spire"
          : metadata.skipGroup === "lake" && lakeGroupManaged
            ? "lake"
            : "none",
      // Actions without a description have no extra text in the old Power wrapper.
      extraDescription: description.kind === "value" ? description.value : "",
      consumptions,
      supportChanges,
      produces,
      fleetMaximum,
      rule: Object.freeze({ kind: "ordinary" }),
    });
    powers.push(input);
  }
  const completeResourceIds = [...resourceIds];
  const resourceInputs = readPowerResourceInputs(
    root,
    completeResourceIds,
    settings,
    demand,
    production,
    dependencies.resources,
    buildingStates,
    decaySource,
  );
  if (resourceInputs === undefined)
    return unavailable("resources", "resource snapshot unavailable");
  const resourceMap = new Map(resourceInputs.map((item) => [item.id, item]));
  const rawSpecies = readProperty(readProperty(root, "race"), "species");
  const populationId =
    typeof rawSpecies === "string" && rawSpecies.length > 0
      ? rawSpecies
      : "Population";
  const populationModel = resourceInputs.find(
    (item) => item.id === populationId,
  );
  const power = resourceMap.get("Power");
  if (populationModel === undefined || power === undefined)
    return unavailable(
      "resources",
      "resource snapshot unavailable: Power or Population",
    );
  const actualSpaceMiners =
    jobCounts?.readCount("space_miner") ??
    readGamePathNumber(root, ["civic", "space_miner", "workers"]) ??
    0;
  const spaceMinerUsesSmartJobsCap =
    settings["autoJobs"] === true &&
    settings["job_space_miner"] === true &&
    settings["job_s_space_miner"] === true;
  // Space Miner worker rows can be absent before the Civic panel materializes them; the game
  // treats that lazily initialized row as zero workers. Otherwise use the Jobs counter snapshot.
  const spaceMinerSupportMaximum = spaceMinerUsesSmartJobsCap
    ? dependencies.readProspectiveSpaceMiners?.(root)
    : actualSpaceMiners;
  resourceMap.set("Population", populationModel);
  const buildingCounts = new Map<string, number>();
  const buildingOns = new Map<string, number>();
  for (const building of buildingStates) {
    buildingCounts.set(building.catalog.binding, building.count);
    buildingOns.set(building.catalog.binding, building.stateOn);
  }
  const filledPowers: PowerBuildingInput[] = [];
  for (const building of powers) {
    const metadata = capturedPowerMetadataForBinding(building.binding);
    const rule = readBuildingRule(
      root,
      building.binding,
      metadata.rule,
      building.produces,
      building.powered,
      production,
      demand,
      resourceMap,
      supportMap,
      buildingCounts,
      buildingOns,
      buildingStates,
      settings,
      structures,
      dependencies.controls,
      dependencies,
      mechState,
      jobCounts,
    );
    if (rule === undefined)
      return unavailable(
        "building-rule",
        `building-specific rule authority unavailable: ${building.binding}`,
      );
    filledPowers.push(
      Object.freeze({
        ...building,
        rule,
      }),
    );
  }

  const powerUnlocked = power.unlocked;
  const population = populationModel.currentQuantity;
  const currentCrew =
    readGamePathNumber(root, ["civic", "crew", "workers"], 0) ?? 0;
  const gameSettings = readProperty(root, "settings");
  const settingsInput: PowerSettingsInput = Object.freeze({
    showGalactic: Boolean(readProperty(gameSettings, "showGalactic")),
    limitPowered: settings["buildingsLimitPowered"] === true,
    autoFleet: settings["autoFleet"] === true,
    autoPower: settings["autoPower"] === true,
    autoJobs: settings["autoJobs"] === true,
    crewReserve: readCrewReserve(settings["crewReserve"], population),
  });
  const lakeAndSpire = readLakeAndSpire(
    root,
    settings,
    runtime,
    allCatalog,
    resourceMap,
    dependencies,
    mechState,
    buildingStates,
    snapshot.structures,
    lakeGroupManaged,
    spireAvailable,
    spireStateBalancingEnabled,
  );
  const cycle: PowerCycleInput = Object.freeze({
    powerUnlocked,
    powerResourceId: "Power",
    powerCurrent: power.currentQuantity,
    powerMaximum: power.maxQuantity,
    replicatorAvailable:
      power.currentQuantity > power.maxQuantity &&
      Boolean(readProperty(readProperty(root, "tech"), "replicator")),
    fasting: Boolean(readProperty(readProperty(root, "race"), "fasting")),
    hungryRace:
      filledPowers.some(
        (building) =>
          building.rule.kind === "tourist-center" ||
          building.consumptions.some(
            (consumption) => consumption.resourceId === "Food",
          ),
      ) && Boolean(readProperty(readProperty(root, "race"), "hungry")),
    banquetStateOn: buildingOns.get("city-banquet") ?? 0,
    debug: runtime.debug,
    consumptionBalanceMinimum: runtime.consumptionBalanceMinimum,
    civilianPopulation: population,
    currentCrew,
    prospectiveSpaceMiners: spaceMinerSupportMaximum,
    settings: settingsInput,
    resources: resourceInputs,
    supports,
    beltConsumers: Object.freeze(beltConsumers),
    buildings: Object.freeze(filledPowers),
    lake: lakeAndSpire.lake,
    spire: lakeAndSpire.spire,
  });
  return snapshot.isCurrent()
    ? cycle
    : unavailable(
        "root",
        "root or captured structure identity changed during sampling",
      );
}

/** Captured Power port with panel-independent semantic Building sampling. */
export function createCapturedPowerReader({
  rootState,
  mechanics,
  diagnostics,
  readJobCounts,
  readProspectiveSpaceMiners,
  controls,
  resources,
  readDemand,
  readDemandUnavailableReason,
  readFleetNeededShips,
  costs,
  readPurifierDescription,
  readMechState,
  readMechSaveSupply,
  readSettingsRaw,
  readRuntimeOptions,
  readWarnings,
}: CapturedPowerReaderDependencies): PowerReader {
  const invalidFallbacks = new Set<string>();
  let unavailableReason: PowerUnavailableReason = {
    authority: "root",
    message: "Power cycle authority unavailable",
  };
  const unavailable = (
    authority: PowerUnavailableReason["authority"],
    message: string,
  ): undefined => {
    unavailableReason = { authority, message };
    return undefined;
  };
  let fallbackRoot: unknown;
  const dependencies: CapturedPowerReaderDependencies = {
    rootState,
    mechanics,
    ...(diagnostics === undefined ? {} : { diagnostics }),
    ...(readJobCounts === undefined ? {} : { readJobCounts }),
    ...(readProspectiveSpaceMiners === undefined
      ? {}
      : { readProspectiveSpaceMiners }),
    controls,
    resources,
    readDemand,
    ...(readDemandUnavailableReason === undefined
      ? {}
      : { readDemandUnavailableReason }),
    ...(readFleetNeededShips === undefined ? {} : { readFleetNeededShips }),
    ...(costs === undefined ? {} : { costs }),
    ...(readPurifierDescription === undefined
      ? {}
      : { readPurifierDescription }),
    ...(readMechState === undefined ? {} : { readMechState }),
    ...(readMechSaveSupply === undefined ? {} : { readMechSaveSupply }),
    readSettingsRaw,
    readRuntimeOptions,
    readWarnings,
  };
  return Object.freeze({
    readCycle(): PowerCycleInput | undefined {
      unavailableReason = {
        authority: "root",
        message: "Power cycle authority unavailable",
      };
      const root = rootState.readRoot();
      if (root === undefined)
        return unavailable("root", "captured root unavailable");
      if (root !== fallbackRoot) {
        invalidFallbacks.clear();
        fallbackRoot = root;
      }
      let raw: unknown;
      let runtime: CapturedPowerReaderRuntimeOptions | undefined;
      try {
        raw = readSettingsRaw();
        runtime = readRuntimeOptions();
      } catch {
        return unavailable("settings", "Power settings unavailable");
      }
      if (
        !isRecord(raw) ||
        runtime === undefined ||
        !Number.isFinite(runtime.consumptionBalanceMinimum)
      ) {
        return unavailable("settings", "Power settings unavailable");
      }
      return readPowerCycle(
        root,
        dependencies,
        runtime,
        raw,
        invalidFallbacks,
        unavailable,
      );
    },
    readUnavailableReason: () => unavailableReason,
    readWarnings(domIds: readonly string[]): readonly PowerWarnBuildingInput[] {
      return readWarnings(domIds);
    },
    readStateOn(binding: string): number {
      const root = rootState.readRoot();
      const structures = mechanics.readStructures();
      if (root === undefined || structures === undefined) {
        throw new TypeError("captured Power structure registry is unavailable");
      }
      const snapshots = readCapturedSemanticBuildingSampleFromStructures(
        root,
        controls,
        structures,
      )?.buildings;
      const building = snapshots?.find(
        (entry) =>
          entry.catalog.binding === binding ||
          entry.structure?.entryKey === binding,
      );
      if (building === undefined) {
        throw new TypeError(
          "captured Power binding is unavailable: " + binding,
        );
      }
      const stateOn = building.stateOn;
      return stateOn;
    },
  });
}
