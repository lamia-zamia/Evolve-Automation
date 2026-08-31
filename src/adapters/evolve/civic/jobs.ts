import {
  DEFAULT_VACUUM_MANA_REQUIREMENT,
  isVacuumCollapseManaStageReady,
} from "../../../domain/progression/prestige/vacuum.ts";
import {
  focusCrystalMinerWeighting,
  planJobs,
  type JobKind,
  type JobsAuthorityInput,
  type JobsCraftInput,
  type JobsCycleInput,
  type JobsDecision,
  type JobsDefaultCandidate,
  type JobsJobInput,
  type JobsSplitInput,
} from "../../../domain/civic/jobs.ts";
import type { JobsExecutor, JobsReader } from "../../../ports/jobs.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  callBoolean,
  callNumber,
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../validation.ts";

export interface JobsAdapterDependencies {
  // TRANSITIONAL: JobManager and Job entities remain the narrow bridge to the
  // current Vue-backed worker controls. Replace them with final Evolve/browser
  // adapters when civic state ownership migrates.
  readonly getJobManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getJobs: () => unknown;
  readonly getCrafter: () => unknown;
  readonly getSettings: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getResources: () => unknown;
  readonly getState: () => unknown;
  readonly getDebugWindow: () => unknown;
  readonly isDemonRace: () => unknown;
  readonly isLumberRace: () => unknown;
  readonly traitValue: (
    trait: string,
    index?: number,
    operation?: string | number,
  ) => unknown;
  readonly haveTech: (technology: string, rank?: number) => unknown;
  readonly haveTask: (task: string) => unknown;
  readonly ticksPerSecond: () => unknown;
  readonly findRequiredResourceWeight: (resource: unknown) => unknown;
  readonly taxCap: (minimum: boolean) => unknown;
  readonly isCraftingJob: (job: unknown) => unknown;
  readonly getFoodConsume: () => unknown;
  readonly log: (message: string) => void;
}

interface JobsSession {
  readonly manager: UnknownRecord;
  readonly game: UnknownRecord;
  readonly jobsCatalog: UnknownRecord;
  readonly state: UnknownRecord;
  readonly resources: UnknownRecord;
  readonly rawJobs: readonly UnknownRecord[];
  readonly defaultJobs: ReadonlyMap<number, UnknownRecord>;
  readonly input: Readonly<JobsCycleInput>;
}

interface SmartMaximum {
  readonly maximum: number | null;
  readonly farmerMinimum: number | null;
  readonly storageBackedMinimum: number | null;
}

function optionalNumber(value: unknown, path: string, fallback = 0): number {
  return value === undefined ? fallback : requireNumber(value, path);
}

function booleanSetting(settings: UnknownRecord, key: string): boolean {
  return requireBoolean(settings[key], `settings.${key}`);
}

function numberSetting(settings: UnknownRecord, key: string): number {
  return requireNumber(settings[key], `settings.${key}`);
}

function optionalNumberSetting(
  settings: UnknownRecord,
  key: string,
  fallback: number,
): number {
  const value = settings[key];
  return value === undefined
    ? fallback
    : requireNumber(value, `settings.${key}`);
}

export function readVacuumCollapseManaStageReady(
  settingsValue: unknown,
  resourcesValue: unknown,
): boolean {
  const settings = requireRecord(settingsValue, "settings");
  const resources = requireRecord(resourcesValue, "resources");
  if (settings["prestigeType"] !== "vacuum") return false;
  return isVacuumCollapseManaStageReady({
    prestigeType: "vacuum",
    manaRate: resourceNumber(resources, "Mana", "rateOfChange"),
    requiredManaRate: optionalNumberSetting(
      settings,
      "prestigeVacuumMana",
      DEFAULT_VACUUM_MANA_REQUIREMENT,
    ),
  });
}

function trait(
  dependencies: JobsAdapterDependencies,
  name: string,
  index = 0,
  operation?: string | number,
): number {
  return requireNumber(
    dependencies.traitValue(name, index, operation),
    `traitVal(${name})`,
  );
}

function technology(
  dependencies: JobsAdapterDependencies,
  name: string,
  rank?: number,
): boolean {
  return Boolean(dependencies.haveTech(name, rank));
}

function resource(resources: UnknownRecord, name: string): UnknownRecord {
  return requireRecord(resources[name], `resources.${name}`);
}

function building(buildings: UnknownRecord, name: string): UnknownRecord {
  return requireRecord(buildings[name], `buildings.${name}`);
}

function resourceNumber(
  resources: UnknownRecord,
  name: string,
  key: string,
): number {
  return requireNumber(
    resource(resources, name)[key],
    `resources.${name}.${key}`,
  );
}

function resourceFlag(
  resources: UnknownRecord,
  name: string,
  method: string,
  ...args: readonly unknown[]
): boolean {
  return callBoolean(
    resource(resources, name),
    method,
    `resources.${name}`,
    ...args,
  );
}

function busyWorkers(
  resources: UnknownRecord,
  name: string,
  source: string,
  count: number,
): number {
  return callNumber(
    resource(resources, name),
    "getBusyWorkers",
    `resources.${name}`,
    source,
    count,
  );
}

function identityKind(job: UnknownRecord, jobs: UnknownRecord): JobKind {
  if (job === jobs["Farmer"]) return "farmer";
  if (job === jobs["Hunter"]) return "hunter";
  if (job === jobs["Lumberjack"]) return "lumberjack";
  if (job === jobs["QuarryWorker"]) return "quarry-worker";
  if (job === jobs["CrystalMiner"]) return "crystal-miner";
  if (job === jobs["Scavenger"]) return "scavenger";
  if (job === jobs["Forager"]) return "forager";
  if (job === jobs["Miner"]) return "miner";
  if (job === jobs["SpaceMiner"]) return "space-miner";
  if (job === jobs["Entertainer"]) return "entertainer";
  return "other";
}

function jobCount(job: UnknownRecord, path: string): number {
  return requireNumber(job["count"], `${path}.count`);
}

/**
 * Floor for a job whose worker count carries resource storage capacity.
 *
 * Reassigning such a worker lowers the resource maximum, and the game clamps
 * the stored amount down to the new maximum: the workers come back, the
 * resource does not. Returning the live count holds the job where it is;
 * growth above it still comes from the ordinary breakpoint and split passes.
 */
