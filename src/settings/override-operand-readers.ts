/**
 * The automation-facing half of a condition operand: what the script reads when a stored override or
 * trigger condition names an operand type. `override-operand-inputs.ts` owns the other half — what the
 * editor renders for the operand's argument — and `override-catalog.ts` joins the two into the
 * `checkTypes` shape both consumers already use.
 *
 * Reads are deduplicated per consumer, not globally, and that is deliberate. The hot consumer is the
 * override pass, which reads each distinct `(operandType, argument)` once because
 * `createOverrideEvaluationSource` samples it. The other two consumers read one operand per call and
 * are not hot: `TriggerManager.resetTargetTriggers` evaluates one requirement per configured trigger
 * per tick, and the editor's `evaluateCheck` is not called in production at all. A shared evaluation
 * input over all consumers would have to sample roughly 400 buildings and 80 resources to serve the
 * handful of conditions a player configures, so it is not built.
 *
 * TRANSITIONAL: every reader still traverses a live game bag through its `read*` dependency, which is
 * the Vue 2 mirror the isolation work replaces. The interfaces below are the typed contract those
 * capability ports have to satisfy; they are already narrow enough that only the suppliers change.
 */

/** One operand read. The argument is whatever the editor's input for that operand type stored. */
export type OverrideOperandReader = (argument: unknown) => unknown;

export interface OverrideReadBuilding {
  /** Resource id to amount for the next copy of this building. */
  readonly cost: Readonly<Record<string, number | undefined>>;
  readonly count: number;
  readonly stateOnCount: number;
  readonly stateOffCount: number;
  isUnlocked: () => boolean;
  isClickable: () => boolean;
  isAffordable: (checkStorageCaps: boolean) => boolean;
}

/** The script's building catalog keyed by name, of which the readers need exactly one entry. */
export interface OverrideReadBuildingCatalog {
  readonly SunSwarmSatellite: {
    readonly cost: Readonly<Record<string, number | undefined>>;
  };
}

export interface OverrideReadProject {
  readonly count: number;
  readonly progress: number;
  isUnlocked: () => boolean;
}

export interface OverrideReadJob {
  readonly count: number;
  readonly max: number;
  readonly workers: number;
  readonly servants: number;
  isUnlocked: () => boolean;
}

export interface OverrideReadResearch {
  isUnlocked: () => boolean;
  isResearched: () => boolean;
}

export interface OverrideReadResource {
  readonly currentQuantity: number;
  readonly maxQuantity: number;
  readonly maxCost: number;
  readonly rateOfChange: number;
  readonly storageRatio: number;
  readonly usefulRatio: number;
  isUnlocked: () => boolean;
  isDemanded: () => boolean;
}

export interface OverrideReadRace {
  readonly genus: string;
}

export interface OverrideReadIndustry {
  maxOperating: () => number;
}

export interface OverrideReadQueue {
  readonly queue: readonly unknown[];
}

/**
 * The game fields the readers touch. A field is optional here only where the current implementation
 * guards it, which is the game's own statement about what it leaves out.
 */
export interface OverrideReadGame {
  readonly global: {
    readonly race: Readonly<Record<string, unknown>>;
    readonly city: {
      readonly biome: unknown;
      readonly ptrait: readonly unknown[];
      readonly calendar: Readonly<Record<string, unknown>>;
    };
    readonly civic: { readonly govern?: { readonly type?: unknown } };
    readonly stats: { readonly days: number };
    readonly pillars: Readonly<Record<string, number | undefined>>;
    readonly portal: { readonly carport?: { readonly damaged?: number } };
    readonly space: {
      readonly m_relay?: { readonly charged?: number };
      readonly shipyard?: { readonly ships?: readonly unknown[] };
    };
    readonly queue: OverrideReadQueue;
    readonly r_queue: OverrideReadQueue;
  };
  readonly races: Readonly<Record<string, { readonly name: string }>>;
  alevel: () => number;
}

export interface OverrideReadScriptState {
  readonly queuedTargetsAll: readonly unknown[];
  readonly knowledgeRequiredByTechs: unknown;
}

export interface OverrideReadSettingsRaw extends Record<string, unknown> {
  readonly evolutionQueue: readonly unknown[];
}

