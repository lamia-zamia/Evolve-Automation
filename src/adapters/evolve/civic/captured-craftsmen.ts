/**
 * Rebalances craftsmen already assigned to the upstream foundry.
 *
 * DeadSpace keeps recipe costs outside the captured root, but persists the effective total and
 * per-resource caps beside the foundry plus the current craftsman and default-job pools. The
 * adapter uses those validated values to allocate craftsmen-only work; full auto-jobs remain out
 * of scope.
 */

import {
  planJobs,
  type JobsCycleInput,
  type JobsDecision,
} from "../../../domain/civic/jobs.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type { JobsExecutor, JobsReader } from "../../../ports/jobs.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { isRecord, readProperty } from "../../validation.ts";
import type { CapturedCraftCosts } from "../economy/production/captured-craft-costs.ts";
import type { CapturedDemandSample } from "../economy/resources/captured-resource-demand.ts";
import {
  createCapturedJobCatalogReader,
  type CapturedJobCatalog,
} from "./captured-job-catalog.ts";
import { createCapturedJobControls } from "./captured-job-controls.ts";

const FOUNDRY_CONTROL = "foundry";
// Verified against DeadSpace's loadFoundry list. The root can retain stale or event-specific
// numeric keys (for example, `Bronze`) that the upstream foundry control does not accept.
const FOUNDRY_PRODUCTS = [
  "Plywood",
  "Brick",
  "Wrought_Iron",
  "Sheet_Metal",
  "Mythril",
  "Aerogel",
  "Nanoweave",
  "Aerographene",
  "Scarletite",
  "Quantium",
  "Super_Fuel",
  "Thermite",
] as const;

const DEFAULT_PRODUCT_SETTING = true;
const DEFAULT_WEIGHTING = 1;

export interface CapturedCraftsmenDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly costs: CapturedCraftCosts;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => CapturedDemandSample;
}

export interface CapturedCraftsmenAutomation {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
  /** Read-only ordinary-job state captured for the next full auto-jobs slice. */
  readonly readJobCatalog: () => CapturedJobCatalog | undefined;
}

interface CraftSample {
  readonly id: string;
  readonly workers: number;
  readonly buildingCapacity: number | null;
}

interface CraftsmanState {
  readonly maximum: number;
  readonly workers: number;
}

interface DefaultJobState {
  readonly id: string;
  readonly workers: number;
}

interface SkilledCraftSample {
  readonly id: string;
  readonly servants: number;
}

interface CraftsmenSession {
  readonly root: unknown;
  readonly input: JobsCycleInput;
  readonly samples: readonly CraftSample[];
  readonly workerPool: number;
  readonly defaultJob: DefaultJobState | undefined;
}

export interface CapturedCraftsmenCycleSample {
  readonly input: Readonly<JobsCycleInput>;
  readonly samples: readonly Readonly<CraftSample>[];
  readonly workerPool: number;
  readonly defaultJob: DefaultJobState | undefined;
  readonly skilledSamples: readonly Readonly<SkilledCraftSample>[];
  readonly skilledMaximum: number;
  readonly skilledUsed: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function settingBoolean(
  settings: Record<PropertyKey, unknown>,
  key: string,
): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : DEFAULT_PRODUCT_SETTING;
}

function productEnabled(
  settings: Record<PropertyKey, unknown>,
  id: string,
): boolean {
  return (
    settingBoolean(settings, `craft${id}`) &&
    settingBoolean(settings, `job_${id}`)
  );
}

function productWeighting(
  settings: Record<PropertyKey, unknown>,
  id: string,
): number {
  const value = settings[`foundry_w_${id}`];
  return finiteNumber(value, DEFAULT_WEIGHTING) > 0
    ? finiteNumber(value, DEFAULT_WEIGHTING)
    : DEFAULT_WEIGHTING;
}

function readFoundry(root: unknown): Record<PropertyKey, unknown> | undefined {
  const city = readProperty(root, "city");
  const foundry = readProperty(city, "foundry");
  return isRecord(foundry) ? foundry : undefined;
}