function storageBackedFloor(
  dependencies: JobsAdapterDependencies,
  job: UnknownRecord,
  jobs: UnknownRecord,
  global: UnknownRecord,
): number | null {
  // From Banking 7 each Banker adds Money capacity.
  if (job === jobs["Banker"] && technology(dependencies, "banking", 7)) {
    return requireNumber(job["workers"], "job.workers");
  }
  // With Ancient Priests each Priest scales the Ziggurat and Temple
  // multipliers, which raise resource maximums as well as production.
  if (job === jobs["Priest"]) {
    const genes = requireRecord(global["genes"], "game.global.genes");
    const civic = requireRecord(global["civic"], "game.global.civic");
    const priest = requireRecord(civic["priest"], "game.global.civic.priest");
    if (
      optionalNumber(genes["ancients"], "game.global.genes.ancients") >= 2 &&
      Boolean(priest["display"])
    ) {
      return requireNumber(job["workers"], "job.workers");
    }
  }
  return null;
}

function jobSmartMaximum(
  dependencies: JobsAdapterDependencies,
  job: UnknownRecord,
  kind: JobKind,
  jobs: UnknownRecord,
  game: UnknownRecord,
  settings: UnknownRecord,
  buildings: UnknownRecord,
  resources: UnknownRecord,
  state: UnknownRecord,
  smart: boolean,
  coalDisabled: boolean,
  minersDisabled: boolean,
  demonicLumber: boolean,
): SmartMaximum {
  const global = requireRecord(game["global"], "game.global");
  const race = requireRecord(global["race"], "game.global.race");
  const tech = requireRecord(global["tech"], "game.global.tech");
  // Storage-backed floors are decided before the `smart` gate: Priest is not a
  // smart job, but its worker count still carries resource maximums.
  const storageFloor = storageBackedFloor(dependencies, job, jobs, global);
  if (!smart)
    return {
      maximum: null,
      farmerMinimum: null,
      storageBackedMinimum: storageFloor,
    };
  const count = jobCount(job, "job");
  let maximum: number | null = null;
  let farmerMinimum: number | null = null;
  const storageBackedMinimum: number | null = storageFloor;

  if (kind === "miner" && race["warlord"]) {
    return {
      maximum: null,
      farmerMinimum: null,
      storageBackedMinimum: storageFloor,
    };
  }

  if (kind === "farmer" || kind === "hunter") {
    if (race["artifical"] || race["unfathomable"]) {
      maximum = 0;
      farmerMinimum = 0;
    } else {
      let foodRate = resourceNumber(resources, "Food", "rateOfChange");
      let minimumFood = resourceNumber(resources, "Food", "maxQuantity") * 0.2;
      let maximumFood = resourceNumber(resources, "Food", "maxQuantity") * 0.6;
      const population = resourceNumber(
        resources,
        "Population",
        "currentQuantity",
      );
      const foodCurrent = resourceNumber(resources, "Food", "currentQuantity");
      if (race["ravenous"]) {
        minimumFood = population * 1.5;
        maximumFood = population * 3;
        foodRate += Math.max(
          foodCurrent / trait(dependencies, "ravenous", 1),
          0,
        );
      }
      if (race["carnivore"]) {
        minimumFood = population;
        maximumFood = population * 2;
        if (foodCurrent > 10) {
          foodRate +=
            (foodCurrent - 10) *
            trait(dependencies, "carnivore", 0, "=") *
            0.9 **
              requireNumber(
                building(buildings, "Smokehouse")["count"],
                "buildings.Smokehouse.count",
              );
        }
      }
      const lastPopulation = requireNumber(
        state["lastPopulationCount"],
        "state.lastPopulationCount",
      );
      const lastFarmers = requireNumber(
        state["lastFarmerCount"],
        "state.lastFarmerCount",
      );
      if (population > lastPopulation) {
        const populationChange = population - lastPopulation;
        const farmerChange = count - lastFarmers;
        maximum =
          populationChange === farmerChange && foodRate > 0
            ? count - populationChange
            : count;
      } else if (resourceFlag(resources, "Food", "isCapped")) {
        maximum = 0;
      } else if (
        foodCurrent +
          foodRate /
            requireNumber(dependencies.ticksPerSecond(), "ticksPerSecond") <
        minimumFood
      ) {
        if (count === 0) {
          maximum = 1;
        } else {
          const id = requireString(job["id"], "job.id");
          const production = callNumber(
            resource(resources, "Food"),
            "getProduction",
            "resources.Food",
            `job_${id}`,
          );
          maximum = Math.max(
            1,
            count + (Math.ceil(foodRate / -(production / count)) || 0),
          );
        }
      } else if (foodCurrent > maximumFood && foodRate > 0) {
        maximum = count - 1;
      } else {
        maximum = count;
      }
      farmerMinimum = maximum;
    }
    if (kind === "farmer" && !race["artifical"] && !race["unfathomable"]) {
      // Evolve gives full farmer output through Farm capacity; surplus
      // farmers use the reduced extra-worker rate. Keep one worker as a
      // small buffer, but do not let smart farming consume every worker.
      const farmCount = requireNumber(
        building(buildings, "Farm")["count"],
        "buildings.Farm.count",
      );
      const farmerCapacity =
        farmCount > 0
          ? Math.ceil(farmCount * trait(dependencies, "high_pop", 0, 1)) + 1
          : 0;
      maximum = Math.min(maximum ?? Number.MAX_SAFE_INTEGER, farmerCapacity);
      farmerMinimum = maximum;
    }
    if (race["unfathomable"]) {
      maximum = Number.MAX_SAFE_INTEGER;
    } else if (kind === "hunter") {
      if (
        resourceFlag(resources, "Furs", "isUnlocked") &&
        (race["evil"] || race["artifical"])
      ) {
        maximum = resourceFlag(resources, "Furs", "isUseful")
          ? Number.MAX_SAFE_INTEGER
          : Math.max(
              maximum ?? 0,
              busyWorkers(resources, "Furs", "job_hunter", count),
            );
      }
      if (demonicLumber) {
        maximum = resourceFlag(resources, "Lumber", "isUseful")
          ? Number.MAX_SAFE_INTEGER
          : Math.max(
              maximum ?? 0,
              busyWorkers(resources, "Lumber", "job_hunter", count),
            );
      }
    }
  } else if (kind === "lumberjack") {
    maximum = 0;
    if (!race["soul_eater"] && race["evil"]) {
      maximum = resourceFlag(resources, "Furs", "isUseful")
        ? Number.MAX_SAFE_INTEGER
        : busyWorkers(resources, "Furs", "job_reclaimer", count);
    }
    maximum = resourceFlag(resources, "Lumber", "isUseful")
      ? Number.MAX_SAFE_INTEGER
      : Math.max(
          maximum,
          busyWorkers(
            resources,
            "Lumber",
            race["evil"] ? "job_reclaimer" : "job_lumberjack",
            count,
          ),
        );
  } else if (kind === "quarry-worker") {
    maximum = 0;
    for (const name of ["Aluminium", "Chrysotile"] as const) {
      if (resourceFlag(resources, name, "isUnlocked")) {
        maximum = resourceFlag(resources, name, "isUseful")
          ? Number.MAX_SAFE_INTEGER
          : Math.max(maximum, busyWorkers(resources, name, "workers", count));
      }
    }
    maximum = resourceFlag(resources, "Stone", "isUseful")
      ? Number.MAX_SAFE_INTEGER
      : Math.max(maximum, busyWorkers(resources, "Stone", "workers", count));
  } else if (kind === "crystal-miner") {
    maximum = resourceFlag(resources, "Crystal", "isUseful")
      ? Number.MAX_SAFE_INTEGER
      : busyWorkers(resources, "Crystal", "job_crystal_miner", count);
  } else if (job === jobs["Torturer"]) {
    const city = requireRecord(global["city"], "game.global.city");
    const dwellers = city["surfaceDwellers"];
    if (!Array.isArray(dwellers))
      throw new TypeError("surfaceDwellers must be an array");
    const housing = requireRecord(
      city["captive_housing"],
      "game.global.city.captive_housing",
    );
    let total = 0;
    for (let index = 0; index < dwellers.length; index++) {
      total += requireNumber(
        housing[`race${index}`],
        `captive_housing.race${index}`,
      );
      total += requireNumber(
        housing[`jailrace${index}`],
        `captive_housing.jailrace${index}`,
      );
    }
    const stats = requireRecord(global["stats"], "game.global.stats");
    const achieve = requireRecord(
      stats["achieve"],
      "game.global.stats.achieve",
    );
    const nightmare =
      achieve["nightmare"] === undefined
        ? null
        : requireRecord(achieve["nightmare"], "nightmare achievement");
    const rank =
      nightmare === null ? 0 : optionalNumber(nightmare["mg"], "nightmare.mg");
    maximum = Math.ceil(total / (rank / 2));
  } else if (kind === "miner") {
    maximum = 0;
    if (!minersDisabled) {
      if (race["sappy"]) {
        for (const name of ["Aluminium", "Chrysotile"] as const) {
          if (resourceFlag(resources, name, "isUnlocked")) {
            const source =
              name === "Aluminium" &&
              (race["cataclysm"] || race["orbit_decayed"])
                ? "space_red_mine_title"
                : "job_miner";
            maximum = resourceFlag(resources, name, "isUseful")
              ? Number.MAX_SAFE_INTEGER
              : Math.max(maximum, busyWorkers(resources, name, source, count));
          }
        }
      }
      if (optionalNumber(tech["titanium"], "game.global.tech.titanium") >= 2) {
        const shipShift =
          requireNumber(
            building(buildings, "BeltIronShip")["stateOnCount"],
            "BeltIronShip.stateOnCount",
          ) * 2;
        maximum = resourceFlag(resources, "Titanium", "isUseful")
          ? Number.MAX_SAFE_INTEGER
          : Math.max(
              maximum,
              busyWorkers(
                resources,
                "Titanium",
                "resource_Iron_name",
                count + shipShift,
              ) - shipShift,
            );
      }
      if (resourceFlag(resources, "Iron", "isUnlocked")) {
        maximum = resourceFlag(resources, "Iron", "isUseful")
          ? Number.MAX_SAFE_INTEGER
          : Math.max(
              maximum,
              busyWorkers(resources, "Iron", "job_miner", count),
            );
      }
      maximum = resourceFlag(resources, "Copper", "isUseful")
        ? Number.MAX_SAFE_INTEGER
        : Math.max(
            maximum,
            busyWorkers(resources, "Copper", "job_miner", count),
          );
    }
  } else if (job === jobs["CoalMiner"]) {
    maximum = 0;
    if (!coalDisabled) {
      if (resourceFlag(resources, "Uranium", "isUnlocked")) {
        maximum = resourceFlag(resources, "Uranium", "isUseful")
          ? Number.MAX_SAFE_INTEGER
          : busyWorkers(resources, "Uranium", "job_coal_miner", count);
      }
      maximum = resourceFlag(resources, "Coal", "isUseful")
        ? Number.MAX_SAFE_INTEGER
        : Math.max(
            maximum,
            busyWorkers(resources, "Coal", "job_coal_miner", count),
          );
    }
  } else if (kind === "space-miner") {
    maximum =
      (requireNumber(
        building(buildings, "BeltEleriumShip")["stateOnCount"],
        "BeltEleriumShip.stateOnCount",
      ) *
        2 +
        requireNumber(
          building(buildings, "BeltIridiumShip")["stateOnCount"],
          "BeltIridiumShip.stateOnCount",
        ) +
        requireNumber(
          building(buildings, "BeltIronShip")["stateOnCount"],
          "BeltIronShip.stateOnCount",
        )) *
      trait(dependencies, "high_pop", 0, 1);
  } else if (kind === "entertainer" && !technology(dependencies, "superstar")) {
    const civic = requireRecord(global["civic"], "game.global.civic");
    const taxes = requireRecord(civic["taxes"], "game.global.civic.taxes");
    const taxBuffer =
      (booleanSetting(settings, "autoTax") ||
        Boolean(dependencies.haveTask("tax"))) &&
      requireNumber(taxes["tax_rate"], "taxes.tax_rate") <
        requireNumber(dependencies.taxCap(false), "taxCap")
        ? 1
        : 0;
    const entertainerMorale =
      (optionalNumber(tech["theatre"], "game.global.tech.theatre") +
        trait(dependencies, "musical")) *
      trait(dependencies, "emotionless", 0, "-") *
      trait(dependencies, "high_pop", 1, "=") *
      (state["astroSign"] === "sagittarius" ? 1.05 : 1) *
      (race["lone_survivor"] ? 25 : 1);
    maximum =
      count -
      Math.floor(
        (resourceNumber(resources, "Morale", "rateOfChange") -
          resourceNumber(resources, "Morale", "maxQuantity") -
          taxBuffer) /
          entertainerMorale,
      );
  } else if (job === jobs["Banker"]) {
    const civic = requireRecord(global["civic"], "game.global.civic");
    const taxes = requireRecord(civic["taxes"], "game.global.civic.taxes");
    const money = resource(resources, "Money");
    const moneyStorageSatisfied =
      requireNumber(
        money["currentQuantity"],
        "resources.Money.currentQuantity",
      ) >=
      requireNumber(
        money["storageRequired"],
        "resources.Money.storageRequired",
      );
    // Evolve refreshes storageRequired before job automation. Once the
    // planned Money reserve is already available, bankers are surplus; keep
    // the Banking 7 guard because bankers also expand Money capacity there.
    maximum =
      (resourceFlag(resources, "Money", "isCapped") ||
        moneyStorageSatisfied ||
        requireNumber(taxes["tax_rate"], "taxes.tax_rate") <= 0) &&
      !technology(dependencies, "banking", 7)
        ? 0
        : null;
  } else if (job === jobs["Scientist"]) {
    maximum = Number.MAX_SAFE_INTEGER;
    if (
      race["universe"] !== "magic" &&
      resourceFlag(resources, "Knowledge", "isCapped") &&
      !race["intelligent"] &&
      !technology(dependencies, "science", 5) &&
      !technology(dependencies, "genetics", 5)
    )
      maximum = 0;
    if (race["witch_hunter"]) {
      const civic = requireRecord(global["civic"], "game.global.civic");
      const govern = requireRecord(civic["govern"], "game.global.civic.govern");
      const suspicionPerWizard = govern["type"] === "magocracy" ? 0.5 : 1;
      maximum =
        (99 - resourceNumber(resources, "Sus", "currentQuantity")) /
          suspicionPerWizard +
        count * suspicionPerWizard;
    }
  } else if (job === jobs["Professor"]) {
    maximum =
      !race["intelligent"] &&
      resourceFlag(resources, "Knowledge", "isCapped") &&
      !technology(dependencies, "genetics", 5) &&
      !technology(dependencies, "fanaticism", 2)
        ? 0
        : null;
  } else if (job === jobs["CementWorker"]) {
    maximum = Number.MAX_SAFE_INTEGER;
    if (resourceNumber(resources, "Stone", "storageRatio") < 0.1) {
      let stoneRate =
        resourceNumber(resources, "Stone", "rateOfChange") + count * 3 - 5;
      if (race["smoldering"] && booleanSetting(settings, "autoQuarry")) {
        stoneRate += resourceNumber(resources, "Chrysotile", "rateOfChange");
      }
      maximum = Math.min(maximum, Math.floor(stoneRate / 3));
    }
    if (!resourceFlag(resources, "Cement", "isUseful")) {
      maximum = Math.min(
        maximum,
        busyWorkers(resources, "Cement", "city_cement_plant_bd", count),
      );
    }
  } else if (job === jobs["HellSurveyor"]) {
    const portal = requireRecord(global["portal"], "game.global.portal");
    const fortress = requireRecord(
      portal["fortress"],
      "game.global.portal.fortress",
    );
    maximum =
      requireNumber(fortress["threat"], "fortress.threat") > 9000 &&
      resourceNumber(resources, "Population", "storageRatio") < 1
        ? 0
        : Number.MAX_SAFE_INTEGER;
  } else if (job === jobs["Teamster"]) {
    maximum = Math.round(
      (requireNumber(race["teamster"], "race.teamster") /
        optionalNumber(tech["transport"], "tech.transport")) *
        1.5,
    );
    maximum -= optionalNumber(tech["railway"], "tech.railway") * 2;
  } else if (job === jobs["Meditator"]) {
    const infusion =
      0.95 **
      requireNumber(
        building(buildings, "LakeLifeInfuser")["stateOnCount"],
        "LakeLifeInfuser.stateOnCount",
      );
    const threshold =
      (1.25 +
        trait(dependencies, "slow_digestion") +
        trait(dependencies, "humpback") -
        trait(dependencies, "atrophy")) *
      infusion;
    const meditator = 0.03 * trait(dependencies, "high_pop", 1, "=") * infusion;
    maximum =
      Math.ceil(
        ((resourceNumber(resources, "Population", "currentQuantity") / 100) *
          requireNumber(dependencies.getFoodConsume(), "getFoodConsume") -
          threshold) /
          meditator,
      ) + 1;
  }
  if (maximum !== null && !Number.isFinite(maximum)) {
    maximum = maximum > 0 ? Number.MAX_SAFE_INTEGER : 0;
  }
  return { maximum, farmerMinimum, storageBackedMinimum };
}

