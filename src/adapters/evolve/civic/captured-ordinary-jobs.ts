/** Captured ordinary-job planning and commands, without foundry crafting. */

import {
  planJobs,
  type JobsCycleInput,
  type JobsDecision,
  type JobsJobInput,
} from "../../../domain/civic/jobs.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type { JobsExecutor, JobsReader } from "../../../ports/jobs.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { isRecord, readProperty } from "../../validation.ts";
import {
  createCapturedJobCatalogReader,
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

export interface CapturedOrdinaryJobsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
}

export interface CapturedFullJobsDependencies extends CapturedOrdinaryJobsDependencies {
  readonly costs: CapturedCraftCosts;
  readonly readDemand?: () => CapturedDemandSample;
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

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
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

const MUSICAL_MORALE: Readonly<Record<number, number>> = Object.freeze({
  0.1: 0.15,
  0.25: 0.25,
  0.5: 0.5,
  1: 1,
  2: 1.1,
  3: 1.2,
  4: 1.25,
});

const EMOTIONLESS_REDUCTION: Readonly<Record<number, number>> = Object.freeze({
  0.1: 55,
  0.25: 50,
  0.5: 45,
  1: 35,
  2: 25,
  3: 20,
  4: 18,
});

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
  const configuredTarget = finiteNumber(settings["generalMinimumAuthority"]);
  if (configuredTarget === undefined) return undefined;
  if (configuredTarget === 0) {
    return unavailableInput().authority;
  }
  const resources = readProperty(root, "resource");
  const authority = readProperty(resources, "Authority");
  const morale = readProperty(resources, "Morale");
  if (!isRecord(authority) || !isRecord(morale)) return undefined;
  const current = finiteNonNegative(readProperty(authority, "amount"));
  const maximum = finiteNonNegative(readProperty(authority, "max"));
  const moraleCurrent = finiteNumber(readProperty(morale, "amount"));
  const moralePotential = finiteNumber(readProperty(morale, "diff"));
  const moraleMaximum = finiteNumber(readProperty(morale, "max"));
  if (
    current === undefined ||
    maximum === undefined ||
    moraleCurrent === undefined ||
    moralePotential === undefined ||
    moraleMaximum === undefined
  ) {
    return undefined;
  }
  const display = readProperty(authority, "display");
  if (display !== undefined && typeof display !== "boolean") return undefined;
  if (display === false) return unavailableInput().authority;

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
  const raceForTax = readProperty(root, "race");
  if (
    Boolean(readProperty(raceForTax, "terrifying")) ||
    Boolean(readProperty(raceForTax, "noble")) ||
    Boolean(readProperty(raceForTax, "wish")) ||
    governmentType === "oligarchy"
  ) {
    return undefined;
  }
  const taxCap = currency !== undefined && currency >= 5 ? 50 : 30;
  let authorityTaxLimit = taxCap;
  if (settings["autoTax"] === true) {
    const requested = readProperty(settings, "generalRequestedTaxRate");
    if (requested !== undefined) {
      const requestedRate = finiteNumber(requested);
      if (requestedRate === undefined || requestedRate < 0) {
        if (requestedRate === undefined) return undefined;
      } else {
        const minimumTax = currency !== undefined && currency >= 5 ? 0 : 10;
        authorityTaxLimit = Math.min(
          Math.max(requestedRate, minimumTax),
          taxCap,
        );
      }
    }
  }
  const canTax =
    current < target &&
    taxDisplay !== false &&
    (settings["autoTax"] === true
      ? taxRate < authorityTaxLimit
      : taxRate < taxCap);
  if (current < target && settings["autoTax"] !== true && taxRate < taxCap) {
    return undefined;
  }

  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  if (!isRecord(race) || !isRecord(tech)) return undefined;
  const theatreValue = readProperty(tech, "theatre");
  const theatre =
    theatreValue === undefined ? 0 : finiteNonNegative(theatreValue);
  const musical = traitValue(race, "musical", MUSICAL_MORALE, "raw");
  const emotionless = traitValue(
    race,
    "emotionless",
    EMOTIONLESS_REDUCTION,
    "factor",
  );
  const highPopulation = traitValue(
    race,
    "high_pop",
    HIGH_POPULATION_MORALE,
    "percent",
  );
  if (
    theatre === undefined ||
    musical === undefined ||
    emotionless === undefined ||
    highPopulation === undefined
  ) {
    return undefined;
  }
  const entertainerMorale =
    (theatre + musical) *
    emotionless *
    highPopulation *
    (readProperty(race, "lone_survivor") ? 25 : 1);
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

function hasCompleteJobCatalog(
  root: unknown,
  catalog: Readonly<CapturedJobCatalog>,
): boolean {
  const civic = readProperty(root, "civic");
  if (!isRecord(civic)) return false;
  const capturedIds = new Set(catalog.jobs.map((job) => job.id));
  for (const [id, value] of Object.entries(civic)) {
    if (isRecord(value) && typeof readProperty(value, "job") === "string") {
      if (!capturedIds.has(id)) return false;
    }
  }
  return true;
}

function readCycle(
  root: unknown,
  settingsValue: unknown,
  catalogReader: () => CapturedJobCatalog | undefined,
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
    readProperty(
      readProperty(readProperty(root, "resource"), "Population"),
      "amount",
    ),
  );
  if (population === undefined) return undefined;
  const catalog = catalogReader();
  if (catalog === undefined) return undefined;
  if (!hasCompleteJobCatalog(root, catalog)) return undefined;
  const servantState = catalog.servantState;
  const manageServants = settings["jobManageServants"] === true;
  if (manageServants && servantState === null) return undefined;
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
    reserveMiner: false,
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
    commandState: Object.freeze({
      manageServants,
      jobs: Object.freeze(
        catalog.jobs.flatMap((job) =>
          job.token === null
            ? []
            : [
                Object.freeze({
                  token: job.token,
                  id: job.id,
                  workers: job.workers,
                  servants: job.servants,
                  serves: job.serves,
                }),
              ],
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
    previousAuthorityCap,
  );
  if (ordinary === undefined) return undefined;
  const foundry = readCapturedCraftsmenCycle(
    root,
    settingsValue,
    costs,
    catalogReader,
    readDemand,
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
  const baseToken =
    Math.max(-1, ...ordinary.input.jobs.map((job) => job.token)) + 1;
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
    skilledServantsMaximum: foundry.skilledMaximum,
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
  controls: ReturnType<typeof createCapturedJobControls>,
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
    const delta = assignment.workers - current;
    if (delta < 0) workerRemovals.push([kind, id, -delta]);
    if (delta > 0) workerAdditions.push([kind, id, delta]);
    const servantDelta =
      assignment.servants -
      (ordinaryJob?.servants ?? foundryJob?.servants ?? 0);
    if (servantDelta < 0) servantRemovals.push([kind, id, -servantDelta]);
    if (servantDelta > 0) servantAdditions.push([kind, id, servantDelta]);
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
  const invoke = (
    kind: "ordinary" | "foundry",
    id: string,
    method: "assign" | "unassign",
    count: number,
  ): boolean =>
    kind === "ordinary"
      ? (method === "assign" ? controls.assign : controls.unassign)({
          elementId: `civ-${id}`,
          count,
        })
      : (method === "assign" ? controls.assign : controls.unassign)({
          elementId: "foundry",
          count,
          craftedResourceId: id,
        });
  for (const [kind, id, count] of workerRemovals) {
    if (!invoke(kind, id, "unassign", count))
      return rejected("full-job-control-failed", `could not unassign ${id}`);
  }
  for (const [kind, id, count] of workerAdditions) {
    if (!invoke(kind, id, "assign", count))
      return rejected("full-job-control-failed", `could not assign ${id}`);
  }
  for (const [kind, id, count] of servantRemovals) {
    const success =
      kind === "ordinary"
        ? controls.unassign({ elementId: `servant-${id}`, count })
        : controls.unassign({
            elementId: `scraft${id}`,
            count,
            craftedResourceId: id,
          });
    if (!success)
      return rejected(
        "full-servant-control-failed",
        `could not unassign servants from ${id}`,
      );
  }
  for (const [kind, id, count] of servantAdditions) {
    const success =
      kind === "ordinary"
        ? controls.assign({ elementId: `servant-${id}`, count })
        : controls.assign({
            elementId: `scraft${id}`,
            count,
            craftedResourceId: id,
          });
    if (!success)
      return rejected(
        "full-servant-control-failed",
        `could not assign servants to ${id}`,
      );
  }
  if (
    selectedDefault !== undefined &&
    !controls.setDefault({
      elementId: `civ-${selectedDefault.id}`,
      jobId: selectedDefault.id,
    })
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
}: CapturedOrdinaryJobsDependencies): {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
} {
  let history: CapturedJobHistory | undefined;
  let historyRoot: unknown;
  let authorityCap: number | null = null;
  const catalogReader = createCapturedJobCatalogReader({
    rootState,
    controls,
    readSettings,
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
      if (
        currentCatalog === undefined ||
        JSON.stringify(currentCatalog) !== JSON.stringify(session.catalog)
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
      const outcome = executeCapturedJobDecision(
        controlsPort,
        session.commandState,
        decision,
      );
      if (outcome.status === "succeeded") {
        historyRoot = session.root;
        history = Object.freeze({
          lastPopulationCount: decision.lastPopulationCount,
          lastFarmerCount: decision.lastFarmerCount,
        });
        authorityCap = decision.clearAuthorityEntertainerCap
          ? null
          : decision.authorityEntertainerCap;
      }
      return outcome;
    },
  });
  return Object.freeze({ reader, executor });
}

/**
 * Combines ordinary jobs and foundry craftsmen into one planner decision when the captured
 * surface has no skilled-servant phase to execute. The caller keeps the bounded separate paths
 * for runs whose servant state needs another command family.
 */
export function createCapturedFullJobsAutomation({
  rootState,
  controls,
  readSettings,
  costs,
  readDemand,
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
    readJobHistory: () =>
      historyRoot === rootState.readRoot() ? history : undefined,
    ...(readDemand === undefined ? {} : { readDemand }),
  });
  const controlsPort = createCapturedJobControls({ controls });
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
      const methods = new Map<string, Set<string>>();
      for (const id of controls.capturedElementIds()) {
        const handle = controls.resolve(id);
        if (handle !== undefined) methods.set(id, new Set(handle.methods));
      }
      for (const assignment of decision.assignments) {
        const ordinaryJob = session.ordinaryJobs.find(
          (job) => job.token === assignment.jobToken,
        );
        const firstCraftToken =
          session.input.jobs[session.ordinaryJobs.length]?.token;
        const foundryIndex =
          firstCraftToken === undefined
            ? -1
            : assignment.jobToken - firstCraftToken;
        const foundryJob = session.foundry.input.jobs[foundryIndex];
        const job =
          ordinaryJob ??
          (foundryJob === undefined
            ? undefined
            : { id: foundryJob.id, workers: foundryJob.workers });
        if (job === undefined) {
          sessionRef.value = undefined;
          return rejected(
            "full-jobs-controls-incomplete",
            "full jobs contains an unknown command token",
          );
        }
        if (assignment.workers !== job.workers) {
          const method = assignment.workers < job.workers ? "sub" : "add";
          const elementId =
            ordinaryJob === undefined ? "foundry" : `civ-${job.id}`;
          if (!methods.get(elementId)?.has(method)) {
            sessionRef.value = undefined;
            return rejected(
              "full-jobs-controls-incomplete",
              `missing ${method} control for ${elementId}`,
            );
          }
        }
        const currentServants =
          ordinaryJob?.servants ??
          session.foundry.skilledSamples.find((sample) => sample.id === job.id)
            ?.servants ??
          0;
        if (assignment.servants !== currentServants) {
          const method = assignment.servants < currentServants ? "sub" : "add";
          const elementId =
            ordinaryJob === undefined ? `scraft${job.id}` : `servant-${job.id}`;
          if (!methods.get(elementId)?.has(method)) {
            sessionRef.value = undefined;
            return rejected(
              "full-jobs-controls-incomplete",
              `missing ${method} control for ${elementId}`,
            );
          }
        }
      }
      if (
        decision.selectedDefaultToken !== null &&
        !methods
          .get(
            `civ-${session.ordinaryJobs.find((job) => job.token === decision.selectedDefaultToken)?.id ?? ""}`,
          )
          ?.has("setDefault")
      ) {
        sessionRef.value = undefined;
        return rejected(
          "full-jobs-controls-incomplete",
          "missing default-job control",
        );
      }
      sessionRef.value = undefined;
      const outcome = executeFullDecision(controlsPort, session, decision);
      if (outcome.status === "succeeded") {
        historyRoot = session.root;
        history = Object.freeze({
          lastPopulationCount: decision.lastPopulationCount,
          lastFarmerCount: decision.lastFarmerCount,
        });
        authorityCap = decision.clearAuthorityEntertainerCap
          ? null
          : decision.authorityEntertainerCap;
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
      authorityCap,
    ) !== undefined;
  return Object.freeze({ reader, executor, isAvailable });
}
