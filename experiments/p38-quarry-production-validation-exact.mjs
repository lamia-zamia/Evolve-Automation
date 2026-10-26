import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import * as prettier from "prettier";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
import {
  P36_BOOTSTRAP_LIMITS,
  P36_BOOTSTRAP_TARGETS,
} from "./p36-productive-resource-bootstrap-policy.mjs";
import {
  createP38QuarryDiagnosticAuthorization,
  P38_DIAGNOSTIC_AUTHORIZATION,
} from "./p38-quarry-production-validation-policy.mjs";
import {
  createP40ConstructionTracePlugin,
  P40_TRACE_HOOK_PROPERTIES,
} from "./p40-construction-reservation-gate-trace.mjs";
import { createP40ConstructionEvidence } from "./p40-construction-reservation-gate-evidence.mjs";
import {
  createP42ConstructionPriorityTracePlugin,
  P42_TRACE_HOOK_PROPERTIES,
} from "./p42-construction-priority-counterfactual-trace.mjs";
import {
  applyP43ExecutorQualification,
  applyP43JobsInstrumentation,
  P43_TRACE_HOOK_PROPERTIES,
} from "./p43-food-safe-jobs-trace.mjs";
import { P43_PINNED_GAME } from "./p43-food-safe-jobs-policy.mjs";
import {
  P42_EXPECTED,
  P42_INTERVENTION_IDENTITY,
} from "./p42-construction-priority-counterfactual-policy.mjs";
import {
  P51_QUARRY_REQUEST,
  qualifyP51QuarryRequest,
} from "./p51-construction-jobs-handoff-contract.mjs";
import { P53_QUARRY_REQUEST } from "./p53-construction-owned-target-authority-contract.mjs";
import {
  applyP51RuntimeAdmissionInstrumentation,
  applyP52RuntimeAdmissionInstrumentation,
  createP51ConstructionJobsHandoffPlugin,
} from "./p51-construction-jobs-handoff-trace.mjs";
import { createP42ConstructionPriorityEvidence } from "./p42-construction-priority-counterfactual-evidence.mjs";
import { createP43FoodSafeJobsEvidence } from "./p43-food-safe-jobs-evidence.mjs";
import { createP51ConstructionJobsHandoffEvidence } from "./p51-construction-jobs-handoff-evidence.mjs";
import { createP52IndependentConstructionJobsIdentityEvidence } from "./p52-independent-construction-jobs-identity-evidence.mjs";
import { planJobs } from "../src/domain/civic/jobs.ts";
import { analyzeEconomicGoalDependencies } from "../src/domain/progression/economic-goal-dependencies.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p54Mode = process.argv.includes("--p54-construction-authority-cost");
const p42Mode = process.argv.includes(
  "--p42-construction-priority-counterfactual",
);
const p53Mode =
  p54Mode || process.argv.includes("--p53-construction-owned-target-authority");
const p52Mode =
  process.argv.includes("--p52-independent-construction-jobs-identity") ||
  p53Mode;
const p51Mode =
  process.argv.includes("--p51-construction-jobs-handoff") || p52Mode;
const p43Mode = process.argv.includes("--p43-food-safe-jobs");
if (p54Mode && !p42Mode)
  throw new Error("P54 requires the retained P42 Construction intervention");
if (p51Mode && !p42Mode)
  throw new Error("P51 reuses the retained P42 Construction intervention");
if (p43Mode && !p42Mode)
  throw new Error("P43 requires the retained P42 Construction intervention");
if (p43Mode && process.argv.includes("--reuse"))
  throw new Error("P43 exact replay must use fresh isolated arms");
const p40TraceEnabled =
  p42Mode || process.argv.includes("--p40-construction-trace");
const fixturePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
);
const settingsPath = path.join(
  root,
  "experiments/p18-standard-human-settings.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const metadataPath = path.join(root, "src/userscript.meta.js");
const bundlePath = path.join(
  root,
  p43Mode
    ? "test-artifacts/benchmark/tmp/p43-food-safe-jobs.user.js"
    : p54Mode
      ? "test-artifacts/benchmark/tmp/p54-construction-authority-cost.user.js"
      : p53Mode
        ? "test-artifacts/benchmark/tmp/p53-construction-owned-target-authority.user.js"
        : p52Mode
          ? "test-artifacts/benchmark/tmp/p52-independent-construction-jobs-identity.user.js"
          : p51Mode
            ? "test-artifacts/benchmark/tmp/p51-construction-jobs-handoff.user.js"
            : p42Mode
              ? "test-artifacts/benchmark/tmp/p42-construction-priority-counterfactual.user.js"
              : "test-artifacts/benchmark/tmp/p38-quarry-production-validation.user.js",
);
const evidencePath = path.join(
  root,
  "experiments/p38-quarry-production-validation-evidence.json",
);
const p40TracePath = path.join(
  root,
  "experiments/p40-construction-reservation-gate-trace.json",
);
const p40PluginPath = path.join(
  root,
  "experiments/p40-construction-reservation-gate-trace.mjs",
);
const p40HarnessPath = path.join(
  root,
  "experiments/p40-construction-reservation-gate-exact.mjs",
);
const p42EvidencePath = path.join(
  root,
  "experiments/p42-construction-priority-counterfactual-evidence.json",
);
const p43EvidencePath = path.join(
  root,
  "experiments/p43-food-safe-jobs-evidence.json",
);
const p43TimelinePath = path.join(
  root,
  "experiments/p43-food-safe-jobs-timeline.json",
);
const p51EvidencePath = path.join(
  root,
  "experiments/p51-construction-jobs-handoff-evidence.json",
);
const p52EvidencePath = path.join(
  root,
  "experiments/p52-independent-construction-jobs-identity-evidence.json",
);
const p53EvidencePath = path.join(
  root,
  "experiments/p53-construction-owned-target-authority-evidence.json",
);
const p54EvidencePath = path.join(
  root,
  "experiments/p54-construction-authority-cost-evidence.json",
);
const p42PluginPath = path.join(
  root,
  "experiments/p42-construction-priority-counterfactual-trace.mjs",
);
const p42PolicyPath = path.join(
  root,
  "experiments/p42-construction-priority-counterfactual-policy.mjs",
);
const p42HarnessPath = path.join(
  root,
  "experiments/p42-construction-priority-counterfactual-exact.mjs",
);
const jobsEvidencePath = path.join(
  root,
  "experiments/p38-quarry-production-validation-jobs.json",
);
const interimPath = path.join(
  root,
  p43Mode
    ? "test-artifacts/benchmark/tmp/p43-food-safe-jobs-interim.json"
    : p54Mode
      ? "test-artifacts/benchmark/tmp/p54-construction-authority-cost-interim.json"
      : p53Mode
        ? "test-artifacts/benchmark/tmp/p53-construction-owned-target-authority-interim.json"
        : p52Mode
          ? "test-artifacts/benchmark/tmp/p52-independent-construction-jobs-identity-interim.json"
          : p51Mode
            ? "test-artifacts/benchmark/tmp/p51-construction-jobs-handoff-interim.json"
            : p42Mode
              ? "test-artifacts/benchmark/tmp/p42-construction-priority-counterfactual-interim.json"
              : "test-artifacts/benchmark/tmp/p38-quarry-production-validation-interim.json",
);
const fixtureSha256 =
  "2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684";
const pinnedGame =
  "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f";
const pinnedGameSha256 =
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7";
const seed = 44;
const epoch = "2026-09-21T00:00:00.000Z";
const p51JobsRequest = Object.freeze({
  requestId: "p51-jobs-owner-observation-v1",
  origin: "test-only",
  objectiveId: "maintain-food-buffer-and-useful-stone-production",
  requestedScope: "food-sustainability-and-useful-stone-replenishment",
  generation: 1,
  active: true,
  authorityClassification: "observation-only",
});
const p51InitialJobsRequest = Object.freeze({
  ...p51JobsRequest,
  active: false,
});
const p51Checkpoints = [719, 720];
const checkpoints = [
  8, 48, 56, 64, 72, 80, 96, 112, 272, 448, 688, 1_000, 2_000, 3_000, 4_000,
  5_000, 6_000, 7_000, 8_000, 9_000, 10_000,
];
const p42Checkpoints = [
  719,
  ...Array.from({ length: 36 }, (_, index) => 720 + index * 8),
];
const p43ExtraCheckpoints = [
  ...Array.from({ length: 17 }, (_, index) => 1_584 + index),
  ...Array.from({ length: 33 }, (_, index) => 1_984 + index),
  ...Array.from({ length: 17 }, (_, index) => 5_624 + index),
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value);
const replayHarnessSha256 = hash(
  await readFile(fileURLToPath(import.meta.url)),
);
const retainedP38EvidenceText = p40TraceEnabled
  ? await readFile(evidencePath, "utf8")
  : undefined;
const retainedP38Evidence =
  retainedP38EvidenceText === undefined
    ? undefined
    : JSON.parse(retainedP38EvidenceText);
const p42RetainedBaseline = p42Mode
  ? retainedP38Evidence?.arms?.find((arm) => arm.arm === "B")
  : undefined;
if (p42Mode) {
  assert.ok(p42RetainedBaseline, "P42 requires the retained P38 B baseline");
}
const withoutArm = (event) => {
  const { arm: _arm, ...rest } = event;
  return rest;
};
const p42ExpectedAuthorizationHistory = p42Mode
  ? {
      p36: p42RetainedBaseline.p36.policyEvents
        .filter((event) => Number(event.period) <= 688)
        .map(withoutArm),
      p38: p42RetainedBaseline.p38.policyEvents
        .filter((event) => Number(event.period) <= 720)
        .map(withoutArm),
    }
  : null;
const p42ExecutionClockExpression = p42Mode
  ? "(window.eaDiagnosticsNow?.() ?? 0)"
  : "performance.now()";

const [fixtureText, settingsText, gameBytes, metadata] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(gamePath),
  readFile(metadataPath, "utf8"),
]);
const settings = JSON.parse(settingsText);
assert.equal(hash(fixtureText), fixtureSha256);
assert.equal(hash(gameBytes), pinnedGameSha256);
assert.equal(settings.buildingAlwaysClick, false);
assert.equal(settings.autoBuild, true);
assert.equal(settings.autoJobs, true);
if (p42Mode) {
  assert.deepEqual(
    {
      fixtureName: path.basename(fixturePath),
      fixtureSha256,
      pinnedGame,
      pinnedGameSha256,
      seed,
      epoch,
    },
    P42_INTERVENTION_IDENTITY,
  );
}

await mkdir(path.dirname(bundlePath), { recursive: true });
const metricPlugin = {
  name: "p38-test-only-native-authority-and-jobs-metrics",
  setup(build) {
    build.onLoad({ filter: /captured-runtime-control\.ts$/ }, async (args) => {
      let source = await readFile(args.path, "utf8");
      const replaceOnce = (before, after, label) => {
        assert.equal(
          source.split(before).length - 1,
          1,
          `P38 instrumentation anchor changed: ${label}`,
        );
        source = source.replace(before, after);
      };
      replaceOnce(
        `              const nativePrice =
                typeof targetId === "string"
                  ? buildCosts.readCost(targetId)
                  : undefined;`,
        `              const p36Metrics = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__")?.p36Metrics;
              const p36Metric = (name: string, amount = 1) => {
                if (isRecord(p36Metrics)) Reflect.set(p36Metrics, name, Number(readProperty(p36Metrics, name) ?? 0) + amount);
              };
              const p38ReadNativePrice = (id: string) => {
                const startedAt = ${p42ExecutionClockExpression};
                const value = buildCosts.readCost(id);
                p36Metric("freshPriceProbeElapsedMs", ${p42ExecutionClockExpression} - startedAt);
                return value;
              };
              const nativePrice =
                typeof targetId === "string"
                  ? (p36Metric("freshPriceProbes"), p38ReadNativePrice(targetId))
                  : undefined;`,
        "initial live native price probe",
      );
      replaceOnce(
        `              const isNativeRequestCurrent = () => {
                let failureReason = "changed-state-during-revalidation";`,
        `              const isNativeRequestCurrent = () => {
                p36Metric("validationFences");
                const p38FenceStartedAt = ${p42ExecutionClockExpression};
                let failureReason = "changed-state-during-revalidation";`,
        "per-action native validation fence",
      );
      replaceOnce(
        `                  const nowNativePrice =
                    typeof targetId === "string"
                      ? buildCosts.readCost(targetId)
                      : undefined;`,
        `                  const nowNativePrice =
                    typeof targetId === "string"
                      ? (p36Metric("freshPriceProbes"), p38ReadNativePrice(targetId))
                      : undefined;`,
        "fresh native price probe inside validation fence",
      );
      replaceOnce(
        `                  lastRevalidationFailureReason = failureReason;`,
        `                  lastRevalidationFailureReason = failureReason;
                  p36Metric("validationFenceElapsedMs", ${p42ExecutionClockExpression} - p38FenceStartedAt);`,
        "measure native per-action validation fence duration",
      );
      replaceOnce(
        `  const fullJobs = createCapturedFullJobsAutomation({`,
        `  const p38TestHooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
  if (typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" && __EA_TEST_SURFACE_ENABLED__ === true && isRecord(p38TestHooks)) {
    Reflect.set(p38TestHooks, "p38JobsApi", {
      readCycle() {
        return ordinaryJobs.reader.readCycle(false);
      },
      readRoot() {
        return pageCapture.rootState.readRoot();
      },
      readPeriod() {
        const runner = readProperty(settingsHostWindow, "__EA_RUNNER__");
        const periods = readProperty(runner, "periods");
        return typeof periods === "function" ? Reflect.apply(periods, runner, []) : null;
      },
      now() {
        const clock = readProperty(settingsHostWindow, "eaDiagnosticsNow");
        return typeof clock === "function" ? Reflect.apply(clock, settingsHostWindow, []) : 0;
      },
      snapshot() {
        const input = ordinaryJobs.reader.readCycle(false);
        const rawSettings = settingsStore.readRaw();
        return {
          input,
          rootGeneration: progression.readRootGeneration(),
          progressionGeneration: progression.readProgressionEpoch(),
          controlGenerations: input.jobs.map((job) => {
            const handle = pageCapture.controls.resolve("civ-" + job.id);
            return { id: job.id, generation: handle?.generation ?? null, methods: handle?.methods ?? null };
          }),
          defaultJobId: input.jobs.find((job) => job.isDefault)?.id ?? null,
          settings: {
            autoJobs: readProperty(rawSettings, "autoJobs") === true,
            jobSetDefault: readProperty(rawSettings, "jobSetDefault") === true,
            farmerEnabled: readProperty(rawSettings, "job_farmer") === true,
            quarryWorkerEnabled: readProperty(rawSettings, "job_quarry_worker") === true,
            farmerPriority: readProperty(rawSettings, "job_p_farmer") ?? null,
            quarryWorkerPriority: readProperty(rawSettings, "job_p_quarry_worker") ?? null,
            farmerBreakpoints: [readProperty(rawSettings, "job_b1_farmer"), readProperty(rawSettings, "job_b2_farmer"), readProperty(rawSettings, "job_b3_farmer")],
            quarryWorkerBreakpoints: [readProperty(rawSettings, "job_b1_quarry_worker"), readProperty(rawSettings, "job_b2_quarry_worker"), readProperty(rawSettings, "job_b3_quarry_worker")],
          },
        };
      },
      readP43FoodObservation(expectedRoot, input) {
        const currentRoot = pageCapture.rootState.readRoot();
        if (currentRoot !== expectedRoot) return null;
        const ledger = pageCapture.mechanics.readProductionBreakdown();
        if (ledger === undefined) return null;
        const sumRates = (values) => Object.values(values ?? {}).reduce((sum, value) => {
          if (typeof value === "number" && Number.isFinite(value)) return sum + value;
          if (typeof value === "string" && value.endsWith("v")) {
            const amount = Number.parseFloat(value);
            return Number.isFinite(amount) ? sum + amount : sum;
          }
          return sum;
        }, 0);
        const race = readProperty(currentRoot, "race");
        const resource = readProperty(currentRoot, "resource");
        const species = readProperty(race, "species");
        const zones = ["city", "underground", "space", "tauceti", "galaxy", "interstellar", "eden"];
        const buildings = Object.fromEntries(zones.map((zone) => {
          const values = readProperty(currentRoot, zone);
          return [zone, Object.fromEntries(Object.entries(isRecord(values) ? values : {}).filter(([, value]) => Number(readProperty(value, "count") ?? 0) > 0).map(([id, value]) => [id, readProperty(value, "count")]))];
        }));
        const civic = readProperty(currentRoot, "civic");
        const servants = readProperty(readProperty(race, "servants"), "jobs");
        const food = readProperty(resource, "Food");
        const foodConsumption = Math.abs(sumRates(ledger.consumption?.Food));
        const foodDiff = readProperty(food, "diff");
        const rootAfterRead = pageCapture.rootState.readRoot();
        return {
          rootMatches: rootAfterRead === expectedRoot,
          root: expectedRoot,
          jobsSnapshot: input,
          ledger,
          measuredFoodOutput: Number(foodDiff) + foodConsumption,
          measuredFoodConsumption: foodConsumption,
          population: readProperty(readProperty(resource, species), "amount"),
          populationCapacity: readProperty(readProperty(resource, species), "max"),
          occupiedJobs: Object.fromEntries(Object.entries(isRecord(civic) ? civic : {}).filter(([, value]) => Number(readProperty(value, "workers") ?? 0) > 0).map(([id, value]) => [id, { workers: readProperty(value, "workers"), servants: readProperty(servants, id) ?? 0 }])),
          unassignedWorkers: readProperty(readProperty(civic, "unemployed"), "workers") ?? 0,
          servants: isRecord(servants) ? servants : {},
          food: { amount: readProperty(food, "amount"), max: readProperty(food, "max"), diff: foodDiff },
          stone: { amount: readProperty(readProperty(resource, "Stone"), "amount"), max: readProperty(readProperty(resource, "Stone"), "max"), diff: readProperty(readProperty(resource, "Stone"), "diff"), production: sumRates(ledger.production?.Stone), consumption: Math.abs(sumRates(ledger.consumption?.Stone)) },
          buildings,
          undergroundFarmCount: Number(readProperty(readProperty(currentRoot, "underground"), "mushroom_farm")?.count ?? 0),
          surfaceFarmCount: Number(readProperty(readProperty(currentRoot, "space"), "surface_farm")?.count ?? 0),
          underTransmitterCount: Number(readProperty(readProperty(currentRoot, "underground"), "under_transmitter")?.count ?? 0),
        };
      },
      readP43DecisionIdentity(expectedRoot, input) {
        const currentRoot = pageCapture.rootState.readRoot();
        const civic = readProperty(currentRoot, "civic");
        const farmerControl = pageCapture.controls.resolve("civ-farmer");
        const quarryControl = pageCapture.controls.resolve("civ-quarry_worker");
        return {
          rootMatches: currentRoot === expectedRoot,
          inputIdentityAvailable: input?.available === true,
          rootGeneration: progression.readRootGeneration(),
          progressionGeneration: progression.readProgressionEpoch(),
          nativeDefaultJobId: readProperty(civic, "d_job") ?? null,
          rootDefaultJobId: readProperty(civic, "d_job") ?? null,
          farmerControlGeneration: farmerControl?.generation ?? null,
          quarryControlGeneration: quarryControl?.generation ?? null,
          farmerControlReady: farmerControl?.methods.includes("add") === true && farmerControl?.methods.includes("sub") === true,
          quarryControlReady: quarryControl?.methods.includes("add") === true && quarryControl?.methods.includes("sub") === true,
          controlGenerationReads: 2,
        };
      },
      readOwnerAuthority(actionId) {
        const handle = pageCapture.controls.resolve(actionId);
        return {
          rootGeneration: progression.readRootGeneration(),
          progressionGeneration: progression.readProgressionEpoch(),
          controlGeneration: handle?.generation ?? null,
          controlElementId: actionId,
          controlActionAvailable: handle?.methods.includes("action") === true,
        };
      },
      transferFourResidentQuarryWorker() {
        const input = ordinaryJobs.reader.readCycle(false);
        const beforeRoot = pageCapture.rootState.readRoot();
        const farmer = input.jobs.find((job) => job.id === "farmer");
        const quarryWorker = input.jobs.find((job) => job.id === "quarry_worker");
        const liveFarmer = readProperty(readProperty(beforeRoot, "civic"), "farmer");
        const liveQuarryWorker = readProperty(readProperty(beforeRoot, "civic"), "quarry_worker");
        if (!input.available || farmer === undefined || quarryWorker === undefined || Number(readProperty(liveFarmer, "workers")) !== 4 || Number(readProperty(liveQuarryWorker, "workers")) !== 0 || farmer.workers !== 4 || quarryWorker.workers !== 0)
          return { attempted: false, reason: "native-jobs-state-not-four-farmers-zero-quarry-workers", inputAvailable: input.available, farmerWorkers: farmer?.workers ?? null, quarryWorkerWorkers: quarryWorker?.workers ?? null };
        const invocations = [];
        const commandState = {
          manageServants: input.manageServants,
          jobs: input.jobs.map((job) => ({ token: job.token, id: job.id, workers: job.workers, servants: job.servants, serves: job.serves })),
        };
        const decision = {
          kind: "assign-jobs",
          assignments: input.jobs.map((job) => ({ jobToken: job.token, workers: job.id === "farmer" ? 3 : job.id === "quarry_worker" ? 1 : job.workers, servants: job.servants })),
          selectedDefaultToken: null,
          moraleIncomeAdjusted: false,
          ironIncomeAdjusted: false,
          maximumSpaceMiners: 0,
          lastPopulationCount: input.population,
          lastFarmerCount: farmer.workers,
          authorityEntertainerCap: null,
          clearAuthorityEntertainerCap: false,
          craftWinner: null,
          craftDebugMessage: null,
          authorityDebugMessage: null,
        };
        const startedAt = ${p42ExecutionClockExpression};
        const controlsPort = createCapturedJobControls({ controls: pageCapture.controls, onInvocation: (invocation) => { invocations.push(invocation); const metrics = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__")?.p38Metrics; if (isRecord(metrics)) Reflect.set(metrics, "nativeJobOperations", Number(readProperty(metrics, "nativeJobOperations") ?? 0) + 1); } });
        const outcome = executeCapturedJobDecision(controlsPort, commandState, decision);
        const elapsedMs = ${p42ExecutionClockExpression} - startedAt;
        const metrics = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__")?.p38Metrics;
        if (isRecord(metrics)) Reflect.set(metrics, "nativeJobControlElapsedMs", Number(readProperty(metrics, "nativeJobControlElapsedMs") ?? 0) + elapsedMs);
        const afterRoot = pageCapture.rootState.readRoot();
        const afterCivic = readProperty(afterRoot, "civic");
        const farmerAfter = Number(readProperty(readProperty(afterCivic, "farmer"), "workers"));
        const quarryWorkerAfter = Number(readProperty(readProperty(afterCivic, "quarry_worker"), "workers"));
        return { attempted: true, outcome, invocations, elapsedMs, rootIdentityStable: afterRoot === beforeRoot, farmerBefore: farmer.workers, quarryWorkerBefore: quarryWorker.workers, farmerAfter, quarryWorkerAfter, postcondition: afterRoot === beforeRoot && farmerAfter === 3 && quarryWorkerAfter === 1 };
      },
    });
  }
  const fullJobs = createCapturedFullJobsAutomation({`,
        "test-only live Jobs reader and captured native control executor",
      );
      replaceOnce(
        `    const outcome = runJobsAutomation(dependencies, craftOnly);`,
        `    const p38Metrics = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__")?.p38Metrics;
    const p38StartedAt = ${p42ExecutionClockExpression};
    const outcome = runJobsAutomation(dependencies, craftOnly);
    if (isRecord(p38Metrics)) {
      Reflect.set(p38Metrics, "ordinaryJobsExecutions", Number(readProperty(p38Metrics, "ordinaryJobsExecutions") ?? 0) + 1);
      Reflect.set(p38Metrics, "ordinaryJobsExecutionElapsedMs", Number(readProperty(p38Metrics, "ordinaryJobsExecutionElapsedMs") ?? 0) + ${p42ExecutionClockExpression} - p38StartedAt);
    }`,
        "measure native ordinary Jobs phase execution",
      );
      source = `import { createCapturedJobControls, executeCapturedJobDecision } from "../adapters/evolve/civic/captured-job-controls.ts";\n${source}`;
      if (p51Mode)
        source = p52Mode
          ? applyP52RuntimeAdmissionInstrumentation(source)
          : applyP51RuntimeAdmissionInstrumentation(source);
      return { contents: source, loader: "ts" };
    });
    build.onLoad({ filter: /application\\jobs\.ts$/ }, async (args) => {
      if (!p43Mode) return null;
      const source = applyP43JobsInstrumentation(
        await readFile(args.path, "utf8"),
      );
      return { contents: source, loader: "ts" };
    });
    build.onLoad({ filter: /captured-ordinary-jobs\.ts$/ }, async (args) => {
      if (!p43Mode) return null;
      const source = applyP43ExecutorQualification(
        await readFile(args.path, "utf8"),
      );
      return { contents: source, loader: "ts" };
    });
  },
};

const mainBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}
window.__EA_TEST_HOOKS__ = {
  ...(window.__EA_TEST_HOOKS__ ?? {}),
  constructionSavingTargetObservations: [],
  p36PreGatherBoundaryCaptures: [],
  civilizationBootstrapEvents: [],
  civilizationHandoffEvents: [],
  p36Metrics: { freshPriceProbes: 0, validationFences: 0 },
  p38Metrics: { nativeJobOperations: 0, nativeJobControlElapsedMs: 0 },
  p38JobTrace: [],
  ${p40TraceEnabled ? P40_TRACE_HOOK_PROPERTIES : ""}
  ${p42Mode ? P42_TRACE_HOOK_PROPERTIES : ""}
  ${p43Mode ? P43_TRACE_HOOK_PROPERTIES : ""}
  observeJobsTrace(event) { this.p38JobTrace.push(event); },
  captureConstructionSavingTargetForTest(target, authority) {
    const period = window.__EA_RUNNER__?.periods?.() ?? null;
    this.constructionSavingTargetObservations.push({ period, target, authority });
  },
  captureP36NativePreGatherBoundary() {
    const period = window.__EA_RUNNER__?.periods?.() ?? null;
    if (this.p36ParityCapturePeriods?.includes(period)) {
      const pageCapture =
        window[Symbol.for("evolve-automation.page-capture")];
      const game = pageCapture?.rootState.readRoot();
      const species = game?.race?.species;
      const state = {
        population: game?.resource?.[species]?.amount ?? null,
        populationCapacity: game?.resource?.[species]?.max ?? null,
        resources: Object.fromEntries(
          ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
            id,
            game?.resource?.[id]
              ? {
                  amount: game.resource[id].amount ?? null,
                  max: game.resource[id].max ?? null,
                  diff: game.resource[id].diff ?? null,
                }
              : null,
          ]),
        ),
        buildings: Object.fromEntries(
          Object.entries(game?.city ?? {})
            .filter(([, value]) => Number(value?.count ?? 0) > 0)
            .map(([id, value]) => [id, value.count]),
        ),
        jobs: Object.fromEntries(
          Object.entries(game?.civic ?? {})
            .filter(([, value]) => Number(value?.workers ?? 0) > 0)
            .map(([id, value]) => [id, value.workers]),
        ),
        tech: game?.tech ?? {},
        days: game?.stats?.days ?? null,
        starved: game?.stats?.starved ?? null,
        deaths: game?.stats?.died ?? null,
      };
      const diagnostics = window.__EA_RUNNER__?.diagnostics?.() ?? {};
      const nativeCalls = (diagnostics.nativeInvocations ?? [])
        .filter(
          (entry) =>
            /^civ-/.test(entry.elementId ?? "") ||
            (entry.method === "action" &&
              (/^(undefined-food|city-lumber|undefined-stone)$/.test(
                entry.elementId ?? "",
              ) || /^(tech-|city-)/.test(entry.elementId ?? ""))),
        )
        .map(({ period: callPeriod, elementId, method }) => ({
          period: callPeriod,
          elementId,
          method,
        }));
      this.p36PreGatherBoundaryCaptures.push({
        period,
        state,
        controlUsage: diagnostics.controlUsage ?? {},
        randomCalls: diagnostics.randomCalls ?? null,
        rngState: diagnostics.rngState ?? null,
        nativeCalls,
      });
    }
  },
};`,
  },
  plugins: p40TraceEnabled
    ? [
        metricPlugin,
        ...(p51Mode ? [createP51ConstructionJobsHandoffPlugin(p52Mode)] : []),
        ...(p42Mode ? [createP42ConstructionPriorityTracePlugin()] : []),
        createP40ConstructionTracePlugin(),
      ]
    : [
        metricPlugin,
        ...(p51Mode ? [createP51ConstructionJobsHandoffPlugin(p52Mode)] : []),
      ],
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
    "globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__": String(p53Mode),
    "globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__": String(p54Mode),
  },
  minifySyntax: true,
  treeShaking: true,
});
const policyBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["experiments/p36-productive-resource-bootstrap-policy.mjs"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "__EA_P36_TEST_POLICY__",
  platform: "browser",
  target: ["esnext"],
  minifySyntax: true,
});
const policyBundleSource = Buffer.from(
  policyBundle.outputFiles[0].contents,
).toString("utf8");
const p38PolicyBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["experiments/p38-quarry-production-validation-policy.mjs"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "__EA_P38_TEST_POLICY__",
  platform: "browser",
  target: ["esnext"],
  minifySyntax: true,
});
const p38PolicyBundleSource = Buffer.from(
  p38PolicyBundle.outputFiles[0].contents,
).toString("utf8");
const bundleBytes = Buffer.concat([
  Buffer.from(mainBundle.outputFiles[0].contents),
  Buffer.from("\n;\n"),
  Buffer.from(policyBundle.outputFiles[0].contents),
  Buffer.from("\n;\n"),
  Buffer.from(p38PolicyBundle.outputFiles[0].contents),
]);
const runtimeBundleSha256 = hash(mainBundle.outputFiles[0].contents);
const policyBundleSha256 = hash(policyBundle.outputFiles[0].contents);
const p38PolicyBundleSha256 = hash(p38PolicyBundle.outputFiles[0].contents);
await writeFile(bundlePath, bundleBytes);
execFileSync(process.execPath, ["--check", bundlePath]);
const bundleSha256 = hash(bundleBytes);
if (process.argv.includes("--bundle-only")) {
  console.log(
    JSON.stringify({
      bundlePath,
      bundleSha256,
      runtimeBundleSha256,
      policyBundleSha256,
      p38PolicyBundleSha256,
    }),
  );
  process.exit(0);
}

const runner = await createChromiumRunner({ game: gamePath });

async function capture(session, period, arm) {
  const [state, diagnostics, native] = await Promise.all([
    session.readState(),
    session.diagnostics(),
    session.evaluate(
      (
        period,
        p42Mode,
        p43Mode,
        p51Mode,
        p52Mode,
        p53Mode,
        p54Mode,
        quarryTarget,
      ) => {
        const hooks = window.__EA_TEST_HOOKS__;
        const p51State = hooks?.p51HandoffState ?? null;
        const publishedReceipt = p51State?.events?.find(
          (event) => event.kind === "receipt-published",
        )?.receipt;
        const sourceMatches =
          publishedReceipt?.origin?.identityProvenance?.sourceIdentity !==
            undefined &&
          publishedReceipt.origin.identityProvenance.sourceIdentity ===
            hooks?.p52JobsIdentitySample?.jobsIdentity?.sourceIdentity;
        const sanitizedP51State =
          p52Mode && p51State
            ? {
                ...p51State,
                events: p51State.events.map((event) => {
                  if (
                    event.kind !== "receipt-published" ||
                    !event.receipt?.origin?.identityProvenance
                  )
                    return event;
                  const { sourceIdentity: _sourceIdentity, ...provenance } =
                    event.receipt.origin.identityProvenance;
                  return {
                    ...event,
                    receipt: {
                      ...event.receipt,
                      origin: {
                        ...event.receipt.origin,
                        identityProvenance: provenance,
                      },
                    },
                  };
                }),
              }
            : p51State;
        const pageCapture =
          window[Symbol.for("evolve-automation.page-capture")];
        const rootObservationCountAtCapture = p54Mode
          ? (pageCapture?.rootState.readRootObservationCountForTest?.() ?? null)
          : null;
        const global = pageCapture?.rootState.readRoot();
        const jobsSnapshot = p51Mode
          ? null
          : (hooks?.p38JobsApi?.snapshot?.() ?? null);
        const species = global?.race?.species;
        const ledger =
          p43Mode && period < 720
            ? undefined
            : pageCapture?.mechanics?.readProductionBreakdown?.();
        const sumUnits = (values) =>
          Object.values(values ?? {}).reduce((sum, value) => {
            if (typeof value === "number" && Number.isFinite(value))
              return sum + value;
            if (typeof value === "string" && /v$/.test(value)) {
              const amount = Number.parseFloat(value);
              return Number.isFinite(amount) ? sum + amount : sum;
            }
            return sum;
          }, 0);
        const capturedFoodConsumption = ledger
          ? Math.abs(sumUnits(ledger.consumption?.Food))
          : null;
        const capturedFoodDiff = global?.resource?.Food?.diff ?? null;
        return {
          population: global?.resource?.[species]?.amount ?? null,
          populationCapacity: global?.resource?.[species]?.max ?? null,
          jobs: Object.fromEntries(
            Object.entries(global?.civic ?? {})
              .filter(([, value]) => Number(value?.workers ?? 0) > 0)
              .map(([id, value]) => [id, value.workers]),
          ),
          buildings: Object.fromEntries(
            Object.entries(global?.city ?? {})
              .filter(([, value]) => Number(value?.count ?? 0) > 0)
              .map(([id, value]) => [id, value.count]),
          ),
          resources: Object.fromEntries(
            ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => {
              const resource = global?.resource?.[id];
              return [
                id,
                resource
                  ? {
                      amount: resource.amount ?? null,
                      max: resource.max ?? null,
                      diff: resource.diff ?? null,
                    }
                  : null,
              ];
            }),
          ),
          foodProduction:
            p43Mode && capturedFoodConsumption !== null
              ? Number(capturedFoodDiff) + capturedFoodConsumption
              : ledger
                ? sumUnits(ledger.production?.Food)
                : null,
          foodConsumption: capturedFoodConsumption,
          foodLedger: p43Mode ? (ledger ?? null) : undefined,
          unassignedWorkers: p43Mode
            ? (global?.civic?.unemployed?.workers ?? null)
            : undefined,
          servantJobs: p43Mode
            ? (global?.race?.servants?.jobs ?? {})
            : undefined,
          lumberProduction: sumUnits(ledger?.production?.Lumber),
          stoneProduction: sumUnits(ledger?.production?.Stone),
          days: global?.stats?.days ?? null,
          starved: global?.stats?.starved ?? null,
          deaths: global?.stats?.died ?? null,
          research: global?.tech ?? {},
          jobsSnapshot,
          jobsInput: jobsSnapshot?.input ?? null,
          jobsTraceCount: hooks?.p38JobTrace?.length ?? 0,
          targets: hooks?.constructionSavingTargetObservations ?? [],
          bootstrapEvents: hooks?.civilizationBootstrapEvents ?? [],
          handoffEvents: hooks?.civilizationHandoffEvents ?? [],
          p36: {
            policyEvents: hooks?.p36PolicyEvents ?? [],
            eligibility: hooks?.p36Eligibility ?? [],
            firstAuthorization: hooks?.p36FirstAuthorization ?? null,
            downstreamChanges: hooks?.p36DownstreamChanges ?? [],
            shadowSummary: hooks?.p32LiveAuthoritySummary ?? null,
            shadowRecords: hooks?.p32LiveAuthority ?? [],
            metrics: hooks?.p36Metrics ?? null,
            totalPolicyClicks: hooks?.p36Policy?.snapshot?.().totalClicks ?? 0,
            policySnapshot: hooks?.p36Policy?.snapshot?.() ?? null,
          },
          p38: {
            policyEventCount: hooks?.p38PolicyEvents?.length ?? 0,
            policySnapshot: hooks?.p38Policy?.snapshot?.() ?? null,
            metrics: hooks?.p38Metrics ?? null,
          },
          p51: p51Mode
            ? {
                state: sanitizedP51State,
                request: hooks?.p51ConstructionRequest ?? null,
                requestQualification: hooks?.p51RequestQualification ?? null,
                jobsAdmissions: hooks?.allocationDiagnosticAdmissions ?? [],
                constructionPublicationAuthority:
                  p52Mode && hooks?.constructionPublicationAuthority
                    ? (({ identitySource: _identitySource, ...authority }) =>
                        authority)(hooks.constructionPublicationAuthority)
                    : (hooks?.constructionPublicationAuthority ?? null),
                ...(p52Mode
                  ? {
                      p52: {
                        constructionIdentitySample:
                          hooks?.p52ConstructionIdentitySample
                            ? (({
                                identitySource: _identitySource,
                                ...sample
                              }) => ({
                                ...sample,
                                sourceInstance:
                                  "shared-runtime-progression-reader",
                              }))(hooks.p52ConstructionIdentitySample)
                            : null,
                        jobsIdentitySample: hooks?.p52JobsIdentitySample
                          ? {
                              ...hooks.p52JobsIdentitySample,
                              jobsIdentity: hooks.p52JobsIdentitySample
                                .jobsIdentity
                                ? (({
                                    sourceIdentity: _sourceIdentity,
                                    ...identity
                                  }) => identity)(
                                    hooks.p52JobsIdentitySample.jobsIdentity,
                                  )
                                : null,
                              sameRuntimeProgressionSource: sourceMatches,
                            }
                          : null,
                        classification: hooks?.p52HandoffClassification ?? null,
                        dormantAdmissionCallbacks:
                          hooks?.p52DormantAdmissionCallbacks ?? 0,
                        constructionIdentityError:
                          hooks?.p52ConstructionIdentityError ?? null,
                        jobsIdentityError: hooks?.p52JobsIdentityError ?? null,
                      },
                    }
                  : {}),
                constructionPublicationTarget:
                  hooks?.constructionPublicationTarget ?? null,
                constructionOwnerContext: hooks?.p40OwnerContext ?? null,
                quarryOrder: hooks?.p42QuarryOrder ?? null,
                p42OwnerCycleApplied: hooks?.p42OwnerCycleApplied === true,
                p42Released: hooks?.p42Released === true,
                p36GatherActions: (hooks?.p36PolicyEvents ?? []).filter(
                  (event) => event.type === "gather-click",
                ).length,
                p38GatherActions: (hooks?.p38PolicyEvents ?? []).filter(
                  (event) => event.type === "gather-click",
                ).length,
                p38Authorization: hooks?.p42P38Authorization ?? null,
                p40QuarryPurchase:
                  (hooks?.p40TraceEvents ?? []).findLast(
                    (event) =>
                      event.period === period &&
                      event.type === "purchase-postcondition" &&
                      event.input?.candidateKey === quarryTarget,
                  ) ?? null,
                p40ConstructionEvents: (hooks?.p40TraceEvents ?? []).filter(
                  (event) =>
                    event.period === period &&
                    /rock_quarry|basic_housing/.test(
                      String(event.input?.candidateKey ?? ""),
                    ),
                ),
                p42Events: hooks?.p42Trace ?? [],
                instrumentationMetrics: {
                  p40ResourceReadCount: hooks?.p40ResourceReadCount ?? 0,
                  p40DiagnosticClockReads: hooks?.p40DiagnosticClockReads ?? 0,
                  p41ConflictReaderCalls: hooks?.p41ConflictReaderCalls ?? 0,
                  p41ConflictReaderElapsedMs:
                    hooks?.p41ConflictReaderElapsedMs ?? 0,
                  p41DiagnosticClockReads: hooks?.p41DiagnosticClockReads ?? 0,
                  p42ResourceAmountReads: hooks?.p42ResourceAmountReads ?? 0,
                  p42OwnerAuthorityReads: hooks?.p42OwnerAuthorityReads ?? 0,
                  p42AppliedReservationReads:
                    hooks?.p42AppliedReservationReads ?? 0,
                  p42DiagnosticClockReads: hooks?.p42DiagnosticClockReads ?? 0,
                },
                ...(p53Mode
                  ? {
                      p53: {
                        request: hooks?.p53ConstructionRequest ?? null,
                        ownerDecision: hooks?.p53OwnerDecision ?? null,
                        ownerDecisionEvents:
                          hooks?.p53OwnerDecisionEvents ?? [],
                        metrics:
                          p54Mode && hooks?.p53Metrics
                            ? {
                                ...hooks.p53Metrics,
                                contextRootReads:
                                  hooks?.p54Metrics?.contextRootObservations ??
                                  null,
                              }
                            : (hooks?.p53Metrics ?? null),
                        eventBytes: hooks?.p53EventBytes ?? 0,
                        eventOverflow: hooks?.p53EventOverflow ?? 0,
                      },
                    }
                  : {}),
                ...(p54Mode
                  ? {
                      p54: {
                        metrics: hooks?.p54Metrics
                          ? JSON.parse(JSON.stringify(hooks.p54Metrics))
                          : null,
                        rootObservationCountAtCapture,
                        rootCounterCallsite:
                          "GameRootStateSource.readRoot actual-call counter",
                        metricsEvidenceBytes:
                          hooks?.p54Metrics === undefined
                            ? 0
                            : JSON.stringify(hooks.p54Metrics).length * 2,
                        ownerDecision: hooks?.p53OwnerDecision ?? null,
                        ownerDecisionEvents:
                          hooks?.p53OwnerDecisionEvents ?? [],
                        receiptEvents: hooks?.p51HandoffState?.events ?? [],
                      },
                    }
                  : {}),
              }
            : undefined,
          savingTargetObservation: p42Mode
            ? ((hooks?.constructionSavingTargetObservations ?? [])
                .filter((entry) => entry.period === period)
                .at(-1) ?? null)
            : undefined,
        };
      },
      period,
      p42Mode,
      p43Mode,
      p51Mode,
      p52Mode,
      p53Mode,
      p54Mode,
      P42_EXPECTED.quarryTarget,
    ),
  ]);
  const species = state.race?.species;
  const canonicalState = {
    population: state.resource?.[species]?.amount ?? null,
    populationCapacity: state.resource?.[species]?.max ?? null,
    resources: Object.fromEntries(
      ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
        id,
        state.resource?.[id]
          ? {
              amount: state.resource[id].amount ?? null,
              max: state.resource[id].max ?? null,
              diff: state.resource[id].diff ?? null,
            }
          : null,
      ]),
    ),
    buildings: Object.fromEntries(
      Object.entries(state.city ?? {})
        .filter(([, value]) => Number(value?.count ?? 0) > 0)
        .map(([id, value]) => [id, value.count]),
    ),
    jobs: Object.fromEntries(
      Object.entries(state.civic ?? {})
        .filter(([, value]) => Number(value?.workers ?? 0) > 0)
        .map(([id, value]) => [id, value.workers]),
    ),
    tech: state.tech ?? {},
    days: state.stats?.days ?? null,
    starved: state.stats?.starved ?? null,
    deaths: state.stats?.died ?? null,
  };
  const relevantNativeCalls = (diagnostics.nativeInvocations ?? [])
    .filter(
      (entry) =>
        /^civ-/.test(entry.elementId ?? "") ||
        (entry.method === "action" &&
          (/^(undefined-food|city-lumber|undefined-stone)$/.test(
            entry.elementId ?? "",
          ) ||
            /^(tech-|city-)/.test(entry.elementId ?? ""))),
    )
    .map(({ period: callPeriod, elementId, method }) => ({
      period: callPeriod,
      elementId,
      method,
    }));
  return {
    period,
    saveSha256: hash(await session.exportSave()),
    state: canonicalState,
    production: {
      foodOutput: native.foodProduction,
      foodConsumption: native.foodConsumption,
      lumberOutput: native.lumberProduction,
      stoneOutput: native.stoneProduction,
    },
    controlUsage: diagnostics.controlUsage ?? {},
    nativeCallsSha256: hash(JSON.stringify(relevantNativeCalls)),
    nativeCallsCount: relevantNativeCalls.length,
    ...(p43Mode ? {} : { nativeCalls: relevantNativeCalls }),
    ...(p54Mode
      ? {
          p54: {
            ...native.p51.p54,
            nativeInvocationCount: (diagnostics.nativeInvocations ?? []).length,
            nativeInvocationSequenceSha256: hash(
              JSON.stringify(diagnostics.nativeInvocations ?? []),
            ),
            nativeInvocationPeriod: (
              diagnostics.nativeInvocations ?? []
            ).filter((entry) => entry.period === period),
            nativeInvocationPeriodCount: (
              diagnostics.nativeInvocations ?? []
            ).filter((entry) => entry.period === period).length,
            nativeInvocationSequence:
              period === 720 || period === 719
                ? (diagnostics.nativeInvocations ?? [])
                : undefined,
            nativePriceProbeCount: (diagnostics.nativeInvocations ?? []).filter(
              (entry) =>
                entry.elementId === "buildQueue" && entry.method === "setData",
            ).length,
            periodNativePriceProbeCount: (
              diagnostics.nativeInvocations ?? []
            ).filter(
              (entry) =>
                entry.period === period &&
                entry.elementId === "buildQueue" &&
                entry.method === "setData",
            ).length,
          },
        }
      : {}),
    randomCalls: diagnostics.randomCalls,
    rngState: diagnostics.rngState,
    native: {
      foodProduction: native.foodProduction,
      foodConsumption: native.foodConsumption,
      lumberProduction: native.lumberProduction,
      stoneProduction: native.stoneProduction,
      ...(p43Mode
        ? {
            foodLedger: native.foodLedger ?? null,
            unassignedWorkers: native.unassignedWorkers ?? null,
            servantJobs: native.servantJobs ?? {},
          }
        : {}),
      p36: {
        policyEventCount: native.p36.policyEvents.length,
        eligibilityCount: native.p36.eligibility.length,
        firstAuthorization: native.p36.firstAuthorization,
        downstreamChangeCount: native.p36.downstreamChanges.length,
        shadowSummary: native.p36.shadowSummary,
        metrics: native.p36.metrics,
        totalPolicyClicks: native.p36.totalPolicyClicks,
        policySnapshot: native.p36.policySnapshot,
      },
      jobsInput: native.jobsInput,
      jobsSnapshot: native.jobsSnapshot,
      jobsTraceCount: native.jobsTraceCount,
      p38: native.p38,
      jobsInput: native.jobsInput,
      ...(p51Mode ? { p51: native.p51 } : {}),
      ...(p42Mode
        ? { savingTargetObservation: native.savingTargetObservation ?? null }
        : {}),
    },
  };
}

async function replay(
  arm,
  extraCheckpoints = [],
  { manualTransferPeriod = null } = {},
) {
  const session = await runner.openSession({
    bundle: bundlePath,
    save: parseSave(fixtureText),
    settings,
    seed,
    epoch,
    perf: true,
    forwardPerfSummary: true,
    nativeTrace: true,
    ...(p51Mode
      ? {
          captureAllocationDiagnosticAdmission: true,
          initialTestInterventions: {
            allocationDiagnosticRequest: p51InitialJobsRequest,
          },
        }
      : {}),
  });
  try {
    await session.evaluate(
      (configuration) => {
        const hooks = window.__EA_TEST_HOOKS__;
        hooks.civilizationBootstrapEvents = [];
        hooks.civilizationHandoffEvents = [];
        hooks.p36Eligibility = [];
        hooks.p36PolicyEvents = [];
        hooks.p36DownstreamChanges = [];
        hooks.p36FirstAuthorization = null;
        hooks.p36PreGatherBoundaryCaptures = [];
        hooks.p38PolicyEvents = [];
        hooks.p38JobTrace = [];
        if (configuration.p51Mode) {
          hooks.p51Mode = true;
          hooks.p52Mode = configuration.p52Mode === true;
          hooks.p51Arm = configuration.arm;
          hooks.p51AdmissionEnabled = false;
          hooks.p51ConstructionRequest = null;
          hooks.p51RequestQualification = null;
          hooks.p51HandoffState = null;
          hooks.p52ConstructionIdentitySampleActive = false;
          hooks.p52ConstructionIdentityNativeRootReads = 0;
          hooks.p52JobsIdentitySampleActive = false;
          hooks.p52IdentityNativeRootReads = 0;
          hooks.p52ConstructionIdentitySample = null;
          hooks.p52JobsIdentitySample = null;
          hooks.p52HandoffClassification = null;
          hooks.p52DormantAdmissionCallbacks = 0;
          hooks.p52NativeInvocationStartIndex = null;
          hooks.p52ConstructionIdentityError = null;
          hooks.p52JobsIdentityError = null;
        }
        if (configuration.p53Mode) {
          hooks.p53Mode = true;
          hooks.p53ConstructionRequest = configuration.p53Request;
          hooks.p53OwnerDecision = null;
          hooks.p53OwnerDecisionEvents = [];
          hooks.p53EventBytes = 0;
          hooks.p53EventOverflow = 0;
          hooks.p53Metrics = {
            ownerDecisionEvaluations: 0,
            savingRevisionConstructions: 0,
            requestSourceReads: 0,
            contextIdentitySamples: 0,
            contextRootReads: 0,
            reservationEvidenceReads: 0,
            nativeControlAuthorityReads: 0,
            nativePriceReads: 0,
            additionalResourceOrCatalogReads: 0,
            totalOwnerDecisionEvaluationMs: 0,
            maximumOwnerDecisionEvaluationMs: 0,
            maximumSynchronousCallbackMs: 0,
          };
          hooks.p53RecordOwnerDecisionForTest = (
            decision,
            candidateKey,
            evaluationMs,
          ) => {
            const startedAt = performance.now();
            const event = {
              period: hooks.p40CurrentPeriod ?? null,
              candidateKey: candidateKey ?? null,
              decision,
            };
            const bytes = JSON.stringify(event).length * 2;
            if (
              hooks.p53OwnerDecisionEvents.length >= 16 ||
              hooks.p53EventBytes + bytes > 16_384
            ) {
              hooks.p53EventOverflow++;
            } else {
              hooks.p53OwnerDecisionEvents.push(event);
              hooks.p53EventBytes += bytes;
            }
            hooks.p53OwnerDecision = { decision, candidateKey };
            hooks.p53Metrics.ownerDecisionEvaluations++;
            if (Number.isFinite(evaluationMs)) {
              hooks.p53Metrics.totalOwnerDecisionEvaluationMs += evaluationMs;
              hooks.p53Metrics.maximumOwnerDecisionEvaluationMs = Math.max(
                hooks.p53Metrics.maximumOwnerDecisionEvaluationMs,
                evaluationMs,
              );
            }
            if (decision?.status === "accepted-for-owner-decision")
              hooks.p53Metrics.savingRevisionConstructions++;
            hooks.p53Metrics.maximumSynchronousCallbackMs = Math.max(
              hooks.p53Metrics.maximumSynchronousCallbackMs,
              performance.now() - startedAt,
            );
          };
          hooks.p53RecordOperationForTest = (operation) => {
            const startedAt = performance.now();
            if (operation === "request-source-read") {
              hooks.p53Metrics.requestSourceReads++;
            } else if (operation === "context-identity-sample") {
              hooks.p53Metrics.contextIdentitySamples++;
              hooks.p53Metrics.contextRootReads += 2;
            } else if (operation === "reservation-evidence-read") {
              hooks.p53Metrics.reservationEvidenceReads++;
            } else if (operation === "native-control-authority-read") {
              hooks.p53Metrics.nativeControlAuthorityReads++;
              hooks.p53Metrics.nativePriceReads++;
            }
            hooks.p53Metrics.maximumSynchronousCallbackMs = Math.max(
              hooks.p53Metrics.maximumSynchronousCallbackMs,
              performance.now() - startedAt,
            );
          };
        }
        if (configuration.p54Mode) {
          hooks.p54EventFedActivation = configuration.p54EventFed === true;
          hooks.p54Metrics = {
            eventFedActivation: configuration.p54EventFed === true,
            runtimeEventFedActivation: null,
            requestLifecycleEvents: 0,
            requestCancellationEvents: 0,
            requestReplacementOrInstallEvents: 0,
            requestConsumedEvents: 0,
            requestExpiredEvents: 0,
            requestInvalidatedEvents: 0,
            requestPresenceChecks: 0,
            localPendingRequestChecks: 0,
            constructionAdapterEventFedAtInitialization: null,
            localPendingRequestCheckTotalMs: 0,
            localPendingRequestCheckMaximumMs: 0,
            contextIdentitySamples: 0,
            contextRootObservations: 0,
            reservationEvidenceSamples: 0,
            reservationRootObservations: 0,
            nativeControlAuthorityReads: 0,
            nativeControlAuthorityRootObservations: 0,
            nativePriceProbeCalls: 0,
            constructionWorkCycles: 0,
            cumulativeSynchronousCostMs: 0,
            maximumMeasuredOperationMs: 0,
            maximumEvidenceCallbackMs: 0,
            eventFeedEmissionMs: 0,
            eventFeedEmissionMaximumMs: 0,
            pendingRequestReferences: 0,
            maximumPendingRequestReferences: 0,
            ownerCycleRequestReferences: 0,
            maximumOwnerCycleRequestReferences: 0,
            synchronousCostByOperation: {},
            synchronousCostByPhase: {
              dormant: 0,
              pending: 0,
              active: 0,
              consumed: 0,
            },
            operationCountByPhase: {
              dormant: {},
              pending: {},
              active: {},
              consumed: {},
            },
            acceptedOwnerDecisions: 0,
          };
          const sink = hooks.p54ConstructionRequestEventSinkForTest;
          if (typeof sink === "function")
            Reflect.apply(sink, hooks, [
              {
                type: "configure",
                experiment: true,
                eventFed: configuration.p54EventFed === true,
                request: null,
              },
            ]);
          hooks.p54PublishConstructionRequestForTest = (request) => {
            const startedAt = performance.now();
            hooks.p53ConstructionRequest = request ?? null;
            const eventSink = hooks.p54ConstructionRequestEventSinkForTest;
            if (typeof eventSink === "function")
              Reflect.apply(eventSink, hooks, [request ?? null]);
            const elapsedMs = Math.max(0, performance.now() - startedAt);
            hooks.p54Metrics.eventFeedEmissionMs += elapsedMs;
            hooks.p54Metrics.eventFeedEmissionMaximumMs = Math.max(
              hooks.p54Metrics.eventFeedEmissionMaximumMs,
              elapsedMs,
            );
            return elapsedMs;
          };
        }
        if (configuration.p40Trace) {
          hooks.p40TraceEnabled = true;
          hooks.p40TraceEvents = [];
          hooks.p40TraceSynchronousMs = 0;
          hooks.p40ContextSynchronousMs = 0;
          hooks.p40GuardSynchronousMs = 0;
          hooks.p40ResourceReadMs = 0;
          hooks.p40ResourceReadCount = 0;
          hooks.p40GuardCalls = 0;
          hooks.p40DiagnosticClockReads = 0;
          hooks.p40OwnerDecisionCount = 0;
          hooks.p41ConflictReaderCalls = 0;
          hooks.p41ConflictReaderElapsedMs = 0;
          hooks.p41DiagnosticClockReads = 0;
          hooks.p40TraceOverflow = 0;
          hooks.p40TraceClockUnavailable = false;
          hooks.p40CurrentPeriod = null;
          hooks.p40OwnerContext = null;
          hooks.p40CurrentBuildCandidate = null;
        }
        if (configuration.p42Mode) {
          hooks.p42Mode = true;
          hooks.p42Enabled = configuration.p42Enabled;
          hooks.p42Arm = configuration.p42Arm ?? configuration.arm;
          hooks.p42Identity = configuration.p42Identity;
          hooks.p42P38Authorization = configuration.p42P38Authorization;
          hooks.p42ExpectedAuthorizationHistory =
            configuration.p42ExpectedAuthorizationHistory;
          hooks.p42PreSubstitutionBoundary = null;
          hooks.p42BoundaryRecorded = false;
          hooks.p42QuarryOrder = null;
          hooks.p42BuildConflictReadActive = false;
          hooks.p42OwnerCycleApplied = false;
          hooks.p42AppliedReservationReads = 0;
          hooks.p42Released = false;
          hooks.p42Trace = [];
          hooks.p42TraceBytes = 0;
          hooks.p42TraceOverflow = 0;
          hooks.p42ResourceAmountReads = 0;
          hooks.p42OwnerAuthorityReads = 0;
          hooks.p42DiagnosticClockReads = 0;
          hooks.p42SynchronousMs = 0;
          hooks.p42TraceElapsedMs = 0;
          hooks.p42AuthorizationHistoryMatched = () => {
            const normalize = (events) =>
              events.map((event) => {
                const { arm: _arm, ...rest } = event;
                return rest;
              });
            const p36Events = hooks.p36PolicyEvents.filter(
              (event) => Number(event.period) <= 688,
            );
            const p38Events = hooks.p38PolicyEvents.filter(
              (event) => Number(event.period) <= 720,
            );
            const expected = hooks.p42ExpectedAuthorizationHistory;
            const p36Stop = p36Events.find(
              (event) =>
                event.type === "stopped" &&
                event.period === 688 &&
                event.reason === "shortage-exceeds-remaining-budget",
            );
            const p36GatherActions = p36Events.filter(
              (event) => event.type === "gather-click",
            ).length;
            const p38LatestPeriod = Math.max(
              -1,
              ...p38Events.map((event) => Number(event.period)),
            );
            const expectedP38Prefix = expected.p38.filter(
              (event) => Number(event.period) <= p38LatestPeriod,
            );
            hooks.p42P36GatherActions = p36GatherActions;
            return (
              p36Stop !== undefined &&
              p36GatherActions === 139 &&
              JSON.stringify(normalize(p36Events)) ===
                JSON.stringify(expected.p36) &&
              JSON.stringify(normalize(p38Events)) ===
                JSON.stringify(expectedP38Prefix) &&
              hooks.p42P38Authorization?.id ===
                "p38-test-only-quarry-lumber-gather-18" &&
              hooks.p42P38Authorization?.additionalGatherLimit === 18
            );
          };
        }
        if (configuration.p43Mode) {
          hooks.p43Mode = false;
          hooks.p43Arm = configuration.arm;
          hooks.p43Enabled = configuration.p43Enabled === true;
          hooks.p43CommitmentMode = configuration.p43CommitmentMode;
          hooks.pinnedGameRevision = configuration.pinnedGameRevision;
          hooks.p43Events = [];
          hooks.p43ExecutionFailures = [];
          hooks.p43ExecutionSamples = [];
          hooks.p43EventBytes = 0;
          hooks.p43EventOverflow = 0;
          hooks.p43Boundary = null;
          hooks.p43AuthorizedDecision = null;
          hooks.p43DecisionSequence = 0;
          hooks.p43LastEventKey = null;
          hooks.p43Metrics = {
            planCalls: 0,
            foodLedgerReads: 0,
            controlGenerationReads: 0,
            foodObservationMs: 0,
            purePolicyMs: 0,
            totalBoundaryMs: 0,
            interventions: 0,
            overriddenPlans: 0,
            ordinaryPlanConflicts: 0,
            unavailableObservations: 0,
          };
        }
        hooks.observeJobsTrace = (event) => {
          hooks.p38JobTrace.push(
            configuration.p42Mode
              ? { period: window.__EA_RUNNER__?.periods?.() ?? null, ...event }
              : event,
          );
        };
        hooks.observeJobsAutomation = (phase, outcome, details) => {
          if (configuration.p43Mode) {
            const period = currentPeriod();
            if (
              hooks.p43Mode === true &&
              period >= 720 &&
              hooks.p43ExecutionSamples.length < 48
            ) {
              const pageCapture =
                window[Symbol.for("evolve-automation.page-capture")];
              const root = pageCapture?.rootState.readRoot();
              hooks.p43ExecutionSamples.push({
                period,
                phase,
                status: outcome?.status ?? null,
                failure: outcome?.failure ?? null,
                reason: outcome?.reason ?? null,
                p43Mode: hooks.p43Mode === true,
                apiAvailable:
                  typeof hooks.p38JobsApi?.readPeriod === "function",
                jobs: Object.fromEntries(
                  Object.entries(root?.civic ?? {})
                    .filter(([, value]) => Number(value?.workers ?? 0) > 0)
                    .map(([id, value]) => [id, value.workers]),
                ),
                food: {
                  amount: root?.resource?.Food?.amount ?? null,
                  diff: root?.resource?.Food?.diff ?? null,
                },
                starved: root?.stats?.starved ?? null,
                deaths: root?.stats?.died ?? null,
              });
            }
            if (
              outcome?.status !== "succeeded" &&
              outcome?.status !== "deferred" &&
              hooks.p43ExecutionFailures.length < 64
            )
              hooks.p43ExecutionFailures.push({
                period: currentPeriod(),
                phase,
                outcome: {
                  status: outcome?.status ?? null,
                  reason: outcome?.reason ?? null,
                  failure: outcome?.failure ?? null,
                },
              });
          }
          hooks.p38JobTrace.push({
            period: currentPeriod(),
            phase,
            outcome,
            details,
          });
        };
        hooks.p38Metrics = {
          nativeJobOperations: 0,
          nativeJobControlElapsedMs: 0,
          ordinaryJobsExecutions: 0,
          ordinaryJobsExecutionElapsedMs: 0,
        };
        hooks.p36ParityCapturePeriods =
          configuration.parityCapturePeriods ?? [];
        const gatherIntervention = {
          civilizationBootstrap: {
            authorized: true,
            authorizationId: "p19-human-candidate-1",
          },
          constructionHandoffEnabled: true,
          civilizationBootstrapObserver(event) {
            hooks.civilizationBootstrapEvents.push({
              period: window.__EA_RUNNER__?.periods?.() ?? null,
              ...event,
            });
          },
          civilizationHandoffObserver(event) {
            hooks.civilizationHandoffEvents.push({
              period: window.__EA_RUNNER__?.periods?.() ?? null,
              ...event,
            });
          },
        };
        hooks.gatherIntervention = gatherIntervention;
        if (configuration.shadow)
          hooks.constructionAllocationShadowBudgets = {
            perCycle: 5,
            perTargetEpisode: 80,
            totalEpisode: 140,
          };
        const currentPeriod = () => window.__EA_RUNNER__?.periods?.() ?? null;
        const nativeTargetReady = (expectedTarget) => {
          const published = hooks.constructionPublicationTarget;
          if (published?.name !== expectedTarget) return false;
          const root =
            window[
              Symbol.for("evolve-automation.page-capture")
            ]?.rootState.readRoot();
          return Object.entries(published.cost ?? {})
            .filter(([resourceId]) => !["Lumber", "Stone"].includes(resourceId))
            .every(
              ([resourceId, amount]) =>
                Number(root?.resource?.[resourceId]?.amount ?? 0) >=
                Number(amount),
            );
        };
        if (!configuration.policy) {
          // Read-only exact-boundary probe. The native Construction owner runs
          // its regular complete authority checks, then this callback records
          // state and returns no allocation, so no Gather action is authorized.
          gatherIntervention.constructionAllocation = {
            get enabled() {
              return (
                hooks.p36ParityCapturePeriods.includes(currentPeriod()) &&
                nativeTargetReady("city-shed")
              );
            },
            authorize() {
              hooks.captureP36NativePreGatherBoundary();
              return undefined;
            },
          };
          return;
        }
        const p36PolicyModule = new Function(
          `${configuration.policySource}\nreturn __EA_P36_TEST_POLICY__;`,
        )();

        const snapshotNative = () => {
          const pageCapture =
            window[Symbol.for("evolve-automation.page-capture")];
          const game = pageCapture?.rootState.readRoot();
          const species = game?.race?.species;
          const ledger = pageCapture?.mechanics?.readProductionBreakdown?.();
          const sumUnits = (values) =>
            Object.values(values ?? {}).reduce((sum, value) => {
              if (typeof value === "number" && Number.isFinite(value))
                return sum + value;
              if (typeof value === "string" && /v$/.test(value)) {
                const amount = Number.parseFloat(value);
                return Number.isFinite(amount) ? sum + amount : sum;
              }
              return sum;
            }, 0);
          const jobs = Object.fromEntries(
            Object.entries(game?.civic ?? {})
              .filter(([, value]) => Number(value?.workers ?? 0) > 0)
              .map(([id, value]) => [id, value.workers]),
          );
          const buildings = Object.fromEntries(
            Object.entries(game?.city ?? {})
              .filter(([, value]) => Number(value?.count ?? 0) > 0)
              .map(([id, value]) => [id, value.count]),
          );
          const resources = Object.fromEntries(
            ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
              id,
              game?.resource?.[id]
                ? {
                    amount: game.resource[id].amount ?? null,
                    max: game.resource[id].max ?? null,
                    diff: game.resource[id].diff ?? null,
                  }
                : null,
            ]),
          );
          return {
            population: game?.resource?.[species]?.amount ?? null,
            populationCapacity: game?.resource?.[species]?.max ?? null,
            jobs,
            buildings,
            resources,
            foodProduction: ledger ? sumUnits(ledger.production?.Food) : null,
            foodConsumption: ledger
              ? Math.abs(sumUnits(ledger.consumption?.Food))
              : null,
            lumberProduction: sumUnits(ledger?.production?.Lumber),
            stoneProduction: sumUnits(ledger?.production?.Stone),
            starved: game?.stats?.starved ?? null,
            deaths: game?.stats?.died ?? null,
          };
        };
        const snapshotStocks = () => {
          const game =
            window[
              Symbol.for("evolve-automation.page-capture")
            ]?.rootState.readRoot();
          return Object.fromEntries(
            ["Lumber", "Stone"].map((id) => [
              id,
              game?.resource?.[id]?.amount ?? null,
            ]),
          );
        };
        let downstreamKey;
        let lastEligibilityKey;
        const recordPolicyEvent = (event) => {
          const period = window.__EA_RUNNER__?.periods?.() ?? null;
          if (hooks.p40TraceEnabled === true) hooks.p40CurrentPeriod = period;
          const record = { period, ...event };
          if (
            event.type === "authorized" &&
            hooks.p36FirstAuthorization === null
          ) {
            hooks.captureP36NativePreGatherBoundary();
            const diagnostics = window.__EA_RUNNER__?.diagnostics?.() ?? {};
            const pageCapture =
              window[Symbol.for("evolve-automation.page-capture")];
            const game = pageCapture?.rootState.readRoot();
            const nativeState = snapshotNative();
            hooks.p36FirstAuthorization = {
              period,
              event,
              state: nativeState,
              canonicalState: {
                population: nativeState.population,
                populationCapacity: nativeState.populationCapacity,
                resources: nativeState.resources,
                buildings: nativeState.buildings,
                jobs: nativeState.jobs,
                tech: game?.tech ?? {},
                days: game?.stats?.days ?? null,
                starved: nativeState.starved,
                deaths: nativeState.deaths,
              },
              controlUsage: diagnostics.controlUsage ?? {},
              randomCalls: diagnostics.randomCalls ?? null,
              rngState: diagnostics.rngState ?? null,
              nativeCalls: (diagnostics.nativeInvocations ?? [])
                .filter(
                  (entry) =>
                    /^civ-/.test(entry.elementId ?? "") ||
                    (entry.method === "action" &&
                      (/^(undefined-food|city-lumber|undefined-stone)$/.test(
                        entry.elementId ?? "",
                      ) ||
                        /^(tech-|city-)/.test(entry.elementId ?? ""))),
                )
                .map(({ period: callPeriod, elementId, method }) => ({
                  period: callPeriod,
                  elementId,
                  method,
                })),
            };
          }
          if (event.type === "gather-click")
            record.afterClickStocks = snapshotStocks();
          if (
            event.type === "native-purchase-verified" ||
            event.type === "complete" ||
            event.type === "stopped"
          )
            record.state = snapshotNative();
          hooks.p36PolicyEvents.push(record);
        };
        hooks.p36Policy = p36PolicyModule.createP36BootstrapPolicy({
          onEvent: recordPolicyEvent,
        });
        const p38PolicyModule = new Function(
          `${configuration.p38PolicySource}\nreturn __EA_P38_TEST_POLICY__;`,
        )();
        const p38Enabled = configuration.p38Enabled === true;
        hooks.p38Policy = p38Enabled
          ? p38PolicyModule.createP38QuarryDiagnosticAuthorization({
              arm: configuration.p38PolicyArm ?? configuration.arm,
              readP36Stop() {
                const stopped = hooks.p36PolicyEvents.find(
                  (event) =>
                    event.type === "stopped" &&
                    event.reason === "shortage-exceeds-remaining-budget" &&
                    event.period === 688,
                );
                return stopped
                  ? {
                      reason: stopped.reason,
                      targetId: stopped.targetId,
                      period: stopped.period,
                    }
                  : undefined;
              },
              readRoot() {
                return window[
                  Symbol.for("evolve-automation.page-capture")
                ]?.rootState.readRoot();
              },
              onEvent(event) {
                const period = window.__EA_RUNNER__?.periods?.() ?? null;
                if (hooks.p40TraceEnabled === true)
                  hooks.p40CurrentPeriod = period;
                const record = {
                  period,
                  ...event,
                };
                if (
                  event.type === "p38-stopped" &&
                  event.reason === "native-quarry-purchased"
                )
                  record.state = snapshotNative();
                hooks.p38PolicyEvents.push(record);
              },
            })
          : null;
        gatherIntervention.constructionAllocation = {
          get enabled() {
            if (
              hooks.p38Policy !== null &&
              hooks.p36Policy.snapshot().stoppedReason !== null
            )
              return true;
            const stage = hooks.p36Policy.snapshot().stage;
            const root =
              window[
                Symbol.for("evolve-automation.page-capture")
              ]?.rootState.readRoot();
            const shedPurchased = Number(root?.city?.shed?.count ?? 0) >= 1;
            const expectedTarget =
              stage === "shed" && !shedPurchased
                ? "city-shed"
                : (stage === "quarry" || shedPurchased) &&
                    Number(root?.city?.rock_quarry?.count ?? 0) === 0
                  ? "city-rock_quarry"
                  : undefined;
            return (
              expectedTarget !== undefined && nativeTargetReady(expectedTarget)
            );
          },
          onRejected(event) {
            hooks.p36Policy.onRejected(event);
            hooks.p38Policy?.onRejected({
              ...event,
              period: window.__EA_RUNNER__?.periods?.() ?? null,
            });
          },
          observe(contract) {
            const period = window.__EA_RUNNER__?.periods?.() ?? null;
            const native =
              window[
                Symbol.for("evolve-automation.page-capture")
              ]?.rootState.readRoot();
            hooks.p36Policy.inspect(contract, native, period);
            hooks.p38Policy?.observe(contract, native, period);
            if (
              contract.targetId === "city-shed" ||
              contract.targetId === "city-rock_quarry"
            ) {
              const eligibilityKey = JSON.stringify([
                contract.targetId,
                contract.price,
                contract.rootGeneration,
                contract.progressionGeneration,
                contract.controlGeneration,
              ]);
              if (eligibilityKey !== lastEligibilityKey) {
                hooks.p36Eligibility.push({
                  period,
                  targetId: contract.targetId,
                  price: contract.price,
                  stock: contract.stock,
                  rootGeneration: contract.rootGeneration,
                  progressionGeneration: contract.progressionGeneration,
                  controlGeneration: contract.controlGeneration,
                  requestMatchesPublication: contract.requestMatchesPublication,
                  publicationCurrent: contract.publicationCurrent,
                  priceAuthorityValid: contract.priceAuthorityValid,
                  permissions: contract.permissions,
                  queuesEmpty: contract.queuesEmpty,
                  competingClaims: contract.competingClaims,
                });
                lastEligibilityKey = eligibilityKey;
              }
            } else {
              lastEligibilityKey = undefined;
            }
            if (hooks.p36Policy.snapshot().stage === "complete") {
              const game =
                window[
                  Symbol.for("evolve-automation.page-capture")
                ]?.rootState.readRoot();
              const species = game?.race?.species;
              const state = {
                population: game?.resource?.[species]?.amount ?? null,
                jobs: Object.fromEntries(
                  Object.entries(game?.civic ?? {})
                    .filter(([, value]) => Number(value?.workers ?? 0) > 0)
                    .map(([id, value]) => [id, value.workers]),
                ),
                buildings: Object.fromEntries(
                  Object.entries(game?.city ?? {})
                    .filter(([, value]) => Number(value?.count ?? 0) > 0)
                    .map(([id, value]) => [id, value.count]),
                ),
              };
              const key = JSON.stringify([
                state.population,
                state.jobs,
                state.buildings,
              ]);
              if (downstreamKey !== undefined && downstreamKey !== key)
                hooks.p36DownstreamChanges.push({
                  period,
                  state: { ...snapshotNative(), ...state },
                });
              downstreamKey = key;
            }
          },
          isCurrent(contract) {
            const native =
              window[
                Symbol.for("evolve-automation.page-capture")
              ]?.rootState.readRoot();
            return (
              hooks.p36Policy.isCurrent(contract, native) ||
              hooks.p38Policy?.isCurrent(contract, native, currentPeriod()) ===
                true
            );
          },
          authorize(contract) {
            const native =
              window[
                Symbol.for("evolve-automation.page-capture")
              ]?.rootState.readRoot();
            const p36Authorization = hooks.p36Policy.authorize(
              contract,
              native,
              currentPeriod(),
            );
            return (
              p36Authorization ??
              hooks.p38Policy?.authorize(contract, native, currentPeriod())
            );
          },
        };
      },
      {
        shadow: false,
        policy: true,
        arm,
        p40Trace: p40TraceEnabled,
        p38Enabled: p42Mode || arm !== "A",
        p38PolicyArm:
          p54Mode && ["A", "D", "D-repeat"].includes(arm)
            ? "B"
            : p42Mode && arm === "A"
              ? "B"
              : arm,
        p42Mode,
        p42Arm: p43Mode ? "B" : arm,
        p42Enabled: p51Mode
          ? false
          : p42Mode && (p43Mode || arm === "B" || arm === "B-repeat"),
        p43Mode,
        p51Mode,
        p52Mode,
        p53Mode,
        p54Mode,
        p54EventFed:
          p54Mode && (arm === "A" || arm === "D" || arm === "D-repeat"),
        p53Request:
          p53Mode && (arm === "C" || arm === "C-repeat")
            ? P53_QUARRY_REQUEST
            : null,
        p43Enabled: p43Mode && (arm === "B" || arm === "B-repeat"),
        p43CommitmentMode: p43Mode ? "test-only-assume-empty" : null,
        pinnedGameRevision: P43_PINNED_GAME,
        p42Identity: P42_INTERVENTION_IDENTITY,
        p42P38Authorization: P38_DIAGNOSTIC_AUTHORIZATION,
        p42ExpectedAuthorizationHistory,
        p38PolicySource: p38PolicyBundleSource,
        parityCapturePeriods: p42Mode
          ? [448, 688, 719, 720, 728, 1_000]
          : [...new Set([448, 688, ...extraCheckpoints])],
        policySource: policyBundleSource,
      },
    );

    const requested = p51Mode
      ? p51Checkpoints
      : [
          ...new Set([
            ...checkpoints,
            ...extraCheckpoints,
            ...(p42Mode ? p42Checkpoints : []),
          ]),
        ].sort((left, right) => left - right);
    const captured = [];
    let elapsed = 0;
    let workerTransfer = null;
    for (const targetPeriod of requested) {
      await session.advance(targetPeriod - elapsed);
      elapsed = targetPeriod;
      const checkpoint = await capture(session, targetPeriod, arm);
      captured.push(checkpoint);
      if (p43Mode && targetPeriod === 719) {
        await session.evaluate(
          (configuration) => {
            const hooks = window.__EA_TEST_HOOKS__;
            hooks.p43Mode = true;
            hooks.p43Arm = configuration.arm;
            hooks.p43Enabled = configuration.p43Enabled === true;
            hooks.p43Events = [];
            hooks.p43ExecutionFailures = [];
            hooks.p43ExecutionSamples = [];
            hooks.p43EventBytes = 0;
            hooks.p43EventOverflow = 0;
            hooks.p43Boundary = null;
            hooks.p43AuthorizedDecision = null;
            hooks.p43DecisionSequence = 0;
            hooks.p43LastEventKey = null;
            hooks.p43Metrics = {
              planCalls: 0,
              foodLedgerReads: 0,
              controlGenerationReads: 0,
              foodObservationMs: 0,
              purePolicyMs: 0,
              totalBoundaryMs: 0,
              interventions: 0,
              overriddenPlans: 0,
              ordinaryPlanConflicts: 0,
              unavailableObservations: 0,
            };
          },
          { arm, p43Enabled: p43Mode && (arm === "B" || arm === "B-repeat") },
        );
      }
      if (p51Mode && targetPeriod === 719) {
        await session.evaluate(
          (configuration) => {
            const hooks = window.__EA_TEST_HOOKS__;
            hooks.p51Arm = configuration.arm;
            hooks.p51ConstructionRequest = configuration.p51Request;
            hooks.p51RequestQualification =
              configuration.p51RequestQualification;
            hooks.p51AdmissionEnabled = true;
            hooks.allocationDiagnosticRequest = configuration.jobsRequest;
            hooks.p42Enabled = configuration.p42Enabled;
          },
          {
            arm,
            p51Request:
              arm === "B" || arm === "B-repeat"
                ? P51_QUARRY_REQUEST
                : p53Mode &&
                    (arm === "C" ||
                      arm === "C-repeat" ||
                      arm === "D" ||
                      arm === "D-repeat")
                  ? P53_QUARRY_REQUEST
                  : null,
            p51RequestQualification: qualifyP51QuarryRequest(
              arm === "B" || arm === "B-repeat"
                ? P51_QUARRY_REQUEST
                : p53Mode &&
                    (arm === "C" ||
                      arm === "C-repeat" ||
                      arm === "D" ||
                      arm === "D-repeat")
                  ? P53_QUARRY_REQUEST
                  : null,
              arm,
            ),
            p42Enabled:
              (arm === "B" || arm === "B-repeat") &&
              qualifyP51QuarryRequest(P51_QUARRY_REQUEST, arm).qualified,
            jobsRequest: p51JobsRequest,
            p54PublishRequest:
              p54Mode && (arm === "D" || arm === "D-repeat")
                ? P53_QUARRY_REQUEST
                : null,
          },
        );
        if (p54Mode && (arm === "D" || arm === "D-repeat")) {
          await session.evaluate((request) => {
            const publisher =
              window.__EA_TEST_HOOKS__?.p54PublishConstructionRequestForTest;
            if (typeof publisher === "function") publisher(request);
          }, P53_QUARRY_REQUEST);
        }
      }
      if (manualTransferPeriod === targetPeriod) {
        const productionIsSafe =
          Number(checkpoint.production.foodOutput ?? 0) >=
            Number(checkpoint.production.foodConsumption ?? 0) &&
          Number(checkpoint.state.resources.Food?.amount ?? 0) > 0 &&
          Number(checkpoint.state.starved ?? 0) === 0 &&
          Number(checkpoint.state.deaths ?? 0) === 0;
        workerTransfer = productionIsSafe
          ? await session.evaluate(() =>
              window.__EA_TEST_HOOKS__?.p38JobsApi?.transferFourResidentQuarryWorker?.(),
            )
          : {
              attempted: false,
              reason: "food-unsafe-before-diagnostic-worker-transfer",
              foodOutput: checkpoint.production.foodOutput,
              foodConsumption: checkpoint.production.foodConsumption,
              foodStock: checkpoint.state.resources.Food?.amount ?? null,
              starved: checkpoint.state.starved,
              deaths: checkpoint.state.deaths,
            };
        workerTransfer = {
          period: targetPeriod,
          ...workerTransfer,
        };
      }
    }
    const [exportText, diagnostics, hooks] = await Promise.all([
      session.exportSave(),
      session.diagnostics(),
      session.evaluate(() => {
        const value = window.__EA_TEST_HOOKS__;
        return {
          targets: value.constructionSavingTargetObservations ?? [],
          preGatherBoundaryCaptures: value.p36PreGatherBoundaryCaptures ?? [],
          bootstrap: value.civilizationBootstrapEvents ?? [],
          handoff: value.civilizationHandoffEvents ?? [],
          policyEvents: value.p36PolicyEvents ?? [],
          eligibility: value.p36Eligibility ?? [],
          firstAuthorization: value.p36FirstAuthorization ?? null,
          downstreamChanges: value.p36DownstreamChanges ?? [],
          policySnapshot: value.p36Policy?.snapshot?.() ?? null,
          shadowSummary: value.p32LiveAuthoritySummary ?? null,
          shadowRecords: value.p32LiveAuthority ?? [],
          metrics: value.p36Metrics ?? null,
          p38PolicyEvents: value.p38PolicyEvents ?? [],
          p38PolicySnapshot: value.p38Policy?.snapshot?.() ?? null,
          p38Metrics: value.p38Metrics ?? null,
          p38JobTrace: value.p38JobTrace ?? [],
          jobsSnapshot: value.p38JobsApi?.snapshot?.() ?? null,
          p40:
            value.p40TraceEnabled === true
              ? {
                  events: value.p40TraceEvents ?? [],
                  synchronousMs: value.p40TraceSynchronousMs ?? 0,
                  contextSynchronousMs: value.p40ContextSynchronousMs ?? 0,
                  guardSynchronousMs: value.p40GuardSynchronousMs ?? 0,
                  resourceReadMs: value.p40ResourceReadMs ?? 0,
                  resourceReadCount: value.p40ResourceReadCount ?? 0,
                  guardCalls: value.p40GuardCalls ?? 0,
                  diagnosticClockReads: value.p40DiagnosticClockReads ?? 0,
                  ownerDecisionCount: value.p40OwnerDecisionCount ?? 0,
                  costConflictReaderCalls: value.p41ConflictReaderCalls ?? 0,
                  costConflictReaderElapsedMs:
                    value.p41ConflictReaderElapsedMs ?? 0,
                  readerTimingClockReads: value.p41DiagnosticClockReads ?? 0,
                  overflow: value.p40TraceOverflow ?? 0,
                  clockUnavailable: value.p40TraceClockUnavailable === true,
                  policyBackend: value.p40BuildPolicyBackend ?? null,
                }
              : null,
          p42:
            value.p42Mode === true
              ? {
                  arm: value.p42Arm ?? null,
                  enabled: value.p42Enabled === true,
                  identity: value.p42Identity ?? null,
                  authorizationHistoryMatched:
                    value.p42AuthorizationHistoryMatched?.() ?? false,
                  p36GatherActions: value.p42P36GatherActions ?? 0,
                  quarryOrder: value.p42QuarryOrder ?? null,
                  preSubstitutionBoundary:
                    value.p42PreSubstitutionBoundary ?? null,
                  events: value.p42Trace ?? [],
                  appliedReservationReads:
                    value.p42AppliedReservationReads ?? 0,
                  ownerCycleApplied: value.p42OwnerCycleApplied === true,
                  released: value.p42Released === true,
                  resourceAmountReads: value.p42ResourceAmountReads ?? 0,
                  ownerAuthorityReads: value.p42OwnerAuthorityReads ?? 0,
                  diagnosticClockReads: value.p42DiagnosticClockReads ?? 0,
                  synchronousMs: value.p42SynchronousMs ?? 0,
                  traceElapsedMs: value.p42TraceElapsedMs ?? 0,
                  traceClockUnavailable:
                    value.p42TraceClockUnavailable === true,
                  traceOverflow: value.p42TraceOverflow ?? 0,
                  traceBytes: value.p42TraceBytes ?? 0,
                }
              : null,
          p43:
            value.p43Mode === true
              ? {
                  arm: value.p43Arm ?? null,
                  enabled: value.p43Enabled === true,
                  mode: value.p43Mode === true,
                  apiAvailable:
                    typeof value.p38JobsApi?.readPeriod === "function",
                  commitmentMode: value.p43CommitmentMode ?? null,
                  events: value.p43Events ?? [],
                  executionFailures: value.p43ExecutionFailures ?? [],
                  executionSamples: value.p43ExecutionSamples ?? [],
                  eventBytes: value.p43EventBytes ?? 0,
                  eventOverflow: value.p43EventOverflow ?? 0,
                  boundary: value.p43Boundary ?? null,
                  metrics: value.p43Metrics ?? null,
                }
              : null,
        };
      }),
    ]);
    const final = captured.at(-1);
    const targetTransitions = [];
    for (const observation of hooks.targets) {
      const previous = targetTransitions.at(-1)?.target;
      if (
        targetTransitions.length === 0 ||
        canonical(previous) !== canonical(observation.target)
      )
        targetTransitions.push(observation);
    }
    const performanceSamples = (diagnostics.perfSummaries ?? []).map(
      (values) => ({
        label: values[0],
        summary: values[1] ?? {},
        counts: values[2] ?? {},
      }),
    );
    return {
      arm,
      periods: final.period,
      checkpoints: captured,
      finalExportSha256: hash(exportText),
      finalRng: {
        calls: final.randomCalls,
        state: final.rngState,
      },
      bootstrapEvents: hooks.bootstrap,
      handoffEvents: hooks.handoff,
      targetTransitions,
      preGatherBoundaryCaptures: hooks.preGatherBoundaryCaptures,
      p36: {
        policyEvents: hooks.policyEvents,
        eligibility: hooks.eligibility,
        firstAuthorization: hooks.firstAuthorization,
        downstreamChanges: hooks.downstreamChanges,
        policySnapshot: hooks.policySnapshot,
        shadowSummary: hooks.shadowSummary,
        shadowRecordsSha256: hash(JSON.stringify(hooks.shadowRecords)),
        shadowEligibleCount: hooks.shadowRecords.filter(
          (record) => record.shadow?.authorized === true,
        ).length,
        metrics: hooks.metrics,
      },
      p38: {
        policyEvents: hooks.p38PolicyEvents,
        policySnapshot: hooks.p38PolicySnapshot,
        metrics: hooks.p38Metrics,
        jobTrace: hooks.p38JobTrace,
        liveJobsSnapshot: hooks.jobsSnapshot,
        manualTransfer: workerTransfer,
      },
      p40: hooks.p40,
      p42: hooks.p42,
      p43: hooks.p43,
      controlUsage: diagnostics.controlUsage ?? {},
      nativeCalls: (diagnostics.nativeInvocations ?? [])
        .filter(
          (entry) =>
            /^civ-/.test(entry.elementId ?? "") ||
            (entry.method === "action" &&
              (/^(undefined-food|city-lumber|undefined-stone)$/.test(
                entry.elementId ?? "",
              ) ||
                /^(tech-|city-)/.test(entry.elementId ?? ""))),
        )
        .map(({ period: callPeriod, elementId, method }) => ({
          period: callPeriod,
          elementId,
          method,
        })),
      performanceSamples,
    };
  } finally {
    await session.close();
  }
}

function checkpointParity(left, right) {
  const rightByPeriod = new Map(
    right.checkpoints.map((checkpoint) => [checkpoint.period, checkpoint]),
  );
  return left.checkpoints.map((checkpoint) => {
    const comparison = rightByPeriod.get(checkpoint.period);
    assert.ok(comparison, `missing parity checkpoint p${checkpoint.period}`);
    return {
      period: checkpoint.period,
      saveHashEqual: checkpoint.saveSha256 === comparison.saveSha256,
      stateEqual: canonical(checkpoint.state) === canonical(comparison.state),
      nativeCallsEqual:
        canonical(checkpoint.nativeCalls) === canonical(comparison.nativeCalls),
      controlUsageEqual:
        canonical(checkpoint.controlUsage) ===
        canonical(comparison.controlUsage),
      rngEqual:
        checkpoint.randomCalls === comparison.randomCalls &&
        checkpoint.rngState === comparison.rngState,
    };
  });
}

function perfPhaseTotal(samples, phase) {
  return samples.reduce(
    (sum, sample) => sum + Number(sample.summary?.[phase]?.totalMs ?? 0),
    0,
  );
}

function perfPhaseSummary(samples, phase) {
  const values = samples
    .map((sample) => sample.summary?.[phase])
    .filter((value) => value !== undefined);
  return {
    count: values.reduce((total, value) => total + value.count, 0),
    totalMs: values.reduce((total, value) => total + value.totalMs, 0),
    maxMs: Math.max(0, ...values.map((value) => value.maxMs)),
  };
}

function compareTreatmentCheckpointToBaseline(checkpoint, baselineCheckpoint) {
  const resources = Object.fromEntries(
    ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => {
      const before = baselineCheckpoint.state.resources[id]?.amount ?? null;
      const after = checkpoint.state.resources[id]?.amount ?? null;
      return [
        id,
        before === after ? null : { baseline: before, treatment: after },
      ];
    }),
  );
  const changes = {
    period: checkpoint.period,
    population:
      checkpoint.state.population === baselineCheckpoint.state.population
        ? null
        : {
            baseline: baselineCheckpoint.state.population,
            treatment: checkpoint.state.population,
          },
    populationCapacity:
      checkpoint.state.populationCapacity ===
      baselineCheckpoint.state.populationCapacity
        ? null
        : {
            baseline: baselineCheckpoint.state.populationCapacity,
            treatment: checkpoint.state.populationCapacity,
          },
    stocks: Object.values(resources).some((change) => change !== null)
      ? resources
      : null,
    buildings:
      canonical(checkpoint.state.buildings) ===
      canonical(baselineCheckpoint.state.buildings)
        ? null
        : {
            baseline: baselineCheckpoint.state.buildings,
            treatment: checkpoint.state.buildings,
          },
    jobs:
      canonical(checkpoint.state.jobs) ===
      canonical(baselineCheckpoint.state.jobs)
        ? null
        : {
            baseline: baselineCheckpoint.state.jobs,
            treatment: checkpoint.state.jobs,
          },
    research:
      canonical(checkpoint.state.tech) ===
      canonical(baselineCheckpoint.state.tech)
        ? null
        : {
            baseline: baselineCheckpoint.state.tech,
            treatment: checkpoint.state.tech,
          },
    starvationDeaths:
      checkpoint.state.starved === baselineCheckpoint.state.starved &&
      checkpoint.state.deaths === baselineCheckpoint.state.deaths
        ? null
        : {
            baseline: {
              starved: baselineCheckpoint.state.starved,
              deaths: baselineCheckpoint.state.deaths,
            },
            treatment: {
              starved: checkpoint.state.starved,
              deaths: checkpoint.state.deaths,
            },
          },
    rng:
      checkpoint.randomCalls === baselineCheckpoint.randomCalls &&
      checkpoint.rngState === baselineCheckpoint.rngState
        ? null
        : {
            baseline: {
              calls: baselineCheckpoint.randomCalls,
              state: baselineCheckpoint.rngState,
            },
            treatment: {
              calls: checkpoint.randomCalls,
              state: checkpoint.rngState,
            },
          },
    nativeControlOrder: (() => {
      const base = baselineCheckpoint.nativeCalls;
      const candidate = checkpoint.nativeCalls;
      let index = 0;
      while (
        index < base.length &&
        index < candidate.length &&
        canonical(base[index]) === canonical(candidate[index])
      )
        index += 1;
      return index === base.length && index === candidate.length
        ? null
        : {
            firstDifferentIndex: index,
            baseline: base.slice(index),
            treatment: candidate.slice(index),
          };
    })(),
  };
  changes.changedAreas = Object.entries(changes)
    .filter(
      ([key, value]) =>
        key !== "period" && key !== "changedAreas" && value !== null,
    )
    .map(([key]) => key);
  return changes;
}

try {
  const [p19Text, p36Text] = await Promise.all([
    readFile(
      path.join(root, "experiments/p19-civilization-bootstrap-evidence.json"),
      "utf8",
    ),
    readFile(
      path.join(
        root,
        "experiments/p36-productive-resource-bootstrap-evidence.json",
      ),
      "utf8",
    ),
  ]);
  const p19Evidence = JSON.parse(p19Text);
  const p36Evidence = JSON.parse(p36Text);
  const p36Treatment = p36Evidence.arms.find((entry) => entry.arm === "C");
  assert.ok(p36Treatment, "retained P36 exact treatment missing");
  assert.deepEqual(P36_BOOTSTRAP_LIMITS, {
    shed: 80,
    quarry: 60,
    total: 140,
    perCycle: 5,
  });
  const retainedP36Stop = p36Treatment.p36.policyEvents.find(
    (event) =>
      event.type === "stopped" &&
      event.period === 688 &&
      event.reason === "shortage-exceeds-remaining-budget",
  );
  assert.ok(retainedP36Stop, "retained P36 p688 stop missing");
  assert.equal(retainedP36Stop.shortage.Lumber, 18);
  assert.equal(retainedP36Stop.targetId, "city-rock_quarry");

  let interim = {
    runtimeBundleSha256,
    policyBundleSha256,
    p38PolicyBundleSha256,
    replayHarnessSha256,
    arms: {},
  };
  if (process.argv.includes("--reuse")) {
    try {
      const retained = JSON.parse(await readFile(interimPath, "utf8"));
      if (
        (retained.replayHarnessSha256 === replayHarnessSha256 ||
          retained.replayHarnessSha256 ===
            "ea723f44e10a3bb5631beaa11734682e9322818dd9b79de67ad797ffec52eeb6" ||
          retained.replayHarnessSha256 ===
            "ab36a405b73b9efb17d689c1f14bf3d894ca168f67ad791896dc267c6a106b8f") &&
        retained.runtimeBundleSha256 === runtimeBundleSha256 &&
        retained.policyBundleSha256 === policyBundleSha256 &&
        retained.p38PolicyBundleSha256 === p38PolicyBundleSha256
      )
        interim = retained;
    } catch {
      /* Missing or stale interim evidence causes a fresh isolated replay. */
    }
  }
  const replayOrReuse = async (arm, options = {}) => {
    const key = arm;
    const expectedManual =
      options.manualTransferPeriod == null
        ? null
        : options.manualTransferPeriod;
    if (
      process.argv.includes("--reuse") &&
      interim.arms[key] !== undefined &&
      interim.arms[key].manualTransferPeriod === expectedManual
    ) {
      interim.arms[key].replayHarnessSha256 ??= interim.replayHarnessSha256;
      return interim.arms[key];
    }
    const result = await replay(
      arm,
      p43Mode ? p43ExtraCheckpoints : [],
      options,
    );
    result.manualTransferPeriod = expectedManual;
    result.replayHarnessSha256 = replayHarnessSha256;
    interim = {
      runtimeBundleSha256,
      policyBundleSha256,
      p38PolicyBundleSha256,
      replayHarnessSha256,
      arms: { ...interim.arms, [key]: result },
    };
    await writeFile(
      interimPath,
      await prettier.format(JSON.stringify(interim), { parser: "json" }),
    );
    return result;
  };

  const A = await replayOrReuse("A");
  const B = await replayOrReuse("B");
  const BRepeat = p53Mode ? null : await replayOrReuse("B-repeat");
  for (const arm of [A, B, ...(BRepeat === null ? [] : [BRepeat])]) {
    for (const entry of arm.checkpoints) {
      entry.jobsSnapshot ??= entry.native?.jobsSnapshot ?? null;
      entry.jobsInput ??= entry.native?.jobsInput ?? null;
      entry.jobsTraceCount ??= entry.native?.jobsTraceCount ?? 0;
    }
  }
  if (p54Mode) {
    const C = await replayOrReuse("C");
    const D = await replayOrReuse("D");
    const DRepeat = await replayOrReuse("D-repeat");
    for (const arm of [C, D, DRepeat]) {
      for (const entry of arm.checkpoints) {
        entry.jobsSnapshot ??= entry.native?.jobsSnapshot ?? null;
        entry.jobsInput ??= entry.native?.jobsInput ?? null;
        entry.jobsTraceCount ??= entry.native?.jobsTraceCount ?? 0;
      }
    }
    const evidenceModule =
      await import("./p54-construction-authority-cost-evidence.mjs");
    const sourcePaths = [
      "build-config.mjs",
      "src/application/build.ts",
      "src/ports/build.ts",
      "src/ports/game-root-state.ts",
      "src/adapters/evolve/vue-capture.ts",
      "src/adapters/evolve/progression-epoch.ts",
      "src/adapters/evolve/progression/construction/captured-construction.ts",
      "src/adapters/evolve/progression/build/captured-build.ts",
      "src/adapters/evolve/captured-cost-conflict.ts",
      "src/adapters/evolve/captured-action-costs.ts",
      "src/adapters/evolve/captured-queue-reservations.ts",
      "src/bootstrap/captured-progression-control.ts",
      "src/bootstrap/captured-runtime-control.ts",
      "src/domain/progression/build/construction-target-admission.ts",
      "experiments/p42-construction-priority-counterfactual-policy.mjs",
      "experiments/p42-construction-priority-counterfactual-trace.mjs",
      "experiments/p51-construction-jobs-handoff-contract.mjs",
      "experiments/p51-construction-jobs-handoff-trace.mjs",
      "experiments/p52-independent-construction-jobs-identity-evidence.mjs",
      "experiments/p53-construction-owned-target-authority-contract.mjs",
      "experiments/p54-construction-authority-cost-evidence.mjs",
      "experiments/p54-construction-authority-cost-exact.mjs",
      "experiments/p38-quarry-production-validation-exact.mjs",
      "tests/experiments/p53-construction-owned-target-authority-test.mjs",
      "tests/architecture/p50-diagnostic-bundle-isolation-test.mjs",
      "tools/chromium-evolve-runner.mjs",
      "tools/chromium/bridge.js",
    ];
    const sourceHashes = Object.fromEntries(
      await Promise.all(
        sourcePaths.map(async (relativePath) => [
          relativePath,
          hash(await readFile(path.join(root, relativePath))),
        ]),
      ),
    );
    const priorP42Evidence = await readFile(p42EvidencePath);
    const evidence = evidenceModule.createP54ConstructionAuthorityCostEvidence({
      A,
      B,
      C,
      D,
      DRepeat,
      gameSnapshotSha256: pinnedGameSha256,
      bundleSha256,
      replayHarnessSha256,
      sourceHashes,
      priorP42EvidenceSha256: hash(priorP42Evidence),
      baselineTunedFixturePresent: await readFile(
        path.join(
          root,
          "test-artifacts/benchmark/settings/baseline-tuned.json",
        ),
        { flag: "r" },
      )
        .then(() => true)
        .catch(() => false),
    });
    await writeFile(
      p54EvidencePath,
      await prettier.format(JSON.stringify(evidence), { parser: "json" }),
    );
    console.log(
      JSON.stringify({
        experiment: evidence.schema,
        outcome: evidence.decision.outcome,
        p54EvidencePath,
        preInterventionExact: evidence.preIntervention.exact,
        BCNativeInvocationParity: evidence.nativeTrace.BC.equal,
        DRepeatExact: evidence.nativeTrace.DRepeat.exact,
        rendererCpuGate:
          evidence.acceptance.independentRendererCpuAcceptance.status,
        replayHashes: { bundleSha256, replayHarnessSha256 },
      }),
    );
    process.exit(0);
  }
  if (p53Mode) {
    const C = await replayOrReuse("C");
    const CRepeat = await replayOrReuse("C-repeat");
    for (const arm of [C, CRepeat]) {
      for (const entry of arm.checkpoints) {
        entry.jobsSnapshot ??= entry.native?.jobsSnapshot ?? null;
        entry.jobsInput ??= entry.native?.jobsInput ?? null;
        entry.jobsTraceCount ??= entry.native?.jobsTraceCount ?? 0;
      }
    }
    const evidenceModule =
      await import("./p53-construction-owned-target-authority-evidence.mjs");
    const sourcePaths = [
      "build-config.mjs",
      "src/application/build.ts",
      "src/ports/build.ts",
      "src/ports/construction-candidates.ts",
      "src/ports/game-construction-observations.ts",
      "src/adapters/evolve/progression/construction/captured-construction.ts",
      "src/adapters/evolve/progression/build/captured-build.ts",
      "src/adapters/evolve/captured-cost-conflict.ts",
      "src/adapters/evolve/captured-action-costs.ts",
      "src/adapters/evolve/captured-queue-reservations.ts",
      "src/bootstrap/captured-construction-control.ts",
      "src/bootstrap/captured-progression-control.ts",
      "src/bootstrap/captured-runtime-control.ts",
      "src/domain/progression/build/construction-target-admission.ts",
      "experiments/p42-construction-priority-counterfactual-policy.mjs",
      "experiments/p40-construction-reservation-gate-trace.mjs",
      "experiments/p42-construction-priority-counterfactual-trace.mjs",
      "experiments/p51-construction-jobs-handoff-contract.mjs",
      "experiments/p51-construction-jobs-handoff-trace.mjs",
      "experiments/p53-construction-owned-target-authority-contract.mjs",
      "experiments/p53-construction-owned-target-authority-evidence.mjs",
      "experiments/p53-construction-owned-target-authority-exact.mjs",
      "experiments/p38-quarry-production-validation-exact.mjs",
      "tests/experiments/p53-construction-owned-target-authority-test.mjs",
      "tests/architecture/p50-diagnostic-bundle-isolation-test.mjs",
      "tools/chromium-evolve-runner.mjs",
      "tools/chromium/bridge.js",
    ];
    const sourceHashes = Object.fromEntries(
      await Promise.all(
        sourcePaths.map(async (relativePath) => [
          relativePath,
          hash(await readFile(path.join(root, relativePath))),
        ]),
      ),
    );
    const admissionSource = await readFile(
      path.join(
        root,
        "src/domain/progression/build/construction-target-admission.ts",
      ),
      "utf8",
    );
    const constructionSource = await readFile(
      path.join(
        root,
        "src/adapters/evolve/progression/construction/captured-construction.ts",
      ),
      "utf8",
    );
    const evidence =
      evidenceModule.createP53ConstructionTargetAuthorityEvidence({
        A,
        B,
        C,
        CRepeat,
        gameSnapshotSha256: pinnedGameSha256,
        bundleSha256,
        replayHarnessSha256,
        sourceHashes,
        staticContract: {
          admissionOutcomes: [
            "accepted-for-owner-decision",
            "rejected-target-unavailable",
            "rejected-priority-conflict",
            "rejected-incomplete-authority",
            "rejected-unaffordable",
            "stale",
            "inactive",
          ].filter((outcome) => admissionSource.includes(`"${outcome}"`)),
          historicalPublicationPreserved:
            constructionSource.includes("readPublishedSavingTarget()") &&
            constructionSource.includes("readSavingTargetForConflict"),
          p53CompileDefinePresent: constructionSource.includes(
            "__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__",
          ),
        },
      });
    await writeFile(
      p53EvidencePath,
      await prettier.format(JSON.stringify(evidence), { parser: "json" }),
    );
    console.log(
      JSON.stringify({
        experiment: evidence.schema,
        outcome: evidence.decision.outcome,
        p53EvidencePath,
        ownerDecision: evidence.ownerDecision.status,
        exactNativeParity: evidence.comparison.BCNativeEquality,
        replayHashes: { bundleSha256, replayHarnessSha256 },
      }),
    );
    process.exit(0);
  }
  if (p51Mode && !p52Mode) {
    const sourcePaths = [
      "src/application/build.ts",
      "src/ports/build.ts",
      "src/adapters/evolve/progression/build/captured-build.ts",
      "src/adapters/evolve/progression/construction/captured-construction.ts",
      "src/bootstrap/captured-progression-control.ts",
      "src/bootstrap/captured-runtime-control.ts",
      "src/adapters/evolve/civic/captured-ordinary-jobs.ts",
      "src/domain/civic/allocation-diagnostic-admission.ts",
      "experiments/p42-construction-priority-counterfactual-policy.mjs",
      "experiments/p42-construction-priority-counterfactual-trace.mjs",
      "experiments/p49-jobs-admission-evidence.mjs",
      "experiments/p51-construction-jobs-handoff-contract.mjs",
      "experiments/p51-construction-jobs-handoff-trace.mjs",
      "experiments/p51-construction-jobs-handoff-evidence.mjs",
      "experiments/p51-construction-jobs-handoff-exact.mjs",
      "experiments/p38-quarry-production-validation-exact.mjs",
      "tests/experiments/p51-construction-jobs-handoff-test.mjs",
      "tests/architecture/p50-diagnostic-bundle-isolation-test.mjs",
      "tools/chromium-evolve-runner.mjs",
      "tools/chromium/bridge.js",
    ];
    const sourceHashes = Object.fromEntries(
      await Promise.all(
        sourcePaths.map(async (relativePath) => [
          relativePath,
          hash(await readFile(path.join(root, relativePath))),
        ]),
      ),
    );
    const p51PortAuditText = await Promise.all(
      [
        "experiments/p51-construction-jobs-handoff-contract.mjs",
        "experiments/p51-construction-jobs-handoff-trace.mjs",
      ].map(async (relativePath) =>
        (await readFile(path.join(root, relativePath), "utf8")).toString(),
      ),
    );
    const countMatches = (source, expression) =>
      p51PortAuditText.reduce(
        (total, contents) => total + (contents.match(expression) ?? []).length,
        0,
      );
    const nativePortAudit = {
      method:
        "static callsite audit of the P51 receipt contract and injected handoff adapter; P49 observation deltas are recorded separately",
      sourceFiles: [
        "experiments/p51-construction-jobs-handoff-contract.mjs",
        "experiments/p51-construction-jobs-handoff-trace.mjs",
      ],
      readCallsites: countMatches(
        p51PortAuditText,
        /(?:rootState|resources|costs|buildCosts|native)\.(?:readRoot|readResources|readCost|readBuildTargets|readQueue|resolve)\s*\(/g,
      ),
      controlCallsites: countMatches(
        p51PortAuditText,
        /(?:controls|pageCapture\.controls)\.(?:resolve|invoke|click|action)\s*\(/g,
      ),
    };
    const evidence = createP51ConstructionJobsHandoffEvidence({
      A,
      B,
      BRepeat,
      gameSnapshotSha256: pinnedGameSha256,
      bundleSha256,
      replayHarnessSha256,
      sourceHashes,
      nativePortAudit,
    });
    await writeFile(
      p51EvidencePath,
      await prettier.format(JSON.stringify(evidence), { parser: "json" }),
    );
    console.log(
      JSON.stringify({
        experiment: evidence.schema,
        outcome: evidence.decision.outcome,
        p51EvidencePath,
        receiptSizeBytes: evidence.receipt.exactSizeBytes,
        jobsOwnerScope: evidence.receipt.jobsConsumption.ownerScope,
        replayHashes: { bundleSha256, replayHarnessSha256 },
      }),
    );
    process.exit(0);
  }
  if (p52Mode) {
    const sourcePaths = [
      "src/adapters/evolve/progression-epoch.ts",
      "src/bootstrap/captured-runtime-control.ts",
      "src/adapters/evolve/civic/captured-ordinary-jobs.ts",
      "src/domain/civic/allocation-diagnostic-admission.ts",
      "experiments/p42-construction-priority-counterfactual-policy.mjs",
      "experiments/p42-construction-priority-counterfactual-trace.mjs",
      "experiments/p49-jobs-admission-evidence.mjs",
      "experiments/p51-construction-jobs-handoff-contract.mjs",
      "experiments/p51-construction-jobs-handoff-trace.mjs",
      "experiments/p52-independent-construction-jobs-identity-evidence.mjs",
      "experiments/p52-independent-construction-jobs-identity-exact.mjs",
      "experiments/p38-quarry-production-validation-exact.mjs",
      "tests/experiments/p52-independent-construction-jobs-identity-test.mjs",
      "tests/architecture/p50-diagnostic-bundle-isolation-test.mjs",
      "tools/chromium-evolve-runner.mjs",
      "tools/chromium/bridge.js",
    ];
    const sourceHashes = Object.fromEntries(
      await Promise.all(
        sourcePaths.map(async (relativePath) => [
          relativePath,
          hash(await readFile(path.join(root, relativePath))),
        ]),
      ),
    );
    const p52TraceSource = await readFile(
      path.join(root, "experiments/p51-construction-jobs-handoff-trace.mjs"),
      "utf8",
    );
    const jobsSampleStart = p52TraceSource.indexOf(
      'const readsBefore = Number(readProperty(p51Hooks, "p52IdentityNativeRootReads")',
    );
    const jobsSampleEnd = p52TraceSource.indexOf(
      "const identitySample = Object.freeze",
      jobsSampleStart,
    );
    const jobsSampleSource = p52TraceSource.slice(
      jobsSampleStart,
      jobsSampleEnd,
    );
    const count = (source, expression) =>
      (source.match(expression) ?? []).length;
    const epochSource = await readFile(
      path.join(root, "src/adapters/evolve/progression-epoch.ts"),
      "utf8",
    );
    const staticPortAudit = {
      method:
        "bounded P52 Jobs callback source audit plus exact shared-reader root observation counter",
      jobsIdentitySampleSites: count(
        p52TraceSource,
        /const readsBefore = Number\(readProperty\(p51Hooks, "p52IdentityNativeRootReads"/g,
      ),
      jobsIdentityAccessorCalls: count(
        jobsSampleSource,
        /progression\.read(?:RootGeneration|ProgressionEpoch)\s*\(/g,
      ),
      jobsIdentityRootReadCallsites: count(
        jobsSampleSource,
        /progression\.readProgressionEpoch\s*\(/g,
      ),
      sharedReaderRootReadCallsites: count(
        epochSource,
        /const root = rootState\.readRoot\(\);/g,
      ),
      perJobsSampleRootObservations: 1,
    };
    const evidence = createP52IndependentConstructionJobsIdentityEvidence({
      A,
      B,
      BRepeat,
      gameSnapshotSha256: pinnedGameSha256,
      bundleSha256,
      replayHarnessSha256,
      sourceHashes,
      staticPortAudit,
    });
    await writeFile(
      p52EvidencePath,
      await prettier.format(JSON.stringify(evidence), { parser: "json" }),
    );
    console.log(
      JSON.stringify({
        experiment: evidence.schema,
        outcome: evidence.decision.outcome,
        p52EvidencePath,
        handoffStatus: evidence.receipt.handoffStatus,
        additionalNativeRootObservations:
          evidence.measurements.additionalNativeRootObservations,
        replayHashes: { bundleSha256, replayHarnessSha256 },
      }),
    );
    process.exit(0);
  }
  if (p43Mode) {
    const p43Result = createP43FoodSafeJobsEvidence({
      A,
      B,
      BRepeat,
      hash,
      canonicalJson: canonical,
      runtimeBundleSha256,
      policyBundleSha256,
      p38PolicyBundleSha256,
      replayHarnessSha256,
      p43PolicySha256: hash(
        await readFile(
          path.join(root, "experiments/p43-food-safe-jobs-policy.mjs"),
        ),
      ),
      p43TraceSha256: hash(
        await readFile(
          path.join(root, "experiments/p43-food-safe-jobs-trace.mjs"),
        ),
      ),
      pinnedGame: P43_PINNED_GAME,
      pinnedGameSha256,
      p42BaseCommit: "62e9d353",
      p42HarnessCommit: "3b10fe0e",
      p42TestsCommit: "bb848c55",
    });
    await writeFile(
      p43EvidencePath,
      await prettier.format(JSON.stringify(p43Result.evidence), {
        parser: "json",
      }),
    );
    await writeFile(
      p43TimelinePath,
      await prettier.format(JSON.stringify(p43Result.timeline), {
        parser: "json",
      }),
    );
    console.log(
      JSON.stringify({
        experiment: p43Result.evidence.experiment,
        outcome: p43Result.evidence.outcome,
        p43EvidencePath,
        p43TimelinePath,
        firstDivergencePeriod:
          p43Result.evidence.comparison.firstDivergencePeriod,
        interventions: p43Result.evidence.outcomes.interventionCount,
        traceOverflows: p43Result.evidence.replay.traceOverflows,
        replayHashes: {
          runtimeBundleSha256,
          replayHarnessSha256,
          p43PolicySha256: p43Result.evidence.replay.p43PolicySha256,
          p43TraceSha256: p43Result.evidence.replay.p43TraceSha256,
        },
      }),
    );
    process.exit(0);
  }
  if (p42Mode) {
    const p39EvidenceText = await readFile(
      path.join(
        root,
        "experiments/p39-cross-owner-economic-coordination-evidence.json",
      ),
      "utf8",
    );
    const p39Evidence = {
      ...JSON.parse(p39EvidenceText),
      sha256: hash(p39EvidenceText),
    };
    const p42Evidence = createP42ConstructionPriorityEvidence({
      A,
      B,
      BRepeat,
      retainedP38Evidence,
      retainedP38EvidenceSha256: hash(retainedP38EvidenceText),
      p39Evidence,
      checkpointParity,
      hash,
      canonicalJson: canonical,
      runtimeBundleSha256,
      policyBundleSha256,
      p38PolicyBundleSha256,
      replayHarnessSha256,
      p42PluginSha256: hash(await readFile(p42PluginPath)),
      p42PolicySha256: hash(await readFile(p42PolicyPath)),
    });
    await writeFile(
      p42EvidencePath,
      await prettier.format(JSON.stringify(p42Evidence), { parser: "json" }),
    );
    console.log(
      JSON.stringify({
        experiment: p42Evidence.experiment,
        outcome: p42Evidence.outcome,
        p42EvidencePath,
        p42TraceBytes:
          p42Evidence.construction.measuredInstrumentation.p42TraceEventBytes,
        replayHashes: {
          runtimeBundleSha256,
          replayHarnessSha256,
          p42PluginSha256: p42Evidence.replay.p42PluginSha256,
        },
      }),
    );
    process.exit(0);
  }
  const checkpoint = (arm, period) =>
    arm.checkpoints.find((entry) => entry.period === period);
  const stop688 = (arm) =>
    arm.p36.policyEvents.find(
      (event) => event.type === "stopped" && event.period === 688,
    );
  const A688 = checkpoint(A, 688);
  const B688 = checkpoint(B, 688);
  assert.ok(
    A688 && B688 && checkpoint(BRepeat, 688),
    "all P38 arms must capture p688",
  );
  for (const arm of [A, B, BRepeat]) {
    const stop = stop688(arm);
    assert.equal(stop?.reason, "shortage-exceeds-remaining-budget");
    assert.equal(stop?.shortage?.Lumber, 18);
    assert.equal(stop?.state?.population, 4);
    assert.equal(stop?.state?.jobs?.farmer, 4);
    assert.equal(stop?.state?.buildings?.shed, 1);
    assert.equal(stop?.state?.buildings?.rock_quarry ?? 0, 0);
    assert.equal(stop?.state?.resources?.Lumber?.amount, 32);
    assert.equal(stop?.state?.resources?.Stone?.amount, 10);
  }

  const p36Prefix = p36Treatment.p36.policyEvents.filter(
    (event) => event.period <= 688,
  );
  const p36PrefixCalls = p36Treatment.nativeCalls.filter(
    (entry) => entry.period <= 688,
  );
  const parityThrough = (left, right, period) =>
    checkpointParity(
      {
        ...left,
        checkpoints: left.checkpoints.filter((entry) => entry.period <= period),
      },
      {
        ...right,
        checkpoints: right.checkpoints.filter(
          (entry) => entry.period <= period,
        ),
      },
    );
  const p36ParityAt448 = parityThrough(A, p36Treatment, 448);
  const boundaryParity = Object.fromEntries(
    [A, B, BRepeat].map((arm) => {
      const stop = stop688(arm);
      const state = checkpoint(arm, 688).state;
      const normalized = (snapshot, production) => ({
        population: snapshot.population,
        populationCapacity: snapshot.populationCapacity,
        resources: Object.fromEntries(
          Object.entries(snapshot.resources ?? {}).map(([id, value]) => [
            id,
            { amount: value?.amount ?? null, max: value?.max ?? null },
          ]),
        ),
        buildings: snapshot.buildings,
        jobs: snapshot.jobs,
        starved: snapshot.starved,
        deaths: snapshot.deaths,
        production,
      });
      const left = normalized(state, checkpoint(arm, 688).production);
      const right = normalized(stop.state, {
        foodOutput: stop.state.foodProduction,
        foodConsumption: stop.state.foodConsumption,
        lumberOutput: stop.state.lumberProduction,
        stoneOutput: stop.state.stoneProduction,
      });
      return [
        arm.arm,
        {
          stateEqualToP36Stop: canonical(left) === canonical(right),
          p36EventsEqualToP36:
            canonical(
              arm.p36.policyEvents.filter((event) => event.period <= 688),
            ) === canonical(p36Prefix),
          nativeActionOrderEqualToP36:
            canonical(checkpoint(arm, 688).nativeCalls) ===
            canonical(p36PrefixCalls),
        },
      ];
    }),
  );
  const AtoBThrough688 = parityThrough(A, B, 688);
  const AtoBExactThrough688 = AtoBThrough688.every(
    (entry) =>
      entry.saveHashEqual &&
      entry.stateEqual &&
      entry.nativeCallsEqual &&
      entry.controlUsageEqual &&
      entry.rngEqual,
  );
  const AtoBRepeatExactThrough688 = parityThrough(A, BRepeat, 688).every(
    (entry) =>
      entry.saveHashEqual &&
      entry.stateEqual &&
      entry.nativeCallsEqual &&
      entry.controlUsageEqual &&
      entry.rngEqual,
  );
  assert.ok(
    p36ParityAt448.every(
      (entry) =>
        entry.saveHashEqual &&
        entry.stateEqual &&
        entry.nativeCallsEqual &&
        entry.controlUsageEqual &&
        entry.rngEqual,
    ),
    "P38 A must reproduce retained P36 through p448",
  );
  assert.ok(
    Object.values(boundaryParity).every(
      (entry) =>
        entry.stateEqualToP36Stop &&
        entry.p36EventsEqualToP36 &&
        entry.nativeActionOrderEqualToP36,
    ),
    "P38 must reproduce P36 stop and native action order",
  );
  assert.ok(
    AtoBExactThrough688 && AtoBRepeatExactThrough688,
    "A and B must match through p688",
  );

  const p688Jobs = A688.jobsSnapshot;
  const p688Input = p688Jobs?.input;
  const p688Farmer = p688Input?.jobs?.find((job) => job.id === "farmer");
  assert.ok(
    p688Input?.available && p688Farmer,
    "live P688 Jobs input unavailable",
  );
  assert.equal(A688.state.population, 4);
  assert.equal(A688.state.jobs.farmer, 4);
  assert.equal(A688.state.jobs.quarry_worker ?? 0, 0);
  const purchaseObservation = (arm) =>
    arm.p38.policyEvents.find(
      (event) =>
        event.type === "p38-stopped" &&
        event.reason === "native-quarry-purchased",
    );
  const hasQuarry = (arm) =>
    arm.checkpoints.some(
      (entry) => Number(entry.state.buildings.rock_quarry ?? 0) > 0,
    ) || purchaseObservation(arm) !== undefined;
  const postPurchaseCheckpoint = (arm) =>
    arm.checkpoints.find(
      (entry) => Number(entry.state.buildings.rock_quarry ?? 0) > 0,
    );
  const purchaseAction = (arm) =>
    arm.nativeCalls.find(
      (entry) =>
        entry.elementId === "city-rock_quarry" && entry.method === "action",
    );
  const BPurchase = purchaseAction(B);
  const BPostPurchase = postPurchaseCheckpoint(B);
  let C = null;
  let CRepeat = null;
  let workerTransferPeriod = null;
  let CSkippedReason = null;
  if (
    hasQuarry(B) &&
    BPostPurchase &&
    Number(BPostPurchase.state.jobs.quarry_worker ?? 0) === 0
  ) {
    const eligible = B.checkpoints.find(
      (entry) =>
        Number(entry.state.buildings.rock_quarry ?? 0) > 0 &&
        Number(entry.state.jobs.quarry_worker ?? 0) === 0 &&
        Number(entry.production.foodOutput ?? 0) >=
          Number(entry.production.foodConsumption ?? 0) &&
        Number(entry.state.resources.Food?.amount ?? 0) > 0 &&
        Number(entry.state.starved ?? 0) === 0 &&
        Number(entry.state.deaths ?? 0) === 0,
    );
    if (eligible) {
      workerTransferPeriod = eligible.period;
      C = await replayOrReuse("C", {
        manualTransferPeriod: workerTransferPeriod,
      });
      CRepeat = await replayOrReuse("C-repeat", {
        manualTransferPeriod: workerTransferPeriod,
      });
    } else
      CSkippedReason =
        "no sampled post-purchase checkpoint has a food-safe state for the bounded transfer";
  } else if (hasQuarry(B))
    CSkippedReason =
      "ordinary autoJobs assigned a Quarry Worker; manual arm not applicable";
  else CSkippedReason = "no native Quarry purchase was observed in B";

  const repeatParity = (first, repeat) => {
    if (!first || !repeat) return null;
    const comparisons = checkpointParity(first, repeat);
    const stripTime = (value) =>
      value ? { ...value, elapsedMs: undefined } : value;
    const stripArmLabels = (events) =>
      events.map(({ arm: _arm, ...event }) => event);
    return {
      checkpointComparisons: comparisons,
      exact:
        comparisons.every(
          (entry) =>
            entry.saveHashEqual &&
            entry.stateEqual &&
            entry.nativeCallsEqual &&
            entry.controlUsageEqual &&
            entry.rngEqual,
        ) &&
        canonical(first.p36.policyEvents) ===
          canonical(repeat.p36.policyEvents) &&
        canonical(stripArmLabels(first.p38.policyEvents)) ===
          canonical(stripArmLabels(repeat.p38.policyEvents)) &&
        canonical(first.bootstrapEvents) ===
          canonical(repeat.bootstrapEvents) &&
        canonical(first.handoffEvents) === canonical(repeat.handoffEvents) &&
        first.finalExportSha256 === repeat.finalExportSha256 &&
        canonical(stripTime(first.p38.manualTransfer)) ===
          canonical(stripTime(repeat.p38.manualTransfer)),
    };
  };
  const BRepeatParity = repeatParity(B, BRepeat);
  const CRepeatParity = repeatParity(C, CRepeat);
  assert.ok(BRepeatParity?.exact, "B repeat must be deterministic");
  if (C) assert.ok(CRepeatParity?.exact, "C repeat must be deterministic");
  const BtoCBeforeTransfer = C
    ? parityThrough(B, C, workerTransferPeriod)
    : null;
  const BtoCExactBeforeTransfer =
    BtoCBeforeTransfer === null ||
    BtoCBeforeTransfer.every(
      (entry) =>
        entry.saveHashEqual &&
        entry.stateEqual &&
        entry.nativeCallsEqual &&
        entry.controlUsageEqual &&
        entry.rngEqual,
    );
  if (C)
    assert.ok(
      BtoCExactBeforeTransfer,
      "B and C must match up to the manual-transfer boundary",
    );

  const assignmentsFrom = (input, decision) => {
    if (!input || !decision) return null;
    const ids = new Map(input.jobs.map((job) => [job.token, job.id]));
    return Object.fromEntries(
      decision.assignments.map((item) => [
        ids.get(item.jobToken) ?? String(item.jobToken),
        item.workers,
      ]),
    );
  };
  const plannerPrediction = (label, snapshot, inputOverride = undefined) => {
    const input = inputOverride ?? snapshot?.input;
    if (!input?.available)
      return {
        label,
        available: false,
        reason: "captured Jobs input unavailable",
      };
    const decision = planJobs(input);
    const farmer = input.jobs.find((job) => job.id === "farmer");
    const quarryWorker = input.jobs.find((job) => job.id === "quarry_worker");
    return {
      label,
      available: true,
      defaultJobId:
        snapshot?.defaultJobId ??
        input.jobs.find((job) => job.token === input.defaultJobToken)?.id ??
        null,
      population: input.population,
      farmer: farmer
        ? {
            workers: farmer.workers,
            minimum: farmer.farmerMinimum,
            maximum: farmer.maximum,
            smartMaximum: farmer.smartMaximum,
            managed: farmer.managed,
            breakpoints: farmer.breakpoints,
            uncappedBreakpoints: farmer.uncappedBreakpoints,
          }
        : null,
      quarryWorker: quarryWorker
        ? {
            workers: quarryWorker.workers,
            maximum: quarryWorker.maximum,
            smartMaximum: quarryWorker.smartMaximum,
            managed: quarryWorker.managed,
            breakpoints: quarryWorker.breakpoints,
            uncappedBreakpoints: quarryWorker.uncappedBreakpoints,
          }
        : null,
      existingAssignments: assignmentsFrom(input, {
        assignments: input.jobs.map((job) => ({
          jobToken: job.token,
          workers: job.workers,
        })),
      }),
      predictedAssignments: assignmentsFrom(input, decision),
      selectedDefaultJobId:
        input.jobs.find((job) => job.token === decision.selectedDefaultToken)
          ?.id ?? null,
      decision,
    };
  };
  const actualP688Planner = plannerPrediction(
    "captured p688 four-resident Jobs state",
    p688Jobs,
  );
  const quarryToken = p688Input.quarryToken;
  const quarryBreakpoints = p688Input.splitEntries.find(
    (entry) => entry.jobToken === quarryToken,
  )?.breakpoints ?? [4, 10, 0];
  const farmerPosition = p688Input.jobs.findIndex((job) => job.id === "farmer");
  assert.ok(quarryToken !== null && farmerPosition >= 0);
  const hypotheticalQuarryRow = {
    token: quarryToken,
    id: "quarry_worker",
    kind: "quarry-worker",
    workers: 0,
    servants: 0,
    count: 0,
    maximum: -1,
    managed: true,
    unlocked: true,
    smart: true,
    crafting: false,
    serves: false,
    split: true,
    isDefault: false,
    breakpoints: [...quarryBreakpoints],
    uncappedBreakpoints: [...quarryBreakpoints],
    smartMaximum: Number.MAX_SAFE_INTEGER,
    farmerMinimum: null,
    storageBackedMinimum: null,
    demonicLumber: false,
    warlordMiner: false,
  };
  const hypotheticalJobs = [...p688Input.jobs];
  hypotheticalJobs.splice(farmerPosition + 1, 0, hypotheticalQuarryRow);
  const hypotheticalInput = {
    ...p688Input,
    jobs: hypotheticalJobs,
    quarryToken,
  };
  const hypotheticalPlanner = {
    ...plannerPrediction(
      "hypothetical unlocked-Quarry catalog applied to captured p688 economy",
      { ...p688Jobs, input: hypotheticalInput },
      hypotheticalInput,
    ),
    nativeObservation: false,
    catalogSource: {
      label: "hypothetical unlock; not a native post-purchase observation",
      tokenAndKind: "captured-job-catalog canonical quarry_worker token/kind",
      managedPriorityOrder: `inserted after Farmer using captured settings priority ${p688Jobs.settings.farmerPriority} < ${p688Jobs.settings.quarryWorkerPriority}`,
      breakpoints:
        "captured p688 split-entry settings for the locked Quarry Worker",
      maximum: "hypothetical unlimited native maximum (-1)",
      smartMaximum:
        "optimistic unbounded cap; pure planner result is a formula projection",
      remainingFields:
        "zero workers/count, managed/unlocked/smart/split flags, and no servant/crafting capacity are hypothetical catalog fields",
    },
  };
  const postPurchaseForPlanner =
    BPostPurchase ??
    B.checkpoints.find((entry) =>
      entry.jobsSnapshot?.input?.jobs?.some(
        (job) => job.id === "quarry_worker",
      ),
    );
  const actualPostPurchasePlanner = postPurchaseForPlanner
    ? plannerPrediction(
        "live ordinary Jobs planner input after native Quarry unlock",
        postPurchaseForPlanner.jobsSnapshot,
      )
    : {
        label: "live ordinary Jobs planner input after native Quarry unlock",
        available: false,
        reason: "no native Quarry purchase",
      };
  const plannerWouldRetainAllFarmers =
    actualPostPurchasePlanner.available &&
    actualPostPurchasePlanner.predictedAssignments.farmer === 4 &&
    Number(
      actualPostPurchasePlanner.predictedAssignments.quarry_worker ?? 0,
    ) === 0;
  const jobPolicyObstacle = plannerWouldRetainAllFarmers
    ? "Captured planner keeps all four residents on Farmer: priority 5 precedes Quarry Worker priority 8 and the Farmer breakpoints are unbounded after normalization. Ordinary Jobs weighting was not changed."
    : null;
  const foodSafe = (entry) =>
    Number(entry.production.foodOutput ?? 0) >
      Number(entry.production.foodConsumption ?? 0) &&
    Number(entry.state.resources.Food?.amount ?? 0) > 0 &&
    Number(entry.state.starved ?? 0) === 0 &&
    Number(entry.state.deaths ?? 0) === 0;
  const stableFoodSamples = (arm, fromPeriod = 1_000) =>
    arm.checkpoints.filter(
      (entry) => entry.period >= fromPeriod && entry.period <= 10_000,
    );
  const summarizeProduction = (arm, fromPeriod = 1_000) => {
    if (!arm) return null;
    const samples = stableFoodSamples(arm, fromPeriod);
    const quarrySamples = samples.filter(
      (entry) => Number(entry.state.buildings.rock_quarry ?? 0) > 0,
    );
    const assignedSamples = quarrySamples.filter(
      (entry) => Number(entry.state.jobs.quarry_worker ?? 0) > 0,
    );
    const populationStable =
      samples.length > 0 &&
      samples.every(
        (entry) =>
          entry.state.population === samples[0].state.population &&
          entry.state.populationCapacity ===
            samples[0].state.populationCapacity &&
          Number(entry.state.populationCapacity ?? 0) >=
            Number(entry.state.population ?? 0),
      );
    const assignmentStable =
      assignedSamples.length >= 2 &&
      assignedSamples.every(
        (entry) =>
          Number(entry.state.jobs.quarry_worker ?? 0) ===
            Number(assignedSamples[0].state.jobs.quarry_worker ?? 0) &&
          entry.state.jobs.farmer === assignedSamples[0].state.jobs.farmer &&
          entry.state.population === assignedSamples[0].state.population &&
          entry.state.populationCapacity ===
            assignedSamples[0].state.populationCapacity,
      );
    return {
      fromPeriod,
      sampleCount: samples.length,
      quarryOwnedAtAnySample: quarrySamples.length > 0,
      actualQuarryWorkerAssignedAtAnySample: assignedSamples.length > 0,
      positiveStoneWithAssignedWorkerAtAnySample: assignedSamples.some(
        (entry) => Number(entry.production.stoneOutput ?? 0) > 0,
      ),
      sustainedPositiveStoneWithAssignedWorker:
        assignedSamples.length >= 2 &&
        assignedSamples.every(
          (entry) => Number(entry.production.stoneOutput ?? 0) > 0,
        ),
      foodMarginPositiveAtEveryAssignedSample:
        assignedSamples.length > 0 && assignedSamples.every(foodSafe),
      foodSustainableAcrossInterval:
        assignedSamples.length >= 2 && assignedSamples.every(foodSafe),
      populationAndHousingStable: populationStable,
      assignmentStableAcrossSamples: assignmentStable,
      ordinaryJobsPreservesAssignment:
        assignedSamples.length >= 2 && assignmentStable,
      starvation: Math.max(
        0,
        ...samples.map((entry) => Number(entry.state.starved ?? 0)),
      ),
      deaths: Math.max(
        0,
        ...samples.map((entry) => Number(entry.state.deaths ?? 0)),
      ),
      foodTimeSeries: samples.map((entry) => ({
        period: entry.period,
        foodStock: entry.state.resources.Food?.amount ?? null,
        foodOutput: entry.production.foodOutput,
        foodConsumption: entry.production.foodConsumption,
        foodMargin:
          Number(entry.production.foodOutput ?? 0) -
          Number(entry.production.foodConsumption ?? 0),
        stoneStock: entry.state.resources.Stone?.amount ?? null,
        stoneOutput: entry.production.stoneOutput,
        population: entry.state.population,
        populationCapacity: entry.state.populationCapacity,
        housing: entry.state.buildings.basic_housing ?? 0,
        farmers: entry.state.jobs.farmer ?? 0,
        quarryWorkers: entry.state.jobs.quarry_worker ?? 0,
        starved: entry.state.starved,
        deaths: entry.state.deaths,
      })),
      samples,
      assignedSamples,
    };
  };
  const BProduction = summarizeProduction(B);
  const CTransferSucceeded = C?.p38.manualTransfer?.postcondition === true;
  const CProduction = C
    ? summarizeProduction(C, workerTransferPeriod + 1)
    : null;

  const graphForArm = (arm, assignmentProvenance) => {
    if (!arm) return null;
    const selected = checkpoint(arm, 10_000);
    const jobsSnapshot = selected?.jobsSnapshot;
    const jobsInput = jobsSnapshot?.input;
    if (!selected || !jobsInput?.available)
      return {
        available: false,
        reason: "native p10000 state or Jobs capture unavailable",
      };
    const controlIdentity = hash(
      JSON.stringify(jobsSnapshot.controlGenerations ?? []),
    );
    const validityEpoch = `p38:${arm.arm}:p10000:root=${jobsSnapshot.rootGeneration}:progression=${jobsSnapshot.progressionGeneration}:controls=${controlIdentity}`;
    const sourceId = `p38:${arm.arm}:p10000:root=${jobsSnapshot.rootGeneration}:progression=${jobsSnapshot.progressionGeneration}`;
    const state = {
      id: `native-state-${arm.arm}-p10000`,
      snapshotId: sourceId,
      period: 10_000,
      validityEpoch,
      race: "standard-human",
      population: selected.state.population,
      populationCapacity: selected.state.populationCapacity,
      basicHousing: Number(selected.state.buildings.basic_housing ?? 0),
      farmCount: Number(selected.state.buildings.farm ?? 0),
      quarryCount: Number(selected.state.buildings.rock_quarry ?? 0),
      farmers: Number(selected.state.jobs.farmer ?? 0),
      quarryWorkers: Number(selected.state.jobs.quarry_worker ?? 0),
      miningLevel: Number(
        selected.state.tech?.mining?.level ?? selected.state.tech?.mining ?? 0,
      ),
      lumberCapacity: selected.state.resources.Lumber?.max ?? undefined,
      stoneCapacity: selected.state.resources.Stone?.max ?? undefined,
      foodOutput: selected.production.foodOutput,
      foodConsumption: selected.production.foodConsumption,
      lumberProduction: selected.production.lumberOutput,
      stoneProduction: selected.production.stoneOutput,
    };
    const assigned = arm.checkpoints.filter(
      (entry) =>
        entry.period >= 1_000 &&
        Number(entry.state.buildings.rock_quarry ?? 0) > 0 &&
        Number(entry.state.jobs.quarry_worker ?? 0) > 0,
    );
    const farmerJob = jobsInput.jobs.find((job) => job.id === "farmer");
    const first = assigned[0];
    const stable =
      assigned.length >= 2 &&
      assigned.every(
        (entry) =>
          Number(entry.state.jobs.quarry_worker ?? 0) ===
            Number(assigned[0].state.jobs.quarry_worker ?? 0) &&
          entry.state.jobs.farmer === assigned[0].state.jobs.farmer &&
          entry.state.population === assigned[0].state.population &&
          entry.state.populationCapacity ===
            assigned[0].state.populationCapacity,
      );
    const foodPositive = assigned.length >= 2 && assigned.every(foodSafe);
    const labor = {
      id: `native-food-labor-interval-${arm.arm}`,
      snapshotId: first
        ? `${arm.arm}:p${first.period}-p${assigned.at(-1)?.period}`
        : `${arm.arm}:no-quarry-worker-sample`,
      period: first?.period ?? 10_000,
      validityEpoch,
      minimumFarmers: farmerJob?.farmerMinimum ?? undefined,
      farmersAfterReassignment: first?.state.jobs.farmer ?? state.farmers,
      foodOutputAfterReassignment: first?.production.foodOutput ?? undefined,
      foodConsumptionAtPopulation:
        first?.production.foodConsumption ?? undefined,
      oneQuarryWorkerStoneOutputPositive: assigned.some(
        (entry) =>
          Number(entry.state.jobs.quarry_worker ?? 0) === 1 &&
          Number(entry.production.stoneOutput ?? 0) > 0,
      ),
      stableThroughPeriod: assigned.at(-1)?.period ?? 10_000,
      stableSampleCount: assigned.length,
      ...(assigned.length >= 2
        ? {
            foodObservedPositiveAtEverySample: foodPositive,
            foodObservedStableAcrossSamples: stable,
          }
        : {}),
      nativeAssignmentObserved: Number(state.quarryWorkers) > 0,
    };
    const capturedSettings = jobsSnapshot.settings;
    const jobSettings = {
      id: `native-job-settings-${arm.arm}-p10000`,
      snapshotId: sourceId,
      period: 10_000,
      validityEpoch,
      autoJobs: capturedSettings.autoJobs,
      jobSetDefault: capturedSettings.jobSetDefault,
      quarryWorkerEnabled: capturedSettings.quarryWorkerEnabled,
      farmerEnabled: capturedSettings.farmerEnabled,
      quarryWorkerPriority: Number(capturedSettings.quarryWorkerPriority),
      farmerPriority: Number(capturedSettings.farmerPriority),
      quarryWorkerBreakpoints: capturedSettings.quarryWorkerBreakpoints,
      farmerBreakpoints: capturedSettings.farmerBreakpoints,
      priorityOrderEvidence: {
        id: `native-managed-job-priority-order-${arm.arm}`,
        snapshotId: sourceId,
        period: 10_000,
        validityEpoch,
      },
      breakpointEvidence: {
        id: `native-job-breakpoints-${arm.arm}`,
        snapshotId: sourceId,
        period: 10_000,
        validityEpoch,
      },
    };
    const graphInput = {
      analysisSnapshotId: sourceId,
      validityEpoch,
      pinnedGame: { revision: pinnedGame, sha256: pinnedGameSha256 },
      state,
      labor,
      jobSettings,
      nativeMechanics: {
        requiredMiningLevel: 1,
        raceId: "standard-human",
        raceEligible: true,
        quarryUnlocksQuarryWorker: true,
        storageWithoutShed: {
          Lumber: state.lumberCapacity,
          Stone: state.stoneCapacity,
        },
        storageEvidence: {
          id: `native-storage-${arm.arm}`,
          snapshotId: sourceId,
          period: 10_000,
          validityEpoch,
        },
        mechanicsEvidence: {
          id: "pinned-quarry-and-housing-mechanics",
          snapshotId: pinnedGame,
          pinnedGameRevision: pinnedGame,
          sourceSha256: pinnedGameSha256,
        },
      },
    };
    return {
      available: true,
      assignmentProvenance,
      source: {
        period: 10_000,
        rootGeneration: jobsSnapshot.rootGeneration,
        progressionGeneration: jobsSnapshot.progressionGeneration,
        controlGenerations: jobsSnapshot.controlGenerations,
        validityEpoch,
      },
      input: graphInput,
      graph: analyzeEconomicGoalDependencies(graphInput),
    };
  };
  const graphB = graphForArm(B, "native-ordinary-autoJobs");
  const graphC = graphForArm(
    C,
    CTransferSucceeded
      ? "test-authorized-native-worker-transfer"
      : "test-authorized-transfer-not-established",
  );
  const p38Clicks = (arm) =>
    arm?.p38.policyEvents.filter((event) => event.type === "gather-click") ??
    [];
  const BPurchasePeriod =
    BPurchase?.period ?? purchaseObservation(B)?.period ?? null;
  const materialsReady = B.p38.policyEvents.find(
    (event) => event.type === "materials-ready",
  );
  const autoJobsAssigned = B.checkpoints.some(
    (entry) =>
      Number(entry.state.buildings.rock_quarry ?? 0) > 0 &&
      Number(entry.state.jobs.quarry_worker ?? 0) > 0,
  );
  const decision = !hasQuarry(B)
    ? "C"
    : BProduction?.sustainedPositiveStoneWithAssignedWorker &&
        BProduction.foodSustainableAcrossInterval &&
        BProduction.populationAndHousingStable &&
        BProduction.ordinaryJobsPreservesAssignment
      ? "A"
      : CTransferSucceeded &&
          CProduction?.sustainedPositiveStoneWithAssignedWorker &&
          CProduction.foodSustainableAcrossInterval &&
          CProduction.populationAndHousingStable &&
          CProduction.ordinaryJobsPreservesAssignment
        ? "B"
        : BProduction?.actualQuarryWorkerAssignedAtAnySample ||
            (CTransferSucceeded &&
              CProduction?.actualQuarryWorkerAssignedAtAnySample)
          ? "D"
          : "B";
  const exactFirstBlocker =
    decision === "A"
      ? "none"
      : decision === "C"
        ? materialsReady
          ? "ordinary-native-construction-did-not-purchase-quarry-after-materials-ready"
          : (B.p38.policySnapshot?.stoppedReason ??
            "bounded-18-click-gather-did-not-complete-quarry-price")
        : decision === "D"
          ? "assigned-quarry-worker-did-not-produce-sustainable-positive-stone-and-food-through-p10000"
          : (jobPolicyObstacle ??
            CSkippedReason ??
            C?.p38.manualTransfer?.reason ??
            "ordinary-autoJobs-did-not-establish-a-sustained-quarry-worker-chain");
  const armPerformance = (arm) => ({
    p36GatherClicks: arm.p36.policyEvents.filter(
      (event) => event.type === "gather-click",
    ).length,
    p38GatherClicks: p38Clicks(arm).length,
    actualValidationFences: arm.p36.metrics?.validationFences ?? null,
    freshNativePriceProbes: arm.p36.metrics?.freshPriceProbes ?? null,
    validationFenceElapsedMs: arm.p36.metrics?.validationFenceElapsedMs ?? null,
    freshPriceProbeElapsedMs: arm.p36.metrics?.freshPriceProbeElapsedMs ?? null,
    ordinaryJobsExecutions: arm.p38.metrics?.ordinaryJobsExecutions ?? 0,
    ordinaryJobsExecutionElapsedMs:
      arm.p38.metrics?.ordinaryJobsExecutionElapsedMs ?? 0,
    nativeJobControlOperations: arm.nativeCalls.filter((entry) =>
      entry.elementId.startsWith("civ-"),
    ).length,
    diagnosticWorkerControlOperations:
      arm.p38.metrics?.nativeJobOperations ?? 0,
    diagnosticWorkerControlElapsedMs:
      arm.p38.metrics?.nativeJobControlElapsedMs ?? 0,
    inPageTimerNote:
      "Synchronous callback elapsed timers returned 0ms in this replay; counts are retained, and runner phase timings below are the measured synchronous costs.",
    measuredRunnerPhases: {
      constructionAction: perfPhaseSummary(
        arm.performanceSamples,
        "buildingAlwaysClick",
      ),
      fullJobsCatalog: perfPhaseSummary(
        arm.performanceSamples,
        "jobs.full.catalog",
      ),
      ordinaryJobsAssignment: perfPhaseSummary(
        arm.performanceSamples,
        "jobs.full.ordinary",
      ),
      allAutoJobs: perfPhaseSummary(arm.performanceSamples, "autoJobs"),
      nativePriceReads: perfPhaseSummary(
        arm.performanceSamples,
        "drawn-actions.native-price",
      ),
    },
    synchronousBuildingAlwaysClickMs: perfPhaseTotal(
      arm.performanceSamples,
      "buildingAlwaysClick",
    ),
  });
  const arms = [
    A,
    B,
    BRepeat,
    ...(C ? [C] : []),
    ...(CRepeat ? [CRepeat] : []),
  ];
  const replayEvidence = {
    experiment: "P38 Native Quarry completion and productive employment",
    schemaVersion: 1,
    decision,
    exactFirstBlocker,
    pinnedGame,
    pinnedGameSha256,
    fixtureSha256,
    fixturePath:
      "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
    settingsPath: "experiments/p18-standard-human-settings.json",
    settingsCanonicalSha256: hash(JSON.stringify(settings)),
    seed,
    epoch,
    p36ImplementationCommit: "06d9e9e1",
    p36TestsCommit: "27a5e1f9",
    startingCommit: "48056a31",
    p19AcceptedEvidenceSha256: hash(p19Text),
    replayHarnessSha256: A.replayHarnessSha256 ?? replayHarnessSha256,
    evidenceGeneratorSha256: replayHarnessSha256,
    runtimeBundleSha256,
    p36PolicyBundleSha256: policyBundleSha256,
    p38PolicyBundleSha256,
    p19BootstrapAndHandoff: {
      clicks: B.bootstrapEvents.length,
      handoffs: B.handoffEvents.length,
      periods: [...new Set(B.bootstrapEvents.map((event) => event.period))],
      verified:
        B.bootstrapEvents.length === 10 &&
        B.bootstrapEvents.every((event) => event.period === 8) &&
        B.handoffEvents.length === 10,
    },
    p36Boundary: {
      period: 688,
      stopReason: stop688(A)?.reason,
      targetId: stop688(A)?.targetId,
      shortage: stop688(A)?.shortage,
      state: A688.state,
      retainedP36Comparison: boundaryParity,
      AtoBThrough688: AtoBThrough688,
      exactAtoBThrough688: AtoBExactThrough688,
      exactAtoBRepeatThrough688: AtoBRepeatExactThrough688,
      unchangedP36Limits: P36_BOOTSTRAP_LIMITS,
      p36GatherActions: stop688(A)?.totalClicks,
      p36StageClicks: stop688(A)?.stageClicks,
    },
    arms,
    repeats: { B: BRepeatParity, C: CRepeatParity },
    BtoCBeforeWorkerTransfer: {
      period: workerTransferPeriod,
      comparisons: BtoCBeforeTransfer,
      exact: BtoCExactBeforeTransfer,
    },
    performance: Object.fromEntries(
      arms.map((arm) => [arm.arm, armPerformance(arm)]),
    ),
    cpuTwoPercentProductionGate:
      "unresolved; no whole-window CPU comparison was repeated or inferred",
    generatedAt: new Date().toISOString(),
  };
  const authorizationEvidence = {
    experiment:
      "P38 separate test-only native Construction Gather authorization",
    authorization: P38_DIAGNOSTIC_AUTHORIZATION,
    provenance:
      "P36 stopped at p688 with one original action remaining; P38 grants a new independent authorization in B/B-repeat/C/C-repeat only.",
    arms: arms.map((arm) => ({
      arm: arm.arm,
      p36Stop: stop688(arm),
      p38Events: arm.p38.policyEvents,
      p38PolicySnapshot: arm.p38.policySnapshot,
      metrics: arm.p36.metrics,
      gatherActions: p38Clicks(arm),
      gatherControlUsage: Object.fromEntries(
        Object.entries(arm.controlUsage).filter(([key]) =>
          /^(city-lumber|undefined-stone)\.action$/.test(key),
        ),
      ),
      nativeActionOrder: arm.nativeCalls.filter(
        (entry) =>
          entry.elementId.startsWith("city-") && entry.method === "action",
      ),
      performance: armPerformance(arm),
    })),
  };
  const jobsAudit = {
    capturedP688Planner: actualP688Planner,
    hypotheticalUnlockedQuarryCatalog: hypotheticalPlanner,
    livePostPurchasePlanner: actualPostPurchasePlanner,
    defaultJob: p688Jobs.defaultJobId,
    existingAssignments: A688.state.jobs,
    settings: p688Jobs.settings,
    farmerMinimum: p688Farmer.farmerMinimum,
    farmerMaximum: p688Farmer.maximum,
    farmerSmartMaximum: p688Farmer.smartMaximum,
    farmerNormalizedBreakpoints: p688Farmer.breakpoints,
    farmerUncappedBreakpoints: p688Farmer.uncappedBreakpoints,
    quarryWorkerMaximum: hypotheticalQuarryRow.maximum,
    quarryWorkerBreakpoints: hypotheticalQuarryRow.breakpoints,
    quarryWorkerCatalogFieldsAreHypothetical: true,
    plannerWouldRetainAllFarmers: plannerWouldRetainAllFarmers,
    policyObstacle: jobPolicyObstacle,
  };
  const jobsAuditEvidence = {
    experiment: "P38 captured and hypothetical Native Jobs planner audit",
    provenance: {
      capturedInput:
        "genuine native P688 four-resident input while Quarry Worker remains locked",
      hypotheticalInput:
        "pure formula catalog projection; Quarry Worker unlock, row fields and smart maximum were not natively observed",
      priority:
        "captured settings order Farmer 5 before Quarry Worker 8; hypothetical row inserted after Farmer",
    },
    capturedP688Input: p688Input,
    capturedP688Planner: actualP688Planner,
    capturedSettings: p688Jobs.settings,
    hypotheticalUnlockedInput: hypotheticalInput,
    hypotheticalUnlockedPlanner: hypotheticalPlanner,
    livePostPurchasePlanner: actualPostPurchasePlanner,
    physicalManualTransfer:
      "not reached: native Construction did not purchase Quarry",
  };
  const productionEvidence = {
    experiment: "P38 native Quarry production outcomes",
    decision,
    exactFirstBlocker,
    quarryPurchase: {
      observed: hasQuarry(B),
      nativeConstructionAction: BPurchase ?? null,
      purchasePeriod: BPurchasePeriod,
      materialsReadyNativeAuthority: materialsReady ?? null,
      postPurchaseObservation: purchaseObservation(B) ?? null,
      postPurchaseCheckpoint: BPostPurchase ?? null,
      completePrice: materialsReady?.price ?? null,
      stockBeforePurchase: materialsReady?.stock ?? null,
      postPurchasePriceAndStock: purchaseObservation(B)
        ? {
            price: purchaseObservation(B).price,
            stock: purchaseObservation(B).stock,
            state: purchaseObservation(B).state,
          }
        : null,
    },
    jobsAudit,
    ordinaryAutoJobs: {
      assignedQuarryWorkerAtAnyCheckpoint: autoJobsAssigned,
      assignmentsByPeriod: B.checkpoints
        .filter((entry) => entry.period >= 688)
        .map((entry) => ({
          period: entry.period,
          farmer: entry.state.jobs.farmer ?? 0,
          quarryWorker: entry.state.jobs.quarry_worker ?? 0,
        })),
      nativeJobsTrace: B.p38.jobTrace,
      plannerWouldRetainAllFarmers,
      policyObstacle: jobPolicyObstacle,
      outcome: BProduction,
    },
    manualWorkerArm: C
      ? {
          arm: C.arm,
          repeatArm: CRepeat?.arm ?? null,
          interventionPeriod: workerTransferPeriod,
          transfer: C.p38.manualTransfer,
          repeatedTransfer: CRepeat?.p38.manualTransfer,
          ordinaryJobsAfterTransfer: C.checkpoints
            .filter((entry) => entry.period > workerTransferPeriod)
            .map((entry) => ({
              period: entry.period,
              farmer: entry.state.jobs.farmer ?? 0,
              quarryWorker: entry.state.jobs.quarry_worker ?? 0,
            })),
          nativeJobsTrace: C.p38.jobTrace,
          outcome: CProduction,
        }
      : { applicable: false, reason: CSkippedReason },
    graphAnalyzer: { B: graphB, C: graphC },
    provenance: {
      ordinaryNativeProgression: [
        "native Construction purchase",
        "ordinary autoJobs",
        "native Food and Stone production",
      ],
      testAuthorizedGather: P38_DIAGNOSTIC_AUTHORIZATION.id,
      testAuthorizedWorkerTransfer: CTransferSucceeded
        ? "captured native controls: sub Farmer, add Quarry Worker; diagnostic only"
        : "not performed or not established",
      productionProjectionUsed: false,
      directResourceOrCivicMutation: false,
      newCatalogDraw: false,
    },
  };
  if (p40TraceEnabled) {
    const p40Evidence = createP40ConstructionEvidence({
      retainedP38Evidence,
      retainedP38EvidenceText,
      tracedB: B,
      tracedBRepeat: BRepeat,
      metadata: {
        pinnedGame,
        fixtureSha256,
        seed,
        epoch,
        retainedP38EvidenceSha256: hash(Buffer.from(retainedP38EvidenceText)),
        p40HarnessSha256: hash(await readFile(p40HarnessPath)),
        p40RunnerSha256: hash(await readFile(fileURLToPath(import.meta.url))),
        p40PluginSha256: hash(await readFile(p40PluginPath)),
        pluginBytes: (await readFile(p40PluginPath)).byteLength,
        runtimeBundleSha256,
        traceRepeatSha256: hash(
          Buffer.from(canonical(BRepeat.p40?.events ?? [])),
        ),
      },
    });
    let p40Formatted = await prettier.format(JSON.stringify(p40Evidence), {
      parser: "json",
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      p40Evidence.traceSizes.formattedEvidenceBytes =
        Buffer.byteLength(p40Formatted);
      const next = await prettier.format(JSON.stringify(p40Evidence), {
        parser: "json",
      });
      if (next === p40Formatted) break;
      p40Formatted = next;
    }
    await writeFile(p40TracePath, p40Formatted);
  }
  await writeFile(
    evidencePath,
    await prettier.format(JSON.stringify(replayEvidence), { parser: "json" }),
  );
  await writeFile(
    path.join(
      root,
      "experiments/p38-quarry-production-validation-authority.json",
    ),
    await prettier.format(JSON.stringify(authorizationEvidence), {
      parser: "json",
    }),
  );
  await writeFile(
    path.join(
      root,
      "experiments/p38-quarry-production-validation-production.json",
    ),
    await prettier.format(JSON.stringify(productionEvidence), {
      parser: "json",
    }),
  );
  await writeFile(
    jobsEvidencePath,
    await prettier.format(JSON.stringify(jobsAuditEvidence), {
      parser: "json",
    }),
  );
  console.log(
    JSON.stringify(
      {
        decision,
        exactFirstBlocker,
        AtoBExactThrough688,
        BRepeatExact: BRepeatParity.exact,
        CRepeatExact: CRepeatParity?.exact ?? null,
        p38GatherActions: p38Clicks(B).length,
        quarryPurchasePeriod: BPurchasePeriod,
        p688Jobs: actualP688Planner,
        hypotheticalPlanner,
        actualPostPurchasePlanner,
        transfer: C?.p38.manualTransfer ?? null,
        BProduction: BProduction && {
          assigned: BProduction.actualQuarryWorkerAssignedAtAnySample,
          sustainedStone: BProduction.sustainedPositiveStoneWithAssignedWorker,
          sustainableFood: BProduction.foodSustainableAcrossInterval,
        },
        CProduction: CProduction && {
          assigned: CProduction.actualQuarryWorkerAssignedAtAnySample,
          sustainedStone: CProduction.sustainedPositiveStoneWithAssignedWorker,
          sustainableFood: CProduction.foodSustainableAcrossInterval,
        },
        evidencePath,
        jobsEvidencePath,
        authorityPath:
          "experiments/p38-quarry-production-validation-authority.json",
        productionPath:
          "experiments/p38-quarry-production-validation-production.json",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await runner.close();
}