function unavailableInput(craftOnly: boolean): Readonly<JobsCycleInput> {
  return Object.freeze({
    available: false,
    craftOnly,
    hunterActsAsUnemployed: false,
    autoCraftsmen: false,
    autoCraftWithoutBuilding: false,
    craftsmenMode: "other",
    foundryWeighting: "other",
    manageServants: false,
    setDefault: false,
    servantModifier: 1,
    servantsMaximum: 0,
    skilledServantsMaximum: 0,
    craftsmenMaximum: 0,
    minimumDefault: 0,
    reserveMiner: false,
    defaultJobToken: null,
    hunterToken: null,
    farmerToken: null,
    lumberjackToken: null,
    quarryToken: null,
    crystalMinerToken: null,
    scavengerToken: null,
    foragerToken: null,
    entertainerToken: null,
    minerToken: null,
    population: 0,
    craftDebug: false,
    lastCraftWinner: null,
    authority: Object.freeze({
      enabled: false,
      current: 0,
      morale: 0,
      moralePotential: 0,
      moraleMaximum: 0,
      moraleCeiling: null,
      entertainerMorale: 0,
      superstarMorale: 0,
      previousCap: null,
      debug: false,
    }),
    jobs: Object.freeze([]),
    crafting: Object.freeze([]),
    splitEntries: Object.freeze([]),
    defaultPreference: Object.freeze([]),
  });
}

