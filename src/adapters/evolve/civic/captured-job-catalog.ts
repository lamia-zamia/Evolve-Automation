/**
 * Reads the ordinary job catalog that DeadSpace exposes through the captured Civics controls.
 *
 * The catalog is deliberately smaller than the full job planner input. Workers, caps, visibility,
 * default-job identity, split preferences, and game-owned control methods are stable captured facts;
 * smart-job rules, storage floors, and special race behavior still need their own characterization.
 */

import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type { JobKind } from "../../../domain/civic/jobs.ts";
import { isRecord, readProperty } from "../../validation.ts";

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
  readonly onSkipped?: (controlId: string, reason: string) => void;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
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

function readSmartMaximum(
  root: unknown,
  id: string,
  smart: boolean,
): number | null | undefined {
  if (!smart) return null;
  if (id === "space_miner") return readSpaceMinerSmartMaximum(root);
  if (id !== "teamster") return null;
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  if (!isRecord(race) || !isRecord(tech)) return undefined;
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
    (readProperty(race, "carnivore") === true &&
      readProperty(race, "herbivore") !== true) ||
    readProperty(race, "soul_eater") === true ||
    readProperty(race, "unfathomable") === true
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
    const smart = readProperty(settings, `job_s_${id}`) === true;
    const smartMaximum = readSmartMaximum(root, id, smart);
    if (smartMaximum === undefined) {
      onSkipped(controlId, "ordinary job smart maximum is unavailable");
      return undefined;
    }
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
    const race = readProperty(root, "race");
    const demonicLumber =
      kind === "hunter" &&
      readProperty(race, "soul_eater") === true &&
      readProperty(race, "evil") === true &&
      readProperty(race, "species") !== "wendigo" &&
      readProperty(race, "kindling_kindred") !== true &&
      readProperty(race, "smoldering") !== true;
    // DeadSpace's job surface defines unlocked from civic.display and the script's managed
    // setting is only effective for an unlocked job. Missing or malformed settings remain false.
    const unlocked = display;
    const managed = unlocked && readProperty(settings, `job_${id}`) === true;
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
        storageBackedMinimum,
        warlordMiner:
          kind === "miner" && readProperty(race, "warlord") === true,
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
  onSkipped,
}: CapturedJobCatalogReaderDependencies): () => CapturedJobCatalog | undefined {
  const reportSkipped = onSkipped ?? (() => {});
  return () =>
    readCatalog(rootState.readRoot(), controls, readSettings(), reportSkipped);
}
