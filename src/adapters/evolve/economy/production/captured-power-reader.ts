/** Strict Power sampling from the live root, captured Building catalog and DeadSpace mechanics. */

import type {
  PowerBuildingInput,
  PowerBuildingRule,
  PowerConsumptionInput,
  PowerCycleInput,
  PowerLakeInput,
  PowerResourceInput,
  PowerSettingsInput,
  PowerSpireBuildingInput,
  PowerSpireInput,
  PowerWarnBuildingInput,
} from "../../../../domain/economy/production/power.ts";
import {
  readCapturedBuildingState,
  type CapturedBuildingState,
} from "../../progression/build/captured-building-state.ts";
import { sortByStoredPriority } from "../../../../domain/settings-priority-order.ts";
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
import type { CapturedMechState } from "../../../../domain/combat/mech-state.ts";
import type { PowerReader } from "../../../../ports/power.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import { readCapturedResourceLabel } from "../../captured-resource-metadata.ts";
import {
  readCapturedJobStackMultiplier,
  readCapturedHighPopulationGrowthMultiplier,
  readCapturedHighPopulationPercent,
  readCapturedLegacyJobCount,
  readCapturedPopulationResource,
  readCapturedPoweredTraitValue,
  readCapturedSpaceMinerSmartMaximum,
  readCapturedTraitScaleVariable,
} from "../../civic/captured-job-catalog.ts";
import { readCapturedGovernorTaskActive } from "../../civic/captured-tax.ts";
import { calculateRequiredAuthorityGarrison } from "../../../../domain/civic/authority.ts";
import { readAuthorityPolicyView } from "../../civic/authority.ts";
import type { CapturedDemandSample } from "../../economy/resources/captured-resource-demand.ts";
import { readCapturedSupplyRateAdjustment } from "../../economy/resources/captured-supply.ts";
import { readCapturedEjectRateAdjustment } from "../../economy/resources/captured-ejector.ts";
import { TRADE_ROUTE_RATIO } from "../../economy/market/trade-price-mirror.ts";
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
import {
  readCapturedBuildingEntries,
  type CapturedBuildingEntry,
} from "../../progression/build/captured-building-catalog.ts";
import {
  capturedPowerMetadataForBinding,
  capturedPowerSmartEnabled,
  capturedPowerSupportType,
  readCapturedPowerConsumptionRate,
} from "./captured-power-metadata.ts";

export interface CapturedPowerReaderRuntimeOptions {
  readonly settings: PowerSettingsInput;
  readonly debug: boolean;
  readonly consumptionBalanceMinimum: number;
}

export interface CapturedPowerReaderDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly mechanics: CapturedGameMechanics;
  readonly resources: GameResourceSource;
  /** Resource commitments and largest observed build cost from the shared demand phase. */
  readonly readDemand: () => CapturedDemandSample;
  /** The current fleet planner's `neededShips`, when that result is available. */
  readonly readFleetNeededShips?: () =>
    Readonly<Record<string, number>> | null | undefined;
  /** Already captured progression availability. This lookup must never draw a tab. */
  readonly readBuildingUnlocked?: (
    actionId: string,
    region: string,
  ) => boolean | undefined;
  /** Current game-owned action costs, used by Spire and lake support rules. */
  readonly costs?: GameActionCostReader;
  /** The page-local date used by the retired reader's astrology bonus. */
  readonly readCurrentDate: () => Date;
  /** Previous Power-cycle description emitted for the Spire purifier. */
  readonly readPurifierDescription?: () => string | undefined;
  /** The current typed Mech reader state, including the queue-key sample. */
  readonly readMechState?: () => CapturedMechState;
  /** Stored automation settings, including the managed-building priorities and state flags. */
  readonly readSettingsRaw: () => unknown;
  readonly readRuntimeOptions: () =>
    CapturedPowerReaderRuntimeOptions | undefined;
  readonly readWarnings: (
    domIds: readonly string[],
  ) => readonly PowerWarnBuildingInput[];
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

