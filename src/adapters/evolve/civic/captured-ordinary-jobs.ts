/** Captured ordinary-job planning and commands, without foundry crafting. */

import {
  planJobs,
  type JobsCycleInput,
  type JobsDecision,
  type JobsJobInput,
} from "../../../domain/civic/jobs.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type { GameActionCostReader } from "../../../ports/game-action-costs.ts";
import type { GameBuildTarget } from "../../../ports/game-build-targets.ts";
import type { JobsExecutor, JobsReader } from "../../../ports/jobs.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  finite,
  finiteNonNegative,
  isRecord,
  readProperty,
} from "../../validation.ts";
import {
  createCapturedJobCatalogReader,
  readCapturedMinerReservation,
  readCapturedPopulationResource,
  toCapturedJobsCycleInput,
  type CapturedJobCatalog,
  type CapturedJobHistory,
  type CapturedJobsCycleOptions,
} from "./captured-job-catalog.ts";
import {
  createCapturedJobControls,
  executeCapturedJobDecision,
  type CapturedJobCommandState,
} from "./captured-job-controls.ts";
import {
  readCapturedCraftsmenCycle,
  type CapturedCraftsmenCycleSample,
} from "./captured-craftsmen.ts";
import type { CapturedCraftCosts } from "../economy/production/captured-craft-costs.ts";
import type { CapturedDemandSample } from "../economy/resources/captured-resource-demand.ts";
import { readCapturedMorale } from "./captured-morale.ts";
import {
  readCapturedTaxLimits,
  readCapturedTaxTaskActive,
} from "./captured-tax.ts";

export interface CapturedOrdinaryJobsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => CapturedDemandSample;
  readonly onSkipped?: (controlId: string, reason: string) => void;
}

/** Current effective counts from the same validated catalog used by ordinary Jobs. */
export interface CapturedJobCountSnapshot {
  readonly readCount: (jobId: string) => number | undefined;
}

export interface CapturedFullJobsDependencies extends CapturedOrdinaryJobsDependencies {
  readonly costs: CapturedCraftCosts;
  readonly readBuildTargets?: () => readonly Readonly<GameBuildTarget>[];
  readonly buildCosts?: GameActionCostReader;
}

interface OrdinaryJobsSession {
  readonly root: unknown;
  readonly catalog: Readonly<CapturedJobCatalog>;
  readonly input: Readonly<JobsCycleInput>;
  readonly commandState: Readonly<CapturedJobCommandState>;
}

function hasMethod(
  controls: GameControlRegistry,
  elementId: string,
  method: string,
): boolean {
  const handle = controls.resolve(elementId);
  return handle !== undefined && handle.methods.includes(method);
}

function preflightDecision(
  controls: GameControlRegistry,
  state: Readonly<CapturedJobCommandState>,
  decision: Readonly<JobsDecision>,
): boolean {
  const jobs = new Map(state.jobs.map((job) => [job.token, job]));
  for (const assignment of decision.assignments) {
    const job = jobs.get(assignment.jobToken);
    if (job === undefined) return false;
    if (assignment.workers !== job.workers) {
      const method = assignment.workers < job.workers ? "sub" : "add";
      if (!hasMethod(controls, `civ-${job.id}`, method)) return false;
    }
    if (state.manageServants && assignment.servants !== job.servants) {
      const method = assignment.servants < job.servants ? "sub" : "add";
      if (!hasMethod(controls, `servant-${job.id}`, method)) return false;
    }
  }
  if (decision.selectedDefaultToken !== null) {
    const job = jobs.get(decision.selectedDefaultToken);
    if (
      job === undefined ||
      !hasMethod(controls, `civ-${job.id}`, "setDefault")
    ) {
      return false;
    }
  }
  return true;
}

