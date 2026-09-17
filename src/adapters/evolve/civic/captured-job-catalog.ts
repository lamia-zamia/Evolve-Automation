/**
 * Reads the ordinary job catalog that DeadSpace exposes through the captured Civics controls.
 *
 * The catalog is deliberately smaller than the full job planner input. Workers, caps, visibility,
 * default-job identity, split preferences, and game-owned control methods are stable captured facts;
 * smart-job rules, storage floors, and special race behavior still need their own characterization.
 */

import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type {
  JobKind,
  JobsAuthorityInput,
  JobsCycleInput,
  JobsJobInput,
} from "../../../domain/civic/jobs.ts";
import type { CapturedDemandSample } from "../economy/resources/captured-resource-demand.ts";
import {
  finite,
  finiteNonNegative,
  isRecord,
  readProperty,
} from "../../validation.ts";
import { readScriptCyclesPerSecond } from "../captured-tick-rate.ts";
import { readCapturedMorale } from "./captured-morale.ts";
import {
  readCapturedTaxLimits,
  readCapturedTaxTaskActive,
} from "./captured-tax.ts";

export interface CapturedJobCatalogEntry {
  readonly id: string;
  readonly controlId: string;
  /** Canonical `defineJobs` position used by the pure planner; null for unknown additions. */
  readonly token: number | null;
  readonly kind: JobKind;
  readonly smart: boolean;
  readonly configuredPriority: number | null;
  readonly assigned: number;
  readonly workers: number;
  /** Current servant assignment; zero when the run has no servant feature. */
  readonly servants: number;
  /** Effective worker-equivalent count used by DeadSpace's planner. */
  readonly count: number;
  /** Whether DeadSpace has initialized a servant assignment slot for this job. */
  readonly serves: boolean;
  /** Static planner split flag from the ordinary-job catalog. */
  readonly split: boolean;
  /** Characterized smart maximum, when this catalog slice has all required inputs. */
  readonly smartMaximum: number | null;
  /** False means the smart setting is visible but its rule is not yet characterized. */
  readonly smartMaximumKnown: boolean;
  /** Characterized Farmer/Hunter food floor for Artificial and Unfathomable races. */
  readonly farmerMinimum: number | null;
  /** Worker floor when this job currently carries irreversible resource capacity. */
  readonly storageBackedMinimum: number | null;
  /** Warlord Miner behavior is a direct race/id condition in the pure planner. */
  readonly warlordMiner: boolean;
  /** Hunter's demonic-lumber branch from the captured race profile. */
  readonly demonicLumber: boolean;
  /** DeadSpace uses -1 for an uncapped ordinary job. */
  readonly maximum: number;
  readonly display: boolean;
  readonly unlocked: boolean;
  readonly managed: boolean;
  /** Raw `job_b1..3_<id>` settings; normalization belongs to the planner-input slice. */
  readonly configuredBreakpoints: readonly [number, number, number] | null;
  /** Normalized breakpoints when population scaling is characterized. */
  readonly breakpoints: readonly [number, number, number] | null;
  readonly uncappedBreakpoints: readonly [number, number, number] | null;
  readonly isDefault: boolean;
}

export interface CapturedServantState {
  readonly maximum: number;
  readonly used: number;
  readonly skilledMaximum: number;
  readonly skilledUsed: number;
}

export interface CapturedJobSplitEntry {
  readonly jobToken: number;
  readonly weighting: number;
  readonly breakpoints: readonly [number, number, number];
}

export interface CapturedJobDefaultCandidate {
  readonly jobToken: number;
  readonly allocationToken: number | null;
  readonly requirement: "managed-with-workers" | "managed" | "unlocked";
  readonly managed: boolean;
  readonly unlocked: boolean;
}

export interface CapturedJobCatalog {
  readonly defaultJobId: string;
  /** False when the settings blob has never been through a job settings reset. */
  readonly jobSettingsConfigured: boolean;
  /** Whether the current race uses Hunter as the unemployed allocation pool. */
  readonly hunterActsAsUnemployed: boolean;
  /** Crew reserve needed before selecting a new default job, when crew state exists. */
  readonly minimumDefault: number | null;
  /** Worker-equivalent value of one servant in the current race. */
  readonly servantModifier: number;
  /** Null means the race has no servant feature in this run. */
  readonly servantState: Readonly<CapturedServantState> | null;
  readonly splitEntries: readonly Readonly<CapturedJobSplitEntry>[];
  readonly defaultPreference: readonly Readonly<CapturedJobDefaultCandidate>[];
  readonly jobs: readonly Readonly<CapturedJobCatalogEntry>[];
}

export interface CapturedJobCatalogReaderDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => CapturedDemandSample;
  readonly readJobHistory?: () => Readonly<CapturedJobHistory> | undefined;
  readonly onSkipped?: (controlId: string, reason: string) => void;
}

/** Explicit application-owned history needed by the upstream food allocation rule. */
export interface CapturedJobHistory {
  readonly lastPopulationCount: number;
  readonly lastFarmerCount: number;
}

/** The cycle facts that are not owned by the ordinary-job catalog reader. */
export type CapturedJobsCycleOptions = Omit<
  JobsCycleInput,
  "available" | "jobs" | "splitEntries" | "defaultPreference"
> & {
  readonly authority: Readonly<JobsAuthorityInput>;
};

/**
 * Projects the validated ordinary catalog into the pure planner's per-job input shape.
 *
 * The planner's input is the managed priority list, exactly as `JobManager.managedPriorityList()`
 * built it: the jobs the player unlocked and left enabled, ordered by their configured priority.
 * The planner assigns from breakpoints alone and never re-checks `managed`, so a catalog handed
 * over whole would staff jobs the player has not unlocked and ignore the priority order. The
 * catalog itself stays complete — the ordinary-job completeness check reads it.
 *
 * Unknown controls remain visible in the read-only catalog, but they cannot be assigned safely
 * until a canonical planner token and command contract are characterized.
 */
export function toCapturedJobsJobInputs(
  catalog: Readonly<CapturedJobCatalog>,
): readonly Readonly<JobsJobInput>[] | undefined {
  // Nothing in this blob says what any job should be staffed to; see `readCatalog`.
  if (!catalog.jobSettingsConfigured) return undefined;
  // Absent `job_p_<id>` settings fall back to the catalog position, which is the order the
  // defaults assign priorities in, so a partially ported settings blob keeps upstream's order.
  const managed = catalog.jobs
    .map((job, position) => ({ job, position }))
    .filter(({ job }) => job.managed)
    .sort(
      (left, right) =>
        (left.job.configuredPriority ?? left.position) -
          (right.job.configuredPriority ?? right.position) ||
        left.position - right.position,
    )
    .map(({ job }) => job);
  // An unknown token names a job this adapter cannot command at all, so the projection still
  // refuses it. An uncharacterized smart rule is narrower than that: it is one job's cap, and it
  // degrades to that job's retained pool rather than disabling every job in the run.
  if (managed.some((job) => job.token === null)) return undefined;
  return Object.freeze(
    managed.map((job) =>
      Object.freeze({
        token: job.token!,
        id: job.id,
        kind: job.kind,
        workers: job.workers,
        servants: job.servants,
        count: job.count,
        maximum: job.maximum,
        managed: job.managed,
        unlocked: job.unlocked,
        smart: job.smart,
        crafting: false,
        serves: job.serves,
        split: job.split,
        isDefault: job.isDefault,
        // A job with no `job_b1..3_<id>` settings at all has no configured target, which is not
        // the same as a configured target of zero: the planner reads a zero breakpoint as "empty
        // this job" and would strip a partially ported settings blob down to the split jobs.
        // Retaining the current pool keeps an absent setting an absence.
        breakpoints: job.breakpoints ?? retainedBreakpoints(job.count),
        uncappedBreakpoints:
          job.uncappedBreakpoints ?? retainedBreakpoints(job.count),
        smartMaximum: job.smartMaximumKnown
          ? job.smartMaximum
          : retainedWorkerCap(job.count),
        farmerMinimum: job.farmerMinimum,
        storageBackedMinimum: job.storageBackedMinimum,
        demonicLumber: job.demonicLumber,
        warlordMiner: job.warlordMiner,
      }),
    ),
  );
}