function readProductionCapacity(
  foundry: Record<PropertyKey, unknown>,
  id: string,
): number | null {
  const caps = readProperty(foundry, "rcap");
  const value = isRecord(caps) ? readProperty(caps, id) : undefined;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function readProducts(root: unknown): readonly CraftSample[] {
  const foundry = readFoundry(root);
  const resources = readProperty(root, "resource");
  if (foundry === undefined || !isRecord(resources)) return [];
  return FOUNDRY_PRODUCTS.flatMap((id) => {
    const resource = readProperty(resources, id);
    const workers = readProperty(foundry, id);
    return isRecord(resource) &&
      typeof workers === "number" &&
      Number.isFinite(workers) &&
      workers >= 0
      ? [{ id, workers, buildingCapacity: readProductionCapacity(foundry, id) }]
      : [];
  });
}

function readSkilledCraftsmen(root: unknown):
  | {
      readonly samples: readonly Readonly<SkilledCraftSample>[];
      readonly maximum: number;
      readonly used: number;
    }
  | undefined {
  const servants = readProperty(readProperty(root, "race"), "servants");
  if (servants === undefined || servants === false) {
    return Object.freeze({ samples: Object.freeze([]), maximum: 0, used: 0 });
  }
  if (!isRecord(servants)) return undefined;
  const jobs = readProperty(servants, "sjobs");
  const maximum = finiteNumber(readProperty(servants, "smax"), -1);
  const used = finiteNumber(readProperty(servants, "sused"), -1);
  if (!isRecord(jobs) || maximum < 0 || used < 0) return undefined;
  const samples = FOUNDRY_PRODUCTS.slice(0, 8).flatMap((id) => {
    const value = readProperty(jobs, id);
    if (value === undefined) return [];
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? [{ id, servants: value }]
      : [];
  });
  const assigned = samples.reduce((sum, sample) => sum + sample.servants, 0);
  return assigned === used
    ? Object.freeze({
        samples: Object.freeze(samples),
        maximum,
        used,
      })
    : undefined;
}

function readCraftsmanState(
  root: unknown,
  foundry: Record<PropertyKey, unknown>,
  assignedWorkers: number,
): CraftsmanState {
  const civic = readProperty(root, "civic");
  const craftsman = readProperty(civic, "craftsman");
  const maximumValue = readProperty(foundry, "cap");
  const fallbackMaximum = readProperty(craftsman, "max");
  const workersValue = readProperty(craftsman, "workers");
  const foundryWorkers = readProperty(foundry, "crafting");
  const maximum = finiteNumber(
    maximumValue,
    finiteNumber(fallbackMaximum, assignedWorkers),
  );
  const workers = finiteNumber(
    workersValue,
    finiteNumber(foundryWorkers, assignedWorkers),
  );
  return Object.freeze({
    maximum: maximum >= 0 ? maximum : assignedWorkers,
    workers: workers >= 0 ? workers : assignedWorkers,
  });
}

function readDefaultJobState(
  readJobCatalog: () => CapturedJobCatalog | undefined,
): DefaultJobState | undefined {
  const catalog = readJobCatalog();
  if (catalog === undefined) return undefined;
  const job = catalog.jobs.find(({ isDefault }) => isDefault);
  return job === undefined
    ? undefined
    : Object.freeze({ id: job.id, workers: job.workers });
}

function readAffordability(
  root: unknown,
  id: string,
  costs: CapturedCraftCosts,
): number {
  const recipe = costs.read(id);
  if (recipe === undefined) return Number.MAX_SAFE_INTEGER;
  const resources = readProperty(root, "resource");
  if (!isRecord(resources)) return 0;
  let affordability = Number.MAX_SAFE_INTEGER;
  for (const [resourceId, cost] of recipe) {
    const resource = readProperty(resources, resourceId);
    const amount = readProperty(resource, "amount");
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      return 0;
    }
    affordability = Math.min(affordability, amount / cost);
  }
  return affordability;
}

