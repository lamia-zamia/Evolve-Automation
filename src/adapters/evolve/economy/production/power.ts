import type {
  BusyWorkerInput,
  PowerBuildingInput,
  PowerBuildingRule,
  PowerCycleInput,
  PowerDecision,
  PowerLakeInput,
  PowerOperation,
  PowerResourceInput,
  PowerSpireBuildingInput,
  PowerSpireInput,
  PowerWarnBuildingInput,
} from "../../../../domain/economy/production/power.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { PowerReader } from "../../../../ports/power.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import {
  callBoolean,
  callNumber,
  requireFunction,
  requireNonEmptyString,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../../validation.ts";

interface PowerSession {
  readonly manager: UnknownRecord;
  readonly buildings: ReadonlyMap<string, UnknownRecord>;
  readonly resources: ReadonlyMap<string, UnknownRecord>;
  readonly ordered: readonly {
    readonly id: string;
    readonly binding: string;
  }[];
}

export interface PowerAdapterDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getState: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getJobs: () => unknown;
  // TRANSITIONAL: BuildingManager and the entity wrappers remain the narrow
  // bridge to current Evolve/Vue state controls until Milestone 5.
  readonly getBuildingManager: () => unknown;
  readonly getFleetManager: () => unknown;
  readonly getMechManager: () => unknown;
  readonly getWarManager: () => unknown;
  readonly getPoly: () => unknown;
  readonly getBuildingIds: () => unknown;
  readonly consumptionBalanceMinimum: number;
  readonly isSupportResource: (value: unknown) => boolean;
  readonly readDebugEnabled: () => boolean;
  readonly haveTech: (name: string, level?: number) => boolean;
  readonly isHellSuppressionUseful: () => boolean;
  readonly getGalaxyRegions: () => unknown;
  readonly traitValue: (
    name: string,
    fallback: number,
    operation?: string | number,
  ) => number;
  readonly getAuthorityGarrisonRequirement: (garrison: number) => unknown;
  readonly getHealingRate: () => number;
  readonly isHungryRace: () => boolean;
  readonly isPillarFinished: () => boolean;
  readonly log: (message: string) => void;
}

/**
 * Order in which crewed ships are idled to honor the crew reserve: the lowest
 * rank is shed first. Keyed by the building's game id. Trade freighters (money,
 * usually the least missed) go first; galaxy combat ships (piracy defense) last.
 * Crewed ships not listed default to the mid rank.
 */
const CREW_SHED_RANK: Readonly<Record<string, number>> = Object.freeze({
  freighter: 0,
  super_freighter: 0,
  bolognium_ship: 1,
  armed_miner: 1,
  raider: 1,
  minelayer: 1,
  scavenger: 1,
  bireme: 2,
  transport: 2,
  scout_ship: 3,
  corvette_ship: 3,
  frigate_ship: 3,
  cruiser_ship: 3,
  dreadnought: 3,
});
const DEFAULT_CREW_SHED_RANK = 1;

// These tables are fixed game metadata. Keep them outside readBuildingRule so
// each managed building does not allocate fresh arrays during every power tick.
const JOB_DEPENDENT_BUILDINGS = [
  ["CementPlant", "CementWorker"],
  ["Mine", "Miner"],
  ["CoalMine", "CoalMiner"],
] as const;
const SAVING_BUSY_BUILDINGS = [
  ["GasMining", "Helium_3", "space_gas_mining_title"],
  ["GasMoonOilExtractor", "Oil", "space_gas_moon_oil_extractor_title"],
] as const;
const MAKEMAKE_BUSY_BUILDINGS = [
  ["MakemakeOrichalcum", "Orichalcum"],
  ["MakemakeUranium", "Uranium"],
  ["MakemakeNeutronium", "Neutronium"],
  ["MakemakeElerium", "Elerium"],
] as const;
const BELT_BUSY_BUILDINGS = [
  ["BeltIridiumShip", "Iridium"],
  ["BeltIronShip", "Iron"],
] as const;
const ORDINARY_BUSY_BUILDINGS = [
  ["BeltEleriumShip", "Elerium", "job_space_miner"],
  ["MoonIridiumMine", "Iridium", "space_moon_iridium_mine_title"],
  ["MoonHeliumMine", "Helium_3", "space_moon_helium_mine_title"],
  ["Alien1VitreloyPlant", "Vitreloy", "galaxy_vitreloy_plant_bd"],
  ["ChthonianExcavator", "Orichalcum", "galaxy_excavator"],
  ["EnceladusWaterFreighter", "Water", "space_water_freighter_title"],
  ["AsphodelHarvester", "Asphodel_Powder", "eden_asphodel_harvester_title"],
] as const;
const ARMED_MINER_RESOURCES = [
  ["Bolognium", "galaxy_armed_miner_bd"],
  ["Adamantite", "galaxy_armed_miner_bd"],
  ["Iridium", "galaxy_armed_miner_bd"],
] as const;
const CHTHONIAN_RAIDER_RESOURCES = [
  ["Vitreloy", "galaxy_raider"],
  ["Polymer", "galaxy_raider"],
  ["Neutronium", "galaxy_raider"],
  ["Deuterium", "galaxy_raider"],
] as const;
const NEBULA_HARVESTER_RESOURCES = [
  ["Deuterium", "interstellar_harvester_title"],
  ["Helium_3", "interstellar_harvester_title"],
] as const;

/**
 * Resolve the crew-reserve setting to an absolute worker count. Accepts a number
 * or a string that is either a plain count ("800") or a percentage of the
 * civilian population ("50%"). Anything unparseable disables the reserve (0).
 */
function resolveCrewReserve(raw: unknown, population: number): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (typeof raw !== "string") {
    return 0;
  }
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    const percent = Number(trimmed.slice(0, -1));
    return Number.isFinite(percent) ? (population * percent) / 100 : 0;
  }
  const absolute = Number(trimmed);
  return Number.isFinite(absolute) ? absolute : 0;
}

function namedRecord(
  catalog: UnknownRecord,
  name: string,
  path: string,
): UnknownRecord {
  return requireRecord(catalog[name], `${path}.${name}`);
}

function recordAt(
  root: UnknownRecord,
  segments: readonly string[],
  path: string,
): UnknownRecord {
  let current = root;
  let currentPath = path;
  for (const segment of segments) {
    currentPath += `.${segment}`;
    current = requireRecord(current[segment], currentPath);
  }
  return current;
}

function finiteProperty(
  record: UnknownRecord,
  name: string,
  path: string,
): number {
  return requireNumber(record[name], `${path}.${name}`);
}

function buildingId(building: UnknownRecord, path: string): string {
  return requireNonEmptyString(building["id"], `${path}.id`);
}

function buildingBinding(building: UnknownRecord, path: string): string {
  return requireNonEmptyString(building["_vueBinding"], `${path}._vueBinding`);
}

function resourceId(resource: UnknownRecord, path: string): string {
  return requireNonEmptyString(resource["id"], `${path}.id`);
}

function identity(
  catalog: UnknownRecord,
  name: string,
  value: unknown,
): boolean {
  return catalog[name] === value;
}

function readBooleanSetting(settings: UnknownRecord, name: string): boolean {
  return Boolean(settings[name]);
}

function readNumberSetting(settings: UnknownRecord, name: string): number {
  return requireNumber(settings[name], `settings.${name}`);
}

function readStringSetting(settings: UnknownRecord, name: string): string {
  const value = settings[name];
  if (typeof value !== "string") {
    throw new TypeError(`settings.${name} must be a string`);
  }
  return value;
}

