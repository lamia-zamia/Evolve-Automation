/** Captured ordinary-job planning and commands, without foundry crafting. */

import {
  planJobs,
  type JobsCycleInput,
  type JobsDecision,
} from "../../../domain/civic/jobs.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type { JobsExecutor, JobsReader } from "../../../ports/jobs.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale } from "../../command-outcomes.ts";
import { isRecord, readProperty } from "../../validation.ts";
import {
  createCapturedJobCatalogReader,
  toCapturedJobsCycleInput,
  type CapturedJobCatalog,
  type CapturedJobsCycleOptions,
} from "./captured-job-catalog.ts";
import {
  createCapturedJobControls,
  executeCapturedJobDecision,
  type CapturedJobCommandState,
} from "./captured-job-controls.ts";

export interface CapturedOrdinaryJobsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
}

interface OrdinaryJobsSession {
  readonly root: unknown;
  readonly catalog: Readonly<CapturedJobCatalog>;
  readonly input: Readonly<JobsCycleInput>;
  readonly commandState: Readonly<CapturedJobCommandState>;
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

function tokenFor(
  catalog: Readonly<CapturedJobCatalog>,
  id: string,
): number | null {
  return catalog.jobs.find((job) => job.id === id)?.token ?? null;
}

function readCycle(
  root: unknown,
  settingsValue: unknown,
  catalogReader: () => CapturedJobCatalog | undefined,
):
  | {
      readonly catalog: Readonly<CapturedJobCatalog>;
      readonly input: Readonly<JobsCycleInput>;
      readonly commandState: Readonly<CapturedJobCommandState>;
    }
  | undefined {
  const settings = isRecord(settingsValue) ? settingsValue : {};
  // Authority management needs morale history, tax state, and trait-derived income that the
  // captured ordinary surface does not yet expose. Do not turn an enabled setting into a false
  // disabled sample.
  if (settings["authorityManage"] === true) return undefined;
  const population = finiteNonNegative(
    readProperty(
      readProperty(readProperty(root, "resource"), "Population"),
      "amount",
    ),
  );
  if (population === undefined) return undefined;
  const catalog = catalogReader();
  if (catalog === undefined) return undefined;
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
    authority: unavailableInput().authority,
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

export function createCapturedOrdinaryJobsAutomation({
  rootState,
  controls,
  readSettings,
}: CapturedOrdinaryJobsDependencies): {
  readonly reader: JobsReader;
  readonly executor: JobsExecutor;
} {
  const catalogReader = createCapturedJobCatalogReader({
    rootState,
    controls,
    readSettings,
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
      const sampled = readCycle(root, readSettings(), catalogReader);
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
      sessionRef.value = undefined;
      return executeCapturedJobDecision(
        controlsPort,
        session.commandState,
        decision,
      );
    },
  });
  return Object.freeze({ reader, executor });
}