export interface OverrideOperandReaderDependencies {
  readonly readSettings: () => Readonly<Record<string, unknown>>;
  readonly readSettingsRaw: () => OverrideReadSettingsRaw;
  readonly readState: () => OverrideReadScriptState;
  readonly readGame: () => OverrideReadGame;
  readonly readBuildingIds: () => Readonly<
    Record<string, OverrideReadBuilding>
  >;
  readonly readBuildings: () => OverrideReadBuildingCatalog;
  readonly readResources: () => Readonly<Record<string, OverrideReadResource>>;
  readonly readTechIds: () => Readonly<Record<string, OverrideReadResearch>>;
  readonly readArpaIds: () => Readonly<Record<string, OverrideReadProject>>;
  readonly readJobIds: () => Readonly<Record<string, OverrideReadJob>>;
  readonly readRaces: () => Readonly<Record<string, OverrideReadRace>>;
  readonly readSmelterManager: () => OverrideReadIndustry;
  readonly readFactoryManager: () => OverrideReadIndustry;
  readonly readWarManager: () => Readonly<Record<string, unknown>>;
  readonly readFastEval: () => (source: string) => unknown;
  readonly readGovernor: () => () => string;
}

/**
 * Resolves a condition's stored argument against a keyed game bag. An argument naming nothing is a
 * broken condition, so it throws; the caller turns that into one reported failure for the condition.
 */
function lookup<T>(
  bag: Readonly<Record<string, T>>,
  argument: unknown,
  kind: string,
): T {
  const entry = typeof argument === "string" ? bag[argument] : undefined;
  if (entry === undefined) {
    throw new Error(`${kind} ${String(argument)} not found`);
  }
  return entry;
}