function readNestedNumber(
  root: UnknownRecord,
  segments: readonly string[],
  path: string,
): number {
  const final = segments.at(-1);
  if (final === undefined) {
    throw new TypeError(`${path} requires a property path`);
  }
  const parent = recordAt(root, segments.slice(0, -1), path);
  return requireNumber(parent[final], `${path}.${segments.join(".")}`);
}

function readResourceSnapshot(
  resource: UnknownRecord,
  path: string,
  namedResources: UnknownRecord,
  dependencies: PowerAdapterDependencies,
): PowerResourceInput {
  const id = resourceId(resource, path);
  const title = resource["title"];
  if (typeof title !== "string") {
    throw new TypeError(`${path}.title must be a string`);
  }
  const supportKind = identity(namedResources, "Womlings_Support", resource)
    ? "womlings-support"
    : identity(namedResources, "Tau_Belt_Support", resource)
      ? "tau-belt-support"
      : dependencies.isSupportResource(resource)
        ? "support"
        : "none";
  return Object.freeze({
    id,
    title,
    currentQuantity: finiteProperty(resource, "currentQuantity", path),
    maxQuantity: finiteProperty(resource, "maxQuantity", path),
    rateOfChange: finiteProperty(resource, "rateOfChange", path),
    storageRatio: finiteProperty(resource, "storageRatio", path),
    unlocked: callBoolean(resource, "isUnlocked", path),
    useful: callBoolean(resource, "isUseful", path),
    income: finiteProperty(resource, "income", path),
    incomeAdjusted: Boolean(resource["incomeAdusted"]),
    supportKind,
  });
}

interface ResourceRegistry {
  readonly inputs: Map<string, PowerResourceInput>;
  readonly records: Map<string, UnknownRecord>;
  register(value: unknown, path: string): PowerResourceInput;
}

function createResourceRegistry(
  namedResources: UnknownRecord,
  dependencies: PowerAdapterDependencies,
): ResourceRegistry {
  const inputs = new Map<string, PowerResourceInput>();
  const records = new Map<string, UnknownRecord>();
  return {
    inputs,
    records,
    register(value: unknown, path: string): PowerResourceInput {
      const resource = requireRecord(value, path);
      const id = resourceId(resource, path);
      const existing = records.get(id);
      if (existing !== undefined) {
        if (existing !== resource) {
          throw new TypeError(`power resource id ${id} changed identity`);
        }
        const input = inputs.get(id);
        if (input === undefined) {
          throw new TypeError(`missing registered power resource ${id}`);
        }
        return input;
      }
      const input = readResourceSnapshot(
        resource,
        path,
        namedResources,
        dependencies,
      );
      records.set(id, resource);
      inputs.set(id, input);
      return input;
    },
  };
}

function busyObservation(
  registry: ResourceRegistry,
  resource: unknown,
  path: string,
  source: string,
  locArg?: readonly string[],
): BusyWorkerInput {
  const record = requireRecord(resource, path);
  const input = registry.register(record, path);
  const production =
    locArg === undefined
      ? callNumber(record, "getProduction", path, source)
      : callNumber(record, "getProduction", path, source, locArg);
  return Object.freeze({
    resourceId: input.id,
    useful: input.useful,
    production,
    income: input.income,
  });
}

function readAuthorityReserve(
  game: UnknownRecord,
  resources: UnknownRecord,
  war: UnknownRecord,
  dependencies: PowerAdapterDependencies,
): number {
  const global = requireRecord(game["global"], "game.global");
  const race = requireRecord(global["race"], "game.global.race");
  const authority = namedRecord(resources, "Authority", "resources");
  if (
    race["universe"] !== "evil" ||
    !callBoolean(authority, "isUnlocked", "resources.Authority")
  ) {
    return 0;
  }
  const currentGarrison = finiteProperty(
    war,
    "currentCityGarrison",
    "WarManager",
  );
  const currentSoldiers = finiteProperty(war, "currentSoldiers", "WarManager");
  const result = requireRecord(
    dependencies.getAuthorityGarrisonRequirement(currentGarrison),
    "authority garrison requirement",
  );
  if (result["status"] !== "ready") {
    return currentSoldiers;
  }
  return Math.min(
    currentSoldiers,
    finiteProperty(
      result,
      "requiredGarrison",
      "authority garrison requirement",
    ),
  );
}