// Retired Power uses this disabled subgroup when either smart-managed gate is off.
const EMPTY_SPIRE: PowerSpireInput = Object.freeze({
  enabled: false,
  autoBuild: false,
  autoMech: false,
  mechActive: false,
  autoPrestige: false,
  prestigeType: "",
  prestigeDemonicFloor: 0,
  towerCount: 0,
  moneyMaximum: 0,
  supplyCurrent: 0,
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

function makeStructureByBinding(
  structures: readonly CapturedGameStructureDefinition[],
): ReadonlyMap<string, readonly CapturedGameStructureDefinition[]> {
  const result = new Map<string, CapturedGameStructureDefinition[]>();
  for (const structure of structures) {
    const matching = result.get(structure.actionId) ?? [];
    matching.push(structure);
    result.set(structure.actionId, matching);
  }
  return new Map(
    [...result].map(([binding, candidates]) => [
      binding,
      Object.freeze(candidates),
    ]),
  );
}

function structureForCatalogEntry(
  entry: Readonly<CapturedBuildingEntry>,
  structures: ReadonlyMap<string, readonly CapturedGameStructureDefinition[]>,
): CapturedGameStructureDefinition | undefined {
  const candidates = structures.get(entry.binding) ?? [];
  if (entry.entryKey !== undefined) {
    return candidates.find(
      (candidate) => candidate.entryKey === entry.entryKey,
    );
  }
  const matching = candidates.filter(
    (candidate) =>
      candidate.region === entry.region &&
      candidate.struct === entry.id &&
      (entry.sector === undefined || candidate.sector === entry.sector),
  );
  return matching.length === 1 ? matching[0] : undefined;
}

function readOrderedMechanics(
  root: unknown,
  mechanics: CapturedGameMechanics,
  structures: readonly CapturedGameStructureDefinition[],
): boolean {
  const powerOrder = mechanics.readPowerOrder(root);
  if (powerOrder.kind !== "value") return false;

  const types = new Set<string>();
  for (const structure of structures) {
    const supportTypes = structure.readSupportTypes();
    if (supportTypes.kind === "invalid") return false;
    if (supportTypes.kind === "value") {
      for (const type of supportTypes.value) types.add(type);
    }
    const provider = structure.readSupportProvider();
    const topology = structure.readSupportTopology();
    if (provider.kind === "invalid" || topology.kind !== "value") return false;
    if (topology.value.enabled.kind === "invalid") return false;
  }
  for (const type of types) {
    const ordered = mechanics.readSupportOrder(root, type);
    if (ordered.kind !== "value") return false;
    for (const structure of ordered.value) {
      if (structure.readSupportValue(type).kind !== "value") return false;
    }
  }
  return true;
}

function readPowerBuildingStates(
  root: unknown,
  catalog: readonly CapturedBuildingEntry[],
  structures: readonly CapturedGameStructureDefinition[],
  readAvailable: CapturedPowerReaderDependencies["readBuildingUnlocked"],
): readonly CapturedBuildingState[] | undefined {
  const byBinding = makeStructureByBinding(structures);
  const result: CapturedBuildingState[] = [];
  for (const entry of catalog) {
    const structure = structureForCatalogEntry(entry, byBinding);
    const state = readCapturedBuildingState(
      root,
      entry,
      structure,
      readAvailable?.(entry.elementId, entry.region) === true,
    );
    if (state === undefined) return undefined;
    result.push(state);
  }
  return Object.freeze(result);
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

/** Retired Building.getFuelRate's metadata-declaration adjustment selection. */
export function readCapturedPowerMetadataFuelMode(
  binding: string,
  region: string,
  resourceId: string,
): CapturedFuelAdjustmentMode | undefined {
  if (binding === "interstellar-fusion") return undefined;
  if (
    region === "space" &&
    (resourceId === "Oil" || resourceId === "Helium_3")
  ) {
    return "space";
  }
  if (
    ["interstellar", "galaxy", "tauceti"].includes(region) &&
    (resourceId === "Deuterium" || resourceId === "Helium_3")
  ) {
    return "interstellar";
  }
  return undefined;
}

function readFuelInputs(
  root: unknown,
  settings: Readonly<Record<string, unknown>>,
  mechanics: CapturedGameMechanics,
  structure: CapturedGameStructureDefinition,
  metadataConsumptions: readonly {
    readonly resourceId: string;
    readonly policy: import("./captured-power-metadata.ts").CapturedPowerRatePolicy;
  }[],
): readonly PowerConsumptionInput[] | undefined {
  const binding = structure.actionId;
  const definitions = metadataConsumptions.map((item) => ({
    resourceId: item.resourceId,
    rate: readCapturedPowerConsumptionRate(root, binding, settings, item),
  }));
  const powerFuel = structure.readFuel();
  if (powerFuel.kind === "invalid") return undefined;
  const supportFuel = structure.readSupportFuel();
  if (supportFuel.kind === "invalid") return undefined;
  const supportAdjustmentDisabled =
    structure.readSupportFuelAdjustmentDisabled();
  if (supportAdjustmentDisabled.kind === "invalid") return undefined;
  const powerAdjustmentRequested = structure.readFuelAdjustmentRequested();
  if (powerAdjustmentRequested.kind === "invalid") return undefined;

  const result: PowerConsumptionInput[] = [];
  const append = (
    resourceId: string,
    rate: number,
    adjustmentDisabled = false,
    adjustmentMode: CapturedFuelAdjustmentMode | undefined = undefined,
  ) => {
    const fuelRate =
      adjustmentDisabled || adjustmentMode === undefined
        ? rate
        : readFuelRate(mechanics, resourceId, rate, adjustmentMode);
    if (fuelRate === undefined) return false;
    result.push(Object.freeze({ resourceId, rate, fuelRate }));
    return true;
  };
  for (const definition of definitions) {
    const mode = readCapturedPowerMetadataFuelMode(
      binding,
      structure.region,
      definition.resourceId,
    );
    if (!append(definition.resourceId, definition.rate, false, mode)) {
      return undefined;
    }
  }
  if (powerFuel.kind === "value" && powerFuel.value !== false) {
    const powerAdjustmentEnabled =
      powerAdjustmentRequested.kind === "value" &&
      powerAdjustmentRequested.value &&
      structure.sector !== "city";
    for (const fuel of powerFuel.value) {
      const mode = powerAdjustmentEnabled
        ? fuelModeFor(structure.region, fuel.resourceId)
        : undefined;
      if (!append(fuel.resourceId, fuel.amount, false, mode)) return undefined;
    }
  }
  if (supportFuel.kind === "value" && supportFuel.value !== false) {
    const adjustmentDisabled =
      supportAdjustmentDisabled.kind === "value" &&
      supportAdjustmentDisabled.value;
    for (const fuel of supportFuel.value) {
      const mode = adjustmentDisabled
        ? undefined
        : fuelModeFor(structure.region, fuel.resourceId);
      if (!append(fuel.resourceId, fuel.amount, adjustmentDisabled, mode)) {
        return undefined;
      }
    }
  }

  const metadata = capturedPowerMetadataForBinding(binding);
  if (metadata.supportResourceId !== undefined) {
    const type = capturedPowerSupportType(metadata.supportResourceId);
    if (type === undefined) return undefined;
    const types = structure.readSupportTypes();
    if (types.kind !== "value" || !types.value.includes(type)) return undefined;
    const output = structure.readSupportValue(type);
    if (output.kind !== "value") return undefined;
    if (!append(metadata.supportResourceId, -output.value)) return undefined;
  }
  return Object.freeze(result);
}

function readSupportAnchorState(
  root: unknown,
  resourceId: string,
  structures: readonly CapturedGameStructureDefinition[],
):
  | Pick<
      PowerResourceInput,
      | "currentQuantity"
      | "maxQuantity"
      | "rateOfChange"
      | "storageRatio"
      | "unlocked"
    >
  | undefined {
  const type = capturedPowerSupportType(resourceId);
  if (type === undefined) return undefined;
  const anchors = new Set<string>();
  for (const structure of structures) {
    const types = structure.readSupportTypes();
    if (types.kind === "invalid") return undefined;
    if (types.kind !== "value" || !types.value.includes(type)) continue;
    const topology = structure.readSupportTopology();
    if (topology.kind !== "value") return undefined;
    if (topology.value.anchorEntryKey !== null)
      anchors.add(topology.value.anchorEntryKey);
  }
  if (anchors.size === 0) {
    // Support wrappers retain zeroed state before their game's anchor is initialized.
    return Object.freeze({
      currentQuantity: 0,
      maxQuantity: 0,
      rateOfChange: 0,
      storageRatio: 1,
      unlocked: false,
    });
  }
  if (anchors.size !== 1) return undefined;
  const anchorKey = [...anchors][0];
  const anchor = structures.find(
    (structure) => structure.entryKey === anchorKey,
  );
  if (anchor === undefined) return undefined;
  const state = readCapturedStructureState(root, anchor);
  if (state === undefined || state === null) {
    return Object.freeze({
      currentQuantity: 0,
      maxQuantity: 0,
      rateOfChange: 0,
      storageRatio: 1,
      unlocked: false,
    });
  }
  if (!isRecord(state)) return undefined;
  const maximum = readGameNumber(state, "s_max");
  const current = readGameNumber(state, "support");
  if (maximum === undefined || current === undefined) return undefined;
  const rate = maximum - current;
  return Object.freeze({
    currentQuantity: current,
    maxQuantity: maximum,
    rateOfChange: rate,
    storageRatio: maximum > 0 ? rate / maximum : 1,
    unlocked: true,
  });
}

export function readCapturedPowerOrdinaryResourceState(
  root: unknown,
  id: string,
  settings: Readonly<Record<string, unknown>>,
  demand: CapturedDemandSample,
  production: CapturedProductionBreakdown,
  view: ResourceView | undefined,
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
  const tradeRoutes = TRADE_ROUTE_RATIO[id] ?? -1;
  const tradeDiff = asNumber(production.consumption[id]?.Trade) ?? 0;
  const sell =
    settings["autoMarket"] === true && tradeRoutes > 0 && tradeDiff < 0
      ? -tradeDiff
      : 0;
  const decay =
    readProperty(readProperty(root, "race"), "decay") === true &&
    tradeRoutes > 0 &&
    current >= 50
      ? (current - 50) * (0.001 * tradeRoutes)
      : 0;
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
    supportKind: "none",
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

export function readCapturedPowerSupportResourceState(
  root: unknown,
  id: string,
  settings: Readonly<Record<string, unknown>>,
  structures: readonly CapturedGameStructureDefinition[],
  buildingStates: readonly CapturedBuildingState[] = [],
): PowerResourceInput | undefined {
  let current: number;
  let maximum: number;
  let unlocked: boolean;
  const supportBuildingOn = (binding: string) =>
    buildingStates.find((building) => building.catalog.binding === binding)
      ?.stateOn ?? 0;
  if (id === "Belt_Support") {
    const anchor = readSupportAnchorState(root, id, structures);
    if (anchor === undefined) return undefined;
    current = anchor.currentQuantity;
    maximum = anchor.maxQuantity;
    unlocked = anchor.unlocked;
  } else if (id === "Electrolysis_Support") {
    unlocked = Boolean(readProperty(readProperty(root, "race"), "truepath"));
    current = supportBuildingOn("space-hydrogen_plant");
    maximum = supportBuildingOn("space-electrolysis");
  } else if (id === "Womlings_Support") {
    const tech = readProperty(root, "tech");
    unlocked = (asNumber(readProperty(tech, "tau_red")) ?? 0) >= 5;
    const farm = supportBuildingOn("tauceti-womling_farm");
    const lab = supportBuildingOn("tauceti-womling_lab");
    const mine = supportBuildingOn("tauceti-womling_mine");
    const village = supportBuildingOn("tauceti-womling_village");
    current = 2 * farm + lab + 6 * mine;
    maximum =
      village *
      ((asNumber(readProperty(tech, "womling_pop")) ?? 0) >= 2 ? 6 : 5);
  } else {
    const anchor = readSupportAnchorState(root, id, structures);
    if (anchor === undefined) return undefined;
    current = anchor.currentQuantity;
    maximum = anchor.maxQuantity;
    unlocked = anchor.unlocked;
  }
  if (id === "Belt_Support" && unlocked) {
    const highPopulation = readCapturedJobStackMultiplier(root);
    const spaceStation = buildingStates.find(
      (building) => building.catalog.binding === "space-space_station",
    );
    const stationCount = spaceStation?.count ?? 0;
    const stationOn = spaceStation?.stateOn ?? 0;
    const stationLimit =
      settings["autoPower"] === true &&
      settings["bld_s_space-space_station"] === true
        ? stationCount
        : stationOn;
    const smartSpaceMiners =
      settings["autoJobs"] === true &&
      settings["job_space_miner"] === true &&
      settings["job_s_space_miner"] === true;
    const workerLimit = smartSpaceMiners
      ? readCapturedSpaceMinerSmartMaximum(root)
      : readCapturedLegacyJobCount(root, "space_miner", false);
    if (
      highPopulation === undefined ||
      stationLimit === undefined ||
      workerLimit === undefined
    )
      return undefined;
    maximum = Math.min(stationLimit * 3 * highPopulation, workerLimit);
  }
  if (!unlocked) {
    current = 0;
    maximum = 0;
  }
  const rate = maximum - current;
  const storageRatio = maximum > 0 ? rate / maximum : 1;
  return Object.freeze({
    id,
    title: readCapturedResourceLabel(root, id),
    currentQuantity: current,
    maxQuantity: maximum,
    rateOfChange: unlocked ? rate : 0,
    storageRatio,
    unlocked,
    useful: storageRatio < 0.99,
    income: unlocked ? rate : 0,
    supportKind:
      id === "Womlings_Support"
        ? "womlings-support"
        : id === "Tau_Belt_Support"
          ? "tau-belt-support"
          : "support",
  });
}

function readPowerResourceState(
  root: unknown,
  id: string,
  settings: Readonly<Record<string, unknown>>,
  demand: CapturedDemandSample,
  production: CapturedProductionBreakdown,
  view: ResourceView | undefined,
  structures: readonly CapturedGameStructureDefinition[],
  buildingStates: readonly CapturedBuildingState[],
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
        supportKind: "none",
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
    const populationRecord = readCapturedPopulationResource(root);
    const populationCurrent =
      asNumber(readProperty(populationRecord, "amount")) ?? 0;
    const populationRawMaximum =
      asNumber(readProperty(populationRecord, "max")) ?? 0;
    const populationMaximum =
      populationRawMaximum < 0 ? Number.MAX_SAFE_INTEGER : populationRawMaximum;
    let maximum = 0;
    if (readProperty(readProperty(root, "race"), "powered")) {
      const traitValue = readCapturedPoweredTraitValue(root);
      if (traitValue === undefined) return undefined;
      maximum += (populationMaximum - populationCurrent) * traitValue;
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
      supportKind: "none",
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
        supportKind: "none",
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
      supportKind: "none",
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
      supportKind: "none",
    });
  }
  if (capturedPowerSupportType(id) !== undefined) {
    return readCapturedPowerSupportResourceState(
      root,
      id,
      settings,
      structures,
      buildingStates,
    );
  }
  return readCapturedPowerOrdinaryResourceState(
    root,
    id,
    settings,
    demand,
    production,
    view,
  );
}

function readPowerResourceInputs(
  root: unknown,
  ids: readonly string[],
  settings: Readonly<Record<string, unknown>>,
  demand: CapturedDemandSample,
  production: CapturedProductionBreakdown,
  resources: GameResourceSource,
  structures: readonly CapturedGameStructureDefinition[],
  buildingStates: readonly CapturedBuildingState[],
): readonly PowerResourceInput[] | undefined {
  const synthetic = new Set([
    "Power",
    "Population",
    "Supply",
    ...ids.filter((id) => capturedPowerSupportType(id) !== undefined),
  ]);
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
      structures,
      buildingStates,
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

function readPowerHealingStructureValue(
  buildingStates: readonly CapturedBuildingState[],
  actionId: string,
  field: "count" | "on",
): number {
  const building = buildingStates.find(
    (entry) => entry.catalog.binding === actionId,
  );
  return field === "count" ? (building?.count ?? 0) : (building?.stateOn ?? 0);
}

function readPowerLegacyTraitValue(
  root: unknown,
  traitId: string,
  index: number,
  fallback: number,
  values: readonly [number, number, number],
  operation: "raw" | "plus" = "raw",
): number | undefined {
  const race = readProperty(root, "race");
  if (!readProperty(race, traitId)) return fallback;
  const value = readCapturedTraitScaleVariable(
    root,
    traitId,
    index,
    values,
    "major",
  );
  return value === undefined
    ? undefined
    : operation === "plus"
      ? 1 + value / 100
      : value;
}

/** Mirrors the retired `createGameRates().getHealingRate()` used by Triton Lander. */
function readPowerLegacyHealingRate(
  root: unknown,
  buildingStates: readonly CapturedBuildingState[],
  currentDate: Date,
): number | undefined {
  if (!(currentDate instanceof Date) || !Number.isFinite(currentDate.getTime()))
    return undefined;
  const race = readProperty(root, "race");
  const city = readProperty(root, "city");
  const tech = readProperty(root, "tech");
  const stats = readProperty(root, "stats");
  const achievements = readProperty(stats, "achieve");
  const sacrificialAltar = readProperty(city, "s_alter");
  let healingCount: number | undefined;
  if (readProperty(race, "orbit_decayed") && readProperty(race, "truepath")) {
    healingCount = readPowerHealingStructureValue(
      buildingStates,
      "space-enceladus_base",
      "on",
    );
  } else if (readProperty(race, "artifical")) {
    healingCount = readPowerHealingStructureValue(
      buildingStates,
      "city-boot_camp",
      "count",
    );
  } else {
    healingCount = readPowerHealingStructureValue(
      buildingStates,
      "city-hospital",
      "count",
    );
  }
  if (healingCount === undefined) return undefined;
  if (
    readProperty(race, "rejuvenated") &&
    readProperty(achievements, "lamentis")
  ) {
    const lamentis = readProperty(achievements, "lamentis");
    const level = asNumber(readProperty(lamentis, "l"));
    if (level === undefined) return undefined;
    healingCount += Math.min(level, 5);
  }
  const month = currentDate.getMonth();
  const day = currentDate.getDate();
  // DeadSpace seasons.js astrologySign() uses the page's local calendar date.
  const cancerSign = (month === 5 && day >= 22) || (month === 6 && day <= 22);
  healingCount *= cancerSign ? 1.05 : 1;
  const medic = asNumber(readProperty(tech, "medic")) || 1;
  healingCount *= medic;
  healingCount += (asNumber(readProperty(race, "fibroblast")) ?? 0) * 2 || 0;
  if ((asNumber(readProperty(sacrificialAltar, "regen")) ?? 0) > 0) {
    const cannibalize = readPowerLegacyTraitValue(
      root,
      "cannibalize",
      0,
      1,
      [6, 15, 24],
    );
    const cannibalizeFactor = readPowerLegacyTraitValue(
      root,
      "cannibalize",
      0,
      1,
      [6, 15, 24],
      "plus",
    );
    if (cannibalize === undefined || cannibalizeFactor === undefined)
      return undefined;
    healingCount =
      healingCount >= 20
        ? healingCount * cannibalizeFactor
        : healingCount + Math.floor(cannibalize / 5);
  }
  const highPopulationGrowth = readCapturedHighPopulationGrowthMultiplier(root);
  if (highPopulationGrowth === undefined) return undefined;
  healingCount *= highPopulationGrowth;
  const governorBackground = readProperty(
    readProperty(readProperty(race, "governor"), "g"),
    "bg",
  );
  if (governorBackground === "sports") healingCount *= 1.5;
  const banquetOn = readPowerHealingStructureValue(
    buildingStates,
    "city-banquet",
    "on",
  );
  const banquetCount = readPowerHealingStructureValue(
    buildingStates,
    "city-banquet",
    "count",
  );
  if (banquetOn === undefined || banquetCount === undefined) return undefined;
  if (banquetOn > 0 && banquetCount >= 2) {
    const strength = asNumber(
      readProperty(readProperty(city, "banquet"), "strength"),
    );
    if (strength === undefined) return undefined;
    healingCount *= 1 + strength ** 0.65 / 100;
  }
  // Retain the legacy TODO: troll fathom has not been included in this automation rate.
  const regeneration = readPowerLegacyTraitValue(
    root,
    "slow_regen",
    0,
    1,
    [45, 25, 12],
    "plus",
  );
  const regenerative = readPowerLegacyTraitValue(
    root,
    "regenerative",
    1,
    1,
    [1, 4, 7],
  );
  if (regeneration === undefined || regenerative === undefined)
    return undefined;
  const maximumBound = 20 * regeneration;
  healingCount = Math.round(healingCount);
  let healed = regenerative + Math.floor(healingCount / maximumBound);
  const leftover = healingCount % maximumBound;
  if (leftover > 0) {
    const chances = leftover * maximumBound;
    let success = 0;
    for (let index = 0; index < leftover; index++) {
      for (let comparison = 0; comparison < maximumBound; comparison++) {
        success += Number(index > comparison);
      }
    }
    healed += success / chances;
  }
  return Number.isFinite(healed) ? healed : undefined;
}

/** Mirrors CraftingJob.count for the legacy Crafter.Scarletite usefulness guard. */
function readPowerLegacyCrafterCount(
  root: unknown,
  resourceId: string,
): number | undefined {
  const workers =
    asNumber(
      readProperty(
        readProperty(readProperty(root, "city"), "foundry"),
        resourceId,
      ),
    ) ?? 0;
  const servants =
    asNumber(
      readProperty(
        readProperty(
          readProperty(readProperty(root, "race"), "servants"),
          "sjobs",
        ),
        resourceId,
      ),
    ) ?? 0;
  const multiplier = readCapturedJobStackMultiplier(root);
  return multiplier === undefined ? undefined : workers + servants * multiplier;
}

const POWER_BUSY_SOURCE_BINDING: Readonly<Record<string, string>> =
  Object.freeze({
    "space-gas_mining": "space-gas_mining",
    "space-oil_extractor": "space-oil_extractor",
    "space-orichalcum_mine": "space-orichalcum_mine",
    "space-uranium_mine": "space-uranium_mine",
    "space-neutronium_mine": "space-neutronium_mine",
    "space-elerium_mine": "space-elerium_mine",
    "space-iridium_ship": "job_space_miner",
    "space-iron_ship": "job_space_miner",
    "space-elerium_ship": "job_space_miner",
    "space-iridium_mine": "space-iridium_mine",
    "space-helium_mine": "space-helium_mine",
    "galaxy-vitreloy_plant": "galaxy-vitreloy_plant",
    "galaxy-excavator": "galaxy-excavator",
    "space-water_freighter": "space-water_freighter",
    "eden-asphodel_harvester": "eden-asphodel_harvester",
    "galaxy-armed_miner": "galaxy-armed_miner",
    "galaxy-raider": "galaxy-raider",
    "interstellar-harvester": "interstellar-harvester",
    "city-tourist_center": "city-tourist_center",
  });

const POWER_BUSY_SOURCE_LOCALIZATION_KEY: Readonly<Record<string, string>> =
  Object.freeze({
    "galaxy-vitreloy_plant": "galaxy_vitreloy_plant_bd",
    "galaxy-armed_miner": "galaxy_armed_miner_bd",
  });

function readLocalizedProductionSource(
  root: unknown,
  sourceBinding: string,
  structures: readonly CapturedGameStructureDefinition[],
  controls: GameControlRegistry,
  mechanics: CapturedGameMechanics,
): string {
  if (sourceBinding === "job_space_miner") {
    const name = readProperty(
      readProperty(readProperty(root, "civic"), "space_miner"),
      "name",
    );
    if (typeof name === "string") return name;
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
  production: CapturedProductionBreakdown,
  demand: CapturedDemandSample,
  resources: ReadonlyMap<string, PowerResourceInput>,
  buildingCounts: ReadonlyMap<string, number>,
  buildingOns: ReadonlyMap<string, number>,
  buildingStates: readonly CapturedBuildingState[],
  settings: Readonly<Record<string, unknown>>,
  structures: readonly CapturedGameStructureDefinition[],
  controls: GameControlRegistry,
  dependencies: CapturedPowerReaderDependencies,
  mechState: CapturedMechState | undefined,
): PowerBuildingRule | undefined {
  const race = readProperty(root, "race");
  const resource = (id: string) => resources.get(id);
  const obs = (
    id: string,
    sourceBinding = POWER_BUSY_SOURCE_BINDING[binding] ?? binding,
  ) => {
    const value = resource(id);
    return Object.freeze({
      resourceId: id,
      useful: value?.useful ?? false,
      production: readObservedProduction(
        id,
        production,
        readLocalizedProductionSource(
          root,
          sourceBinding,
          structures,
          controls,
          dependencies.mechanics,
        ),
      ),
      income: value?.income ?? 0,
    });
  };
  switch (metadataRule) {
    case "neutron-citadel":
      return Object.freeze({
        kind: metadataRule,
        electromagneticField: Boolean(readProperty(race, "emfield")),
      });
    case "belt-space-station": {
      const stationTitle = readLocalizedProductionSource(
        root,
        "space-space_station",
        structures,
        controls,
        dependencies.mechanics,
      );
      const capacity = production.capacity?.Elerium?.[stationTitle];
      const stationStorage = readCellNumber(capacity);
      if (demand.maxCost === undefined) return undefined;
      return Object.freeze({
        kind: metadataRule,
        stationStorage,
        eleriumMaximum: resource("Elerium")?.maxQuantity ?? 0,
        eleriumMaximumCost: demand.maxCost("Elerium"),
        eleriumShipsOn: buildingOns.get("space-elerium_ship") ?? 0,
        iridiumShipsOn: buildingOns.get("space-iridium_ship") ?? 0,
        ironShipsOn: buildingOns.get("space-iron_ship") ?? 0,
      });
    }
    case "job-dependent": {
      const jobId =
        binding === "city-cement_plant"
          ? "cement_worker"
          : binding === "city-coal_mine"
            ? "coal_miner"
            : "miner";
      return Object.freeze({
        kind: metadataRule,
        jobCount: readCapturedLegacyJobCount(root, jobId, false) ?? 0,
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
        "space-gas_mining": ["Helium_3", "space-gas_mining", true],
        "space-oil_extractor": ["Oil", "space-oil_extractor", true],
        "space-orichalcum_mine": ["Orichalcum", "space-orichalcum_mine", true],
        "space-uranium_mine": ["Uranium", "space-uranium_mine", true],
        "space-neutronium_mine": ["Neutronium", "space-neutronium_mine", true],
        "space-elerium_mine": ["Elerium", "space-elerium_mine", true],
        "space-iridium_ship": ["Iridium", "job_space_miner", false],
        "space-iron_ship": ["Iron", "job_space_miner", false],
        "space-elerium_ship": ["Elerium", "job_space_miner", false],
        "space-iridium_mine": ["Iridium", "space-iridium_mine", false],
        "space-helium_mine": ["Helium_3", "space-helium_mine", false],
        "galaxy-vitreloy_plant": ["Vitreloy", "galaxy-vitreloy_plant", false],
        "galaxy-excavator": ["Orichalcum", "galaxy-excavator", false],
        "space-water_freighter": ["Water", "space-water_freighter", false],
        "eden-asphodel_harvester": [
          "Asphodel_Powder",
          "eden-asphodel_harvester",
          false,
        ],
      };
      const selected = selector[sourceBinding];
      if (selected === undefined) return undefined;
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
      let healingRate: number | undefined;
      try {
        healingRate = readPowerLegacyHealingRate(
          root,
          buildingStates,
          dependencies.readCurrentDate(),
        );
      } catch {
        return undefined;
      }
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
      if (healingRate === undefined || !Number.isFinite(healingRate))
        return undefined;
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
        healingRate,
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
    case "mill":
      return Object.freeze({
        kind: metadataRule,
        foodStorageRatio: resource("Food")?.storageRatio ?? 1,
        foodWorkers:
          (readCapturedLegacyJobCount(root, "farmer", true) ?? 0) +
          (readCapturedLegacyJobCount(root, "hunter", true) ?? 0),
        sampledPower: resource("Power")?.currentQuantity ?? 0,
      });
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
      const postEffect =
        postControl === undefined
          ? undefined
          : controls.invoke(postControl, "effect");
      const postText =
        postEffect?.ok === true && typeof postEffect.value === "string"
          ? postEffect.value
          : "";
      // The effect contains the game's localized guard-post rating. Read its numeric value
      // from that live output instead of reimplementing armyRating and its trait effects.
      const postNumbers = postText.match(/[-+]?\d[\d,]*(?:\.\d+)?/gu) ?? [];
      const postRating =
        postNumbers.length > 0
          ? Number(postNumbers[0]!.replaceAll(",", ""))
          : undefined;
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
        highPopulation === undefined ||
        postRating === undefined ||
        ruinsRating === undefined ||
        gateRating === undefined
      )
        return undefined;
      const gateUnlocked =
        Number(readProperty(readProperty(root, "tech"), "hell_gate") ?? 0) > 0;
      const archaeologists = readCapturedLegacyJobCount(
        root,
        "archaeologist",
        false,
      );
      const scarletiteCrafters = readPowerLegacyCrafterCount(
        root,
        "Scarletite",
      );
      if (archaeologists === undefined || scarletiteCrafters === undefined)
        return undefined;
      return Object.freeze({
        kind: metadataRule,
        suppressionUseful:
          archaeologists > 0 ||
          scarletiteCrafters > 0 ||
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
        gatewaySupportMaximum: resource("Gateway_Support")?.maxQuantity ?? 0,
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
    case "womling-farm":
      return Object.freeze({
        kind: metadataRule,
        supportMaximum: resource("Womlings_Support")?.maxQuantity ?? 0,
        cropPerFarm:
          (Number(
            readProperty(readProperty(root, "tech"), "womling_pop") ?? 0,
          ) > 0
            ? 16
            : 12) +
          (Number(
            readProperty(readProperty(root, "tech"), "womling_gene") ?? 0,
          ) > 0
            ? 4
            : 0),
      });
    case "womling-overseer": {
      const overseer = structures.find(
        (structure) => structure.actionId === binding,
      );
      const value = overseer?.readValue();
      if (value?.kind !== "value") return undefined;
      return Object.freeze({
        kind: metadataRule,
        loyaltyBase: readProperty(race, "womling_friend")
          ? 25
          : readProperty(race, "womling_god")
            ? 75
            : 0,
        loyaltyPerBuilding: value.value,
        miners:
          readGamePathNumber(root, ["tauceti", "womling_mine", "miners"], 0) ??
          0,
      });
    }
    case "womling-fun": {
      const fun = structures.find(
        (structure) => structure.actionId === binding,
      );
      const value = fun?.readValue();
      if (value?.kind !== "value") return undefined;
      return Object.freeze({
        kind: metadataRule,
        moraleBase: readProperty(race, "womling_friend")
          ? 75
          : readProperty(race, "womling_god")
            ? 40
            : readProperty(race, "womling_lord")
              ? 30
              : 0,
        moralePerBuilding: value.value,
        miners:
          readGamePathNumber(root, ["tauceti", "womling_mine", "miners"], 0) ??
          0,
        farmers:
          readGamePathNumber(root, ["tauceti", "womling_farm", "farmers"], 0) ??
          0,
        injured:
          readGamePathNumber(root, ["tauceti", "overseer", "injured"], 0) ?? 0,
      });
    }
    case "tau-whaling-station":
      return Object.freeze({
        kind: metadataRule,
        supportMaximum: resource("Tau_Belt_Support")?.maxQuantity ?? 0,
        supportCurrent: resource("Tau_Belt_Support")?.currentQuantity ?? 0,
        whalingShipsOn: buildingOns.get("tauceti-whaling_ship") ?? 0,
      });
    case "tau-mining-pit":
      return Object.freeze({
        kind: metadataRule,
        populationMaximum: resource("Population")?.maxQuantity ?? 0,
      });
    case "exotic-zoo":
      return Object.freeze({ kind: metadataRule });
    default:
      return Object.freeze({ kind: "ordinary" });
  }
}

function readRuleResourceIds(binding: string): readonly string[] {
  switch (binding) {
    case "interstellar-citadel":
      return [];
    case "space-space_station":
      return ["Elerium"];
    case "interstellar-ascension_trigger":
      return ["Harmony"];
    case "city-cement_plant":
    case "city-mine":
    case "city-coal_mine":
      return [];
    case "portal-cooling_tower":
    case "portal-harbor":
      return [];
    case "space-gas_mining":
      return ["Helium_3"];
    case "space-oil_extractor":
      return ["Oil"];
    case "space-orichalcum_mine":
      return ["Orichalcum"];
    case "space-uranium_mine":
      return ["Uranium"];
    case "space-neutronium_mine":
      return ["Neutronium"];
    case "space-elerium_mine":
    case "space-elerium_ship":
      return ["Elerium"];
    case "space-iridium_ship":
    case "space-iridium_mine":
      return ["Iridium"];
    case "space-iron_ship":
      return ["Iron"];
    case "space-helium_mine":
      return ["Helium_3"];
    case "galaxy-vitreloy_plant":
      return ["Vitreloy", "Bolognium", "Stanene", "Money"];
    case "galaxy-excavator":
      return ["Orichalcum"];
    case "space-water_freighter":
      return ["Water"];
    case "eden-asphodel_harvester":
      return ["Asphodel_Powder"];
    case "space-lander":
      return ["Authority"];
    case "city-tourist_center":
      return ["Food", "Money"];
    case "city-mill":
      return ["Food", "Power"];
    case "galaxy-armed_miner":
      return ["Bolognium", "Adamantite", "Iridium"];
    case "galaxy-bolognium_ship":
      return ["Bolognium", "Gateway_Support"];
    case "galaxy-raider":
      return ["Vitreloy", "Polymer", "Neutronium", "Deuterium"];
    case "interstellar-harvester":
      return ["Deuterium", "Helium_3"];
    case "tauceti-womling_farm":
      return ["Womlings_Support"];
    case "tauceti-whaling_station":
      return ["Tau_Belt_Support"];
    case "tauceti-mining_pit":
      return ["Population"];
    default:
      return [];
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
):
  | { readonly lake: PowerLakeInput; readonly spire: PowerSpireInput }
  | undefined {
  const lakeBireme = allRecords.find(
    (entry) => entry.binding === "portal-bireme",
  );
  const lakeTransport = allRecords.find(
    (entry) => entry.binding === "portal-transport",
  );
  const lakeEnabled =
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
  const spireEnabled =
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
  let spire: PowerSpireInput = EMPTY_SPIRE;
  if (spireEnabled) {
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
      return undefined;
    const autoMech = settings["autoMech"] === true;
    if (autoMech && mechState === undefined) return undefined;
    const prestigeType = settings["prestigeType"];
    if (typeof prestigeType !== "string") return undefined;
    const prestigeFloor = asNumber(settings["prestigeDemonicFloor"]);
    if (
      settings["autoPrestige"] === true &&
      prestigeType === "demonic" &&
      prestigeFloor === undefined
    )
      return undefined;
    const money = resourceMap.get("Money");
    const supply = resourceMap.get("Supply");
    if (money === undefined || supply === undefined) return undefined;
    const design =
      autoMech && mechState !== undefined
        ? designAutoChoice(mechState, () => 0)
        : null;
    let purifierDescription = dependencies.readPurifierDescription?.();
    if (purifierDescription === undefined) {
      const purifierDefinition = dependencies.mechanics
        .readStructures()
        ?.find((structure) => structure.actionId === "portal-purifier");
      const description = purifierDefinition?.readDescription();
      if (description?.kind !== "value") return undefined;
      purifierDescription = description.value;
    }
    const mechQueued =
      readCapturedBuildQueueEntryCount(root, spireMech.binding) > 0;
    const purifierQueued =
      readCapturedBuildQueueEntryCount(root, purifier.binding) > 0;
    spire = Object.freeze({
      enabled: true,
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
      mechQueued,
      purifierQueued,
      purifierDescription,
      expectedSaveSupply:
        design === null || mechState === undefined
          ? false
          : capturedMechSupplyHold(
              mechState,
              false,
              design.teamPower,
              design.cost.space,
            ),
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
): PowerCycleInput | undefined {
  const structures = dependencies.mechanics.readStructures();
  const production = dependencies.mechanics.readProductionBreakdown();
  const demand = dependencies.readDemand();
  if (
    structures === undefined ||
    production === undefined ||
    !readOrderedMechanics(root, dependencies.mechanics, structures)
  ) {
    return undefined;
  }
  const allCatalog = readCapturedBuildingEntries(
    root,
    dependencies.controls,
    structures,
  );
  const buildingStates = readPowerBuildingStates(
    root,
    allCatalog,
    structures,
    dependencies.readBuildingUnlocked,
  );
  if (buildingStates === undefined) return undefined;
  const managed = sortByStoredPriority(
    buildingStates,
    settings,
    (building) => "bld_p_" + building.catalog.binding,
  ).filter(
    (
      building,
    ): building is CapturedBuildingState & {
      readonly structure: CapturedGameStructureDefinition;
    } =>
      building.structure !== undefined &&
      building.hasState &&
      settings["bld_s_" + building.catalog.binding] === true &&
      building.count > 0,
  );
  const autoFleet = settings["autoFleet"] === true;
  const fleetNeededShipsSample = autoFleet
    ? dependencies.readFleetNeededShips?.()
    : null;
  if (autoFleet && fleetNeededShipsSample === undefined) return undefined;
  const fleetNeededShips = fleetNeededShipsSample ?? null;

  const powers: PowerBuildingInput[] = [];
  const lakeGroupManaged =
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
  const spireGroupManaged =
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
  const requiresMechState =
    settings["autoMech"] === true &&
    (spireGroupManaged ||
      managed.some(({ catalog }) => catalog.binding === "portal-waygate"));
  const mechState = requiresMechState
    ? dependencies.readMechState?.()
    : undefined;
  if (requiresMechState && mechState === undefined) return undefined;
  const resourceIds = new Set<string>(["Power", "Population", "Supply"]);
  if (spireGroupManaged) resourceIds.add("Money");
  for (let index = 0; index < managed.length; index++) {
    const record = managed[index]!;
    const binding = record.catalog.binding;
    const metadata = capturedPowerMetadataForBinding(binding);
    const consumptions = readFuelInputs(
      root,
      settings,
      dependencies.mechanics,
      record.structure,
      metadata.consumptions,
    );
    const powered = record.powered;
    const title = record.structure.readTitle();
    const description = record.structure.readDescription();
    if (
      consumptions === undefined ||
      powered === undefined ||
      title.kind === "invalid" ||
      description.kind === "invalid"
    )
      return undefined;
    for (const consumption of consumptions)
      resourceIds.add(consumption.resourceId);
    for (const resourceId of metadata.produces) resourceIds.add(resourceId);
    for (const resourceId of readRuleResourceIds(binding))
      resourceIds.add(resourceId);
    const state = readCapturedStructureState(root, record.structure);
    const autoMaximumRaw = asNumber(settings[`bld_m_${binding}`]);
    let fleetMaximum: number | null = null;
    if (
      autoFleet &&
      fleetNeededShips !== null &&
      Object.hasOwn(fleetNeededShips, record.structure.struct)
    ) {
      const needed = asNumber(fleetNeededShips[record.structure.struct]);
      if (needed === undefined) return undefined;
      fleetMaximum = needed;
    }
    const input: PowerBuildingInput = Object.freeze({
      index,
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
      ship: metadata.ship,
      crewShip: typeof readProperty(state, "crew") === "number",
      crewValueRank: metadata.crewValueRank,
      singleState: metadata.singleState,
      ignorePositivePowerCap: metadata.ignorePositivePowerCap,
      skipGroup:
        metadata.skipGroup === "spire" && spireGroupManaged
          ? "spire"
          : metadata.skipGroup === "lake" && lakeGroupManaged
            ? "lake"
            : "none",
      // Actions without a description have no extra text in the old Power wrapper.
      extraDescription: description.kind === "value" ? description.value : "",
      consumptions,
      produces: Object.freeze([...metadata.produces]),
      fleetMaximum,
      rule: Object.freeze({ kind: "ordinary" }),
    });
    powers.push(input);
  }
  const supportIds = [...resourceIds].filter(
    (id) => capturedPowerSupportType(id) !== undefined,
  );
  const completeResourceIds = [...resourceIds];
  // The retired reader's rule payloads and direct building declarations share one resource
  // registry. Support capacities are sampled from their live anchor state, never reconstructed.
  for (const id of supportIds) {
    if (!completeResourceIds.includes(id)) completeResourceIds.push(id);
  }
  const resourceInputs = readPowerResourceInputs(
    root,
    completeResourceIds,
    settings,
    demand,
    production,
    dependencies.resources,
    structures,
    buildingStates,
  );
  if (resourceInputs === undefined) return undefined;
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
  if (populationModel === undefined || power === undefined) return undefined;
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
      production,
      demand,
      resourceMap,
      buildingCounts,
      buildingOns,
      buildingStates,
      settings,
      structures,
      dependencies.controls,
      dependencies,
      mechState,
    );
    if (rule === undefined) return undefined;
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
  );
  if (lakeAndSpire === undefined) return undefined;
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
    settings: settingsInput,
    resources: resourceInputs,
    buildings: Object.freeze(filledPowers),
    lake: lakeAndSpire.lake,
    spire: lakeAndSpire.spire,
  });
  return cycle;
}

/** Captured Power port. Production `autoPower` continues to use its bounded slice for now. */
export function createCapturedPowerReader({
  rootState,
  mechanics,
  controls,
  resources,
  readDemand,
  readFleetNeededShips,
  readBuildingUnlocked,
  costs,
  readCurrentDate,
  readPurifierDescription,
  readMechState,
  readSettingsRaw,
  readRuntimeOptions,
  readWarnings,
}: CapturedPowerReaderDependencies): PowerReader {
  const dependencies: CapturedPowerReaderDependencies = {
    rootState,
    mechanics,
    controls,
    resources,
    readDemand,
    ...(readFleetNeededShips === undefined ? {} : { readFleetNeededShips }),
    ...(readBuildingUnlocked === undefined ? {} : { readBuildingUnlocked }),
    ...(costs === undefined ? {} : { costs }),
    readCurrentDate,
    ...(readPurifierDescription === undefined
      ? {}
      : { readPurifierDescription }),
    ...(readMechState === undefined ? {} : { readMechState }),
    readSettingsRaw,
    readRuntimeOptions,
    readWarnings,
  };
  return Object.freeze({
    readCycle(): PowerCycleInput | undefined {
      const root = rootState.readRoot();
      if (root === undefined) return undefined;
      let raw: unknown;
      let runtime: CapturedPowerReaderRuntimeOptions | undefined;
      try {
        raw = readSettingsRaw();
        runtime = readRuntimeOptions();
      } catch {
        return undefined;
      }
      if (
        !isRecord(raw) ||
        runtime === undefined ||
        !Number.isFinite(runtime.consumptionBalanceMinimum)
      ) {
        return undefined;
      }
      return readPowerCycle(root, dependencies, runtime, raw);
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
      const catalog = readCapturedBuildingEntries(root, controls, structures);
      const snapshots = readPowerBuildingStates(
        root,
        catalog,
        structures,
        readBuildingUnlocked,
      );
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