function unavailableInput(): Readonly<JobsCycleInput> {
  return Object.freeze({
    available: false,
    craftOnly: false,
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

function traitValue(
  race: Record<PropertyKey, unknown>,
  id: string,
  values: Readonly<Record<number, number>>,
  operation: "raw" | "factor" | "percent",
): number | undefined {
  const rank = readProperty(race, id);
  if (rank === undefined || rank === false) {
    return operation === "raw" ? 0 : 1;
  }
  if (typeof rank !== "number" || !Number.isFinite(rank)) return undefined;
  const value = values[rank];
  if (value === undefined) return undefined;
  if (operation === "factor") return 1 - value / 100;
  if (operation === "percent") return value / 100;
  return value;
}

const HIGH_POPULATION_MORALE: Readonly<Record<number, number>> = Object.freeze({
  0.1: 50,
  0.25: 50,
  0.5: 34,
  1: 26,
  2: 21.2,
  3: 18,
  4: 15.8,
});

function readAuthorityInput(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  previousCap: number | null,
): Readonly<JobsCycleInput["authority"]> | undefined {
  if (settings["authorityManage"] !== true) return unavailableInput().authority;
  const configuredTarget = finite(settings["generalMinimumAuthority"]);
  if (configuredTarget === undefined) return undefined;
  if (configuredTarget === 0) {
    return unavailableInput().authority;
  }
  const resources = readProperty(root, "resource");
  const authority = readProperty(resources, "Authority");
  // Authority is created lazily by DeadSpace. A fresh profile has no such resource yet; that is
  // the same unavailable authority input as a hidden resource, not an incomplete job catalog.
  if (!isRecord(authority)) return unavailableInput().authority;
  // The legacy input gated the whole authority block on `Authority.isUnlocked()`, which is this
  // flag. Reading it first keeps a run that never unlocks Authority from needing the rest.
  const display = readProperty(authority, "display");
  if (display !== undefined && typeof display !== "boolean") return undefined;
  if (display === false) return unavailableInput().authority;
  // A 1.4.x save migrated into 1.5.0 can carry `city.morale.current` and `.potential` as NaN, so
  // morale is validated rather than used as a number. Authority is the only part of the cycle that
  // needs morale, so an unreadable figure stands that part down rather than taking every job with
  // it — the same answer a locked Authority resource gets above.
  const morale = readCapturedMorale(root);
  if (morale === undefined) return unavailableInput().authority;
  const current = finiteNonNegative(readProperty(authority, "amount"));
  const maximum = finiteNonNegative(readProperty(authority, "max"));
  if (current === undefined || maximum === undefined) return undefined;
  const moraleCurrent = morale.current;
  const moralePotential = morale.potential;
  const moraleMaximum = morale.maximum;

  const target = Math.max(
    100,
    configuredTarget < 0 ? maximum : configuredTarget,
  );
  const taxes = readProperty(readProperty(root, "civic"), "taxes");
  const taxDisplay = readProperty(taxes, "display");
  const taxRate = finiteNonNegative(readProperty(taxes, "tax_rate"));
  if (
    taxRate === undefined ||
    (taxDisplay !== undefined && typeof taxDisplay !== "boolean")
  ) {
    return undefined;
  }
  const government = readProperty(readProperty(root, "civic"), "govern");
  const governmentType = readProperty(government, "type");
  if (governmentType !== undefined && typeof governmentType !== "string") {
    return undefined;
  }
  const currency = readProperty(readProperty(root, "tech"), "currency");
  if (
    currency !== undefined &&
    (typeof currency !== "number" || !Number.isFinite(currency))
  ) {
    return undefined;
  }
  const [minimumTax, taxCap] = readCapturedTaxLimits(root);
  let authorityTaxLimit = taxCap;
  const autoTax = settings["autoTax"] === true;
  let taxTaskActive = false;
  if (autoTax) {
    const requested = readProperty(settings, "generalRequestedTaxRate");
    if (requested !== undefined) {
      const requestedRate = finite(requested);
      if (requestedRate === undefined || requestedRate < 0) {
        if (requestedRate === undefined) return undefined;
      } else {
        authorityTaxLimit = Math.min(
          Math.max(requestedRate, minimumTax),
          taxCap,
        );
      }
    }
  }
  if (!autoTax && current < target && taxRate < taxCap) {
    const capturedTaxTask = readCapturedTaxTaskActive(root);
    if (capturedTaxTask === undefined) return undefined;
    taxTaskActive = capturedTaxTask;
  }
  const canTax =
    current < target &&
    taxDisplay !== false &&
    (autoTax || taxTaskActive) &&
    taxRate < authorityTaxLimit;
  if (current < target && !autoTax && taxRate < taxCap && !taxTaskActive) {
    return undefined;
  }

  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  if (!isRecord(race) || !isRecord(tech)) return undefined;
  const entertainer = readProperty(readProperty(root, "civic"), "entertainer");
  const entertainerWorkers = finiteNonNegative(
    readProperty(entertainer, "workers"),
  );
  const highPopulation = traitValue(
    race,
    "high_pop",
    HIGH_POPULATION_MORALE,
    "percent",
  );
  if (entertainerWorkers === undefined || highPopulation === undefined)
    return undefined;
  // DeadSpace writes a total to `city.morale.entertain`. `workerScale` is a multiplicative
  // worker-count adjustment, so dividing by the captured pool recovers the current per-worker
  // value without restating Theatre, traits, astronomy, or government effects. At zero workers
  // that ratio has no answer; zero keeps authority conservative and prevents growth on an
  // unproven contribution.
  const entertainerMorale =
    entertainerWorkers === 0
      ? 0
      : morale.entertainment === undefined
        ? undefined
        : finite(morale.entertainment / entertainerWorkers);
  if (entertainerMorale === undefined) return undefined;
  const superstarValue = readProperty(tech, "superstar");
  const superstar =
    superstarValue === undefined ? 0 : finiteNonNegative(superstarValue);
  if (superstar === undefined) return undefined;
  const superstarMorale = superstar > 0 ? highPopulation : 0;
  let moraleCeiling: number | null = null;
  if (!canTax) {
    const factor = governmentType === "democracy" ? 0.9 : 1;
    const authorityAtHundred =
      current + Math.max(0, moraleCurrent - 100) * factor;
    moraleCeiling = 100 + Math.max(0, authorityAtHundred - 100) / factor;
  }
  return Object.freeze({
    enabled: true,
    current,
    morale: moraleCurrent,
    moralePotential,
    moraleMaximum,
    moraleCeiling,
    entertainerMorale,
    superstarMorale,
    previousCap,
    debug: false,
  });
}

function tokenFor(
  catalog: Readonly<CapturedJobCatalog>,
  id: string,
): number | null {
  return catalog.jobs.find((job) => job.id === id)?.token ?? null;
}

// DeadSpace defines Craftsman in the ordinary job list but exposes no civ-craftsman Vue control;
// its worker pool is owned by the shared #foundry control instead.
const JOBS_WITHOUT_ORDINARY_CONTROL = new Set(["craftsman"]);

function hasCompleteJobCatalog(
  root: unknown,
  catalog: Readonly<CapturedJobCatalog>,
): boolean {
  const civic = readProperty(root, "civic");
  if (!isRecord(civic)) return false;
  const capturedIds = new Set(catalog.jobs.map((job) => job.id));
  for (const [id, value] of Object.entries(civic)) {
    if (isRecord(value) && typeof readProperty(value, "job") === "string") {
      if (JOBS_WITHOUT_ORDINARY_CONTROL.has(id)) continue;
      if (!capturedIds.has(id)) return false;
    }
  }
  return true;
}

function readCycle(
  root: unknown,
  settingsValue: unknown,
  catalogReader: () => CapturedJobCatalog | undefined,
  readDemand: (() => CapturedDemandSample) | undefined,
  previousAuthorityCap: number | null,
):
  | {
      readonly catalog: Readonly<CapturedJobCatalog>;
      readonly input: Readonly<JobsCycleInput>;
      readonly commandState: Readonly<CapturedJobCommandState>;
    }
  | undefined {
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const authority = readAuthorityInput(root, settings, previousAuthorityCap);
  if (authority === undefined) return undefined;
  const population = finiteNonNegative(
    readProperty(readCapturedPopulationResource(root), "amount"),
  );
  if (population === undefined) return undefined;
  const catalog = catalogReader();
  if (catalog === undefined) return undefined;
  if (!hasCompleteJobCatalog(root, catalog)) return undefined;
  const servantState = catalog.servantState;
  // A race without servants reports a null servant state, which the catalog documents as a valid
  // zero. The legacy input kept `manageServants` as the player's setting and let the servant
  // maximum be zero, so the planner allocates none; it is not an incomplete sample.
  const manageServants = settings["jobManageServants"] === true;
  const reserveMiner = readCapturedMinerReservation(
    root,
    settingsValue,
    readDemand,
  );
  if (reserveMiner === undefined) return undefined;
  const defaultJobToken = catalog.jobs.find((job) => job.isDefault)?.token;
  if (defaultJobToken === undefined || defaultJobToken === null)
    return undefined;
  const artificial = Boolean(
    readProperty(readProperty(root, "race"), "artifical"),
  );
  const farmerToken = artificial
    ? null
    : catalog.hunterActsAsUnemployed
      ? tokenFor(catalog, "hunter")
      : Math.max(
          tokenFor(catalog, "hunter") ?? -1,
          tokenFor(catalog, "farmer") ?? -1,
        );
  const normalizedFarmerToken =
    farmerToken === null || farmerToken < 0 ? null : farmerToken;
  const demonicLumber = catalog.jobs.some((job) => job.demonicLumber);
  const options: CapturedJobsCycleOptions = {
    craftOnly: false,
    hunterActsAsUnemployed: catalog.hunterActsAsUnemployed,
    autoCraftsmen: false,
    autoCraftWithoutBuilding: false,
    craftsmenMode: "other",
    foundryWeighting: "other",
    manageServants,
    setDefault: settings["jobSetDefault"] === true,
    servantModifier: catalog.servantModifier,
    servantsMaximum: manageServants ? (servantState?.maximum ?? 0) : 0,
    skilledServantsMaximum: manageServants
      ? (servantState?.skilledMaximum ?? 0)
      : 0,
    craftsmenMaximum: 0,
    minimumDefault: catalog.minimumDefault ?? 0,
    reserveMiner,
    defaultJobToken,
    hunterToken: tokenFor(catalog, "hunter"),
    farmerToken: normalizedFarmerToken,
    lumberjackToken: demonicLumber
      ? normalizedFarmerToken
      : tokenFor(catalog, "lumberjack"),
    quarryToken: tokenFor(catalog, "quarry_worker"),
    crystalMinerToken: tokenFor(catalog, "crystal_miner"),
    scavengerToken: tokenFor(catalog, "scavenger"),
    foragerToken: tokenFor(catalog, "forager"),
    entertainerToken: tokenFor(catalog, "entertainer"),
    minerToken: tokenFor(catalog, "miner"),
    population,
    craftDebug: false,
    lastCraftWinner: null,
    authority,
    crafting: Object.freeze([]),
  };
  const input = toCapturedJobsCycleInput(catalog, options);
  if (input === undefined) return undefined;
  return Object.freeze({
    catalog,
    input,
    // The command state mirrors the planner input job for job. A decision only ever names jobs
    // the planner was given, and the full-jobs executor locates the first crafting job by this
    // list's length, so the two must stay one list in two shapes.
    commandState: Object.freeze({
      manageServants,
      jobs: Object.freeze(
        input.jobs.map((job) =>
          Object.freeze({
            token: job.token,
            id: job.id,
            workers: job.workers,
            servants: job.servants,
            serves: job.serves,
          }),
        ),
      ),
    }),
  });
}

interface FullJobsSession {
  readonly root: unknown;
  readonly catalog: Readonly<CapturedJobCatalog>;
  readonly foundry: Readonly<CapturedCraftsmenCycleSample>;
  readonly input: Readonly<JobsCycleInput>;
  readonly ordinaryJobs: readonly Readonly<
    CapturedJobCommandState["jobs"][number]
  >[];
}

function craftJob(
  job: Readonly<JobsJobInput>,
  token: number,
  servants: number,
): Readonly<JobsJobInput> {
  // Foundry workers are a separate pool. Keeping them out of the planner's ordinary worker sum
  // prevents the same worker from being counted once as a craftsman and again as a civic worker;
  // the command session retains the live foundry count for its delta.
  return Object.freeze({
    ...job,
    token,
    workers: 0,
    count: 0,
    servants,
    crafting: true,
    serves: true,
  });
}

function readFullCycle(
  root: unknown,
  settingsValue: unknown,
  catalogReader: () => CapturedJobCatalog | undefined,
  costs: CapturedCraftCosts,
  readDemand: (() => CapturedDemandSample) | undefined,
  readBuildTargets: (() => readonly Readonly<GameBuildTarget>[]) | undefined,
  buildCosts: GameActionCostReader | undefined,
  previousAuthorityCap: number | null,
):
  | {
      readonly catalog: Readonly<CapturedJobCatalog>;
      readonly foundry: Readonly<CapturedCraftsmenCycleSample>;
      readonly input: Readonly<JobsCycleInput>;
      readonly ordinaryJobs: readonly Readonly<
        FullJobsSession["ordinaryJobs"][number]
      >[];
    }
  | undefined {
  const ordinary = readCycle(
    root,
    settingsValue,
    catalogReader,
    readDemand,
    previousAuthorityCap,
  );
  if (ordinary === undefined) return undefined;
  const foundry = readCapturedCraftsmenCycle(
    root,
    settingsValue,
    costs,
    catalogReader,
    readDemand,
    readBuildTargets,
    buildCosts,
  );
  if (
    foundry === undefined ||
    foundry.input.jobs.length !== foundry.input.crafting.length ||
    foundry.skilledSamples.some(
      (sample) => !foundry.input.jobs.some((job) => job.id === sample.id),
    )
  ) {
    return undefined;
  }
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const modeValue = settings["productionCraftsmen"];
  const craftsmenMode =
    modeValue === "always" ||
    modeValue === "nocraft" ||
    modeValue === "servants"
      ? modeValue
      : ("other" as const);
  const weightingValue = settings["productionFoundryWeighting"];
  const foundryWeighting =
    weightingValue === "buildings" || weightingValue === "demanded"
      ? weightingValue
      : ("other" as const);
  const noCraft = Boolean(readProperty(readProperty(root, "race"), "no_craft"));
  // Crafting tokens continue past every ordinary token the catalog knows, not just the ones the
  // planner was given: a job the player switched off keeps its canonical token, and a crafting job
  // reusing it would address that job's control instead of the foundry.
  const baseToken =
    Math.max(
      -1,
      ...ordinary.catalog.jobs.map((job) => job.token ?? -1),
      ...ordinary.input.jobs.map((job) => job.token),
    ) + 1;
  const skilledById = new Map(
    foundry.skilledSamples.map((sample) => [sample.id, sample.servants]),
  );
  const craftJobs = foundry.input.jobs.map((job, index) =>
    craftJob(job, baseToken + index, skilledById.get(job.id) ?? 0),
  );
  const crafting = foundry.input.crafting.map((craft, index) =>
    Object.freeze({ ...craft, jobToken: baseToken + index }),
  );
  const input = Object.freeze({
    ...ordinary.input,
    autoCraftsmen: true,
    autoCraftWithoutBuilding:
      craftsmenMode === "always" || (craftsmenMode === "nocraft" && noCraft),
    craftsmenMode,
    foundryWeighting,
    craftsmenMaximum: foundry.input.craftsmenMaximum,
    skilledServantsMaximum: ordinary.input.manageServants
      ? foundry.skilledMaximum
      : 0,
    jobs: Object.freeze([...ordinary.input.jobs, ...craftJobs]),
    crafting: Object.freeze(crafting),
  });
  return Object.freeze({
    catalog: ordinary.catalog,
    foundry,
    input,
    ordinaryJobs: ordinary.commandState.jobs,
  });
}

function executeFullDecision(
  controls: GameControlRegistry,
  session: Readonly<FullJobsSession>,
  decision: Readonly<JobsDecision>,
): CommandExecutionOutcome {
  const ordinary = new Map(session.ordinaryJobs.map((job) => [job.token, job]));
  const foundry = new Map(
    session.foundry.input.jobs.map((job, index) => [
      session.input.jobs[session.ordinaryJobs.length + index]!.token,
      {
        id: job.id,
        workers: session.foundry.samples[index]?.workers ?? job.workers,
        servants:
          session.foundry.skilledSamples.find((sample) => sample.id === job.id)
            ?.servants ?? 0,
      },
    ]),
  );
  const workerRemovals: Array<
    readonly ["ordinary" | "foundry", string, number]
  > = [];
  const workerAdditions: Array<
    readonly ["ordinary" | "foundry", string, number]
  > = [];
  const servantRemovals: Array<
    readonly ["ordinary" | "foundry", string, number]
  > = [];
  const servantAdditions: Array<
    readonly ["ordinary" | "foundry", string, number]
  > = [];
  const foundryWorkerDelta = decision.assignments.reduce(
    (total, assignment) => {
      if (!foundry.has(assignment.jobToken)) return total;
      return (
        total + assignment.workers - foundry.get(assignment.jobToken)!.workers
      );
    },
    0,
  );
  for (const assignment of decision.assignments) {
    const ordinaryJob = ordinary.get(assignment.jobToken);
    const foundryJob = foundry.get(assignment.jobToken);
    if (ordinaryJob === undefined && foundryJob === undefined) {
      return rejected(
        "unknown-full-job-token",
        "full jobs decision contains an unknown token",
      );
    }
    const current = ordinaryJob?.workers ?? foundryJob!.workers;
    const kind = ordinaryJob === undefined ? "foundry" : "ordinary";
    const id = ordinaryJob?.id ?? foundryJob!.id;
    // #foundry transfers a worker through the current default-job pool itself. Account for that
    // transfer before issuing the default job's own delta, or a combined pass double-removes (or
    // double-adds) those workers.
    const effectiveCurrent =
      ordinaryJob?.id === session.catalog.defaultJobId
        ? ordinaryJob.workers - foundryWorkerDelta
        : current;
    const delta = assignment.workers - effectiveCurrent;
    if (delta < 0) workerRemovals.push([kind, id, -delta]);
    if (delta > 0) workerAdditions.push([kind, id, delta]);
    if (session.input.manageServants) {
      const servantDelta =
        assignment.servants -
        (ordinaryJob?.servants ?? foundryJob?.servants ?? 0);
      if (servantDelta < 0) servantRemovals.push([kind, id, -servantDelta]);
      if (servantDelta > 0) servantAdditions.push([kind, id, servantDelta]);
    }
  }
  const selectedDefault =
    decision.selectedDefaultToken === null
      ? undefined
      : ordinary.get(decision.selectedDefaultToken);
  if (decision.selectedDefaultToken !== null && selectedDefault === undefined) {
    return rejected(
      "unknown-full-default-job",
      "full jobs selects an unknown default job",
    );
  }
  const requiredMethods = new Map<string, Set<string>>();
  const requireMethod = (elementId: string, method: string) => {
    const methods = requiredMethods.get(elementId) ?? new Set<string>();
    methods.add(method);
    requiredMethods.set(elementId, methods);
  };
  for (const [kind, id] of workerRemovals) {
    requireMethod(kind === "ordinary" ? `civ-${id}` : "foundry", "sub");
  }
  for (const [kind, id] of workerAdditions) {
    requireMethod(kind === "ordinary" ? `civ-${id}` : "foundry", "add");
  }
  for (const [kind, id] of servantRemovals) {
    requireMethod(
      kind === "ordinary" ? `servant-${id}` : "skilledServants",
      "sub",
    );
  }
  for (const [kind, id] of servantAdditions) {
    requireMethod(
      kind === "ordinary" ? `servant-${id}` : "skilledServants",
      "add",
    );
  }
  if (selectedDefault !== undefined) {
    requireMethod(`civ-${selectedDefault.id}`, "setDefault");
  }
  const handles = new Map<string, GameControlHandle>();
  for (const [elementId, methods] of requiredMethods) {
    const handle = controls.resolve(elementId);
    if (
      handle === undefined ||
      handle.elementId !== elementId ||
      [...methods].some((method) => !handle.methods.includes(method))
    ) {
      return rejected(
        "full-jobs-controls-incomplete",
        `missing required method on ${elementId}`,
      );
    }
    handles.set(elementId, handle);
  }
  const invoke = (
    elementId: string,
    method: "add" | "sub" | "setDefault",
    count: number,
    args?: readonly unknown[],
  ): boolean => {
    const handle = handles.get(elementId);
    if (handle === undefined || !Number.isFinite(count)) return false;
    for (let index = 0; index < Math.ceil(Math.max(count, 0)); index++) {
      if (!controls.invoke(handle, method, args).ok) return false;
    }
    return true;
  };
  for (const [kind, id, count] of workerRemovals) {
    if (
      !invoke(
        kind === "ordinary" ? `civ-${id}` : "foundry",
        "sub",
        count,
        kind === "foundry" ? [id] : undefined,
      )
    )
      return rejected("full-job-control-failed", `could not unassign ${id}`);
  }
  for (const [kind, id, count] of workerAdditions) {
    if (
      !invoke(
        kind === "ordinary" ? `civ-${id}` : "foundry",
        "add",
        count,
        kind === "foundry" ? [id] : undefined,
      )
    )
      return rejected("full-job-control-failed", `could not assign ${id}`);
  }
  for (const [kind, id, count] of servantRemovals) {
    const success = invoke(
      kind === "ordinary" ? `servant-${id}` : "skilledServants",
      "sub",
      count,
      kind === "foundry" ? [id] : undefined,
    );
    if (!success)
      return rejected(
        "full-servant-control-failed",
        `could not unassign servants from ${id}`,
      );
  }
  for (const [kind, id, count] of servantAdditions) {
    const success = invoke(
      kind === "ordinary" ? `servant-${id}` : "skilledServants",
      "add",
      count,
      kind === "foundry" ? [id] : undefined,
    );
    if (!success)
      return rejected(
        "full-servant-control-failed",
        `could not assign servants to ${id}`,
      );
  }
  if (
    selectedDefault !== undefined &&
    !invoke(`civ-${selectedDefault.id}`, "setDefault", 1, [selectedDefault.id])
  ) {
    return rejected(
      "full-default-job-control-failed",
      `could not select ${selectedDefault.id} as the default job`,
    );
  }
  return SUCCEEDED;
}

export function createCapturedOrdinaryJobsAutomation({
  rootState,
  controls,
  readSettings,
  readDemand,
  onSkipped,
}: CapturedOrdinaryJobsDependencies): {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
  readonly readJobCounts: (
    root: unknown,
  ) => CapturedJobCountSnapshot | undefined;
} {
  let history: CapturedJobHistory | undefined;
  let historyRoot: unknown;
  let authorityCap: number | null = null;
  const catalogReader = createCapturedJobCatalogReader({
    rootState,
    controls,
    readSettings,
    ...(readDemand === undefined ? {} : { readDemand }),
    ...(onSkipped === undefined ? {} : { onSkipped }),
    readJobHistory: () =>
      historyRoot === rootState.readRoot() ? history : undefined,
  });
  const controlsPort = createCapturedJobControls({ controls });
  const sessionRef: { value: OrdinaryJobsSession | undefined } = {
    value: undefined,
  };
  const reader: JobsReader = Object.freeze({
    readCycle(craftOnly: boolean) {
      if (craftOnly) {
        sessionRef.value = undefined;
        return unavailableInput();
      }
      const root = rootState.readRoot();
      const sampled = readCycle(
        root,
        readSettings(),
        catalogReader,
        readDemand,
        authorityCap,
      );
      if (sampled === undefined) {
        sessionRef.value = undefined;
        return unavailableInput();
      }
      sessionRef.value = Object.freeze({
        root,
        catalog: sampled.catalog,
        input: sampled.input,
        commandState: sampled.commandState,
      });
      return sampled.input;
    },
  });
  const executor: JobsExecutor = Object.freeze({
    execute(decision: Readonly<JobsDecision>): CommandExecutionOutcome {
      const session = sessionRef.value;
      if (session === undefined)
        return stale(
          "ordinary-jobs-session-missing",
          "ordinary jobs session is missing",
        );
      if (rootState.readRoot() !== session.root) {
        sessionRef.value = undefined;
        return stale(
          "ordinary-jobs-root-changed",
          "captured game root changed",
        );
      }
      const currentCatalog = catalogReader();
      const currentCycle = readCycle(
        session.root,
        readSettings(),
        catalogReader,
        readDemand,
        authorityCap,
      );
      if (
        currentCatalog === undefined ||
        JSON.stringify(currentCatalog) !== JSON.stringify(session.catalog) ||
        currentCycle === undefined ||
        JSON.stringify(currentCycle.input) !== JSON.stringify(session.input)
      ) {
        sessionRef.value = undefined;
        return stale(
          "ordinary-jobs-state-changed",
          "ordinary job catalog changed",
        );
      }
      const expected = planJobs(session.input);
      if (
        expected === null ||
        JSON.stringify(expected) !== JSON.stringify(decision)
      ) {
        sessionRef.value = undefined;
        return rejected(
          "invalid-ordinary-jobs-decision",
          "ordinary jobs decision does not match the sampled plan",
        );
      }
      if (!preflightDecision(controls, session.commandState, decision)) {
        sessionRef.value = undefined;
        return rejected(
          "ordinary-jobs-controls-incomplete",
          "ordinary jobs command controls are incomplete",
        );
      }
      sessionRef.value = undefined;
      let outcome = executeCapturedJobDecision(
        controlsPort,
        session.commandState,
        decision,
      );
      if (outcome.status === "succeeded") {
        const observed =
          rootState.readRoot() === session.root ? catalogReader() : undefined;
        const matches =
          observed !== undefined &&
          observed.defaultJobId ===
            (decision.selectedDefaultToken === null
              ? session.catalog.defaultJobId
              : (session.commandState.jobs.find(
                  (job) => job.token === decision.selectedDefaultToken,
                )?.id ?? "")) &&
          decision.assignments.every((assignment) => {
            const before = session.commandState.jobs.find(
              (job) => job.token === assignment.jobToken,
            );
            const after = observed.jobs.find(
              (job) => job.token === assignment.jobToken,
            );
            return (
              before !== undefined &&
              after !== undefined &&
              after.workers === assignment.workers &&
              after.servants ===
                (session.commandState.manageServants
                  ? assignment.servants
                  : before.servants)
            );
          });
        if (!matches) {
          outcome = rejected(
            "ordinary-jobs-postcondition-failed",
            "ordinary job assignment was not observed in captured root state",
          );
        } else {
          historyRoot = rootState.readRoot();
          history = Object.freeze({
            lastPopulationCount: decision.lastPopulationCount,
            lastFarmerCount: decision.lastFarmerCount,
          });
          authorityCap = decision.clearAuthorityEntertainerCap
            ? null
            : decision.authorityEntertainerCap;
        }
      }
      return outcome;
    },
  });
  return Object.freeze({
    reader,
    executor,
    readJobCounts(root: unknown): CapturedJobCountSnapshot | undefined {
      if (root !== rootState.readRoot()) return undefined;
      const catalog = catalogReader();
      if (root !== rootState.readRoot() || catalog === undefined)
        return undefined;
      const counts = new Map(catalog.jobs.map((job) => [job.id, job.count]));
      return Object.freeze({ readCount: (jobId: string) => counts.get(jobId) });
    },
  });
}

/** Combines ordinary jobs, foundry craftsmen, and their servant pools in one planner decision. */
export function createCapturedFullJobsAutomation({
  rootState,
  controls,
  readSettings,
  onSkipped,
  costs,
  readDemand,
  readBuildTargets,
  buildCosts,
}: CapturedFullJobsDependencies): {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
  readonly isAvailable: () => boolean;
} {
  let history: CapturedJobHistory | undefined;
  let historyRoot: unknown;
  let authorityCap: number | null = null;
  const catalogReader = createCapturedJobCatalogReader({
    rootState,
    controls,
    readSettings,
    ...(onSkipped === undefined ? {} : { onSkipped }),
    readJobHistory: () =>
      historyRoot === rootState.readRoot() ? history : undefined,
    ...(readDemand === undefined ? {} : { readDemand }),
  });
  const sessionRef: { value: FullJobsSession | undefined } = {
    value: undefined,
  };
  const reader: JobsReader = Object.freeze({
    readCycle(craftOnly: boolean) {
      if (craftOnly) {
        sessionRef.value = undefined;
        return unavailableInput();
      }
      const root = rootState.readRoot();
      const sampled = readFullCycle(
        root,
        readSettings(),
        catalogReader,
        costs,
        readDemand,
        readBuildTargets,
        buildCosts,
        authorityCap,
      );
      if (sampled === undefined) {
        sessionRef.value = undefined;
        return unavailableInput();
      }
      sessionRef.value = Object.freeze({
        root,
        catalog: sampled.catalog,
        foundry: sampled.foundry,
        input: sampled.input,
        ordinaryJobs: sampled.ordinaryJobs,
      });
      return sampled.input;
    },
  });
  const executor: JobsExecutor = Object.freeze({
    execute(decision: Readonly<JobsDecision>): CommandExecutionOutcome {
      const session = sessionRef.value;
      if (session === undefined)
        return stale(
          "full-jobs-session-missing",
          "full jobs session is missing",
        );
      if (rootState.readRoot() !== session.root) {
        sessionRef.value = undefined;
        return stale("full-jobs-root-changed", "captured game root changed");
      }
      const currentCatalog = catalogReader();
      const currentFoundry = readCapturedCraftsmenCycle(
        session.root,
        readSettings(),
        costs,
        catalogReader,
        readDemand,
        readBuildTargets,
        buildCosts,
      );
      if (
        currentCatalog === undefined ||
        JSON.stringify(currentCatalog) !== JSON.stringify(session.catalog) ||
        currentFoundry === undefined ||
        JSON.stringify(currentFoundry.samples) !==
          JSON.stringify(session.foundry.samples) ||
        JSON.stringify(currentFoundry.skilledSamples) !==
          JSON.stringify(session.foundry.skilledSamples) ||
        currentFoundry.skilledMaximum !== session.foundry.skilledMaximum ||
        currentFoundry.skilledUsed !== session.foundry.skilledUsed ||
        currentFoundry.input.manageServants !==
          session.foundry.input.manageServants ||
        currentFoundry.input.servantModifier !==
          session.foundry.input.servantModifier ||
        JSON.stringify(currentFoundry.input.crafting) !==
          JSON.stringify(session.foundry.input.crafting)
      ) {
        sessionRef.value = undefined;
        return stale(
          "full-jobs-state-changed",
          "ordinary or foundry state changed",
        );
      }
      const expected = planJobs(session.input);
      if (
        expected === null ||
        JSON.stringify(expected) !== JSON.stringify(decision)
      ) {
        sessionRef.value = undefined;
        return rejected(
          "invalid-full-jobs-decision",
          "full jobs decision does not match the sampled plan",
        );
      }
      sessionRef.value = undefined;
      let outcome = executeFullDecision(controls, session, decision);
      if (outcome.status === "succeeded") {
        const currentRoot = rootState.readRoot();
        const observed =
          currentRoot === session.root
            ? readFullCycle(
                currentRoot,
                readSettings(),
                catalogReader,
                costs,
                readDemand,
                readBuildTargets,
                buildCosts,
                authorityCap,
              )
            : undefined;
        const expectedDefaultId =
          decision.selectedDefaultToken === null
            ? session.catalog.defaultJobId
            : (session.ordinaryJobs.find(
                (job) => job.token === decision.selectedDefaultToken,
              )?.id ?? "");
        const matches =
          observed !== undefined &&
          observed.catalog.defaultJobId === expectedDefaultId &&
          decision.assignments.every((assignment) => {
            const before = session.input.jobs.find(
              (job) => job.token === assignment.jobToken,
            );
            const after = observed.input.jobs.find(
              (job) => job.token === assignment.jobToken,
            );
            const foundry = observed.foundry.samples.find(
              (sample) => sample.id === before?.id,
            );
            return (
              before !== undefined &&
              after !== undefined &&
              (before.crafting
                ? foundry?.workers === assignment.workers
                : after.workers === assignment.workers) &&
              after.servants ===
                (session.input.manageServants
                  ? assignment.servants
                  : before.servants)
            );
          });
        if (!matches) {
          outcome = rejected(
            "full-jobs-postcondition-failed",
            "ordinary or foundry assignment was not observed in captured root state",
          );
        } else {
          historyRoot = currentRoot;
          history = Object.freeze({
            lastPopulationCount: decision.lastPopulationCount,
            lastFarmerCount: decision.lastFarmerCount,
          });
          authorityCap = decision.clearAuthorityEntertainerCap
            ? null
            : decision.authorityEntertainerCap;
        }
      }
      return outcome;
    },
  });
  const isAvailable = (): boolean =>
    readFullCycle(
      rootState.readRoot(),
      readSettings(),
      catalogReader,
      costs,
      readDemand,
      readBuildTargets,
      buildCosts,
      authorityCap,
    ) !== undefined;
  return Object.freeze({ reader, executor, isAvailable });
}