export function createOverrideOperandReaders({
  readSettings,
  readSettingsRaw,
  readState,
  readGame,
  readBuildingIds,
  readBuildings,
  readResources,
  readTechIds,
  readArpaIds,
  readJobIds,
  readRaces,
  readSmelterManager,
  readFactoryManager,
  readWarManager,
  readFastEval,
  readGovernor,
}: OverrideOperandReaderDependencies) {
  const building = (argument: unknown) =>
    lookup(readBuildingIds(), argument, "building");
  const project = (argument: unknown) =>
    lookup(readArpaIds(), argument, "project");
  const job = (argument: unknown) => lookup(readJobIds(), argument, "job");
  const research = (argument: unknown) =>
    lookup(readTechIds(), argument, "research");
  const resource = (argument: unknown) =>
    lookup(readResources(), argument, "resource");

  /** The race id an argument names: the current race, one of the stored races, or a literal id. */
  function resolveRaceId(argument: unknown): unknown {
    const race = readGame().global.race;
    if (
      argument === "species" ||
      argument === "gods" ||
      argument === "old_gods"
    ) {
      return race[argument];
    }
    if (argument === "srace") {
      return race.srace ?? "protoplasm";
    }
    return argument;
  }

  function resolveDate(argument: unknown): unknown {
    const game = readGame();
    if (argument === "total") {
      return game.global.stats.days;
    }
    if (argument === "impact") {
      const orbitDecay = game.global.race.orbit_decay;
      // Anything truthy but non-numeric keeps the historical NaN result.
      return orbitDecay ? Number(orbitDecay) - game.global.stats.days : -1;
    }
    return game.global.city.calendar[String(argument)];
  }

  function resolveIndustry(argument: unknown): unknown {
    if (argument === "smelters") {
      return readSmelterManager().maxOperating();
    }
    if (argument === "factories") {
      return readFactoryManager().maxOperating();
    }
    return argument;
  }

  /** The ingame name of the race being played, or of the one chosen at the end of evolution. */
  function currentRaceName(): string {
    const game = readGame();
    const species = game.global.race.species;
    const chosen = game.global.race.evoFinalMenu;
    const raceId = species === "protoplasm" && chosen ? chosen : species;
    return lookup(game.races, raceId, "race").name;
  }

  function resolveOther(argument: unknown): unknown {
    const game = readGame();
    switch (argument) {
      case "rname":
        return currentRaceName();
      case "tpfleet":
        return game.global.space.shipyard?.ships?.length ?? 0;
      case "mrelay":
        // An absent relay keeps the historical NaN result rather than reading as uncharged.
        return Number(game.global.space.m_relay?.charged) / 10000.0;
      case "satcost":
        return readBuildings().SunSwarmSatellite.cost.Money ?? 0;
      case "bcar":
        return game.global.portal.carport?.damaged ?? 0;
      case "alevel":
        return game.alevel() - 1;
      case "tknow":
        return readState().knowledgeRequiredByTechs;
      default:
        return argument;
    }
  }

  return {
    String: (argument) => argument,
    Number: (argument) => argument,
    Boolean: (argument) => argument,
    SettingDefault: (argument) => readSettingsRaw()[String(argument)],
    SettingCurrent: (argument) => readSettings()[String(argument)],
    Eval: (argument) => readFastEval()(String(argument)),

    BuildingCost: (argument) => {
      const [buildingId, resourceId] = String(argument).split(".");
      return (
        lookup(readBuildingIds(), buildingId, "building").cost[
          String(resourceId)
        ] ?? 0
      );
    },
    BuildingUnlocked: (argument) => building(argument).isUnlocked(),
    BuildingClickable: (argument) => building(argument).isClickable(),
    BuildingAffordable: (argument) => building(argument).isAffordable(true),
    BuildingCount: (argument) => building(argument).count,
    BuildingEnabled: (argument) => building(argument).stateOnCount,
    BuildingDisabled: (argument) => building(argument).stateOffCount,
    BuildingQueued: (argument) =>
      readState().queuedTargetsAll.includes(building(argument)),

    ProjectUnlocked: (argument) => project(argument).isUnlocked(),
    ProjectCount: (argument) => project(argument).count,
    ProjectProgress: (argument) => project(argument).progress,

    JobUnlocked: (argument) => job(argument).isUnlocked(),
    JobCount: (argument) => job(argument).count,
    JobMax: (argument) => job(argument).max,
    JobWorkers: (argument) => job(argument).workers,
    JobServants: (argument) => job(argument).servants,

    ResearchUnlocked: (argument) => research(argument).isUnlocked(),
    ResearchComplete: (argument) => research(argument).isResearched(),

    ResourceUnlocked: (argument) => resource(argument).isUnlocked(),
    ResourceQuantity: (argument) => resource(argument).currentQuantity,
    ResourceStorage: (argument) => resource(argument).maxQuantity,
    ResourceMaxCost: (argument) => resource(argument).maxCost,
    // rateOfChange holds the full diff of the resource at the moment overrides are checked.
    ResourceIncome: (argument) => resource(argument).rateOfChange,
    ResourceRatio: (argument) => resource(argument).storageRatio,
    ResourceSatisfied: (argument) => resource(argument).usefulRatio >= 1,
    ResourceSatisfyRatio: (argument) => resource(argument).usefulRatio,
    ResourceDemanded: (argument) => resource(argument).isDemanded(),

    RaceId: (argument) => resolveRaceId(argument),
    RacePillared: (argument) => {
      const pillared =
        readGame().global.pillars[String(resolveRaceId(argument))];
      return pillared !== undefined && pillared >= readGame().alevel();
    },
    RaceGenus: (argument) => {
      const species = String(readGame().global.race.species);
      return readRaces()[species]?.genus === argument;
    },
    MimicGenus: (argument) =>
      (readGame().global.race.ss_genus ?? "none") === argument,
    TraitLevel: (argument) => readGame().global.race[String(argument)] ?? 0,

    ResetType: (argument) => readSettings().prestigeType === argument,
    Challenge: (argument) =>
      readGame().global.race[String(argument)] ? true : false,
    Universe: (argument) => readGame().global.race.universe === argument,
    Government: (argument) => readGame().global.civic.govern?.type === argument,
    Governor: (argument) => readGovernor()() === argument,

    Queue: (argument) => {
      if (argument === "queue") {
        return readGame().global.queue.queue.length;
      }
      if (argument === "r_queue") {
        return readGame().global.r_queue.queue.length;
      }
      if (argument === "evo") {
        return readSettingsRaw().evolutionQueue.length;
      }
      throw new Error(`queue ${String(argument)} not found`);
    },
    Date: (argument) => resolveDate(argument),
    Soldiers: (argument) => readWarManager()[String(argument)],
    PlanetBiome: (argument) => readGame().global.city.biome === argument,
    PlanetTrait: (argument) => readGame().global.city.ptrait.includes(argument),
    Industry: (argument) => resolveIndustry(argument),
    Other: (argument) => resolveOther(argument),
  } satisfies Record<string, OverrideOperandReader>;
}

export type OverrideOperandReaders = ReturnType<
  typeof createOverrideOperandReaders
>;
