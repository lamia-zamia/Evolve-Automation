/**
 * Rebalances craftsmen already assigned to the upstream foundry.
 *
 * DeadSpace keeps recipe costs outside the captured root, but persists the effective total and
 * per-resource caps beside the foundry plus the current craftsman pool. The adapter uses those
 * validated values to redistribute existing assignments; it still does not acquire new craftsmen
 * from the default job pool.
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
}

export interface CapturedCraftsmenAutomation {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
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

interface CraftsmenSession {
  readonly root: unknown;
  readonly input: JobsCycleInput;
  readonly samples: readonly CraftSample[];
  readonly workerPool: number;
  readonly defaultJob: DefaultJobState | undefined;
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

function readDefaultJobState(root: unknown): DefaultJobState | undefined {
  const civic = readProperty(root, "civic");
  if (!isRecord(civic)) return undefined;
  // `civic.d_job` is filled during vars loading. A transient root can precede that initialization;
  // craft-only redistribution stays lenient, while future default-job acquisition must require a
  // complete state here before it can consume this pool.
  const id = readProperty(civic, "d_job");
  if (typeof id !== "string" || id.length === 0) return undefined;
  const job = readProperty(civic, id);
  const workers = readProperty(job, "workers");
  if (typeof workers !== "number" || !Number.isFinite(workers) || workers < 0)
    return undefined;
  return Object.freeze({ id, workers });
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
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const resources = readProperty(root, "resource");
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
      demanded: false,
      useful: false,
      currentQuantity: finiteNumber(readProperty(resource, "amount"), 0),
      weighting: productWeighting(settings, sample.id),
      driver: null,
      exclusion: null,
    });
  });
  const input: JobsCycleInput = Object.freeze({
    available: true,
    craftOnly: true,
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
    defaultJob: readDefaultJobState(root),
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
      const currentDefaultJob = readDefaultJobState(session.root);
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
  const executor = createExecutor(dependencies, sessionRef);
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
  return Object.freeze({ reader, executor });
}