function readBuildingRule(
  building: UnknownRecord,
  path: string,
  catalogs: {
    readonly game: UnknownRecord;
    readonly settings: UnknownRecord;
    readonly resources: UnknownRecord;
    readonly buildings: UnknownRecord;
    readonly jobs: UnknownRecord;
    readonly fleet: UnknownRecord;
    readonly mech: UnknownRecord;
    readonly war: UnknownRecord;
    readonly poly: UnknownRecord;
  },
  registry: ResourceRegistry,
  dependencies: PowerAdapterDependencies,
): PowerBuildingRule {
  const { game, settings, resources, buildings, jobs, mech, war, poly } =
    catalogs;
  const global = requireRecord(game["global"], "game.global");
  const race = requireRecord(global["race"], "game.global.race");
  const tech = requireRecord(global["tech"], "game.global.tech");

  if (identity(buildings, "NeutronCitadel", building)) {
    return Object.freeze({
      kind: "neutron-citadel",
      electromagneticField: Boolean(race["emfield"]),
    });
  }
  if (identity(buildings, "BeltSpaceStation", building)) {
    const breakdown = recordAt(game, ["breakdown", "c"], "game");
    const eleriumBreakdown = requireRecord(
      breakdown["Elerium"] ?? {},
      "game.breakdown.c.Elerium",
    );
    const location = Reflect.apply(
      requireFunction(game["loc"], "game.loc"),
      game,
      ["space_belt_station_title"],
    );
    const rawStorage =
      typeof location === "string" ? (eleriumBreakdown[location] ?? 0) : 0;
    const stationStorage =
      typeof rawStorage === "number"
        ? rawStorage
        : Number.parseFloat(String(rawStorage));
    const elerium = registry.register(
      namedRecord(resources, "Elerium", "resources"),
      "resources.Elerium",
    );
    return Object.freeze({
      kind: "belt-space-station",
      stationStorage: Number.isFinite(stationStorage) ? stationStorage : 0,
      eleriumMaximum: elerium.maxQuantity,
      eleriumMaximumCost: finiteProperty(
        namedRecord(resources, "Elerium", "resources"),
        "maxCost",
        "resources.Elerium",
      ),
      eleriumShipsOn: finiteProperty(
        namedRecord(buildings, "BeltEleriumShip", "buildings"),
        "stateOnCount",
        "buildings.BeltEleriumShip",
      ),
      iridiumShipsOn: finiteProperty(
        namedRecord(buildings, "BeltIridiumShip", "buildings"),
        "stateOnCount",
        "buildings.BeltIridiumShip",
      ),
      ironShipsOn: finiteProperty(
        namedRecord(buildings, "BeltIronShip", "buildings"),
        "stateOnCount",
        "buildings.BeltIronShip",
      ),
    });
  }
  for (const [buildingName, jobName] of JOB_DEPENDENT_BUILDINGS) {
    if (identity(buildings, buildingName, building)) {
      return Object.freeze({
        kind: "job-dependent",
        jobCount: finiteProperty(
          namedRecord(jobs, jobName, "jobs"),
          "count",
          `jobs.${jobName}`,
        ),
      });
    }
  }
  if (identity(buildings, "LakeCoolingTower", building)) {
    return Object.freeze({
      kind: "lake-cooling-tower",
      harborCount: finiteProperty(
        namedRecord(buildings, "LakeHarbor", "buildings"),
        "count",
        "buildings.LakeHarbor",
      ),
      electromagneticField: Boolean(race["emfield"]),
    });
  }
  if (identity(buildings, "LakeHarbor", building)) {
    return Object.freeze({ kind: "lake-harbor" });
  }
  for (const [buildingName, resourceName, source] of SAVING_BUSY_BUILDINGS) {
    if (identity(buildings, buildingName, building)) {
      const resource = namedRecord(resources, resourceName, "resources");
      return Object.freeze({
        kind: "busy-resource",
        active: true,
        savingOnly: true,
        observation: busyObservation(
          registry,
          resource,
          `resources.${resourceName}`,
          source,
        ),
      });
    }
  }
  for (const [buildingName, resourceName] of MAKEMAKE_BUSY_BUILDINGS) {
    if (identity(buildings, buildingName, building)) {
      const resource = namedRecord(resources, resourceName, "resources");
      const title = registry.register(
        resource,
        `resources.${resourceName}`,
      ).title;
      return Object.freeze({
        kind: "busy-resource",
        active: true,
        savingOnly: true,
        observation: busyObservation(
          registry,
          resource,
          `resources.${resourceName}`,
          "space_makemake_mine",
          [title],
        ),
      });
    }
  }
  for (const [buildingName, resourceName] of BELT_BUSY_BUILDINGS) {
    if (identity(buildings, buildingName, building)) {
      const resource = namedRecord(resources, resourceName, "resources");
      const elerium = namedRecord(resources, "Elerium", "resources");
      return Object.freeze({
        kind: "busy-resource",
        active: callBoolean(elerium, "isUnlocked", "resources.Elerium"),
        savingOnly: false,
        observation: busyObservation(
          registry,
          resource,
          `resources.${resourceName}`,
          "job_space_miner",
        ),
      });
    }
  }
  for (const [buildingName, resourceName, source] of ORDINARY_BUSY_BUILDINGS) {
    if (identity(buildings, buildingName, building)) {
      return Object.freeze({
        kind: "busy-resource",
        active: true,
        savingOnly: false,
        observation: busyObservation(
          registry,
          namedRecord(resources, resourceName, "resources"),
          `resources.${resourceName}`,
          source,
        ),
      });
    }
  }
  if (identity(buildings, "TritonLander", building)) {
    return Object.freeze({
      kind: "triton-lander",
      fobOn: finiteProperty(
        namedRecord(buildings, "TritonFOB", "buildings"),
        "stateOnCount",
        "buildings.TritonFOB",
      ),
      currentSoldiers: finiteProperty(war, "currentSoldiers", "WarManager"),
      wounded: finiteProperty(war, "wounded", "WarManager"),
      healingRate: dependencies.getHealingRate(),
      highPopulationMultiplier: dependencies.traitValue("high_pop", 0, 1),
      authorityReserve: readAuthorityReserve(
        game,
        resources,
        war,
        dependencies,
      ),
    });
  }
  if (identity(buildings, "SiriusAscensionTrigger", building)) {
    return Object.freeze({
      kind: "ascension-trigger",
      pillarFinished: dependencies.isPillarFinished(),
      prestigeType: readStringSetting(settings, "prestigeType"),
    });
  }
  if (identity(buildings, "RedAtmoTerraformer", building)) {
    return Object.freeze({
      kind: "terraformer",
      prestigeType: readStringSetting(settings, "prestigeType"),
    });
  }
  if (identity(buildings, "BadlandsAttractor", building)) {
    return Object.freeze({
      kind: "badlands-attractor",
      threat: readNestedNumber(
        game,
        ["global", "portal", "fortress", "threat"],
        "game",
      ),
      bottomThreat: readNumberSetting(settings, "hellAttractorBottomThreat"),
      topThreat: readNumberSetting(settings, "hellAttractorTopThreat"),
      // `WarManager.hellAssigned` mirrors `game.global.portal.fortress.assigned`,
      // which the game does not write until soldiers are first assigned. A
      // fortress that exists but has never been staffed leaves it undefined, so
      // read it as leniently as the hell adapter does rather than rejecting the
      // whole power cycle.
      hellAssigned:
        war["hellAssigned"] === undefined
          ? 0
          : finiteProperty(war, "hellAssigned", "WarManager"),
    });
  }
  if (identity(buildings, "TouristCenter", building)) {
    const money = namedRecord(resources, "Money", "resources");
    return Object.freeze({
      kind: "tourist-center",
      hungryRace: dependencies.isHungryRace(),
      foodStorageRatio: finiteProperty(
        namedRecord(resources, "Food", "resources"),
        "storageRatio",
        "resources.Food",
      ),
      moneyUseful: callBoolean(money, "isUseful", "resources.Money"),
      observation: busyObservation(
        registry,
        money,
        "resources.Money",
        "tech_tourism",
      ),
    });
  }
  if (identity(buildings, "Mill", building)) {
    return Object.freeze({
      kind: "mill",
      foodStorageRatio: finiteProperty(
        namedRecord(resources, "Food", "resources"),
        "storageRatio",
        "resources.Food",
      ),
      foodWorkers:
        finiteProperty(
          namedRecord(jobs, "Farmer", "jobs"),
          "count",
          "jobs.Farmer",
        ) +
        finiteProperty(
          namedRecord(jobs, "Hunter", "jobs"),
          "count",
          "jobs.Hunter",
        ),
      sampledPower: finiteProperty(
        namedRecord(resources, "Power", "resources"),
        "currentQuantity",
        "resources.Power",
      ),
    });
  }
  if (identity(buildings, "ChthonianMineLayer", building)) {
    const regions = dependencies.getGalaxyRegions();
    if (!Array.isArray(regions)) {
      throw new TypeError("galaxy regions must be an array");
    }
    const region = regions
      .map((entry, index) => requireRecord(entry, `galaxy regions[${index}]`))
      .find((entry) => entry["name"] === "gxy_chthonian");
    if (region === undefined) {
      throw new TypeError("gxy_chthonian region is missing");
    }
    const actions = recordAt(
      game,
      ["actions", "galaxy", "gxy_chthonian", "minelayer", "ship"],
      "game",
    );
    return Object.freeze({
      kind: "chthonian-mine-layer",
      raiderOn: finiteProperty(
        namedRecord(buildings, "ChthonianRaider", "buildings"),
        "stateOnCount",
        "buildings.ChthonianRaider",
      ),
      excavatorOn: finiteProperty(
        namedRecord(buildings, "ChthonianExcavator", "buildings"),
        "stateOnCount",
        "buildings.ChthonianExcavator",
      ),
      starbaseOn: finiteProperty(
        namedRecord(buildings, "GatewayStarbase", "buildings"),
        "stateOnCount",
        "buildings.GatewayStarbase",
      ),
      piracy: finiteProperty(region, "piracy", "gxy_chthonian"),
      armada: finiteProperty(region, "armada", "gxy_chthonian"),
      rating: callNumber(actions, "rating", "gxy_chthonian.minelayer.ship"),
    });
  }
  if (identity(buildings, "RuinsGuardPost", building)) {
    const armyRating = requireNumber(
      Reflect.apply(
        requireFunction(game["armyRating"], "game.armyRating"),
        game,
        [dependencies.traitValue("high_pop", 0, 1), "hellArmy", 0],
      ),
      "game.armyRating()",
    );
    const suppression = (location: string) => {
      const result = requireRecord(
        Reflect.apply(
          requireFunction(poly["hellSupression"], "poly.hellSupression"),
          poly,
          [location],
        ),
        `poly.hellSupression(${location})`,
      );
      return finiteProperty(result, "rating", `hell suppression ${location}`);
    };
    return Object.freeze({
      kind: "ruins-guard-post",
      suppressionUseful: dependencies.isHellSuppressionUseful(),
      postRating: armyRating * dependencies.traitValue("holy", 1, "+"),
      ruinsRating: suppression("ruins"),
      gateUnlocked: dependencies.haveTech("hell_gate"),
      gateRating: suppression("gate"),
    });
  }
  if (identity(buildings, "SpireWaygate", building)) {
    const prestigeType = readStringSetting(settings, "prestigeType");
    const universeAffix = Reflect.apply(
      requireFunction(poly["universeAffix"], "poly.universeAffix"),
      poly,
      [],
    );
    if (typeof universeAffix !== "string") {
      throw new TypeError("poly.universeAffix() must be a string");
    }
    const stats = recordAt(game, ["global", "stats", "spire"], "game");
    const spireStats = requireRecord(
      stats[universeAffix] ?? {},
      `game.global.stats.spire.${universeAffix}`,
    );
    return Object.freeze({
      kind: "spire-waygate",
      cleared: dependencies.haveTech("waygate", 3),
      demonicBombReady:
        readBooleanSetting(settings, "prestigeDemonicBomb") &&
        prestigeType === "demonic" &&
        Number(spireStats["dlstr"] ?? 0) > 0,
      mechPotentialTooHigh:
        readBooleanSetting(settings, "autoMech") &&
        finiteProperty(mech, "mechsPotential", "MechManager") >
          readNumberSetting(settings, "mechWaygatePotential"),
      prestigeFloorProtected:
        readBooleanSetting(settings, "autoPrestige") &&
        prestigeType === "demonic" &&
        finiteProperty(
          namedRecord(buildings, "SpireTower", "buildings"),
          "count",
          "buildings.SpireTower",
        ) >= readNumberSetting(settings, "prestigeDemonicFloor"),
    });
  }
  if (
    identity(buildings, "ScoutShip", building) ||
    identity(buildings, "CorvetteShip", building)
  ) {
    return Object.freeze({
      kind: "early-galaxy-ship",
      piracyUnlocked: Boolean(tech["piracy"]),
      embassyUnlocked: callBoolean(
        namedRecord(buildings, "GorddonEmbassy", "buildings"),
        "isUnlocked",
        "buildings.GorddonEmbassy",
      ),
    });
  }
  if (identity(buildings, "Alien2ArmedMiner", building)) {
    return Object.freeze({
      kind: "armed-miner",
      observations: Object.freeze(
        ARMED_MINER_RESOURCES.map(([name, source]) =>
          busyObservation(
            registry,
            namedRecord(resources, name, "resources"),
            `resources.${name}`,
            source,
          ),
        ) as unknown as readonly [
          BusyWorkerInput,
          BusyWorkerInput,
          BusyWorkerInput,
        ],
      ),
    });
  }
  if (identity(buildings, "BologniumShip", building)) {
    const resource = namedRecord(resources, "Bolognium", "resources");
    return Object.freeze({
      kind: "bolognium-ship",
      missionBuildable: callBoolean(
        namedRecord(buildings, "GorddonMission", "buildings"),
        "isAutoBuildable",
        "buildings.GorddonMission",
      ),
      scoutCount: finiteProperty(
        namedRecord(buildings, "ScoutShip", "buildings"),
        "count",
        "buildings.ScoutShip",
      ),
      corvetteCount: finiteProperty(
        namedRecord(buildings, "CorvetteShip", "buildings"),
        "count",
        "buildings.CorvetteShip",
      ),
      gatewaySupportMaximum: finiteProperty(
        namedRecord(resources, "Gateway_Support", "resources"),
        "maxQuantity",
        "resources.Gateway_Support",
      ),
      observation: busyObservation(
        registry,
        resource,
        "resources.Bolognium",
        "galaxy_bolognium_ship",
      ),
    });
  }
  if (identity(buildings, "ChthonianRaider", building)) {
    const observations = CHTHONIAN_RAIDER_RESOURCES.map(([name, source]) =>
      busyObservation(
        registry,
        namedRecord(resources, name, "resources"),
        `resources.${name}`,
        source,
      ),
    );
    return Object.freeze({
      kind: "chthonian-raider",
      starbaseOn: finiteProperty(
        namedRecord(buildings, "GatewayStarbase", "buildings"),
        "stateOnCount",
        "buildings.GatewayStarbase",
      ),
      observations: Object.freeze(observations) as unknown as readonly [
        BusyWorkerInput,
        BusyWorkerInput,
        BusyWorkerInput,
        BusyWorkerInput,
      ],
    });
  }
  if (identity(buildings, "NebulaHarvester", building)) {
    const observations = NEBULA_HARVESTER_RESOURCES.map(([name, source]) =>
      busyObservation(
        registry,
        namedRecord(resources, name, "resources"),
        `resources.${name}`,
        source,
      ),
    );
    return Object.freeze({
      kind: "dual-resource",
      observations: Object.freeze(observations) as unknown as readonly [
        BusyWorkerInput,
        BusyWorkerInput,
      ],
    });
  }
  if (identity(buildings, "TauRedWomlingFarm", building)) {
    return Object.freeze({
      kind: "womling-farm",
      supportMaximum: finiteProperty(
        namedRecord(resources, "Womlings_Support", "resources"),
        "maxQuantity",
        "resources.Womlings_Support",
      ),
      cropPerFarm:
        (dependencies.haveTech("womling_pop") ? 16 : 12) +
        (dependencies.haveTech("womling_gene") ? 4 : 0),
    });
  }
  if (identity(buildings, "TauRedOverseer", building)) {
    return Object.freeze({
      kind: "womling-overseer",
      loyaltyBase: race["womling_friend"] ? 25 : race["womling_god"] ? 75 : 0,
      loyaltyPerBuilding: callNumber(
        requireRecord(building["definition"], `${path}.definition`),
        "val",
        `${path}.definition`,
      ),
      miners: readNestedNumber(
        game,
        ["global", "tauceti", "womling_mine", "miners"],
        "game",
      ),
    });
  }
  if (identity(buildings, "TauRedWomlingFun", building)) {
    return Object.freeze({
      kind: "womling-fun",
      moraleBase: race["womling_friend"]
        ? 75
        : race["womling_god"]
          ? 40
          : race["womling_lord"]
            ? 30
            : 0,
      moralePerBuilding: callNumber(
        requireRecord(building["definition"], `${path}.definition`),
        "val",
        `${path}.definition`,
      ),
      miners: readNestedNumber(
        game,
        ["global", "tauceti", "womling_mine", "miners"],
        "game",
      ),
      farmers: readNestedNumber(
        game,
        ["global", "tauceti", "womling_farm", "farmers"],
        "game",
      ),
      injured: readNestedNumber(
        game,
        ["global", "tauceti", "overseer", "injured"],
        "game",
      ),
    });
  }
  if (identity(buildings, "TauGasWhalingStation", building)) {
    return Object.freeze({
      kind: "tau-whaling-station",
      supportMaximum: finiteProperty(
        namedRecord(resources, "Tau_Belt_Support", "resources"),
        "maxQuantity",
        "resources.Tau_Belt_Support",
      ),
      supportCurrent: finiteProperty(
        namedRecord(resources, "Tau_Belt_Support", "resources"),
        "currentQuantity",
        "resources.Tau_Belt_Support",
      ),
      whalingShipsOn: finiteProperty(
        namedRecord(buildings, "TauBeltWhalingShip", "buildings"),
        "stateOnCount",
        "buildings.TauBeltWhalingShip",
      ),
    });
  }
  if (identity(buildings, "TauMiningPit", building)) {
    return Object.freeze({
      kind: "tau-mining-pit",
      populationMaximum: finiteProperty(
        namedRecord(resources, "Population", "resources"),
        "maxQuantity",
        "resources.Population",
      ),
    });
  }
  if (identity(buildings, "AlphaExoticZoo", building)) {
    // Food income and per-zoo upkeep are read from the shared resources map and
    // the building's own consumption list inside the domain rule.
    return Object.freeze({ kind: "exotic-zoo" });
  }
  return Object.freeze({ kind: "ordinary" });
}

