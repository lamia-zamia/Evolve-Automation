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
import type { PowerReader } from "../../../../ports/power.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import { readCapturedResourceLabel } from "../../captured-resource-metadata.ts";
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
  /** Stored automation settings, including the managed-building priorities and state flags. */
  readonly readSettingsRaw: () => unknown;
  readonly readRuntimeOptions: () =>
    CapturedPowerReaderRuntimeOptions | undefined;
  readonly readWarnings: (
    domIds: readonly string[],
  ) => readonly PowerWarnBuildingInput[];
}

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

interface CapturedPowerBuildingRecord {
  readonly catalog: Readonly<CapturedBuildingEntry>;
  readonly structure: CapturedGameStructureDefinition;
  readonly count: number;
  readonly stateOn: number;
}

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

function readCapturedStructureOn(
  root: unknown,
  structure: CapturedGameStructureDefinition,
): number | undefined {
  const state = readCapturedStructureState(root, structure);
  if (state === undefined || state === null) return 0;
  if (!isRecord(state)) return undefined;
  return readGameNumber(state, "on", 0);
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

function readPowerRequirementsSatisfied(
  root: unknown,
  structure: CapturedGameStructureDefinition,
): boolean | undefined {
  const requirements = structure.readPowerRequirements();
  if (requirements.kind === "invalid") return undefined;
  if (requirements.kind === "absent") return true;
  const tech = readProperty(root, "tech");
  for (const requirement of requirements.value) {
    const level = readGameNumber(tech, requirement.techId, 0);
    // Upstream checkPowerRequirements first requires a truthy tech rank, then compares it to the
    // action's requirement. An absent or zero rank never satisfies even a zero threshold.
    if (level === undefined || level === 0 || level < requirement.level)
      return false;
  }
  return true;
}

function readCapturedPowerValue(
  root: unknown,
  structure: CapturedGameStructureDefinition,
): number | undefined {
  const requirements = readPowerRequirementsSatisfied(root, structure);
  if (requirements === undefined) return undefined;
  if (!requirements) return 0;
  const powered = structure.readPowered();
  if (powered.kind === "absent") return 0;
  return powered.kind === "value" ? powered.value : undefined;
}

function readManagedBuildingRecords(
  root: unknown,
  settings: Readonly<Record<string, unknown>>,
  controls: GameControlRegistry,
  structures: readonly CapturedGameStructureDefinition[],
): readonly CapturedPowerBuildingRecord[] | undefined {
  const byBinding = makeStructureByBinding(structures);
  const catalog = readCapturedBuildingEntries(root, controls, structures);
  const priorityCatalog = sortByStoredPriority(
    catalog,
    settings,
    (entry) => `bld_p_${entry.binding}`,
  );
  const result: CapturedPowerBuildingRecord[] = [];
  for (const entry of priorityCatalog) {
    if (!entry.switchable || settings[`bld_s_${entry.binding}`] !== true) {
      continue;
    }
    const structure = structureForCatalogEntry(entry, byBinding);
    if (structure === undefined) return undefined;
    const state = readCapturedStructureState(root, structure);
    if (!isRecord(state)) continue;
    const count = readGameNumber(state, "count", 0);
    const stateOn = readGameNumber(state, "on", 0);
    if (count === undefined || stateOn === undefined) return undefined;
    if (count <= 0) continue;
    result.push(Object.freeze({ catalog: entry, structure, count, stateOn }));
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
  region: string,
  resourceId: string,
  amount: number,
): number | undefined {
  const mode = fuelModeFor(region, resourceId);
  if (mode === undefined) return amount;
  const adjustment = mechanics.readAdjustedFuelFactor(mode, resourceId);
  return adjustment.kind === "value" ? amount * adjustment.value : undefined;
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
        : readFuelRate(mechanics, structure.region, resourceId, rate);
    if (fuelRate === undefined) return false;
    result.push(Object.freeze({ resourceId, rate, fuelRate }));
    return true;
  };
  for (const definition of definitions) {
    if (!append(definition.resourceId, definition.rate, true)) {
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

function readSupportResourceState(
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
  | null
  | undefined {
  const type = capturedPowerSupportType(resourceId);
  if (type === undefined) return undefined;
  const anchors = new Set<string>();
  for (const structure of structures) {
    const types = structure.readSupportTypes();
    if (types.kind === "invalid") return null;
    if (types.kind !== "value" || !types.value.includes(type)) continue;
    const topology = structure.readSupportTopology();
    if (topology.kind !== "value") return null;
    if (topology.value.anchorEntryKey !== null)
      anchors.add(topology.value.anchorEntryKey);
  }
  if (anchors.size !== 1) return null;
  const anchorKey = [...anchors][0];
  const anchor = structures.find(
    (structure) => structure.entryKey === anchorKey,
  );
  if (anchor === undefined) return null;
  const state = readCapturedStructureState(root, anchor);
  if (!isRecord(state)) return null;
  const maximum = readGameNumber(state, "s_max");
  const current = readGameNumber(state, "support");
  if (maximum === undefined || current === undefined) return null;
  const rate = maximum - current;
  return Object.freeze({
    currentQuantity: current,
    maxQuantity: maximum,
    rateOfChange: rate,
    storageRatio: maximum > 0 ? rate / maximum : 1,
    unlocked: true,
  });
}

function readPowerResourceInputs(
  root: unknown,
  ids: readonly string[],
  resources: GameResourceSource,
  structures: readonly CapturedGameStructureDefinition[],
): readonly PowerResourceInput[] | undefined {
  const sample = resources.readResources(ids);
  if (sample === undefined) return undefined;
  const result: PowerResourceInput[] = [];
  for (const id of ids) {
    const supportState = readSupportResourceState(root, id, structures);
    if (supportState === null) return undefined;
    const support = supportState;
    const view = sample.resources.get(id);
    if (support === undefined && view === undefined) return undefined;
    const rawResource = readProperty(readProperty(root, "resource"), id);
    const currentQuantity =
      support?.currentQuantity ?? (view?.present ? asNumber(view.amount) : 0);
    const maximumCandidate =
      support?.maxQuantity ?? (view?.present ? asNumber(view.max) : 0);
    if (currentQuantity === undefined || maximumCandidate === undefined)
      return undefined;
    const rawRate = readGameNumber(rawResource, "diff");
    const rateOfChange =
      support?.rateOfChange ??
      (view?.present ? (asNumber(view.rateOfChange) ?? rawRate) : 0);
    if (rateOfChange === undefined) return undefined;
    const storageRatio =
      support?.storageRatio ??
      (view?.present ? asNumber(view.storageRatio) : 0);
    if (storageRatio === undefined) return undefined;
    const requested = readGameNumber(rawResource, "requestedQuantity", 0);
    const maxStorage = readGameNumber(rawResource, "maxStorage", 0);
    const rateMods = readProperty(rawResource, "rateMods");
    const eject = readGameNumber(rateMods, "eject", 0);
    const supply = readGameNumber(rateMods, "supply", 0);
    const storeOverflow = Boolean(readProperty(rawResource, "storeOverflow"));
    const useful =
      storageRatio < 0.99 ||
      (requested !== undefined && requested > currentQuantity) ||
      (eject !== undefined && eject > 0) ||
      (supply !== undefined && supply > 0) ||
      (storeOverflow &&
        maxStorage !== undefined &&
        currentQuantity < maxStorage);
    result.push(
      Object.freeze({
        id,
        title: readCapturedResourceLabel(root, id),
        currentQuantity,
        maxQuantity: maximumCandidate,
        rateOfChange,
        storageRatio,
        unlocked: support?.unlocked ?? view?.unlocked ?? false,
        useful,
        income: rateOfChange,
        incomeAdjusted: Boolean(readProperty(rawResource, "incomeAdusted")),
        supportKind:
          id === "Womlings_Support"
            ? "womlings-support"
            : id === "Tau_Belt_Support"
              ? "tau-belt-support"
              : support === undefined
                ? "none"
                : "support",
      }),
    );
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
  production: CapturedProductionBreakdown,
  resourceId: string,
  sourceTitle: string,
): number {
  return readCellNumber(production.production[resourceId]?.[sourceTitle]);
}

function readBuildingRule(
  root: unknown,
  binding: string,
  metadataRule: string,
  production: CapturedProductionBreakdown,
  resources: ReadonlyMap<string, PowerResourceInput>,
  buildingCounts: ReadonlyMap<string, number>,
  buildingOns: ReadonlyMap<string, number>,
  settings: Readonly<Record<string, unknown>>,
): PowerBuildingRule | undefined {
  const race = readProperty(root, "race");
  const resource = (id: string) => resources.get(id);
  const obs = (id: string, sourceTitle: string) => {
    const value = resource(id);
    return Object.freeze({
      resourceId: id,
      useful: value?.useful ?? false,
      production: readObservedProduction(production, id, sourceTitle),
      income: value?.income ?? 0,
    });
  };
  switch (metadataRule) {
    case "neutron-citadel":
      return Object.freeze({
        kind: metadataRule,
        electromagneticField: Boolean(readProperty(race, "emfield")),
      });
    case "belt-space-station":
      return Object.freeze({
        kind: metadataRule,
        stationStorage: 0,
        eleriumMaximum: resource("Elerium")?.maxQuantity ?? 0,
        eleriumMaximumCost: 0,
        eleriumShipsOn: buildingOns.get("space-elerium_ship") ?? 0,
        iridiumShipsOn: buildingOns.get("space-iridium_ship") ?? 0,
        ironShipsOn: buildingOns.get("space-iron_ship") ?? 0,
      });
    case "job-dependent": {
      const jobId =
        binding === "city-cement_plant"
          ? "cement_worker"
          : binding === "city-coal_mine"
            ? "coal_miner"
            : "miner";
      return Object.freeze({
        kind: metadataRule,
        jobCount: readGamePathNumber(root, ["civic", jobId, "count"], 0) ?? 0,
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
        "space-gas_mining": ["Helium_3", "Gas Mining", true],
        "space-oil_extractor": ["Oil", "Moon Oil", true],
        "space-orichalcum_mine": ["Orichalcum", "Makemake", true],
        "space-uranium_mine": ["Uranium", "Makemake", true],
        "space-neutronium_mine": ["Neutronium", "Makemake", true],
        "space-elerium_mine": ["Elerium", "Makemake", true],
        "space-iridium_ship": ["Iridium", "Space Miner", false],
        "space-iron_ship": ["Iron", "Space Miner", false],
        "space-elerium_ship": ["Elerium", "Space Miner", false],
        "space-iridium_mine": ["Iridium", "Moon Iridium Mine", false],
        "space-helium_mine": ["Helium_3", "Moon Helium Mine", false],
        "galaxy-vitreloy_plant": ["Vitreloy", "Vitreloy Plant", false],
        "galaxy-excavator": ["Orichalcum", "Chthonian Excavator", false],
        "space-water_freighter": ["Water", "Water Freighter", false],
        "eden-asphodel_harvester": [
          "Asphodel_Powder",
          "Asphodel Harvester",
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
    case "triton-lander":
      return Object.freeze({
        kind: metadataRule,
        fobOn: buildingOns.get("space-fob") ?? 0,
        currentSoldiers:
          readGamePathNumber(root, ["eden", "army", "soldiers"], 0) ?? 0,
        wounded: readGamePathNumber(root, ["eden", "army", "wounded"], 0) ?? 0,
        healingRate: 0,
        highPopulationMultiplier: 1,
        authorityReserve: 0,
      });
    case "ascension-trigger":
      return Object.freeze({
        kind: metadataRule,
        pillarFinished: false,
        prestigeType:
          typeof settings["prestigeType"] === "string"
            ? settings["prestigeType"]
            : "",
      });
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
        observation: obs("Money", "Tourism"),
      });
    case "mill":
      return Object.freeze({
        kind: metadataRule,
        foodStorageRatio: resource("Food")?.storageRatio ?? 1,
        foodWorkers:
          (readGamePathNumber(root, ["civic", "farmer", "count"], 0) ?? 0) +
          (readGamePathNumber(root, ["civic", "hunter", "count"], 0) ?? 0),
        sampledPower: resource("Power")?.currentQuantity ?? 0,
      });
    case "chthonian-mine-layer":
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
        rating: 0,
      });
    case "ruins-guard-post":
      return Object.freeze({
        kind: metadataRule,
        suppressionUseful: false,
        postRating: 0,
        ruinsRating: 0,
        gateUnlocked:
          Number(readProperty(readProperty(root, "tech"), "hell_gate") ?? 0) >
          0,
        gateRating: 0,
      });
    case "spire-waygate":
      return Object.freeze({
        kind: metadataRule,
        cleared:
          Number(readProperty(readProperty(root, "tech"), "waygate") ?? 0) >= 3,
        demonicBombReady: false,
        mechPotentialTooHigh: false,
        prestigeFloorProtected: false,
      });
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
          obs("Bolognium", "Armed Miner"),
          obs("Adamantite", "Armed Miner"),
          obs("Iridium", "Armed Miner"),
        ]) as unknown as readonly [
          ReturnType<typeof obs>,
          ReturnType<typeof obs>,
          ReturnType<typeof obs>,
        ],
      });
    case "bolognium-ship":
      return Object.freeze({
        kind: metadataRule,
        missionBuildable: false,
        scoutCount: buildingCounts.get("galaxy-scout_ship") ?? 0,
        corvetteCount: buildingCounts.get("galaxy-corvette_ship") ?? 0,
        gatewaySupportMaximum: resource("Gateway_Support")?.maxQuantity ?? 0,
        observation: obs("Bolognium", "Bolognium Ship"),
      });
    case "chthonian-raider":
      return Object.freeze({
        kind: metadataRule,
        starbaseOn: buildingOns.get("galaxy-starbase") ?? 0,
        observations: Object.freeze([
          obs("Vitreloy", "Chthonian Raider"),
          obs("Polymer", "Chthonian Raider"),
          obs("Neutronium", "Chthonian Raider"),
          obs("Deuterium", "Chthonian Raider"),
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
          obs("Deuterium", "Nebula Harvester"),
          obs("Helium_3", "Nebula Harvester"),
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
    case "womling-overseer":
      return Object.freeze({
        kind: metadataRule,
        loyaltyBase: readProperty(race, "womling_friend")
          ? 25
          : readProperty(race, "womling_god")
            ? 75
            : 0,
        loyaltyPerBuilding: 0,
        miners:
          readGamePathNumber(
            root,
            ["tauceti", "tau_red", "womling_mine", "miners"],
            0,
          ) ?? 0,
      });
    case "womling-fun":
      return Object.freeze({
        kind: metadataRule,
        moraleBase: readProperty(race, "womling_friend")
          ? 75
          : readProperty(race, "womling_god")
            ? 40
            : readProperty(race, "womling_lord")
              ? 30
              : 0,
        moralePerBuilding: 0,
        miners:
          readGamePathNumber(
            root,
            ["tauceti", "tau_red", "womling_mine", "miners"],
            0,
          ) ?? 0,
        farmers:
          readGamePathNumber(
            root,
            ["tauceti", "tau_red", "womling_farm", "farmers"],
            0,
          ) ?? 0,
        injured:
          readGamePathNumber(
            root,
            ["tauceti", "tau_red", "overseer", "injured"],
            0,
          ) ?? 0,
      });
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
  controls: GameControlRegistry,
): PowerSpireBuildingInput {
  const entry = allRecords.find((item) => item.binding === binding);
  if (entry === undefined) return EMPTY_SPIRE_BUILDING;
  const count = readGameNumber(entry.state, "count", 0) ?? 0;
  const on = readGameNumber(entry.state, "on", 0) ?? 0;
  const autoMaximumRaw = asNumber(settings[`bld_m_${binding}`]);
  const handle = controls.resolve(entry.elementId);
  const invoke = (method: string): unknown => {
    if (handle === undefined) return undefined;
    const result = controls.invoke(handle, method);
    return result.ok ? result.value : undefined;
  };
  return Object.freeze({
    buildingId: entry.id,
    binding,
    count,
    stateOn: on,
    autoMaximum:
      autoMaximumRaw !== undefined && autoMaximumRaw >= 0
        ? autoMaximumRaw
        : Number.MAX_SAFE_INTEGER,
    autoBuildable: invoke("isAutoBuildable") === true,
    smartManaged: settings[`bld_s2_${binding}`] === true,
    moneyCost: 0,
    supplyCost: 0,
  });
}

function readLakeAndSpire(
  root: unknown,
  settings: Readonly<Record<string, unknown>>,
  runtime: CapturedPowerReaderRuntimeOptions,
  allRecords: readonly CapturedBuildingEntry[],
  controls: GameControlRegistry,
  resourceMap: ReadonlyMap<string, PowerResourceInput>,
): { readonly lake: PowerLakeInput; readonly spire: PowerSpireInput } {
  const lakeEnabled =
    capturedPowerSmartEnabled("portal-bireme", settings) &&
    capturedPowerSmartEnabled("portal-transport", settings);
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
          biremeCount: readGameNumber(lakeBireme.state, "count", 0) ?? 0,
          biremeStateOn: readGameNumber(lakeBireme.state, "on", 0) ?? 0,
          transportId: lakeTransport.id,
          transportBinding: lakeTransport.binding,
          transportCount: readGameNumber(lakeTransport.state, "count", 0) ?? 0,
          transportStateOn: readGameNumber(lakeTransport.state, "on", 0) ?? 0,
        })
      : EMPTY_LAKE;
  const spireEnabled =
    capturedPowerSmartEnabled("portal-port", settings) &&
    capturedPowerSmartEnabled("portal-base_camp", settings);
  const spire: PowerSpireInput = spireEnabled
    ? Object.freeze({
        enabled: true,
        autoBuild: settings["autoBuild"] === true,
        autoMech: settings["autoMech"] === true,
        mechActive: Boolean(
          readGamePath(root, ["portal", "mechbay", "active"]),
        ),
        autoPrestige: settings["autoPrestige"] === true,
        prestigeType:
          typeof settings["prestigeType"] === "string"
            ? settings["prestigeType"]
            : "",
        prestigeDemonicFloor: asNumber(settings["prestigeDemonicFloor"]) ?? 0,
        towerCount:
          readGamePathNumber(root, ["portal", "spire", "count"], 0) ?? 0,
        moneyMaximum: resourceMap.get("Money")?.maxQuantity ?? 0,
        supplyCurrent: resourceMap.get("Supply")?.currentQuantity ?? 0,
        mechQueued: false,
        purifierQueued: false,
        purifierDescription: "",
        expectedSaveSupply: false,
        mechBay: makeSpireBuilding(
          "portal-mechbay",
          allRecords,
          settings,
          controls,
        ),
        port: makeSpireBuilding("portal-port", allRecords, settings, controls),
        camp: makeSpireBuilding(
          "portal-base_camp",
          allRecords,
          settings,
          controls,
        ),
        purifier: makeSpireBuilding(
          "portal-purifier",
          allRecords,
          settings,
          controls,
        ),
      })
    : EMPTY_SPIRE;
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
  const managed = readManagedBuildingRecords(
    root,
    settings,
    dependencies.controls,
    structures,
  );
  if (managed === undefined) return undefined;
  const allByBinding = makeStructureByBinding(structures);

  const powers: PowerBuildingInput[] = [];
  const lakeGroupManaged =
    capturedPowerSmartEnabled("portal-bireme", settings) &&
    capturedPowerSmartEnabled("portal-transport", settings);
  const spireGroupManaged =
    capturedPowerSmartEnabled("portal-port", settings) &&
    capturedPowerSmartEnabled("portal-base_camp", settings);
  const resourceIds = new Set<string>(["Power"]);
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
    const powered = readCapturedPowerValue(root, record.structure);
    const title = record.structure.readTitle();
    if (
      consumptions === undefined ||
      powered === undefined ||
      title.kind === "invalid"
    )
      return undefined;
    for (const consumption of consumptions)
      resourceIds.add(consumption.resourceId);
    for (const resourceId of metadata.produces) resourceIds.add(resourceId);
    for (const resourceId of readRuleResourceIds(binding))
      resourceIds.add(resourceId);
    const state = readCapturedStructureState(root, record.structure);
    const autoMaximumRaw = asNumber(settings[`bld_m_${binding}`]);
    const requirements = readPowerRequirementsSatisfied(root, record.structure);
    if (requirements === undefined) return undefined;
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
      extraDescription: "",
      consumptions,
      produces: Object.freeze([...metadata.produces]),
      fleetMaximum: null,
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
    dependencies.resources,
    structures,
  );
  if (resourceInputs === undefined) return undefined;
  const resourceMap = new Map(resourceInputs.map((item) => [item.id, item]));
  const buildingCounts = new Map<string, number>();
  const buildingOns = new Map<string, number>();
  for (const entry of allCatalog) {
    const structure = structureForCatalogEntry(entry, allByBinding);
    if (structure === undefined) continue;
    const state = readCapturedStructureState(root, structure);
    buildingCounts.set(entry.binding, readGameNumber(state, "count", 0) ?? 0);
    buildingOns.set(
      entry.binding,
      readCapturedStructureOn(root, structure) ?? 0,
    );
  }
  const filledPowers: PowerBuildingInput[] = [];
  for (const building of powers) {
    const metadata = capturedPowerMetadataForBinding(building.binding);
    const rule = readBuildingRule(
      root,
      building.binding,
      metadata.rule,
      production,
      resourceMap,
      buildingCounts,
      buildingOns,
      settings,
    );
    if (rule === undefined) return undefined;
    filledPowers.push(
      Object.freeze({
        ...building,
        rule,
      }),
    );
  }

  const power = resourceMap.get("Power");
  const powerUnlocked = power?.unlocked ?? false;
  const population = resourceMap.get("Population")?.currentQuantity ?? 0;
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
    dependencies.controls,
    resourceMap,
  );
  const cycle: PowerCycleInput = Object.freeze({
    powerUnlocked,
    powerResourceId: "Power",
    powerCurrent: power?.currentQuantity ?? 0,
    powerMaximum: power?.maxQuantity ?? 0,
    replicatorAvailable: Boolean(
      power &&
      power.currentQuantity > power.maxQuantity &&
      readProperty(readProperty(root, "tech"), "replicator"),
    ),
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
  readSettingsRaw,
  readRuntimeOptions,
  readWarnings,
}: CapturedPowerReaderDependencies): PowerReader {
  const dependencies: CapturedPowerReaderDependencies = {
    rootState,
    mechanics,
    controls,
    resources,
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
      const matching = structures.filter(
        (entry) => entry.actionId === binding || entry.entryKey === binding,
      );
      const structure = matching.length === 1 ? matching[0] : undefined;
      if (matching.length !== 1 || structure === undefined) {
        throw new TypeError(`captured Power binding ${binding} is unavailable`);
      }
      const stateOn = readCapturedStructureOn(root, structure);
      if (stateOn === undefined) {
        throw new TypeError(`captured Power state for ${binding} is invalid`);
      }
      return stateOn;
    },
  });
}