function readCycleInput(
  root: unknown,
  settingsValue: unknown,
  costs: CapturedCraftCosts,
  readJobCatalog: () => CapturedJobCatalog | undefined,
  readDemand: (() => CapturedDemandSample) | undefined,
):
  | {
      readonly input: JobsCycleInput;
      readonly samples: readonly CraftSample[];
      readonly workerPool: number;
      readonly defaultJob: DefaultJobState | undefined;
    }
  | undefined {
  const samples = readProducts(root);
  if (samples.length === 0) return undefined;
  const foundry = readFoundry(root);
  if (foundry === undefined) return undefined;
  const assignedWorkers = samples.reduce(
    (sum, sample) => sum + sample.workers,
    0,
  );
  const craftsmen = readCraftsmanState(root, foundry, assignedWorkers);
  const defaultJob = readDefaultJobState(readJobCatalog);
  // The game initializes this lazily, but a craftsmen command cannot safely acquire or release a
  // worker without the named default job. Keep the cycle unavailable until that state is present.
  if (defaultJob === undefined) return undefined;
  // Upstream updates the resource rows and civic.craftsman.workers in the same foundry control.
  // Do not acquire from the default pool while a reactive sample exposes only part of that update;
  // the planner cannot preserve an assignment that is missing from its captured rows.
  if (craftsmen.workers !== assignedWorkers) return undefined;
  const craftOnlyWorkerPool = Math.min(
    craftsmen.maximum,
    craftsmen.workers + defaultJob.workers,
  );
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const resources = readProperty(root, "resource");
  const demand = readDemand?.();
  const jobs = samples.map((sample, token) =>
    Object.freeze({
      token,
      id: sample.id,
      kind: "other" as const,
      workers: sample.workers,
      servants: 0,
      count: sample.workers,
      maximum: Number.MAX_SAFE_INTEGER,
      managed: true,
      unlocked: true,
      smart: false,
      crafting: true,
      serves: false,
      split: false,
      isDefault: false,
      breakpoints: [0, 0, 0] as const,
      uncappedBreakpoints: [0, 0, 0] as const,
      smartMaximum: null,
      farmerMinimum: null,
      storageBackedMinimum: null,
      demonicLumber: false,
      warlordMiner: false,
    }),
  );
  const crafting = samples.map((sample, jobToken) => {
    const resource = readProperty(resources, sample.id);
    return Object.freeze({
      jobToken,
      enabled: productEnabled(settings, sample.id),
      buildingCapacity: sample.buildingCapacity,
      affordability: readAffordability(root, sample.id, costs),
      demanded: demand?.isDemanded(sample.id) ?? false,
      useful:
        demand !== undefined &&
        finiteNumber(readProperty(resource, "amount"), 0) <
          demand.storageRequired(sample.id),
      currentQuantity: finiteNumber(readProperty(resource, "amount"), 0),
      weighting: productWeighting(settings, sample.id),
      driver: null,
      exclusion: null,
    });
  });
  const input: JobsCycleInput = Object.freeze({
    available: true,
    craftOnly: true,
    craftOnlyWorkerPool,
    hunterActsAsUnemployed: false,
    autoCraftsmen: true,
    autoCraftWithoutBuilding: true,
    craftsmenMode: "other",
    foundryWeighting: "other",
    manageServants: false,
    setDefault: false,
    servantModifier: 1,
    servantsMaximum: 0,
    skilledServantsMaximum: 0,
    craftsmenMaximum: craftsmen.maximum,
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
    jobs: Object.freeze(jobs),
    crafting: Object.freeze(crafting),
    splitEntries: Object.freeze([]),
    defaultPreference: Object.freeze([]),
  });
  return Object.freeze({
    input,
    samples: Object.freeze(samples),
    workerPool: craftsmen.workers,
    defaultJob,
  });
}

/** Reads the foundry half for a caller that will combine it with ordinary jobs. */
export function readCapturedCraftsmenCycle(
  root: unknown,
  settingsValue: unknown,
  costs: CapturedCraftCosts,
  readJobCatalog: () => CapturedJobCatalog | undefined,
  readDemand?: () => CapturedDemandSample,
): CapturedCraftsmenCycleSample | undefined {
  const sampled = readCycleInput(
    root,
    settingsValue,
    costs,
    readJobCatalog,
    readDemand,
  );
  const skilled = readSkilledCraftsmen(root);
  return sampled === undefined || skilled === undefined
    ? undefined
    : Object.freeze({
        ...sampled,
        skilledSamples: skilled.samples,
        skilledMaximum: skilled.maximum,
        skilledUsed: skilled.used,
      });
}