function decisionsMatch(
  left: Readonly<JobsDecision>,
  right: Readonly<JobsDecision>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createJobsAdapter(dependencies: JobsAdapterDependencies): {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
} {
  let session: JobsSession | null = null;
  const reader: JobsReader = Object.freeze({
    readCycle(craftOnly: boolean) {
      session = null;
      const manager = requireRecord(dependencies.getJobManager(), "JobManager");
      const listed = Reflect.apply(
        requireFunction(
          manager["managedPriorityList"],
          "JobManager.managedPriorityList",
        ),
        manager,
        [],
      );
      if (!Array.isArray(listed))
        throw new TypeError("managedPriorityList must return an array");
      if (listed.length === 0) return unavailableInput(craftOnly);
      const rawJobs = listed.map((value, index) =>
        requireRecord(value, `jobList[${index}]`),
      );
      const game = requireRecord(dependencies.getGame(), "game");
      const jobs = requireRecord(dependencies.getJobs(), "jobs");
      const crafter = requireRecord(dependencies.getCrafter(), "crafter");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const buildings = requireRecord(dependencies.getBuildings(), "buildings");
      const resources = requireRecord(dependencies.getResources(), "resources");
      const state = requireRecord(dependencies.getState(), "state");
      const debugWindow = requireRecord(
        dependencies.getDebugWindow(),
        "debug window",
      );
      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      const civic = requireRecord(global["civic"], "game.global.civic");
      const crew = requireRecord(civic["crew"], "game.global.civic.crew");
      const coalDisabled =
        booleanSetting(settings, "jobDisableMiners") &&
        requireNumber(
          building(buildings, "GatewayStarbase")["count"],
          "GatewayStarbase.count",
        ) > 0;
      const minersDisabled =
        coalDisabled && !(race["sappy"] && race["smoldering"]);
      const demonLumber =
        Boolean(dependencies.isDemonRace()) &&
        Boolean(dependencies.isLumberRace());
      const servantModifier = trait(dependencies, "high_pop", 0, 1);
      const rawCrafting = manager["craftingJobs"];
      if (!Array.isArray(rawCrafting))
        throw new TypeError("JobManager.craftingJobs must be an array");

      const jobInputs: JobsJobInput[] = rawJobs.map((job, token) => {
        const kind = identityKind(job, jobs);
        const flags = requireRecord(job["is"], `jobList[${token}].is`);
        const crafting = Boolean(dependencies.isCraftingJob(job));
        // Evolve leaves the per-job smart setting absent until it has been
        // initialized. Legacy treated that undefined getter as disabled.
        const smart = Boolean(job["isSmartEnabled"]);
        const demonicLumber = kind === "hunter" && demonLumber;
        const smartMaximum = crafting
          ? { maximum: null, farmerMinimum: null, storageBackedMinimum: null }
          : jobSmartMaximum(
              dependencies,
              job,
              kind,
              jobs,
              game,
              settings,
              buildings,
              resources,
              state,
              smart,
              coalDisabled,
              minersDisabled,
              demonicLumber,
            );
        // Crafting jobs carry no breakpoint settings (migration deletes
        // job_b1_<crafter>), so breakpointEmployees would yield NaN. planJobs
        // skips crafting jobs in the assignment loop, so these values are
        // never read; use placeholders to keep the input well-formed.
        const breakpoints = crafting
          ? ([0, 0, 0] as [number, number, number])
          : ([0, 1, 2].map((pass) =>
              callNumber(job, "breakpointEmployees", `jobList[${token}]`, pass),
            ) as [number, number, number]);
        const uncappedBreakpoints = crafting
          ? ([0, 0, 0] as [number, number, number])
          : ([0, 1, 2].map((pass) =>
              callNumber(
                job,
                "breakpointEmployees",
                `jobList[${token}]`,
                pass,
                true,
              ),
            ) as [number, number, number]);
        return Object.freeze({
          token,
          id: requireString(job["id"], `jobList[${token}].id`),
          kind,
          workers: requireNumber(job["workers"], `jobList[${token}].workers`),
          servants: requireNumber(
            job["servants"],
            `jobList[${token}].servants`,
          ),
          count: jobCount(job, `jobList[${token}]`),
          maximum: requireNumber(job["max"], `jobList[${token}].max`),
          managed: callBoolean(job, "isManaged", `jobList[${token}]`),
          unlocked: callBoolean(job, "isUnlocked", `jobList[${token}]`),
          smart,
          crafting,
          serves: Boolean(flags["serve"]),
          split: Boolean(flags["split"]),
          isDefault: callBoolean(job, "isDefault", `jobList[${token}]`),
          breakpoints: Object.freeze(breakpoints),
          uncappedBreakpoints: Object.freeze(uncappedBreakpoints),
          smartMaximum: smartMaximum.maximum,
          farmerMinimum: smartMaximum.farmerMinimum,
          storageBackedMinimum: smartMaximum.storageBackedMinimum,
          demonicLumber,
          warlordMiner: kind === "miner" && Boolean(race["warlord"]),
        });
      });

      const tokenOf = (value: unknown): number | null => {
        const token = rawJobs.indexOf(value as UnknownRecord);
        return token === -1 ? null : token;
      };
      const craftsmenModeValue = settings["productionCraftsmen"];
      const craftsmenMode =
        craftsmenModeValue === "always" ||
        craftsmenModeValue === "nocraft" ||
        craftsmenModeValue === "servants"
          ? craftsmenModeValue
          : "other";
      const weightingValue = settings["productionFoundryWeighting"];
      let foundryWeighting: JobsCycleInput["foundryWeighting"] =
        weightingValue === "buildings" || weightingValue === "demanded"
          ? weightingValue
          : "other";
      if (foundryWeighting === "buildings") {
        const unlockedBuildings = state["unlockedBuildings"];
        if (!Array.isArray(unlockedBuildings)) {
          throw new TypeError("state.unlockedBuildings must be an array");
        }
        if (unlockedBuildings.length === 0) foundryWeighting = "other";
      }
      const craftySpeed = requireRecord(global["genes"], "game.global.genes")[
        "crafty"
      ]
        ? 2
        : 1;
      const costModifier =
        (craftySpeed * trait(dependencies, "resourceful", 0, "-")) / 140;
      const ticks = requireNumber(
        dependencies.ticksPerSecond(),
        "ticksPerSecond",
      );
      const craftingInputs: JobsCraftInput[] = rawCrafting.map(
        (value, index) => {
          const job = requireRecord(value, `JobManager.craftingJobs[${index}]`);
          const jobToken = tokenOf(job);
          const craftResource = requireRecord(
            job["resource"],
            `craftingJobs[${index}].resource`,
          );
          const enabled =
            jobToken !== null &&
            callBoolean(job, "isManaged", `craftingJobs[${index}]`) &&
            requireBoolean(
              craftResource["autoCraftEnabled"],
              `craftingJobs[${index}].resource.autoCraftEnabled`,
            );
          if (!enabled) {
            return Object.freeze({
              jobToken: jobToken ?? -1,
              enabled: false,
              buildingCapacity: null,
              affordability: 0,
              demanded: false,
              useful: false,
              currentQuantity: 0,
              weighting: 1,
              driver: null,
              exclusion: null,
            });
          }
          let craftBuilding: UnknownRecord | null = null;
          if (job === crafter["Scarletite"])
            craftBuilding = building(buildings, "RuinsHellForge");
          else if (job === crafter["Quantium"]) {
            craftBuilding = technology(dependencies, "isolation")
              ? building(buildings, "TauDiseaseLab")
              : building(buildings, "EnceladusZeroGLab");
          }
          const demanded = callBoolean(
            craftResource,
            "isDemanded",
            `craftingJobs[${index}].resource`,
          );
          let affordability = Number.MAX_SAFE_INTEGER;
          let exclusion: string | null = null;
          const costs = requireRecord(
            craftResource["cost"],
            `craftingJobs[${index}].resource.cost`,
          );
          for (const [resourceId, costValue] of Object.entries(costs)) {
            const requiredResource = requireRecord(
              resources[resourceId],
              `resources.${resourceId}`,
            );
            if (
              !demanded &&
              ((!booleanSetting(settings, "useDemanded") &&
                callBoolean(
                  requiredResource,
                  "isDemanded",
                  `resources.${resourceId}`,
                )) ||
                requireNumber(
                  requiredResource["storageRatio"],
                  `resources.${resourceId}.storageRatio`,
                ) <
                  requireNumber(
                    craftResource["craftPreserve"],
                    `craftingJobs[${index}].resource.craftPreserve`,
                  ))
            ) {
              affordability = 0;
              exclusion = `${requireString(job["id"], `craftingJobs[${index}].id`)}(hold:${resourceId})`;
              break;
            }
            affordability = Math.min(
              affordability,
              ((requireNumber(
                craftResource["rateOfChange"],
                `craftingJobs[${index}].resource.rateOfChange`,
              ) +
                requireNumber(
                  requiredResource["currentQuantity"],
                  `resources.${resourceId}.currentQuantity`,
                )) /
                (requireNumber(costValue, `craft cost ${resourceId}`) *
                  costModifier) /
                2) *
                ticks,
            );
          }
          if (!Number.isFinite(affordability))
            affordability = Number.MAX_SAFE_INTEGER;
          const craftWeight = requireNumber(
            craftResource["craftWeighting"],
            `craftingJobs[${index}].resource.craftWeighting`,
          );
          let weighting = craftWeight;
          let driver: string | null = null;
          if (foundryWeighting === "buildings") {
            const requiredWeight =
              dependencies.findRequiredResourceWeight(craftResource);
            weighting =
              (requiredWeight === undefined || requiredWeight === null
                ? 0
                : requireNumber(requiredWeight, "required resource weight")) *
              craftWeight;
            const unlocked = state["unlockedBuildings"];
            if (!Array.isArray(unlocked))
              throw new TypeError("state.unlockedBuildings must be an array");
            const current = requireNumber(
              craftResource["currentQuantity"],
              `craftingJobs[${index}].resource.currentQuantity`,
            );
            const resourceId = requireString(
              craftResource["id"],
              `craftingJobs[${index}].resource.id`,
            );
            // Diagnostics must name the same requirement the weighting came
            // from, so this walks the ordered list with the identical
            // cumulative-claim rule rather than its own comparison.
            let claimed = 0;
            const driving = unlocked.find((candidate) => {
              const record = requireRecord(
                candidate,
                "state.unlockedBuildings entry",
              );
              const cost = requireRecord(
                record["cost"],
                "unlocked building cost",
              );
              const amount = cost[resourceId];
              if (typeof amount !== "number") return false;
              claimed += amount;
              return claimed > current;
            });
            if (driving === undefined) {
              driver = `no building×${craftWeight}`;
            } else {
              const record = requireRecord(driving, "driving building");
              driver = `${requireString(record["_vueBinding"], "driving building binding")}@${requireNumber(record["weighting"], "driving building weighting").toFixed(1)}×${craftWeight}`;
            }
          }
          return Object.freeze({
            jobToken: jobToken ?? -1,
            enabled,
            buildingCapacity:
              craftBuilding === null
                ? null
                : requireNumber(
                    craftBuilding["stateOnCount"],
                    "craft building stateOnCount",
                  ) * servantModifier,
            affordability,
            demanded,
            useful:
              requireNumber(
                craftResource["currentQuantity"],
                `craftingJobs[${index}].resource.currentQuantity`,
              ) <
              requireNumber(
                craftResource["storageRequired"],
                `craftingJobs[${index}].resource.storageRequired`,
              ),
            currentQuantity: requireNumber(
              craftResource["currentQuantity"],
              `craftingJobs[${index}].resource.currentQuantity`,
            ),
            weighting,
            driver,
            exclusion,
          });
        },
      );

      const authorityEnabled =
        booleanSetting(settings, "authorityManage") &&
        numberSetting(settings, "generalMinimumAuthority") !== 0 &&
        resourceFlag(resources, "Authority", "isUnlocked");
      let moraleCeiling: number | null = null;
      if (authorityEnabled) {
        const authorityTarget = Math.max(
          100,
          numberSetting(settings, "generalMinimumAuthority") < 0
            ? resourceNumber(resources, "Authority", "maxQuantity")
            : numberSetting(settings, "generalMinimumAuthority"),
        );
        let authorityTaxLimit = requireNumber(
          dependencies.taxCap(false),
          "taxCap(false)",
        );
        const requestedTaxRate = Number(settings["generalRequestedTaxRate"]);
        if (
          booleanSetting(settings, "autoTax") &&
          Number.isFinite(requestedTaxRate) &&
          requestedTaxRate >= 0
        ) {
          authorityTaxLimit = Math.min(
            Math.max(
              requestedTaxRate,
              requireNumber(dependencies.taxCap(true), "taxCap(true)"),
            ),
            authorityTaxLimit,
          );
        }
        const taxes = requireRecord(civic["taxes"], "game.global.civic.taxes");
        const canTax =
          taxes["display"] !== false &&
          (booleanSetting(settings, "autoTax") ||
            Boolean(dependencies.haveTask("tax"))) &&
          requireNumber(taxes["tax_rate"], "taxes.tax_rate") <
            authorityTaxLimit &&
          resourceNumber(resources, "Authority", "currentQuantity") <
            authorityTarget;
        const scriptTick = state["scriptTick"];
        const soldiersAdjusted =
          scriptTick !== undefined &&
          state["authoritySoldiersAdjustedTick"] === scriptTick;
        if (!canTax && !soldiersAdjusted) {
          const govern = requireRecord(
            civic["govern"],
            "game.global.civic.govern",
          );
          const factor = govern["type"] === "democracy" ? 0.9 : 1;
          const authorityAtHundred =
            resourceNumber(resources, "Authority", "currentQuantity") +
            Math.max(
              0,
              resourceNumber(resources, "Morale", "currentQuantity") - 100,
            ) *
              factor;
          moraleCeiling = 100 + Math.max(0, authorityAtHundred - 100) / factor;
        }
      }
      const tech = requireRecord(global["tech"], "game.global.tech");
      const entertainerMorale =
        (optionalNumber(tech["theatre"], "game.global.tech.theatre") +
          trait(dependencies, "musical")) *
        trait(dependencies, "emotionless", 0, "-") *
        trait(dependencies, "high_pop", 1, "=") *
        (state["astroSign"] === "sagittarius" ? 1.05 : 1) *
        (race["lone_survivor"] ? 25 : 1);
      const authority: JobsAuthorityInput = Object.freeze({
        enabled: authorityEnabled,
        current: authorityEnabled
          ? resourceNumber(resources, "Authority", "currentQuantity")
          : 0,
        morale: authorityEnabled
          ? resourceNumber(resources, "Morale", "currentQuantity")
          : 0,
        moralePotential: authorityEnabled
          ? resourceNumber(resources, "Morale", "rateOfChange")
          : 0,
        moraleMaximum: authorityEnabled
          ? resourceNumber(resources, "Morale", "maxQuantity")
          : 0,
        moraleCeiling,
        entertainerMorale,
        superstarMorale: technology(dependencies, "superstar")
          ? trait(dependencies, "high_pop", 1, "=")
          : 0,
        previousCap:
          state["authorityEntertainerCap"] === undefined
            ? null
            : requireNumber(
                state["authorityEntertainerCap"],
                "state.authorityEntertainerCap",
              ),
        debug: Boolean(debugWindow["authorityDebug"]),
      });

      const token = (name: string) => tokenOf(jobs[name]);
      const hunterActsAsUnemployed =
        (Boolean(race["carnivore"]) && !race["herbivore"]) ||
        Boolean(race["soul_eater"]) ||
        Boolean(race["unfathomable"]);
      const hunterToken = token("Hunter");
      const defaultCandidates: JobsDefaultCandidate[] = [];
      const defaultJobs = new Map<number, UnknownRecord>();
      let nextDefaultToken = rawJobs.length;
      const addDefault = (
        name: string,
        requirement: JobsDefaultCandidate["requirement"],
      ) => {
        const value = jobs[name];
        if (typeof value !== "object" || value === null) return;
        const record = value as UnknownRecord;
        const allocationToken = tokenOf(record);
        const jobToken = allocationToken ?? nextDefaultToken++;
        defaultJobs.set(jobToken, record);
        defaultCandidates.push(
          Object.freeze({
            jobToken,
            allocationToken,
            requirement,
            managed: callBoolean(record, "isManaged", `jobs.${name}`),
            unlocked: callBoolean(record, "isUnlocked", `jobs.${name}`),
          }),
        );
      };
      const setDefault = booleanSetting(settings, "jobSetDefault");
      if (!craftOnly && setDefault) {
        addDefault("QuarryWorker", "managed-with-workers");
        addDefault("Lumberjack", "managed-with-workers");
        addDefault("CrystalMiner", "managed-with-workers");
        addDefault("Scavenger", "managed-with-workers");
        addDefault("Forager", "managed");
        addDefault("Hunter", "managed");
        addDefault("Farmer", "managed");
        addDefault("Teamster", "managed");
        addDefault("Scavenger", "unlocked");
        addDefault("CrystalMiner", "unlocked");
        addDefault("QuarryWorker", "unlocked");
        addDefault("Lumberjack", "unlocked");
        addDefault("Forager", "unlocked");
        addDefault("Hunter", "managed");
        addDefault("Unemployed", "unlocked");
      }
      const currentDefault =
        jobInputs.find((job) => job.isDefault)?.token ?? null;
      const farmerToken = race["artifical"]
        ? null
        : hunterActsAsUnemployed
          ? hunterToken
          : Math.max(token("Hunter") ?? -1, token("Farmer") ?? -1);
      const normalizedFarmerToken = farmerToken === -1 ? null : farmerToken;
      const lumberjackToken = demonLumber
        ? normalizedFarmerToken
        : token("Lumberjack");
      const vacuumSyphonStage = readVacuumCollapseManaStageReady(
        settings,
        resources,
      );
      const splitSpecs = [
        ...(race["unfathomable"]
          ? [
              {
                jobToken: normalizedFarmerToken,
                name: "Hunter",
                setting: "jobRaiderWeighting",
              },
            ]
          : []),
        {
          jobToken: lumberjackToken,
          name: "Lumberjack",
          setting: "jobLumberWeighting",
        },
        {
          jobToken: token("QuarryWorker"),
          name: "QuarryWorker",
          setting: "jobQuarryWeighting",
        },
        {
          jobToken: token("CrystalMiner"),
          name: "CrystalMiner",
          setting: "jobCrystalWeighting",
        },
        {
          jobToken: token("Scavenger"),
          name: "Scavenger",
          setting: "jobScavengerWeighting",
        },
        {
          jobToken: token("Forager"),
          name: "Forager",
          setting: "jobForagerWeighting",
        },
      ] as const;
      const competingSplitWeightings = splitSpecs
        .filter(
          (spec) => spec.name !== "CrystalMiner" && spec.jobToken !== null,
        )
        .map((spec) => numberSetting(settings, spec.setting));
      const splitEntries: JobsSplitInput[] = [];
      const addSplit = (
        jobToken: number | null,
        name: string,
        setting: string,
      ) => {
        if (jobToken === null) return;
        const weighting =
          name === "CrystalMiner"
            ? focusCrystalMinerWeighting(
                numberSetting(settings, setting),
                competingSplitWeightings,
                vacuumSyphonStage,
              )
            : numberSetting(settings, setting);
        if (weighting <= 0) return;
        const raw = requireRecord(jobs[name], `jobs.${name}`);
        const breakpoints = [0, 1, 2].map((pass) => {
          const configured = callNumber(
            raw,
            "getBreakpoint",
            `jobs.${name}`,
            pass,
          );
          return configured > 0
            ? callNumber(raw, "breakpointEmployees", `jobs.${name}`, pass)
            : 0;
        }) as [number, number, number];
        splitEntries.push(
          Object.freeze({
            jobToken,
            weighting,
            breakpoints: Object.freeze(breakpoints),
          }),
        );
      };
      for (const spec of splitSpecs) {
        addSplit(spec.jobToken, spec.name, spec.setting);
      }
      const input: JobsCycleInput = Object.freeze({
        available: true,
        craftOnly,
        hunterActsAsUnemployed,
        autoCraftsmen: booleanSetting(settings, "autoCraftsmen"),
        autoCraftWithoutBuilding:
          craftsmenMode === "always" ||
          (craftsmenMode === "nocraft" && Boolean(race["no_craft"])),
        craftsmenMode,
        foundryWeighting,
        manageServants: booleanSetting(settings, "jobManageServants"),
        setDefault,
        servantModifier,
        servantsMaximum: booleanSetting(settings, "jobManageServants")
          ? callNumber(manager, "servantsMax", "JobManager")
          : 0,
        skilledServantsMaximum: booleanSetting(settings, "jobManageServants")
          ? callNumber(manager, "skilledServantsMax", "JobManager")
          : 0,
        craftsmenMaximum: callNumber(manager, "craftingMax", "JobManager"),
        minimumDefault:
          requireNumber(crew["max"], "crew.max") -
            requireNumber(crew["workers"], "crew.workers") >
          0
            ? requireNumber(crew["max"], "crew.max") -
              requireNumber(crew["workers"], "crew.workers") +
              1
            : 0,
        reserveMiner:
          ((Boolean(race["hooved"]) &&
            resourceNumber(resources, "Horseshoe", "usefulRatio") < 1) ||
            (Boolean(race["artifical"]) &&
              !race["deconstructor"] &&
              resourceNumber(resources, "Population", "storageRatio") < 1)) &&
          !minersDisabled,
        defaultJobToken: currentDefault,
        hunterToken,
        farmerToken: normalizedFarmerToken,
        lumberjackToken,
        quarryToken: token("QuarryWorker"),
        crystalMinerToken: token("CrystalMiner"),
        scavengerToken: token("Scavenger"),
        foragerToken: token("Forager"),
        entertainerToken: token("Entertainer"),
        minerToken: token("Miner"),
        population: resourceNumber(resources, "Population", "currentQuantity"),
        craftDebug: Boolean(debugWindow["craftDebug"]),
        lastCraftWinner:
          state["lastCraftWinner"] === undefined
            ? null
            : requireString(state["lastCraftWinner"], "state.lastCraftWinner"),
        authority,
        jobs: Object.freeze(jobInputs),
        crafting: Object.freeze(craftingInputs),
        splitEntries: Object.freeze(splitEntries),
        defaultPreference: Object.freeze(defaultCandidates),
      });
      session = {
        manager,
        game,
        jobsCatalog: jobs,
        state,
        resources,
        rawJobs,
        defaultJobs,
        input,
      };
      return input;
    },
  });

  const executor: JobsExecutor = Object.freeze({
    execute(decision: Readonly<JobsDecision>) {
      const active = session;
      if (active === null)
        return stale("jobs-session-missing", "Jobs session is missing");
      if (
        dependencies.getJobManager() !== active.manager ||
        dependencies.getGame() !== active.game ||
        dependencies.getJobs() !== active.jobsCatalog
      ) {
        return stale("jobs-source-changed", "Jobs source changed");
      }
      const expected = planJobs(active.input);
      if (expected === null || !decisionsMatch(expected, decision)) {
        return rejected(
          "invalid-jobs-decision",
          "Jobs decision does not match the sampled plan",
        );
      }
      const workerRemovals: Array<readonly [UnknownRecord, number]> = [];
      const workerAdditions: Array<readonly [UnknownRecord, number]> = [];
      const servantRemovals: Array<readonly [UnknownRecord, number]> = [];
      const servantAdditions: Array<readonly [UnknownRecord, number]> = [];
      for (const assignment of decision.assignments) {
        const job = active.rawJobs[assignment.jobToken];
        const sampled = active.input.jobs[assignment.jobToken];
        if (job === undefined || sampled === undefined)
          return rejected(
            "unknown-job-token",
            "Jobs decision contains an unknown job token",
          );
        const workerDelta = assignment.workers - sampled.workers;
        if (workerDelta < 0) {
          requireFunction(
            job["removeWorkers"],
            `jobList[${assignment.jobToken}].removeWorkers`,
          );
          workerRemovals.push([job, -workerDelta]);
        } else if (workerDelta > 0) {
          requireFunction(
            job["addWorkers"],
            `jobList[${assignment.jobToken}].addWorkers`,
          );
          workerAdditions.push([job, workerDelta]);
        }
        if (active.input.manageServants) {
          const servantDelta = assignment.servants - sampled.servants;
          if (servantDelta < 0) {
            requireFunction(
              job["removeServants"],
              `jobList[${assignment.jobToken}].removeServants`,
            );
            servantRemovals.push([job, -servantDelta]);
          } else if (servantDelta > 0) {
            requireFunction(
              job["addServants"],
              `jobList[${assignment.jobToken}].addServants`,
            );
            servantAdditions.push([job, servantDelta]);
          }
        }
      }
      const defaultJob =
        decision.selectedDefaultToken === null
          ? null
          : active.defaultJobs.get(decision.selectedDefaultToken);
      const morale = decision.moraleIncomeAdjusted
        ? resource(active.resources, "Morale")
        : null;
      const iron = decision.ironIncomeAdjusted
        ? resource(active.resources, "Iron")
        : null;
      session = null;
      if (decision.craftDebugMessage !== null)
        dependencies.log(decision.craftDebugMessage);
      if (decision.craftWinner !== null)
        active.state["lastCraftWinner"] = decision.craftWinner;
      active.state["maxSpaceMiners"] = decision.maximumSpaceMiners;
      if (decision.clearAuthorityEntertainerCap)
        delete active.state["authorityEntertainerCap"];
      else if (decision.authorityEntertainerCap !== null)
        active.state["authorityEntertainerCap"] =
          decision.authorityEntertainerCap;
      if (decision.authorityDebugMessage !== null)
        dependencies.log(decision.authorityDebugMessage);
      if (morale !== null) morale["incomeAdusted"] = true;
      if (iron !== null) iron["incomeAdusted"] = true;
      for (const [job, count] of workerRemovals)
        Reflect.apply(
          requireFunction(job["removeWorkers"], "job.removeWorkers"),
          job,
          [count],
        );
      for (const [job, count] of workerAdditions)
        Reflect.apply(
          requireFunction(job["addWorkers"], "job.addWorkers"),
          job,
          [count],
        );
      for (const [job, count] of servantRemovals)
        Reflect.apply(
          requireFunction(job["removeServants"], "job.removeServants"),
          job,
          [count],
        );
      for (const [job, count] of servantAdditions)
        Reflect.apply(
          requireFunction(job["addServants"], "job.addServants"),
          job,
          [count],
        );
      active.state["lastPopulationCount"] = decision.lastPopulationCount;
      active.state["lastFarmerCount"] = decision.lastFarmerCount;
      if (defaultJob !== null && defaultJob !== undefined)
        Reflect.apply(
          requireFunction(
            defaultJob["setAsDefault"],
            "selected job.setAsDefault",
          ),
          defaultJob,
          [],
        );
      return SUCCEEDED;
    },
  });
  return Object.freeze({ reader, executor });
}