/**
 * Joins the validated ordinary catalog with an explicitly captured cycle sample.
 *
 * The catalog owns job identity, split entries, and default candidates. Everything else stays an
 * option so authority, population, crafting, and the remaining race-specific inputs cannot be
 * smuggled in through defaults.
 */
export function toCapturedJobsCycleInput(
  catalog: Readonly<CapturedJobCatalog>,
  options: Readonly<CapturedJobsCycleOptions>,
): Readonly<JobsCycleInput> | undefined {
  const jobs = toCapturedJobsJobInputs(catalog);
  if (jobs === undefined) return undefined;
  return Object.freeze({
    ...options,
    available: true,
    jobs,
    splitEntries: catalog.splitEntries,
    defaultPreference: catalog.defaultPreference,
  });
}

function finiteMaximum(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= -1
    ? value
    : undefined;
}

function finiteSettingNumber(
  settings: Record<PropertyKey, unknown> | undefined,
  key: string,
): number | null {
  const value = readProperty(settings, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function settingNumber(
  settings: Record<PropertyKey, unknown> | undefined,
  key: string,
  fallback: number,
): number | undefined {
  const value = readProperty(settings, key);
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalFiniteNumber(
  record: Record<PropertyKey, unknown> | undefined,
  key: string,
): number | undefined {
  const value = readProperty(record, key);
  if (value === undefined) return 0;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function hasRaceFlag(race: unknown, key: string): boolean {
  return Boolean(readProperty(race, key));
}

function readEntertainerSmartMaximum(
  root: unknown,
  settings: Record<PropertyKey, unknown> | undefined,
  count: number,
): number | null | undefined {
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return undefined;
  const superstarValue = readProperty(tech, "superstar");
  const superstar =
    superstarValue === undefined ? 0 : finiteNonNegative(superstarValue);
  if (superstar === undefined) return undefined;
  // Superstar contributes a separate morale-cap term, so the legacy smart Entertainer rule does
  // not apply once that technology is active.
  if (superstar > 0) return null;
  // With no current pool, the per-worker game answer is undefined. Retaining zero is the safe
  // boundary: a smart setting cannot prove that the first worker is worthwhile from this sample.
  if (count === 0) return 0;
  const morale = readCapturedMorale(root);
  if (morale === undefined || morale.entertainment === undefined)
    return undefined;
  const entertainerWorkers = finiteNonNegative(
    readProperty(
      readProperty(readProperty(root, "civic"), "entertainer"),
      "workers",
    ),
  );
  if (entertainerWorkers === undefined) return undefined;
  // Servants contribute to the planner's effective count but not to the game's
  // `workerScale(civic.entertainer.workers, "entertainer")` total.
  if (entertainerWorkers === 0) return count;
  const entertainerMorale = finite(morale.entertainment / entertainerWorkers);
  if (entertainerMorale === undefined) return undefined;
  if (entertainerMorale <= 0) return count;

  const taxes = readProperty(readProperty(root, "civic"), "taxes");
  const taxRate = finiteNonNegative(readProperty(taxes, "tax_rate"));
  if (taxRate === undefined) return undefined;
  const taxTaskActive = readCapturedTaxTaskActive(root);
  if (taxTaskActive === undefined) return undefined;
  const [, taxCap] = readCapturedTaxLimits(root);
  const taxBuffer =
    (settings?.["autoTax"] === true || taxTaskActive) && taxRate < taxCap
      ? 1
      : 0;
  // This is the existing smart-cap policy, now fed by the game's captured morale answer rather
  // than its former Theatre/trait reconstruction. Keep the formula in this one owner because the
  // pure planner consumes the resulting cap, not the upstream game's ordinary job maximum.
  const maximum =
    count -
    Math.floor(
      (morale.potential - morale.maximum - taxBuffer) / entertainerMorale,
    );
  if (Number.isFinite(maximum)) return maximum;
  return maximum > 0 ? Number.MAX_SAFE_INTEGER : 0;
}

function readSmartMaximum(
  root: unknown,
  id: string,
  smart: boolean,
  settings: Record<PropertyKey, unknown> | undefined,
  count: number,
  readDemand?: () => CapturedDemandSample,
  readJobHistory?: () => Readonly<CapturedJobHistory> | undefined,
): number | null | undefined {
  if (!smart) return null;
  if (id === "space_miner") return readSpaceMinerSmartMaximum(root);
  if (id === "torturer") return readTorturerSmartMaximum(root);
  if (id === "hell_surveyor") return readHellSurveyorSmartMaximum(root);
  if (id === "scientist") return readScientistSmartMaximum(root, count);
  if (id === "professor") return readProfessorSmartMaximum(root);
  if (id === "banker") return readBankerSmartMaximum(root, readDemand);
  if (id === "entertainer") {
    return readEntertainerSmartMaximum(root, settings, count);
  }
  const history = readJobHistory?.();
  if (id === "farmer") {
    return readFarmerSmartMaximum(root, count, settings, history);
  }
  if (id === "hunter") {
    return readHunterSmartMaximum(root, count, readDemand, settings, history);
  }
  if (id === "lumberjack") {
    return readLumberjackSmartMaximum(root, count, readDemand);
  }
  if (id === "quarry_worker") {
    return readQuarryWorkerSmartMaximum(root, count, readDemand);
  }
  if (id === "crystal_miner") {
    return readCrystalMinerSmartMaximum(root, count, readDemand);
  }
  if (id === "miner") {
    return readMinerSmartMaximum(root, count, readDemand);
  }
  if (id === "coal_miner") {
    return readCoalMinerSmartMaximum(root, count, readDemand);
  }
  if (id === "cement_worker") {
    return readCementWorkerSmartMaximum(root, settings, count, readDemand);
  }
  if (id !== "teamster") return null;
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  if (!isRecord(race) || !isRecord(tech)) return undefined;
  // DeadSpace only applies the Teamster cap to Gravity Well races; for every other race the
  // upstream teamsterCap() leaves transport at zero and the job has no smart maximum.
  if (!hasRaceFlag(race, "gravity_well")) return null;
  const teamster = finiteNonNegative(readProperty(race, "teamster"));
  const transport = optionalFiniteNumber(tech, "transport");
  const railway = optionalFiniteNumber(tech, "railway");
  if (
    teamster === undefined ||
    transport === undefined ||
    railway === undefined
  ) {
    return undefined;
  }
  const maximum = Math.round((teamster / transport) * 1.5) - railway * 2;
  if (Number.isFinite(maximum)) return maximum;
  return maximum > 0 ? Number.MAX_SAFE_INTEGER : 0;
}

interface HighPopulationFactors {
  readonly breakpointScale: number;
  readonly workerEffect: number;
}

function readHighPopulationFactors(
  race: unknown,
): Readonly<HighPopulationFactors> | null | undefined {
  const rank = readProperty(race, "high_pop");
  if (rank === undefined || rank === false) return null;
  if (typeof rank !== "number" || !Number.isFinite(rank)) return undefined;
  switch (rank) {
    case 0.1:
    case 0.25:
      return { breakpointScale: 2, workerEffect: 0.5 };
    case 0.5:
      return { breakpointScale: 3, workerEffect: 0.34 };
    case 1:
      return { breakpointScale: 4, workerEffect: 0.26 };
    case 2:
      return { breakpointScale: 5, workerEffect: 0.212 };
    case 3:
      return { breakpointScale: 6, workerEffect: 0.18 };
    case 4:
      return { breakpointScale: 7, workerEffect: 0.158 };
    default:
      return undefined;
  }
}

function readHighPopulationWorkerEffect(root: unknown): number | undefined {
  const factors = readHighPopulationFactors(readProperty(root, "race"));
  return factors === undefined ? undefined : (factors?.workerEffect ?? 1);
}

export function readCapturedHighPopulationPercent(
  root: unknown,
): number | undefined {
  const factors = readHighPopulationFactors(readProperty(root, "race"));
  return factors === undefined ? undefined : (factors?.workerEffect ?? 1) * 100;
}

/**
 * DeadSpace stores population under the current race id (`resource[race.species]`), not under
 * the legacy compatibility name `resource.Population`. Fixtures without a race id retain the
 * older name so the adapter stays lenient for the pre-race initialization state.
 */
export function readCapturedPopulationResource(
  root: unknown,
): Record<PropertyKey, unknown> | undefined {
  const resources = readProperty(root, "resource");
  if (!isRecord(resources)) return undefined;
  const species = readProperty(readProperty(root, "race"), "species");
  const key =
    typeof species === "string" && species.length > 0 ? species : "Population";
  const population = readProperty(resources, key);
  return isRecord(population) ? population : undefined;
}

function readSpaceBuildingOn(root: unknown, id: string): number | undefined {
  const space = readProperty(root, "space");
  const building = readProperty(space, id);
  if (building === undefined) return 0;
  const on = finiteNonNegative(readProperty(building, "on"));
  return on;
}

function readSpaceMinerSmartMaximum(root: unknown): number | undefined {
  const elerium = readSpaceBuildingOn(root, "elerium_ship");
  const iridium = readSpaceBuildingOn(root, "iridium_ship");
  const iron = readSpaceBuildingOn(root, "iron_ship");
  const workerEffect = readHighPopulationWorkerEffect(root);
  if (
    elerium === undefined ||
    iridium === undefined ||
    iron === undefined ||
    workerEffect === undefined
  ) {
    return undefined;
  }
  return (elerium * 2 + iridium + iron) * workerEffect;
}

function readTorturerSmartMaximum(root: unknown): number | undefined {
  const city = readProperty(root, "city");
  const dwellers = readProperty(city, "surfaceDwellers");
  const housing = readProperty(city, "captive_housing");
  if (!Array.isArray(dwellers) || !isRecord(housing)) return undefined;
  let total = 0;
  for (let index = 0; index < dwellers.length; index++) {
    const race = finiteNonNegative(readProperty(housing, `race${index}`));
    const jailed = finiteNonNegative(readProperty(housing, `jailrace${index}`));
    if (race === undefined || jailed === undefined) return undefined;
    total += race + jailed;
  }
  const stats = readProperty(root, "stats");
  const achievements = readProperty(stats, "achieve");
  if (!isRecord(stats) || !isRecord(achievements)) return undefined;
  const achievement = readProperty(achievements, "nightmare");
  if (achievement === undefined) return Number.MAX_SAFE_INTEGER;
  if (!isRecord(achievement)) return undefined;
  const rankValue = readProperty(achievement, "mg");
  const rank = rankValue === undefined ? 0 : finiteNonNegative(rankValue);
  if (rank === undefined) return undefined;
  const maximum = Math.ceil(total / (rank / 2));
  if (Number.isFinite(maximum)) return maximum;
  return maximum > 0 ? Number.MAX_SAFE_INTEGER : 0;
}

function readHellSurveyorSmartMaximum(root: unknown): number | undefined {
  const fortress = readProperty(readProperty(root, "portal"), "fortress");
  const threat = readProperty(fortress, "threat");
  const population = readCapturedPopulationResource(root);
  const amount = readProperty(population, "amount");
  const maximum = readProperty(population, "max");
  if (
    typeof threat !== "number" ||
    !Number.isFinite(threat) ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    typeof maximum !== "number" ||
    !Number.isFinite(maximum)
  ) {
    return undefined;
  }
  const storageRatio = maximum > 0 ? amount / maximum : 0;
  return threat > 9000 && storageRatio < 1 ? 0 : Number.MAX_SAFE_INTEGER;
}

function readScientistSmartMaximum(
  root: unknown,
  count: number,
): number | undefined {
  const race = readProperty(root, "race");
  const universe = readProperty(race, "universe");
  const resources = readProperty(root, "resource");
  const knowledge = readProperty(resources, "Knowledge");
  const knowledgeMaximum = readProperty(knowledge, "max");
  if (
    !isRecord(race) ||
    typeof universe !== "string" ||
    !isRecord(knowledge) ||
    typeof knowledgeMaximum !== "number" ||
    !Number.isFinite(knowledgeMaximum)
  ) {
    return undefined;
  }
  let maximum = Number.MAX_SAFE_INTEGER;
  const tech = readProperty(root, "tech");
  const techRecord = isRecord(tech) ? tech : undefined;
  const science = optionalFiniteNumber(techRecord, "science");
  const genetics = optionalFiniteNumber(techRecord, "genetics");
  if (science === undefined || genetics === undefined) return undefined;
  if (
    universe !== "magic" &&
    knowledgeMaximum >= 0 &&
    !readProperty(race, "intelligent") &&
    science < 5 &&
    genetics < 5
  ) {
    maximum = 0;
  }
  if (!hasRaceFlag(race, "witch_hunter")) return maximum;
  const govern = readProperty(readProperty(root, "civic"), "govern");
  const governType = readProperty(govern, "type");
  const suspicion = readProperty(resources, "Sus");
  const suspicionAmount = readProperty(suspicion, "amount");
  if (
    typeof governType !== "string" ||
    typeof suspicionAmount !== "number" ||
    !Number.isFinite(suspicionAmount)
  ) {
    return undefined;
  }
  const suspicionPerWizard = governType === "magocracy" ? 0.5 : 1;
  maximum =
    (99 - suspicionAmount) / suspicionPerWizard + count * suspicionPerWizard;
  if (Number.isFinite(maximum)) return maximum;
  return maximum > 0 ? Number.MAX_SAFE_INTEGER : 0;
}

function readProfessorSmartMaximum(root: unknown): number | null | undefined {
  const race = readProperty(root, "race");
  const resources = readProperty(root, "resource");
  const knowledge = readProperty(resources, "Knowledge");
  const knowledgeMaximum = readProperty(knowledge, "max");
  if (
    !isRecord(race) ||
    !isRecord(knowledge) ||
    typeof knowledgeMaximum !== "number" ||
    !Number.isFinite(knowledgeMaximum)
  ) {
    return undefined;
  }
  const tech = readProperty(root, "tech");
  const techRecord = isRecord(tech) ? tech : undefined;
  const genetics = optionalFiniteNumber(techRecord, "genetics");
  const fanaticism = optionalFiniteNumber(techRecord, "fanaticism");
  if (genetics === undefined || fanaticism === undefined) return undefined;
  return !readProperty(race, "intelligent") &&
    knowledgeMaximum >= 0 &&
    genetics < 5 &&
    fanaticism < 2
    ? 0
    : null;
}

function readBankerSmartMaximum(
  root: unknown,
  readDemand?: () => CapturedDemandSample,
): number | null | undefined {
  const resources = readProperty(root, "resource");
  const money = readProperty(resources, "Money");
  const amount = finiteNonNegative(readProperty(money, "amount"));
  const maximum = finiteNonNegative(readProperty(money, "max"));
  const taxes = readProperty(readProperty(root, "civic"), "taxes");
  const taxRate = finiteNonNegative(readProperty(taxes, "tax_rate"));
  const tech = readProperty(root, "tech");
  const banking = optionalFiniteNumber(
    isRecord(tech) ? tech : undefined,
    "banking",
  );
  if (
    amount === undefined ||
    maximum === undefined ||
    taxRate === undefined ||
    banking === undefined
  ) {
    return undefined;
  }
  if (banking >= 7) return null;
  if (amount >= maximum || taxRate <= 0) return 0;
  if (readDemand === undefined) return null;
  return amount >= readDemand().storageRequired("Money") ? 0 : null;
}

function readFarmerSmartMaximum(
  root: unknown,
  count: number,
  settings: Record<PropertyKey, unknown> | undefined,
  history?: Readonly<CapturedJobHistory>,
  applyFarmCapacity = true,
): number | null | undefined {
  const race = readProperty(root, "race");
  // Existing early-game fixtures can omit the race bag before race initialization; preserve the
  // catalog's established conservative null cap for that lenient external state.
  if (!isRecord(race)) return null;
  if (hasRaceFlag(race, "unfathomable")) return Number.MAX_SAFE_INTEGER;
  if (hasRaceFlag(race, "artifical")) return 0;
  const food = readProperty(readProperty(root, "resource"), "Food");
  const amount = finiteNonNegative(readProperty(food, "amount"));
  const maximum = finiteNonNegative(readProperty(food, "max"));
  let rate = finite(readProperty(food, "diff"));
  if (amount === undefined || maximum === undefined || rate === undefined) {
    return undefined;
  }
  if (amount >= maximum) return 0;
  const population = finiteNonNegative(
    readProperty(readCapturedPopulationResource(root), "amount"),
  );
  let minimumFood = maximum * 0.2;
  let maximumFood = maximum * 0.6;
  const specialFoodRule =
    hasRaceFlag(race, "ravenous") || hasRaceFlag(race, "carnivore");
  if (hasRaceFlag(race, "ravenous")) {
    const rank = readProperty(race, "ravenous");
    const stockpileDivisor =
      typeof rank === "number"
        ? (
            {
              0.1: 2,
              0.25: 2,
              0.5: 2,
              1: 3,
              2: 4,
              3: 4,
              4: 4,
            } as Readonly<Record<number, number>>
          )[rank]
        : undefined;
    if (stockpileDivisor === undefined || population === undefined) {
      return undefined;
    }
    minimumFood = population * 1.5;
    maximumFood = population * 3;
    rate += Math.max(amount / stockpileDivisor, 0);
  } else if (hasRaceFlag(race, "carnivore")) {
    const rank = readProperty(race, "carnivore");
    const rotPercent =
      typeof rank === "number"
        ? (
            {
              0.1: 70,
              0.25: 65,
              0.5: 60,
              1: 50,
              2: 40,
              3: 35,
              4: 30,
            } as Readonly<Record<number, number>>
          )[rank]
        : undefined;
    const smokehouse = readProperty(readProperty(root, "city"), "smokehouse");
    const smokehouseCount =
      smokehouse === undefined
        ? 0
        : isRecord(smokehouse)
          ? finiteNonNegative(smokehouse["count"])
          : undefined;
    if (
      rotPercent === undefined ||
      population === undefined ||
      smokehouseCount === undefined
    ) {
      return undefined;
    }
    minimumFood = population;
    maximumFood = population * 2;
    if (amount > 10) {
      rate += (amount - 10) * (rotPercent / 100) * 0.9 ** smokehouseCount;
    }
  }
  // Food gained before the script next acts. The cycle's length in game periods is owned by
  // readScriptCyclesPerSecond, which is also the period gate's threshold, so this projection and
  // the cadence it projects over cannot disagree.
  const nextTickFood = amount + rate / readScriptCyclesPerSecond(settings);
  let foodMaximum: number | null = null;
  if (
    population !== undefined &&
    history !== undefined &&
    population > history.lastPopulationCount
  ) {
    const populationChange = population - history.lastPopulationCount;
    const farmerChange = count - history.lastFarmerCount;
    if (populationChange === farmerChange && rate > 0) {
      foodMaximum = Math.max(0, count - populationChange);
    }
  }
  if (foodMaximum === null) {
    if (count === 0 && amount < minimumFood && nextTickFood < minimumFood) {
      foodMaximum = 1;
    } else if (count > 0 && nextTickFood < minimumFood) {
      // The upstream fallback divides by each source's live production. The captured root has no
      // equivalent source breakdown, so preserve the currently allocated pool as a conservative
      // cap instead of making every ordinary job unavailable.
      foodMaximum = count;
    } else {
      foodMaximum = specialFoodRule
        ? amount > maximumFood && rate > 0
          ? Math.max(0, count - 1)
          : count
        : count === 0 && amount < maximum * 0.2 && rate <= 0
          ? 1
          : amount > maximum * 0.6 && rate > 0
            ? Math.max(0, count - 1)
            : null;
    }
  }
  if (!applyFarmCapacity) return foodMaximum;
  const farm = readProperty(readProperty(root, "city"), "farm");
  // Early-game roots can omit the lazily-created Farm record; retain the Food-only cap in that
  // state rather than making the whole smart-job catalog unavailable.
  if (farm === undefined) return foodMaximum;
  if (!isRecord(farm)) return undefined;
  const farmCount = finiteNonNegative(readProperty(farm, "count"));
  const highPopulation = readHighPopulationFactors(readProperty(root, "race"));
  if (farmCount === undefined || highPopulation === undefined) return undefined;
  const citizenCap = highPopulation?.breakpointScale ?? 1;
  const farmerCapacity =
    farmCount > 0 ? Math.ceil(farmCount * citizenCap) + 1 : 0;
  return Math.min(foodMaximum ?? Number.MAX_SAFE_INTEGER, farmerCapacity);
}

function readHunterSmartMaximum(
  root: unknown,
  count: number,
  readDemand?: () => CapturedDemandSample,
  settings?: Record<PropertyKey, unknown>,
  history?: Readonly<CapturedJobHistory>,
): number | null | undefined {
  const race = readProperty(root, "race");
  if (!isRecord(race)) return null;
  if (hasRaceFlag(race, "unfathomable")) return Number.MAX_SAFE_INTEGER;

  let uncertain = false;
  if (hasRaceFlag(race, "evil") || hasRaceFlag(race, "artifical")) {
    const fursUnlocked = readResourceUnlocked(root, "Furs");
    if (fursUnlocked === undefined) return undefined;
    if (fursUnlocked) {
      const useful = readResourceUseful(root, "Furs", readDemand);
      if (useful === true) return Number.MAX_SAFE_INTEGER;
      uncertain = true;
    }
  }

  const demonicLumber =
    hasRaceFlag(race, "soul_eater") &&
    hasRaceFlag(race, "evil") &&
    readProperty(race, "species") !== "wendigo" &&
    !hasRaceFlag(race, "kindling_kindred") &&
    !hasRaceFlag(race, "smoldering");
  if (demonicLumber) {
    const useful = readResourceUseful(root, "Lumber", readDemand);
    if (useful === true) return Number.MAX_SAFE_INTEGER;
    uncertain = true;
  }

  if (!hasRaceFlag(race, "ravenous") && !hasRaceFlag(race, "carnivore")) {
    const food = readFarmerSmartMaximum(root, count, settings, history, false);
    if (food === 0) return 0;
    if (food === undefined) return undefined;
    if (!uncertain && food !== null) return food;
  }

  // The ordinary Farmer/Hunter food formula still needs live consumption and history fields.
  return uncertain ? retainedWorkerCap(count) : null;
}

function readFarmerMinimum(root: unknown, id: string): number | null {
  if (id !== "farmer" && id !== "hunter") return null;
  const race = readProperty(root, "race");
  return isRecord(race) &&
    (hasRaceFlag(race, "artifical") || hasRaceFlag(race, "unfathomable"))
    ? 0
    : null;
}

function readCapturedFarmerMinimum(
  root: unknown,
  id: string,
  smart: boolean,
  count: number,
  smartMaximum: number | null,
  history?: Readonly<CapturedJobHistory>,
  settings?: Record<PropertyKey, unknown>,
): number | null {
  const explicit = readFarmerMinimum(root, id);
  if (explicit !== null || !smart) return explicit;
  if (id === "hunter") {
    const foodMaximum = readFarmerSmartMaximum(
      root,
      count,
      settings,
      history,
      false,
    );
    return foodMaximum === undefined ? null : (foodMaximum ?? count);
  }
  if (id !== "farmer") return explicit;
  // Upstream keeps the Farmer minimum at the current food/farm-derived allocation when the
  // smart maximum has no finite cap. An absent race bag remains the established lenient null.
  return isRecord(readProperty(root, "race")) ? (smartMaximum ?? count) : null;
}

function resourceStorageRatio(root: unknown, id: string): number | undefined {
  const resource = readProperty(readProperty(root, "resource"), id);
  const amount = finiteNonNegative(readProperty(resource, "amount"));
  const maximum = finite(readProperty(resource, "max"));
  if (amount === undefined || maximum === undefined) return undefined;
  return maximum > 0 ? amount / maximum : 1;
}

function resourceDiff(root: unknown, id: string): number | undefined {
  return finite(
    readProperty(readProperty(readProperty(root, "resource"), id), "diff"),
  );
}

function readResourceUseful(
  root: unknown,
  id: string,
  readDemand?: () => CapturedDemandSample,
): boolean | undefined {
  const ratio = resourceStorageRatio(root, id);
  if (ratio === undefined) return undefined;
  if (ratio < 0.99 || readDemand?.().isDemanded(id) === true) return true;
  const diff = resourceDiff(root, id);
  if (diff !== undefined && diff < 0) return true;
  // DeadSpace no longer exposes the legacy eject/supply/store-overflow flags or the
  // per-source production breakdown. A full, undemanded resource with no negative live rate is
  // therefore not provably useful or useless.
  return undefined;
}

/**
 * The smart cap for a job whose resources the capture cannot prove useless.
 *
 * Upstream answers this case with `getBusyWorkers`, which divides a resource's consumption by each
 * source's live production; DeadSpace captures no per-source breakdown, so that figure is out of
 * reach. Retaining the pool the player already has is the same conservative answer the Food path
 * takes: the job stops growing, and one unprovable resource never takes every ordinary job with it.
 */
function retainedWorkerCap(count: number): number {
  return count;
}

/** The same retained pool, as the breakpoint triple a job with no configured target reads as. */
function retainedBreakpoints(count: number): readonly [number, number, number] {
  return Object.freeze([count, count, count] as [number, number, number]);
}

function readLumberjackSmartMaximum(
  root: unknown,
  count: number,
  readDemand?: () => CapturedDemandSample,
): number | undefined {
  const race = readProperty(root, "race");
  if (
    hasRaceFlag(race, "evil") &&
    !hasRaceFlag(race, "soul_eater") &&
    readResourceUseful(root, "Furs", readDemand) === true
  ) {
    return Number.MAX_SAFE_INTEGER;
  }
  return readResourceUseful(root, "Lumber", readDemand) === true
    ? Number.MAX_SAFE_INTEGER
    : retainedWorkerCap(count);
}

function readResourceUnlocked(root: unknown, id: string): boolean | undefined {
  const resource = readProperty(readProperty(root, "resource"), id);
  if (resource === undefined) return false;
  const display = readProperty(resource, "display");
  return typeof display === "boolean" ? display : undefined;
}

function readAnyUsefulSmartMaximum(
  root: unknown,
  ids: readonly string[],
  count: number,
  readDemand?: () => CapturedDemandSample,
): number | undefined {
  let uncertain = false;
  for (const id of ids) {
    const useful = readResourceUseful(root, id, readDemand);
    if (useful === true) return Number.MAX_SAFE_INTEGER;
    uncertain = true;
  }
  return uncertain ? retainedWorkerCap(count) : 0;
}

function readQuarryWorkerSmartMaximum(
  root: unknown,
  count: number,
  readDemand?: () => CapturedDemandSample,
): number | undefined {
  const resources = ["Stone"];
  for (const id of ["Aluminium", "Chrysotile"] as const) {
    const unlocked = readResourceUnlocked(root, id);
    if (unlocked === undefined) return undefined;
    if (unlocked) resources.unshift(id);
  }
  return readAnyUsefulSmartMaximum(root, resources, count, readDemand);
}

function readCrystalMinerSmartMaximum(
  root: unknown,
  count: number,
  readDemand?: () => CapturedDemandSample,
): number | undefined {
  return readAnyUsefulSmartMaximum(root, ["Crystal"], count, readDemand);
}

function readUsefulUnlockedResources(
  root: unknown,
  ids: readonly string[],
): readonly string[] | undefined {
  const resources: string[] = [];
  for (const id of ids) {
    const unlocked = readResourceUnlocked(root, id);
    if (unlocked === undefined) return undefined;
    if (unlocked) resources.push(id);
  }
  return resources;
}

function readMinerSmartMaximum(
  root: unknown,
  count: number,
  readDemand?: () => CapturedDemandSample,
): number | null | undefined {
  // DeadSpace's jobs surface no longer applies the legacy Gateway Starbase/jobDisableMiners gate;
  // the captured adapter therefore follows the upstream useful-resource rule directly.
  const race = readProperty(root, "race");
  if (hasRaceFlag(race, "warlord")) return null;
  const tech = readProperty(root, "tech");
  const resources = ["Copper"];
  const sappyResources = hasRaceFlag(race, "sappy")
    ? readUsefulUnlockedResources(root, ["Aluminium", "Chrysotile"])
    : [];
  if (sappyResources === undefined) return undefined;
  resources.push(...sappyResources);
  if (
    (optionalFiniteNumber(isRecord(tech) ? tech : undefined, "titanium") ??
      0) >= 2
  ) {
    resources.push("Titanium");
  }
  const ironUnlocked = readResourceUnlocked(root, "Iron");
  if (ironUnlocked === undefined) return undefined;
  if (ironUnlocked) resources.push("Iron");
  return readAnyUsefulSmartMaximum(root, resources, count, readDemand);
}

function readCoalMinerSmartMaximum(
  root: unknown,
  count: number,
  readDemand?: () => CapturedDemandSample,
): number | undefined {
  const uraniumUnlocked = readResourceUnlocked(root, "Uranium");
  if (uraniumUnlocked === undefined) return undefined;
  const resources = uraniumUnlocked ? ["Uranium", "Coal"] : ["Coal"];
  return readAnyUsefulSmartMaximum(root, resources, count, readDemand);
}

function readCementWorkerSmartMaximum(
  root: unknown,
  settings: Record<PropertyKey, unknown> | undefined,
  count: number,
  readDemand?: () => CapturedDemandSample,
): number | undefined {
  const stoneRatio = resourceStorageRatio(root, "Stone");
  const stoneDiff = resourceDiff(root, "Stone");
  if (stoneRatio === undefined || stoneDiff === undefined) {
    return undefined;
  }
  const cementUseful = readResourceUseful(root, "Cement", readDemand) === true;
  // A full, non-demanded Cement store may still be useful because of an eject/supply modifier;
  // its fallback also needs per-source production, which the DeadSpace root does not capture.
  if (!cementUseful) return retainedWorkerCap(count);
  let maximum = Number.MAX_SAFE_INTEGER;
  if (stoneRatio < 0.1) {
    let stoneRate = stoneDiff + count * 3 - 5;
    if (
      hasRaceFlag(readProperty(root, "race"), "smoldering") &&
      readProperty(settings, "autoQuarry") === true
    ) {
      const chrysotileDiff = resourceDiff(root, "Chrysotile");
      if (chrysotileDiff === undefined) return undefined;
      stoneRate += chrysotileDiff;
    }
    maximum = Math.min(maximum, Math.floor(stoneRate / 3));
  }
  return maximum;
}

function readStorageBackedMinimum(
  root: unknown,
  id: string,
  workers: number,
  display: boolean,
): number | null | undefined {
  const rawTech = readProperty(root, "tech");
  const tech = isRecord(rawTech) ? rawTech : undefined;
  const banking = optionalFiniteNumber(tech, "banking");
  if (banking === undefined) return undefined;
  if (id === "banker" && banking >= 7) return workers;
  if (id !== "priest" || !display) return null;
  const rawGenes = readProperty(root, "genes");
  const genes = isRecord(rawGenes) ? rawGenes : undefined;
  const ancients = optionalFiniteNumber(genes, "ancients");
  if (ancients === undefined) return undefined;
  return ancients >= 2 ? workers : null;
}

function readServantState(
  root: unknown,
): Readonly<CapturedServantState> | null | undefined {
  const race = readProperty(root, "race");
  const servants = readProperty(race, "servants");
  // DeadSpace omits the servant state entirely for races without servants. That is a valid zero,
  // not an incomplete ordinary-job sample.
  if (servants === undefined || servants === false) return null;
  if (!isRecord(servants)) return undefined;
  const jobs = readProperty(servants, "jobs");
  if (!isRecord(jobs)) return undefined;
  const maximum = finiteNonNegative(readProperty(servants, "max"));
  const used = finiteNonNegative(readProperty(servants, "used"));
  const skilledMaximum = finiteNonNegative(readProperty(servants, "smax"));
  const skilledUsed = finiteNonNegative(readProperty(servants, "sused"));
  if (
    maximum === undefined ||
    used === undefined ||
    skilledMaximum === undefined ||
    skilledUsed === undefined
  ) {
    return undefined;
  }
  return Object.freeze({ maximum, used, skilledMaximum, skilledUsed });
}

function readServants(
  servantState: Readonly<CapturedServantState> | null,
  root: unknown,
  id: string,
): { readonly count: number; readonly serves: boolean } | undefined {
  if (servantState === null) return { count: 0, serves: false };
  const race = readProperty(root, "race");
  const servants = readProperty(race, "servants");
  if (!isRecord(servants)) return undefined;
  const jobs = readProperty(servants, "jobs");
  if (!isRecord(jobs)) return undefined;
  const serves = Object.prototype.hasOwnProperty.call(jobs, id);
  const value = readProperty(jobs, id);
  // A servant job is created lazily with the servant panel. An absent entry therefore means that
  // no servant is assigned yet; it must not make an ordinary worker sample unavailable.
  if (value === undefined) return { count: 0, serves };
  const count = finiteNonNegative(value);
  return count === undefined ? undefined : { count, serves };
}

// These are the canonical ordinary ids from DeadSpace's defineJobs list. The fallback keeps
// newly added or special jobs visible without assigning them a behavior the planner cannot prove.
const JOB_KINDS: Readonly<Record<string, JobKind>> = Object.freeze({
  farmer: "farmer",
  hunter: "hunter",
  lumberjack: "lumberjack",
  quarry_worker: "quarry-worker",
  crystal_miner: "crystal-miner",
  scavenger: "scavenger",
  forager: "forager",
  miner: "miner",
  space_miner: "space-miner",
  entertainer: "entertainer",
});

const SMART_MAXIMUM_IDS: ReadonlySet<string> = new Set([
  "space_miner",
  "torturer",
  "hell_surveyor",
  "scientist",
  "professor",
  "banker",
  "farmer",
  "hunter",
  "lumberjack",
  "quarry_worker",
  "crystal_miner",
  "miner",
  "coal_miner",
  "cement_worker",
  "teamster",
  "entertainer",
]);

const JOB_TOKENS: Readonly<Record<string, number>> = Object.freeze({
  unemployed: 0,
  hunter: 1,
  forager: 2,
  farmer: 3,
  lumberjack: 4,
  quarry_worker: 5,
  crystal_miner: 6,
  scavenger: 7,
  iceage_gardener: 8,
  teamster: 9,
  meditator: 10,
  torturer: 11,
  water_collector: 12,
  miner: 13,
  coal_miner: 14,
  core_miner: 15,
  craftsman: 16,
  cement_worker: 17,
  technician: 18,
  entertainer: 19,
  gardener: 20,
  priest: 21,
  professor: 22,
  scientist: 23,
  banker: 24,
  colonist: 25,
  titan_colonist: 26,
  crater_worker: 27,
  space_miner: 28,
  hell_surveyor: 29,
  archaeologist: 30,
  ghost_trapper: 31,
  elysium_miner: 32,
  pit_miner: 33,
  crew: 34,
});

const SPLIT_JOB_IDS: ReadonlySet<string> = new Set([
  "forager",
  "lumberjack",
  "quarry_worker",
  "crystal_miner",
  "scavenger",
]);

function jobKind(id: string): JobKind {
  return JOB_KINDS[id] ?? "other";
}

function isSplitJob(id: string): boolean {
  return SPLIT_JOB_IDS.has(id);
}

const SPLIT_SETTINGS: Readonly<
  Readonly<{ id: string; setting: string; fallback: number }>[]
> = Object.freeze([
  Object.freeze({
    id: "lumberjack",
    setting: "jobLumberWeighting",
    fallback: 50,
  }),
  Object.freeze({
    id: "quarry_worker",
    setting: "jobQuarryWeighting",
    fallback: 50,
  }),
  Object.freeze({
    id: "crystal_miner",
    setting: "jobCrystalWeighting",
    fallback: 50,
  }),
  Object.freeze({
    id: "scavenger",
    setting: "jobScavengerWeighting",
    fallback: 5,
  }),
  Object.freeze({
    id: "forager",
    setting: "jobForagerWeighting",
    fallback: 50,
  }),
]);

const DEFAULT_PREFERENCE: Readonly<
  Readonly<{
    id: string;
    requirement: "managed-with-workers" | "managed" | "unlocked";
  }>[]
> = Object.freeze([
  Object.freeze({ id: "quarry_worker", requirement: "managed-with-workers" }),
  Object.freeze({ id: "lumberjack", requirement: "managed-with-workers" }),
  Object.freeze({ id: "crystal_miner", requirement: "managed-with-workers" }),
  Object.freeze({ id: "scavenger", requirement: "managed-with-workers" }),
  Object.freeze({ id: "forager", requirement: "managed" }),
  Object.freeze({ id: "hunter", requirement: "managed" }),
  Object.freeze({ id: "farmer", requirement: "managed" }),
  Object.freeze({ id: "teamster", requirement: "managed" }),
  Object.freeze({ id: "scavenger", requirement: "unlocked" }),
  Object.freeze({ id: "crystal_miner", requirement: "unlocked" }),
  Object.freeze({ id: "quarry_worker", requirement: "unlocked" }),
  Object.freeze({ id: "lumberjack", requirement: "unlocked" }),
  Object.freeze({ id: "forager", requirement: "unlocked" }),
  Object.freeze({ id: "hunter", requirement: "managed" }),
  Object.freeze({ id: "unemployed", requirement: "unlocked" }),
]);

function readHunterActsAsUnemployed(root: unknown): boolean {
  const race = readProperty(root, "race");
  return (
    (hasRaceFlag(race, "carnivore") && !hasRaceFlag(race, "herbivore")) ||
    hasRaceFlag(race, "soul_eater") ||
    hasRaceFlag(race, "unfathomable")
  );
}

function readMinimumDefault(root: unknown): number | null | undefined {
  const civic = readProperty(root, "civic");
  const crew = readProperty(civic, "crew");
  if (crew === undefined) return null;
  if (!isRecord(crew)) return undefined;
  const maximum = finiteNonNegative(readProperty(crew, "max"));
  const workers = finiteNonNegative(readProperty(crew, "workers"));
  if (maximum === undefined || workers === undefined) return undefined;
  return maximum > workers ? maximum - workers + 1 : 0;
}

function readConfiguredBreakpoints(
  settings: Record<PropertyKey, unknown> | undefined,
  id: string,
): readonly [number, number, number] | null {
  const values = [1, 2, 3].map((number) =>
    readProperty(settings, `job_b${number}_${id}`),
  );
  if (
    values.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    return null;
  }
  const breakpoints: [number, number, number] = [
    values[0] as number,
    values[1] as number,
    values[2] as number,
  ];
  return Object.freeze(breakpoints);
}

function normalizeBreakpoints(
  configured: readonly [number, number, number] | null,
  maximum: number,
  id: string,
  settings: Record<PropertyKey, unknown> | undefined,
  root: unknown,
):
  | {
      readonly capped: readonly [number, number, number] | null;
      readonly uncapped: readonly [number, number, number] | null;
    }
  | undefined {
  if (configured === null) return { capped: null, uncapped: null };
  const highPopulationEnabled =
    readProperty(settings, "jobScalePop") === true && id !== "hell_surveyor";
  const highPopulation = highPopulationEnabled
    ? readHighPopulationFactors(readProperty(root, "race"))
    : null;
  if (highPopulation === undefined) return undefined;
  const scale = highPopulation?.breakpointScale ?? 1;
  const uncapped = configured.map((value) =>
    value === -1 ? Number.MAX_SAFE_INTEGER : value * scale,
  ) as [number, number, number];
  const cap = maximum === -1 ? Number.MAX_SAFE_INTEGER : maximum;
  const capped = uncapped.map((value) => Math.min(value, cap)) as [
    number,
    number,
    number,
  ];
  return {
    capped: Object.freeze(capped),
    uncapped: Object.freeze(uncapped),
  };
}

function readCatalog(
  root: unknown,
  controls: GameControlRegistry,
  settingsValue: unknown,
  readDemand: (() => CapturedDemandSample) | undefined,
  readJobHistory: (() => Readonly<CapturedJobHistory> | undefined) | undefined,
  onSkipped: (controlId: string, reason: string) => void,
): CapturedJobCatalog | undefined {
  const civic = readProperty(root, "civic");
  if (!isRecord(civic)) return undefined;
  const defaultJobId = readProperty(civic, "d_job");
  if (typeof defaultJobId !== "string" || defaultJobId.length === 0) {
    return undefined;
  }
  const settings = isRecord(settingsValue) ? settingsValue : undefined;
  const servantState = readServantState(root);
  if (servantState === undefined) {
    onSkipped("civics", "ordinary job servant state is incomplete");
    return undefined;
  }
  const minimumDefault = readMinimumDefault(root);
  if (minimumDefault === undefined) {
    onSkipped("civics", "ordinary job crew state is incomplete");
    return undefined;
  }
  const servantModifier = readHighPopulationWorkerEffect(root);
  if (servantModifier === undefined) {
    onSkipped("civics", "ordinary job servant modifier is unavailable");
    return undefined;
  }

  const jobs: CapturedJobCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const controlId of controls.capturedElementIds()) {
    if (!controlId.startsWith("civ-") || controlId.length <= "civ-".length)
      continue;
    const id = controlId.slice("civ-".length);
    if (seen.has(id)) continue;
    seen.add(id);
    const handle = controls.resolve(controlId);
    if (
      handle === undefined ||
      !handle.methods.includes("add") ||
      !handle.methods.includes("sub") ||
      !handle.methods.includes("setDefault")
    ) {
      onSkipped(controlId, "ordinary job control is incomplete");
      continue;
    }
    const job = readProperty(civic, id);
    if (!isRecord(job)) {
      onSkipped(controlId, "ordinary job state is unavailable");
      continue;
    }
    if (readProperty(job, "job") !== id) {
      onSkipped(controlId, "ordinary job identity does not match control");
      continue;
    }
    const assigned = finiteNonNegative(readProperty(job, "assigned"));
    if (assigned === undefined) {
      onSkipped(controlId, "ordinary job assigned count is not finite");
      continue;
    }
    const workers = finiteNonNegative(readProperty(job, "workers"));
    if (workers === undefined) {
      onSkipped(controlId, "ordinary job worker count is not finite");
      continue;
    }
    const maximum = finiteMaximum(readProperty(job, "max"));
    if (maximum === undefined) {
      onSkipped(controlId, "ordinary job maximum is not finite");
      continue;
    }
    const display = readProperty(job, "display");
    if (typeof display !== "boolean") {
      onSkipped(controlId, "ordinary job visibility is not boolean");
      continue;
    }
    const servantInput = readServants(servantState, root, id);
    if (servantInput === undefined) {
      onSkipped(controlId, "ordinary job servant count is not finite");
      return undefined;
    }
    // Locked DeadSpace jobs still expose civic records and controls, but their smart settings are
    // irrelevant until the job is displayed. Do not let an unavailable locked-job input disable
    // the whole ordinary-job catalog.
    const smart = display && readProperty(settings, `job_s_${id}`) === true;
    const smartMaximum = readSmartMaximum(
      root,
      id,
      smart,
      settings,
      workers + servantInput.count * servantModifier,
      readDemand,
      readJobHistory,
    );
    if (smartMaximum === undefined) {
      onSkipped(controlId, "ordinary job smart maximum is unavailable");
      return undefined;
    }
    const smartMaximumKnown = !smart || SMART_MAXIMUM_IDS.has(id);
    const storageBackedMinimum = readStorageBackedMinimum(
      root,
      id,
      workers,
      display,
    );
    if (storageBackedMinimum === undefined) {
      onSkipped(controlId, "ordinary job storage floor is unavailable");
      return undefined;
    }
    const kind = jobKind(id);
    const jobHistory = readJobHistory?.();
    const race = readProperty(root, "race");
    const demonicLumber =
      kind === "hunter" &&
      hasRaceFlag(race, "soul_eater") &&
      hasRaceFlag(race, "evil") &&
      readProperty(race, "species") !== "wendigo" &&
      !hasRaceFlag(race, "kindling_kindred") &&
      !hasRaceFlag(race, "smoldering");
    // DeadSpace's job surface defines unlocked from civic.display. Missing target settings use the
    // reset default only when autoJobs is enabled; an explicit false remains the opt-out.
    const unlocked = display;
    const setting = readProperty(settings, `job_${id}`);
    const managed =
      unlocked &&
      (setting === true ||
        (setting === undefined && readProperty(settings, "autoJobs") === true));
    const configuredBreakpoints = readConfiguredBreakpoints(settings, id);
    const normalized = normalizeBreakpoints(
      configuredBreakpoints,
      maximum,
      id,
      settings,
      root,
    );
    if (normalized === undefined) {
      onSkipped(controlId, "ordinary job high-population scale is unavailable");
      return undefined;
    }
    jobs.push(
      Object.freeze({
        id,
        controlId,
        token: JOB_TOKENS[id] ?? null,
        kind,
        smart,
        configuredPriority: finiteSettingNumber(settings, `job_p_${id}`),
        assigned,
        workers,
        servants: servantInput.count,
        count: workers + servantInput.count * servantModifier,
        serves: servantInput.serves,
        split: isSplitJob(id),
        smartMaximum,
        smartMaximumKnown,
        farmerMinimum: readCapturedFarmerMinimum(
          root,
          id,
          smart,
          workers + servantInput.count * servantModifier,
          smartMaximum,
          jobHistory,
          settings,
        ),
        storageBackedMinimum,
        warlordMiner: kind === "miner" && hasRaceFlag(race, "warlord"),
        demonicLumber,
        maximum,
        display,
        unlocked,
        managed,
        configuredBreakpoints,
        breakpoints: normalized.capped,
        uncappedBreakpoints: normalized.uncapped,
        isDefault: id === defaultJobId,
      }),
    );
  }

  if (!jobs.some((job) => job.id === defaultJobId)) return undefined;
  // `computeJobDefaults` writes `job_b1..3_<id>`, `job_p_<id>` and `job_s_<id>` for every job, and
  // it is still only reachable from the compatibility runtime. A blob that has never been through
  // a job settings reset carries none of them, and every one of those absences would otherwise be
  // read as a decision — a zero target, no priority, no smart rule. The catalog decides that here
  // and says so once; only the ordinary planner projection refuses to act on it, because the
  // foundry reader shares this catalog and crafting does not depend on job breakpoints.
  const jobSettingsConfigured = jobs.some(
    (job) => job.configuredBreakpoints !== null,
  );
  if (!jobSettingsConfigured) {
    onSkipped(
      "civ-jobs",
      "no job breakpoints are configured; reset the job settings to populate them",
    );
  }
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const splitEntries: CapturedJobSplitEntry[] = [];
  for (const split of SPLIT_SETTINGS) {
    const job = byId.get(split.id);
    if (job === undefined || job.token === null) continue;
    const weighting = settingNumber(settings, split.setting, split.fallback);
    if (weighting === undefined) {
      onSkipped(
        `civ-${split.id}`,
        "ordinary job split weighting is unavailable",
      );
      return undefined;
    }
    if (weighting <= 0) continue;
    const breakpoints = (
      job.configuredBreakpoints === null
        ? [0, 0, 0]
        : job.configuredBreakpoints.map((value, index) =>
            value > 0 ? (job.breakpoints?.[index] ?? 0) : 0,
          )
    ) as [number, number, number];
    splitEntries.push(
      Object.freeze({
        jobToken: job.token,
        weighting,
        breakpoints: Object.freeze(breakpoints),
      }),
    );
  }
  const defaultPreference: CapturedJobDefaultCandidate[] = [];
  for (const candidate of DEFAULT_PREFERENCE) {
    const job = byId.get(candidate.id);
    if (job === undefined || job.token === null) continue;
    defaultPreference.push(
      Object.freeze({
        jobToken: job.token,
        allocationToken: job.token,
        requirement: candidate.requirement,
        managed: job.managed,
        unlocked: job.unlocked,
      }),
    );
  }
  return Object.freeze({
    defaultJobId,
    jobSettingsConfigured,
    hunterActsAsUnemployed: readHunterActsAsUnemployed(root),
    minimumDefault,
    servantModifier,
    servantState,
    splitEntries: Object.freeze(splitEntries),
    defaultPreference: Object.freeze(defaultPreference),
    jobs: Object.freeze(jobs),
  });
}

export function createCapturedJobCatalogReader({
  rootState,
  controls,
  readSettings,
  readDemand,
  readJobHistory,
  onSkipped,
}: CapturedJobCatalogReaderDependencies): () => CapturedJobCatalog | undefined {
  const reportSkipped = onSkipped ?? (() => {});
  return () =>
    readCatalog(
      rootState.readRoot(),
      controls,
      readSettings(),
      readDemand,
      readJobHistory,
      reportSkipped,
    );
}