function decisionsMatch(
  left: Readonly<JobsDecision>,
  right: Readonly<JobsDecision>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function samplesMatch(root: unknown, samples: readonly CraftSample[]): boolean {
  const current = readProducts(root);
  return (
    current.length === samples.length &&
    current.every(
      (sample, index) =>
        sample.id === samples[index]!.id &&
        sample.workers === samples[index]!.workers &&
        sample.buildingCapacity === samples[index]!.buildingCapacity,
    )
  );
}

function createExecutor(
  dependencies: CapturedCraftsmenDependencies,
  sessionRef: { value: CraftsmenSession | undefined },
  readJobCatalog: () => CapturedJobCatalog | undefined,
): JobsExecutor {
  const controls = createCapturedJobControls({
    controls: dependencies.controls,
  });
  return Object.freeze({
    execute(decision: Readonly<JobsDecision>): CommandExecutionOutcome {
      const session = sessionRef.value;
      if (session === undefined)
        return stale(
          "craftsmen-session-missing",
          "craftsmen read session is missing",
        );
      if (dependencies.rootState.readRoot() !== session.root)
        return stale("craftsmen-root-changed", "captured game root changed");
      if (!samplesMatch(session.root, session.samples))
        return stale("craftsmen-state-changed", "foundry assignments changed");
      const foundry = readFoundry(session.root);
      if (foundry === undefined)
        return stale("craftsmen-state-changed", "foundry state disappeared");
      const currentWorkerPool = readCraftsmanState(
        session.root,
        foundry,
        session.samples.reduce((sum, sample) => sum + sample.workers, 0),
      ).workers;
      if (currentWorkerPool !== session.workerPool)
        return stale("craftsmen-pool-changed", "craftsman worker pool changed");
      const currentInput = readCycleInput(
        session.root,
        dependencies.readSettings(),
        dependencies.costs,
        readJobCatalog,
        dependencies.readDemand,
      )?.input;
      if (
        currentInput === undefined ||
        JSON.stringify(currentInput.crafting) !==
          JSON.stringify(session.input.crafting)
      )
        return stale(
          "crafting-input-changed",
          "crafting quantities or demand changed",
        );
      const currentDefaultJob = readDefaultJobState(readJobCatalog);
      if (
        currentDefaultJob?.id !== session.defaultJob?.id ||
        currentDefaultJob?.workers !== session.defaultJob?.workers
      )
        return stale(
          "default-job-pool-changed",
          "default job or its worker pool changed",
        );
      if (!decisionsMatch(planJobs(session.input)!, decision))
        return rejected(
          "invalid-craftsmen-decision",
          "craftsmen decision does not match the sampled plan",
        );
      if (dependencies.controls.resolve(FOUNDRY_CONTROL) === undefined)
        return rejected(
          "foundry-control-missing",
          "no captured control for foundry",
        );

      for (const assignment of decision.assignments) {
        const sample = session.samples[assignment.jobToken];
        if (sample === undefined) {
          return rejected(
            "unknown-craftsmen-token",
            "craftsmen decision contains an unknown token",
          );
        }
        const delta = assignment.workers - sample.workers;
        if (
          delta < 0 &&
          !controls.unassign({
            elementId: FOUNDRY_CONTROL,
            count: -delta,
            craftedResourceId: sample.id,
          })
        ) {
          return rejected(
            "foundry-control-failed",
            `could not unassign ${sample.id} craftsmen`,
          );
        }
      }
      for (const assignment of decision.assignments) {
        const sample = session.samples[assignment.jobToken]!;
        const delta = assignment.workers - sample.workers;
        if (
          delta > 0 &&
          !controls.assign({
            elementId: FOUNDRY_CONTROL,
            count: delta,
            craftedResourceId: sample.id,
          })
        ) {
          return rejected(
            "foundry-control-failed",
            `could not assign ${sample.id} craftsmen`,
          );
        }
      }
      sessionRef.value = undefined;
      return SUCCEEDED;
    },
  });
}

export function createCapturedCraftsmenAutomation(
  dependencies: CapturedCraftsmenDependencies,
): CapturedCraftsmenAutomation {
  const sessionRef: { value: CraftsmenSession | undefined } = {
    value: undefined,
  };
  const readJobCatalog = createCapturedJobCatalogReader({
    rootState: dependencies.rootState,
    controls: dependencies.controls,
    readSettings: dependencies.readSettings,
    ...(dependencies.readDemand === undefined
      ? {}
      : { readDemand: dependencies.readDemand }),
  });
  const executor = createExecutor(dependencies, sessionRef, readJobCatalog);
  const reader: JobsReader = Object.freeze({
    readCycle() {
      if (dependencies.controls.resolve(FOUNDRY_CONTROL) === undefined) {
        sessionRef.value = undefined;
        return Object.freeze({
          available: false,
          craftOnly: true,
          hunterActsAsUnemployed: false,
          autoCraftsmen: true,
          autoCraftWithoutBuilding: true,
          craftsmenMode: "other" as const,
          foundryWeighting: "other" as const,
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
      const root = dependencies.rootState.readRoot();
      const sampled = readCycleInput(
        root,
        dependencies.readSettings(),
        dependencies.costs,
        readJobCatalog,
        dependencies.readDemand,
      );
      if (sampled === undefined) {
        sessionRef.value = undefined;
        return Object.freeze({
          available: false,
          craftOnly: true,
          hunterActsAsUnemployed: false,
          autoCraftsmen: true,
          autoCraftWithoutBuilding: true,
          craftsmenMode: "other" as const,
          foundryWeighting: "other" as const,
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
      sessionRef.value = Object.freeze({
        root,
        input: sampled.input,
        samples: sampled.samples,
        workerPool: sampled.workerPool,
        defaultJob: sampled.defaultJob,
      });
      return sampled.input;
    },
  });
  return Object.freeze({ reader, executor, readJobCatalog });
}