function readSpireBuilding(
  building: UnknownRecord,
  path: string,
  register: (id: string, building: UnknownRecord) => void,
): PowerSpireBuildingInput {
  const cost = requireRecord(building["cost"], `${path}.cost`);
  const id = buildingId(building, path);
  register(id, building);
  return Object.freeze({
    buildingId: id,
    binding: buildingBinding(building, path),
    count: finiteProperty(building, "count", path),
    stateOn: finiteProperty(building, "stateOnCount", path),
    autoMaximum: finiteProperty(building, "autoMax", path),
    autoBuildable: callBoolean(building, "isAutoBuildable", path),
    smartManaged: callBoolean(building, "isSmartManaged", path),
    moneyCost: requireNumber(cost["Money"] ?? 0, `${path}.cost.Money`),
    supplyCost: requireNumber(cost["Supply"] ?? 0, `${path}.cost.Supply`),
  });
}

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

export function createPowerAdapter(dependencies: PowerAdapterDependencies): {
  readonly reader: PowerReader;
  readonly executor: DecisionExecutor<PowerDecision>;
} {
  let session: PowerSession | null = null;

  const reader: PowerReader = Object.freeze({
    readCycle(): PowerCycleInput {
      const game = requireRecord(dependencies.getGame(), "game");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const state = requireRecord(dependencies.getState(), "state");
      const resources = requireRecord(dependencies.getResources(), "resources");
      const buildings = requireRecord(dependencies.getBuildings(), "buildings");
      const jobs = requireRecord(dependencies.getJobs(), "jobs");
      const manager = requireRecord(
        dependencies.getBuildingManager(),
        "BuildingManager",
      );
      const fleet = requireRecord(
        dependencies.getFleetManager(),
        "FleetManager",
      );
      const mech = requireRecord(dependencies.getMechManager(), "MechManager");
      const war = requireRecord(dependencies.getWarManager(), "WarManager");
      const poly = requireRecord(dependencies.getPoly(), "poly");
      const power = namedRecord(resources, "Power", "resources");
      if (!callBoolean(power, "isUnlocked", "resources.Power")) {
        session = null;
        return Object.freeze({
          powerUnlocked: false,
          powerResourceId: "Power",
          powerCurrent: 0,
          powerMaximum: 0,
          replicatorAvailable: false,
          fasting: false,
          hungryRace: false,
          banquetStateOn: 0,
          debug: false,
          consumptionBalanceMinimum: dependencies.consumptionBalanceMinimum,
          civilianPopulation: 0,
          currentCrew: 0,
          settings: Object.freeze({
            showGalactic: true,
            limitPowered: false,
            autoFleet: false,
            crewReserve: 0,
          }),
          resources: Object.freeze([]),
          buildings: Object.freeze([]),
          lake: EMPTY_LAKE,
          spire: EMPTY_SPIRE,
        });
      }

      const listValue = Reflect.apply(
        requireFunction(
          manager["managedStatePriorityList"],
          "BuildingManager.managedStatePriorityList",
        ),
        manager,
        [],
      );
      if (!Array.isArray(listValue)) {
        throw new TypeError(
          "BuildingManager.managedStatePriorityList() must return an array",
        );
      }
      const registry = createResourceRegistry(resources, dependencies);
      registry.register(power, "resources.Power");
      const managedRecords = listValue.map((value, index) =>
        requireRecord(value, `BuildingManager state list[${index}]`),
      );
      if (managedRecords.length === 0) {
        session = Object.freeze({
          manager,
          buildings: new Map(),
          resources: registry.records,
          ordered: Object.freeze([]),
        });
        return Object.freeze({
          powerUnlocked: true,
          powerResourceId: resourceId(power, "resources.Power"),
          powerCurrent: finiteProperty(
            power,
            "currentQuantity",
            "resources.Power",
          ),
          powerMaximum: finiteProperty(power, "maxQuantity", "resources.Power"),
          replicatorAvailable: false,
          fasting: false,
          hungryRace: false,
          banquetStateOn: 0,
          debug: false,
          consumptionBalanceMinimum: dependencies.consumptionBalanceMinimum,
          civilianPopulation: 0,
          currentCrew: 0,
          settings: Object.freeze({
            showGalactic: true,
            limitPowered: false,
            autoFleet: false,
            crewReserve: 0,
          }),
          resources: Object.freeze([...registry.inputs.values()]),
          buildings: Object.freeze([]),
          lake: EMPTY_LAKE,
          spire: EMPTY_SPIRE,
        });
      }
      const manageLake =
        callBoolean(
          namedRecord(buildings, "LakeTransport", "buildings"),
          "isSmartManaged",
          "buildings.LakeTransport",
        ) &&
        callBoolean(
          namedRecord(buildings, "LakeBireme", "buildings"),
          "isSmartManaged",
          "buildings.LakeBireme",
        );
      const manageSpire =
        callBoolean(
          namedRecord(buildings, "SpirePort", "buildings"),
          "isSmartManaged",
          "buildings.SpirePort",
        ) &&
        callBoolean(
          namedRecord(buildings, "SpireBaseCamp", "buildings"),
          "isSmartManaged",
          "buildings.SpireBaseCamp",
        );
      const neededShipsValue = fleet["neededShips"];
      const neededShips =
        typeof neededShipsValue === "object" && neededShipsValue !== null
          ? requireRecord(neededShipsValue, "FleetManager.neededShips")
          : null;
      // Keyed by `_vueBinding`, which is unique. The game's short structure id
      // is not: the Alpha Graphene Plant (`interstellar-g_factory`) and the
      // Titan Graphene Plant (`space-g_factory`) are both `g_factory`, and a
      // True Path run owns both from Titan onward.
      const seenBuildings = new Map<string, UnknownRecord>();
      // Buildings the domain adjusts directly (lake bireme/transport, spire
      // mech/port/camp/purifier) may be absent from managedStatePriorityList
      // (e.g. count 0 while still smart-managed). Register each so the command
      // executor can resolve it even though it is not in the managed list.
      const registerCommandable = (
        binding: string,
        building: UnknownRecord,
      ) => {
        if (!seenBuildings.has(binding)) {
          seenBuildings.set(binding, building);
        }
      };
      const globalState = requireRecord(game["global"], "game.global");
      const inputs: PowerBuildingInput[] = managedRecords.map(
        (building, index) => {
          const path = `BuildingManager state list[${index}]`;
          const id = buildingId(building, path);
          const binding = buildingBinding(building, path);
          if (seenBuildings.has(binding)) {
            throw new TypeError(`duplicate managed power binding ${binding}`);
          }
          seenBuildings.set(binding, building);
          const rawConsumptions = building["consumption"];
          if (!Array.isArray(rawConsumptions)) {
            throw new TypeError(`${path}.consumption must be an array`);
          }
          const consumptions = rawConsumptions.map(
            (value, consumptionIndex) => {
              const consumptionPath = `${path}.consumption[${consumptionIndex}]`;
              const consumption = requireRecord(value, consumptionPath);
              const resource = registry.register(
                consumption["resource"],
                `${consumptionPath}.resource`,
              );
              return Object.freeze({
                resourceId: resource.id,
                rate: finiteProperty(consumption, "rate", consumptionPath),
                fuelRate: callNumber(
                  building,
                  "getFuelRate",
                  path,
                  consumptionIndex,
                ),
              });
            },
          );
          const rawProduces = building["produces"];
          const produces =
            rawProduces === undefined || rawProduces === null
              ? []
              : Array.isArray(rawProduces)
                ? rawProduces.map(
                    (resource, resourceIndex) =>
                      registry.register(
                        resource,
                        `${path}.produces[${resourceIndex}]`,
                      ).id,
                  )
                : (() => {
                    throw new TypeError(`${path}.produces must be an array`);
                  })();
          const is = requireRecord(building["is"] ?? {}, `${path}.is`);
          const rule = readBuildingRule(
            building,
            path,
            {
              game,
              settings,
              resources,
              buildings,
              jobs,
              fleet,
              mech,
              war,
              poly,
            },
            registry,
            dependencies,
          );
          const fleetMaximum =
            readBooleanSetting(settings, "autoFleet") &&
            neededShips !== null &&
            Object.prototype.hasOwnProperty.call(neededShips, id)
              ? requireNumber(neededShips[id], `FleetManager.neededShips.${id}`)
              : null;
          const skipGroup =
            manageSpire &&
            (identity(buildings, "SpirePort", building) ||
              identity(buildings, "SpireBaseCamp", building) ||
              identity(buildings, "SpireMechBay", building))
              ? "spire"
              : manageLake &&
                  (identity(buildings, "LakeTransport", building) ||
                    identity(buildings, "LakeBireme", building))
                ? "lake"
                : "none";
          return Object.freeze({
            index,
            id,
            binding,
            count: finiteProperty(building, "count", path),
            stateOn: finiteProperty(building, "stateOnCount", path),
            powered: finiteProperty(building, "powered", path),
            autoMaximum: finiteProperty(building, "autoMax", path),
            tab: typeof building["_tab"] === "string" ? building["_tab"] : "",
            smartCategory: Boolean(is["smart"]),
            smartEnabled: Boolean(building["autoStateSmart"]),
            ship: Boolean(is["ship"]),
            // A crewed ship is any building whose game struct carries a numeric
            // `crew` field (galaxy/portal ships); those draw from the civilian
            // pool the crew reserve protects.
            crewShip: (() => {
              const tab =
                typeof building["_tab"] === "string" ? building["_tab"] : "";
              const areaState = globalState[tab];
              if (typeof areaState !== "object" || areaState === null) {
                return false;
              }
              const shipState = (areaState as UnknownRecord)[id];
              return (
                typeof shipState === "object" &&
                shipState !== null &&
                typeof (shipState as UnknownRecord)["crew"] === "number"
              );
            })(),
            crewValueRank: CREW_SHED_RANK[id] ?? DEFAULT_CREW_SHED_RANK,
            singleState: identity(buildings, "Banquet", building),
            ignorePositivePowerCap: identity(
              buildings,
              "RuinsHellForge",
              building,
            ),
            skipGroup,
            extraDescription: requireString(
              building["extraDescription"],
              `${path}.extraDescription`,
            ),
            consumptions: Object.freeze(consumptions),
            produces: Object.freeze(produces),
            fleetMaximum,
            rule,
          });
        },
      );

      const lakeBireme = namedRecord(buildings, "LakeBireme", "buildings");
      const lakeTransport = namedRecord(
        buildings,
        "LakeTransport",
        "buildings",
      );
      const lake: PowerLakeInput = manageLake
        ? (() => {
            const blood = requireRecord(
              requireRecord(game["global"], "game.global")["blood"] ?? {},
              "game.global.blood",
            );
            const biremeIdValue = buildingId(
              lakeBireme,
              "buildings.LakeBireme",
            );
            const transportIdValue = buildingId(
              lakeTransport,
              "buildings.LakeTransport",
            );
            registerCommandable(
              buildingBinding(lakeBireme, "buildings.LakeBireme"),
              lakeBireme,
            );
            registerCommandable(
              buildingBinding(lakeTransport, "buildings.LakeTransport"),
              lakeTransport,
            );
            return Object.freeze({
              enabled: true,
              bloodSpireLevel:
                blood["spire"] === undefined
                  ? 0
                  : requireNumber(blood["spire"], "game.global.blood.spire"),
              biremeId: biremeIdValue,
              biremeBinding: buildingBinding(
                lakeBireme,
                "buildings.LakeBireme",
              ),
              biremeCount: finiteProperty(
                lakeBireme,
                "count",
                "buildings.LakeBireme",
              ),
              biremeStateOn: finiteProperty(
                lakeBireme,
                "stateOnCount",
                "buildings.LakeBireme",
              ),
              transportId: transportIdValue,
              transportBinding: buildingBinding(
                lakeTransport,
                "buildings.LakeTransport",
              ),
              transportCount: finiteProperty(
                lakeTransport,
                "count",
                "buildings.LakeTransport",
              ),
              transportStateOn: finiteProperty(
                lakeTransport,
                "stateOnCount",
                "buildings.LakeTransport",
              ),
            });
          })()
        : EMPTY_LAKE;

      let spire: PowerSpireInput = EMPTY_SPIRE;
      if (manageSpire) {
        const spireMech = namedRecord(buildings, "SpireMechBay", "buildings");
        const spirePort = namedRecord(buildings, "SpirePort", "buildings");
        const spireCamp = namedRecord(buildings, "SpireBaseCamp", "buildings");
        const purifier = namedRecord(buildings, "SpirePurifier", "buildings");
        const queued = state["queuedTargetsAll"];
        if (!Array.isArray(queued)) {
          throw new TypeError("state.queuedTargetsAll must be an array");
        }
        spire = Object.freeze({
          enabled: true,
          autoBuild: readBooleanSetting(settings, "autoBuild"),
          autoMech: readBooleanSetting(settings, "autoMech"),
          mechActive: Boolean(mech["isActive"]),
          autoPrestige: readBooleanSetting(settings, "autoPrestige"),
          prestigeType: readStringSetting(settings, "prestigeType"),
          prestigeDemonicFloor: readNumberSetting(
            settings,
            "prestigeDemonicFloor",
          ),
          towerCount: finiteProperty(
            namedRecord(buildings, "SpireTower", "buildings"),
            "count",
            "buildings.SpireTower",
          ),
          moneyMaximum: finiteProperty(
            namedRecord(resources, "Money", "resources"),
            "maxQuantity",
            "resources.Money",
          ),
          supplyCurrent: finiteProperty(
            namedRecord(resources, "Supply", "resources"),
            "currentQuantity",
            "resources.Supply",
          ),
          mechQueued: queued.includes(spireMech),
          purifierQueued: queued.includes(purifier),
          purifierDescription: requireString(
            purifier["extraDescription"],
            "buildings.SpirePurifier.extraDescription",
          ),
          expectedSaveSupply: Boolean(mech["saveSupply"]),
          mechBay: readSpireBuilding(
            spireMech,
            "buildings.SpireMechBay",
            registerCommandable,
          ),
          port: readSpireBuilding(
            spirePort,
            "buildings.SpirePort",
            registerCommandable,
          ),
          camp: readSpireBuilding(
            spireCamp,
            "buildings.SpireBaseCamp",
            registerCommandable,
          ),
          purifier: readSpireBuilding(
            purifier,
            "buildings.SpirePurifier",
            registerCommandable,
          ),
        });
      }

      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      const gameSettings = requireRecord(
        global["settings"],
        "game.global.settings",
      );
      session = Object.freeze({
        manager,
        buildings: seenBuildings,
        resources: registry.records,
        ordered: Object.freeze(
          inputs.map((building) =>
            Object.freeze({ id: building.id, binding: building.binding }),
          ),
        ),
      });
      // civic.crew (and its workers) is lazily initialized — absent until the
      // first crewed ship exists — so read the whole path leniently and coerce a
      // missing value to 0 (no crew assigned yet), matching legacy tolerance.
      const civicRecord = global["civic"];
      const crewRecord =
        typeof civicRecord === "object" && civicRecord !== null
          ? (civicRecord as UnknownRecord)["crew"]
          : undefined;
      const crewWorkers =
        typeof crewRecord === "object" && crewRecord !== null
          ? (crewRecord as UnknownRecord)["workers"]
          : undefined;
      const currentCrew =
        typeof crewWorkers === "number" && Number.isFinite(crewWorkers)
          ? crewWorkers
          : 0;
      const civilianPopulation = finiteProperty(
        namedRecord(resources, "Population", "resources"),
        "currentQuantity",
        "resources.Population",
      );
      return Object.freeze({
        powerUnlocked: true,
        powerResourceId: resourceId(power, "resources.Power"),
        powerCurrent: finiteProperty(
          power,
          "currentQuantity",
          "resources.Power",
        ),
        powerMaximum: finiteProperty(power, "maxQuantity", "resources.Power"),
        replicatorAvailable:
          finiteProperty(power, "currentQuantity", "resources.Power") >
          finiteProperty(power, "maxQuantity", "resources.Power")
            ? dependencies.haveTech("replicator")
            : false,
        fasting: Boolean(race["fasting"]),
        hungryRace: inputs.some(
          (building) =>
            building.rule.kind === "tourist-center" ||
            building.consumptions.some(
              (consumption) => consumption.resourceId === "Food",
            ),
        )
          ? dependencies.isHungryRace()
          : false,
        banquetStateOn: finiteProperty(
          namedRecord(buildings, "Banquet", "buildings"),
          "stateOnCount",
          "buildings.Banquet",
        ),
        debug: dependencies.readDebugEnabled(),
        consumptionBalanceMinimum: dependencies.consumptionBalanceMinimum,
        civilianPopulation,
        currentCrew,
        settings: Object.freeze({
          showGalactic: Boolean(gameSettings["showGalactic"]),
          limitPowered: readBooleanSetting(settings, "buildingsLimitPowered"),
          autoFleet: readBooleanSetting(settings, "autoFleet"),
          // Resolved to absolute workers here (accepts "800" or "50%"); absent on
          // saves predating the setting, in which case it disables the reserve.
          crewReserve: resolveCrewReserve(
            settings["crewReserve"],
            civilianPopulation,
          ),
        }),
        resources: Object.freeze([...registry.inputs.values()]),
        buildings: Object.freeze(inputs),
        lake,
        spire,
      });
    },

    readWarnings(domIds: readonly string[]): readonly PowerWarnBuildingInput[] {
      if (domIds.length === 0) {
        return Object.freeze([]);
      }
      const resources = requireRecord(dependencies.getResources(), "resources");
      const buildings = requireRecord(dependencies.getBuildings(), "buildings");
      const buildingIds = requireRecord(
        dependencies.getBuildingIds(),
        "buildingIds",
      );
      const highPopulation = dependencies.traitValue("high_pop", 0, 1);
      const beltNeeded =
        (finiteProperty(
          namedRecord(buildings, "BeltEleriumShip", "buildings"),
          "stateOnCount",
          "buildings.BeltEleriumShip",
        ) *
          2 +
          finiteProperty(
            namedRecord(buildings, "BeltIridiumShip", "buildings"),
            "stateOnCount",
            "buildings.BeltIridiumShip",
          ) +
          finiteProperty(
            namedRecord(buildings, "BeltIronShip", "buildings"),
            "stateOnCount",
            "buildings.BeltIronShip",
          )) *
        highPopulation;
      const lakeNeeded =
        finiteProperty(
          namedRecord(buildings, "LakeBireme", "buildings"),
          "stateOnCount",
          "buildings.LakeBireme",
        ) +
        finiteProperty(
          namedRecord(buildings, "LakeTransport", "buildings"),
          "stateOnCount",
          "buildings.LakeTransport",
        );
      const beltSupportMaximum = finiteProperty(
        namedRecord(resources, "Belt_Support", "resources"),
        "maxQuantity",
        "resources.Belt_Support",
      );
      const lakeSupportMaximum = finiteProperty(
        namedRecord(resources, "Lake_Support", "resources"),
        "maxQuantity",
        "resources.Lake_Support",
      );
      const warnings: PowerWarnBuildingInput[] = [];
      for (const domId of domIds) {
        if (domId.length === 0 || buildingIds[domId] === undefined) {
          continue;
        }
        const building = requireRecord(
          buildingIds[domId],
          `buildingIds.${domId}`,
        );
        const path = `buildingIds.${domId}`;
        const is = requireRecord(building["is"] ?? {}, `${path}.is`);
        const warningKind = identity(buildings, "BeltEleriumShip", building)
          ? "belt-elerium"
          : identity(buildings, "BeltIridiumShip", building)
            ? "belt-iridium"
            : identity(buildings, "BeltIronShip", building)
              ? "belt-iron"
              : identity(buildings, "LakeBireme", building)
                ? "lake-bireme"
                : identity(buildings, "LakeTransport", building)
                  ? "lake-transport"
                  : identity(buildings, "TauBeltWhalingShip", building)
                    ? "tau-whaling"
                    : identity(buildings, "TauBeltMiningShip", building)
                      ? "tau-mining"
                      : "ordinary";
        warnings.push(
          Object.freeze({
            domId,
            buildingId: buildingId(building, path),
            binding: buildingBinding(building, path),
            stateOn: finiteProperty(building, "stateOnCount", path),
            autoStateEnabled: Boolean(building["autoStateEnabled"]),
            ship: Boolean(is["ship"]),
            warningKind,
            beltSupportNeeded: beltNeeded,
            beltSupportMaximum,
            lakeSupportNeeded: lakeNeeded,
            lakeSupportMaximum,
          }),
        );
      }
      return Object.freeze(warnings);
    },

    readStateOn(binding: string): number {
      if (session === null) {
        throw new Error("power cycle must be read before state-on resampling");
      }
      const building = session.buildings.get(binding);
      if (building === undefined) {
        throw new TypeError(`power building binding ${binding} is missing`);
      }
      return finiteProperty(
        building,
        "stateOnCount",
        `power building ${binding}`,
      );
    },
  });

  function validateSession(
    decision: Extract<PowerDecision, { kind: "apply-power-cycle" }>,
  ): PowerSession | null {
    if (session === null) {
      return null;
    }
    if (decision.expectedBuildings.length !== session.ordered.length) {
      return null;
    }
    const currentValue = Reflect.apply(
      requireFunction(
        session.manager["managedStatePriorityList"],
        "BuildingManager.managedStatePriorityList",
      ),
      session.manager,
      [],
    );
    if (
      !Array.isArray(currentValue) ||
      currentValue.length !== session.ordered.length
    ) {
      return null;
    }
    for (let index = 0; index < decision.expectedBuildings.length; index++) {
      const expected = decision.expectedBuildings[index];
      const actual = session.ordered[index];
      const current = currentValue[index];
      if (
        expected === undefined ||
        actual === undefined ||
        current === undefined ||
        session.buildings.get(actual.binding) !== current ||
        expected.id !== actual.id ||
        expected.binding !== actual.binding
      ) {
        return null;
      }
    }
    return session;
  }

  function preflightOperations(
    active: PowerSession,
    operations: readonly PowerOperation[],
  ): string | null {
    const resourceRates = new Map<string, number>();
    const resourceAdjusted = new Map<string, boolean>();
    const descriptions = new Map<string, string>();
    const buildingStates = new Map<string, number>();
    let saveSupply = Boolean(
      requireRecord(dependencies.getMechManager(), "MechManager")["saveSupply"],
    );
    for (const operation of operations) {
      switch (operation.kind) {
        case "set-resource-rate": {
          const resource = active.resources.get(operation.resourceId);
          if (resource === undefined)
            return `resource ${operation.resourceId} missing`;
          const current =
            resourceRates.get(operation.resourceId) ??
            finiteProperty(
              resource,
              "rateOfChange",
              `resource ${operation.resourceId}`,
            );
          if (current !== operation.expected)
            return `resource ${operation.resourceId} rate changed`;
          resourceRates.set(operation.resourceId, operation.value);
          break;
        }
        case "set-income-adjusted": {
          const resource = active.resources.get(operation.resourceId);
          if (resource === undefined)
            return `resource ${operation.resourceId} missing`;
          const current =
            resourceAdjusted.get(operation.resourceId) ??
            Boolean(resource["incomeAdusted"]);
          if (current !== operation.expected)
            return `resource ${operation.resourceId} adjustment changed`;
          resourceAdjusted.set(operation.resourceId, operation.value);
          break;
        }
        case "set-description": {
          const building = active.buildings.get(operation.binding);
          if (building === undefined)
            return `building ${operation.binding} missing`;
          const current =
            descriptions.get(operation.binding) ??
            requireString(
              building["extraDescription"],
              `building ${operation.binding}.extraDescription`,
            );
          if (current !== operation.expected)
            return `building ${operation.binding} description changed`;
          descriptions.set(operation.binding, operation.value);
          break;
        }
        case "adjust-building": {
          const building = active.buildings.get(operation.binding);
          if (building === undefined)
            return `building ${operation.binding} missing`;
          if (
            buildingBinding(building, `building ${operation.binding}`) !==
            operation.binding
          )
            return `building ${operation.binding} binding changed`;
          const current =
            buildingStates.get(operation.binding) ??
            finiteProperty(
              building,
              "stateOnCount",
              `building ${operation.binding}`,
            );
          if (current !== operation.expectedStateOn)
            return `building ${operation.binding} state changed`;
          requireFunction(
            building["tryAdjustState"],
            `building ${operation.buildingId}.tryAdjustState`,
          );
          buildingStates.set(operation.binding, current + operation.amount);
          break;
        }
        case "set-mech-save-supply":
          if (saveSupply !== operation.expected)
            return "MechManager.saveSupply changed";
          saveSupply = operation.value;
          break;
        case "set-power-model": {
          const resource = active.resources.get(operation.resourceId);
          if (resource === undefined)
            return `resource ${operation.resourceId} missing`;
          const rate =
            resourceRates.get(operation.resourceId) ??
            finiteProperty(
              resource,
              "rateOfChange",
              `resource ${operation.resourceId}`,
            );
          if (
            finiteProperty(
              resource,
              "currentQuantity",
              `resource ${operation.resourceId}`,
            ) !== operation.expectedCurrent ||
            rate !== operation.expectedRate
          )
            return `resource ${operation.resourceId} power model changed`;
          resourceRates.set(operation.resourceId, operation.value);
          break;
        }
        case "log":
          break;
      }
    }
    return null;
  }

  function applyOperations(
    active: PowerSession,
    operations: readonly PowerOperation[],
  ): void {
    const mech = requireRecord(dependencies.getMechManager(), "MechManager");
    for (const operation of operations) {
      switch (operation.kind) {
        case "set-resource-rate":
          Reflect.set(
            active.resources.get(operation.resourceId)!,
            "rateOfChange",
            operation.value,
          );
          break;
        case "set-income-adjusted":
          Reflect.set(
            active.resources.get(operation.resourceId)!,
            "incomeAdusted",
            operation.value,
          );
          break;
        case "set-description":
          Reflect.set(
            active.buildings.get(operation.binding)!,
            "extraDescription",
            operation.value,
          );
          break;
        case "adjust-building": {
          const building = active.buildings.get(operation.binding)!;
          Reflect.apply(
            requireFunction(
              building["tryAdjustState"],
              `building ${operation.binding}.tryAdjustState`,
            ),
            building,
            [operation.amount],
          );
          break;
        }
        case "set-mech-save-supply":
          Reflect.set(mech, "saveSupply", operation.value);
          break;
        case "set-power-model": {
          const resource = active.resources.get(operation.resourceId)!;
          Reflect.set(resource, "currentQuantity", operation.value);
          Reflect.set(resource, "rateOfChange", operation.value);
          break;
        }
        case "log":
          dependencies.log(operation.message);
          break;
      }
    }
  }

  const executor: DecisionExecutor<PowerDecision> = Object.freeze({
    execute(decision: Readonly<PowerDecision>) {
      if (decision.kind === "apply-power-cycle") {
        const active = validateSession(decision);
        if (active === null) {
          return stale(
            "power-session-changed",
            "Power planning session changed",
          );
        }
        const failure = preflightOperations(active, decision.operations);
        if (failure !== null) {
          return stale("power-precondition-changed", failure);
        }
        applyOperations(active, decision.operations);
        return SUCCEEDED;
      }
      if (decision.kind !== "shutdown-warned-building") {
        return rejected("invalid-power-decision", "Unsupported power decision");
      }
      const buildingIds = requireRecord(
        dependencies.getBuildingIds(),
        "buildingIds",
      );
      const value = buildingIds[decision.domId];
      if (value === undefined) {
        return stale("warned-building-missing", "Warned building disappeared");
      }
      const building = requireRecord(value, `buildingIds.${decision.domId}`);
      if (
        buildingId(building, `buildingIds.${decision.domId}`) !==
          decision.buildingId ||
        buildingBinding(building, `buildingIds.${decision.domId}`) !==
          decision.binding ||
        finiteProperty(
          building,
          "stateOnCount",
          `buildingIds.${decision.domId}`,
        ) !== decision.expectedStateOn
      ) {
        return stale("warned-building-changed", "Warned building changed");
      }
      Reflect.apply(
        requireFunction(
          building["tryAdjustState"],
          `buildingIds.${decision.domId}.tryAdjustState`,
        ),
        building,
        [-1],
      );
      return SUCCEEDED;
    },
  });
  return Object.freeze({ reader, executor });
}
