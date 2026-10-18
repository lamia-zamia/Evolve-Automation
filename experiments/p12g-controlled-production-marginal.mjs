import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import { compareGoalStrategies } from "../src/domain/economy/goal-feasibility.ts";
import { planSmelter } from "../src/domain/economy/production/smelter.ts";
import {
  createChromiumRunner,
  decodeExport,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const upstream = "D:/work/Evolve-DeadSpace";
const seed = 42;
const epoch = "2026-09-21T00:00:00.000Z";
const horizon = 100;
const steelGoalAction = "tech-steel_containers";
const steelGoalPrice = 250;
const outputPath =
  process.argv.find((value) => value.startsWith("--out="))?.slice(6) ??
  path.join(
    root,
    "test-artifacts/benchmark/tmp/p12g-controlled-production-marginal.json",
  );
const capturePath = process.argv
  .find((value) => value.startsWith("--capture="))
  ?.slice(10);
const hash = (value) => createHash("sha256").update(value).digest("hex");

const startSaveText = await readFile(savePath, "utf8");
const baseSettings = {
  ...JSON.parse(await readFile(settingsPath, "utf8")),
  autoResearch: true,
  autoSmelter: true,
};
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const built = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata}\n\n// P12G isolated-runner observation surface.\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}) };\nwindow.__EA_TEST_HOOKS__.p12gPlans = [];\nwindow.__EA_TEST_HOOKS__.observeSmelterPlanForTest = (input, decision, demand) => { const hooks = window.__EA_TEST_HOOKS__; if (demand.requestedSteel >= 250 && input.initialised && input.steelCount < 1 && decision.smeltAdjustments?.some((item) => item.productionId === \"Steel\" && item.delta > 0)) hooks.p12gPlans.push({ period: window.__EA_RUNNER__.periods(), input, decision, demand, exportSave: window.exportGame() }); };`,
  },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p12g-test.user.js",
);
await mkdir(path.dirname(bundlePath), { recursive: true });
await writeFile(bundlePath, built.outputFiles[0].contents);

function steelDelta(decision) {
  return (
    decision?.smeltAdjustments?.find(
      ({ productionId }) => productionId === "Steel",
    )?.delta ?? 0
  );
}

function resourceSnapshot(state) {
  return Object.fromEntries(
    Object.entries(state.resource ?? {}).flatMap(([id, value]) => {
      if (typeof value?.amount !== "number" || !Number.isFinite(value.amount))
        return [];
      return [
        [
          id,
          {
            amount: value.amount,
            capacity: Number.isFinite(value.max) ? value.max : null,
            rate: Number.isFinite(value.diff) ? value.diff : null,
          },
        ],
      ];
    }),
  );
}

const runner = await createChromiumRunner({ game: gamePath, upstream });
let capture;
try {
  if (capturePath !== undefined)
    capture = JSON.parse(await readFile(path.resolve(capturePath), "utf8"));
  else {
    const discovery = await runner.openSession({
      bundle: bundlePath,
      save: parseSave(startSaveText),
      settings: baseSettings,
      seed,
      epoch,
      nativeTrace: true,
      perf: true,
    });
    try {
      for (let periods = 0; periods < 4_000; periods += 25) {
        await discovery.advance(25);
        const [state, diagnostics, evidence] = await Promise.all([
          discovery.readState(),
          discovery.diagnostics(),
          discovery.evaluate(() => {
            const hooks = window.__EA_TEST_HOOKS__;
            return {
              plans: hooks.p12gPlans,
              plan: hooks.readSmelterPlanForTest?.(),
              demand: hooks.readSmelterDemandForTest?.(),
              catalog: hooks.readCurrentResearchCatalog?.(
                "tech-industrialization",
              ),
            };
          }),
        ]);
        if (
          baseSettings.autoSmelter !== true ||
          evidence.plan?.input?.initialised !== true ||
          evidence.plan.controlAvailable !== true ||
          !evidence.plan.controlMethods.includes("addMetal") ||
          (state.resource?.Steel?.amount ?? 0) >= steelGoalPrice
        )
          continue;
        const offer = evidence.catalog?.offers?.find(
          ({ elementId }) => elementId === steelGoalAction,
        );
        if (offer?.cost?.Steel !== steelGoalPrice) continue;
        const observation = evidence.plans.findLast(
          (entry) =>
            entry.demand.requestedSteel >= steelGoalPrice &&
            entry.input.steelCount < 1 &&
            steelDelta(entry.decision) > 0,
        );
        if (observation === undefined) continue;
        const observedSave = decodeExport(observation.exportSave);
        const smelter = evidence.plan.input;
        assert.equal(observation.input.initialised, true);
        assert.ok(observation.demand.requestedSteel >= steelGoalPrice);
        assert.ok(
          (observedSave.resource?.Steel?.amount ?? Infinity) < steelGoalPrice,
        );
        capture = {
          period: observation.period,
          exportSave: observation.exportSave,
          saveSha256: hash(observation.exportSave),
          rootGeneration: evidence.catalog.rootGeneration,
          progressionEpoch: evidence.catalog.progressionEpoch,
          offer,
          currentState: {
            resources: resourceSnapshot(observedSave),
            smelter: observedSave.city?.smelter,
            demand: observation.demand,
          },
          preAdjustment: observation,
          liveControl: {
            available: evidence.plan.controlAvailable,
            methods: evidence.plan.controlMethods,
          },
          permissions: { autoSmelter: baseSettings.autoSmelter },
          currentPlan: evidence.plan,
          discoveryDiagnostics: {
            workTicks: diagnostics.workTicks,
            controlUsage: diagnostics.controlUsage,
          },
        };
        break;
      }
    } finally {
      await discovery.close();
    }
  }

  assert.ok(
    capture,
    "no observed enabled Smelter state satisfied the live Steel-goal conditions",
  );

  async function replay(id, settings) {
    const session = await runner.openSession({
      bundle: bundlePath,
      save: parseSave(capture.exportSave),
      settings,
      seed,
      epoch,
      nativeTrace: true,
      perf: true,
    });
    const samples = [];
    try {
      const beforeMetrics = await session.metrics();
      const initialState = decodeExport(capture.exportSave);
      let startAuthority;
      let observationReadMs = [];
      for (let elapsed = 0; elapsed < horizon; elapsed += 10) {
        await session.advance(10);
        const [state, diagnostics, evidence] = await Promise.all([
          session.readState(),
          session.diagnostics(),
          session.evaluate(() => ({
            plan: window.__EA_TEST_HOOKS__.readSmelterPlanForTest?.(),
            demand: window.__EA_TEST_HOOKS__.readSmelterDemandForTest?.(),
            catalog: window.__EA_TEST_HOOKS__.readCurrentResearchCatalog?.(
              "tech-industrialization",
            ),
            plans: window.__EA_TEST_HOOKS__.p12gPlans,
          })),
        ]);
        if (startAuthority === undefined) {
          startAuthority = evidence;
          observationReadMs = await session.evaluate(() =>
            Array.from({ length: 10 }, () => {
              const started = performance.now();
              window.__EA_TEST_HOOKS__.readSmelterPlanForTest();
              window.__EA_TEST_HOOKS__.readSmelterDemandForTest();
              return performance.now() - started;
            }),
          );
        }
        samples.push({
          elapsed: elapsed + 10,
          resources: resourceSnapshot(state),
          smelter: state.city?.smelter,
          demand: evidence.demand,
          currentPlan: evidence.plan,
          planCount: evidence.plans.length,
          controlUsage: diagnostics.controlUsage,
          randomCalls: diagnostics.randomCalls,
          nativeInvocations: diagnostics.nativeInvocations ?? [],
          researchInvocations: (diagnostics.nativeInvocations ?? []).filter(
            ({ elementId }) => elementId.startsWith("tech-"),
          ),
          workTicks: diagnostics.workTicks,
        });
      }
      const afterMetrics = await session.metrics();
      const exported = await session.exportSave();
      const diagnostics = await session.diagnostics();
      return {
        id,
        settings: {
          autoSmelter: settings.autoSmelter,
          productionSmelting: settings.productionSmelting,
        },
        initialResources: resourceSnapshot(initialState),
        initialSmelter: initialState.city?.smelter,
        initialStateSha256: hash(JSON.stringify(initialState)),
        startAuthority,
        observationReadMs,
        finalExportSha256: hash(exported),
        samples,
        final: {
          state: resourceSnapshot(await session.readState()),
          smelter: (await session.readState()).city?.smelter,
          controlUsage: diagnostics.controlUsage,
          randomCalls: diagnostics.randomCalls,
          nativeInvocations: diagnostics.nativeInvocations ?? [],
          researchInvocations: (diagnostics.nativeInvocations ?? []).filter(
            ({ elementId }) => elementId.startsWith("tech-"),
          ),
          workTicks: diagnostics.workTicks,
          rendererTaskSec:
            afterMetrics.TaskDuration - beforeMetrics.TaskDuration,
          rendererScriptSec:
            afterMetrics.ScriptDuration - beforeMetrics.ScriptDuration,
        },
      };
    } finally {
      await session.close();
    }
  }

  const required = await replay("native-baseline", baseSettings);
  const alternativeSettings = { ...baseSettings, productionSmelting: "steel" };
  const alternative = await replay(
    "steel-oriented-native-allocation",
    alternativeSettings,
  );

  assert.equal(required.samples.length, alternative.samples.length);
  const sameStart =
    JSON.stringify(required.initialResources) ===
      JSON.stringify(alternative.initialResources) &&
    JSON.stringify(required.initialSmelter) ===
      JSON.stringify(alternative.initialSmelter);
  assert.equal(
    sameStart,
    true,
    "paired replays must start from identical saved resource holdings",
  );
  assert.equal(
    required.startAuthority.catalog.rootGeneration,
    alternative.startAuthority.catalog.rootGeneration,
  );
  assert.deepEqual(
    required.startAuthority.demand,
    alternative.startAuthority.demand,
  );
  assert.deepEqual(
    required.startAuthority.plan.controlMethods,
    alternative.startAuthority.plan.controlMethods,
  );
  assert.equal(required.startAuthority.plan.controlAvailable, true);
  assert.equal(alternative.startAuthority.plan.controlAvailable, true);
  const smelterCalls = (arm) =>
    Object.entries(arm.final.controlUsage)
      .filter(([key]) => key.startsWith("iSmelter."))
      .reduce((total, [, value]) => total + value.returned, 0);
  assert.ok(smelterCalls(required) > 0);
  assert.ok(smelterCalls(alternative) > 0);
  assert.equal(required.final.randomCalls, alternative.final.randomCalls);
  assert.deepEqual(
    required.final.researchInvocations,
    alternative.final.researchInvocations,
  );
  const nonSmelterInvocations = (arm) =>
    arm.final.nativeInvocations
      .filter(({ elementId }) => elementId !== "iSmelter")
      .map(({ order: _order, ...entry }) => entry);
  assert.deepEqual(
    nonSmelterInvocations(required),
    nonSmelterInvocations(alternative),
  );
  const nonSmelterControlUsage = (arm) =>
    Object.fromEntries(
      Object.entries(arm.final.controlUsage).filter(
        ([key]) => !key.startsWith("iSmelter."),
      ),
    );
  assert.deepEqual(
    nonSmelterControlUsage(required),
    nonSmelterControlUsage(alternative),
  );

  const recentBase = required.samples.slice(-5);
  const recentAlternative = alternative.samples.slice(-5);
  const resourceIds = new Set([
    ...Object.keys(required.initialResources),
    ...Object.keys(required.final.state),
    ...Object.keys(alternative.final.state),
  ]);
  const pairedStockChanges = [];
  const productionChanges = [];
  const rateReadings = {};
  for (const resourceId of [...resourceIds].sort()) {
    const initialAmount = required.initialResources[resourceId]?.amount;
    const baselineFinalAmount = required.final.state[resourceId]?.amount;
    const alternativeFinalAmount = alternative.final.state[resourceId]?.amount;
    const baselineCapacity = required.final.state[resourceId]?.capacity;
    const alternativeCapacity = alternative.final.state[resourceId]?.capacity;
    if (
      [initialAmount, baselineFinalAmount, alternativeFinalAmount].every(
        Number.isFinite,
      )
    ) {
      const baselineChange = baselineFinalAmount - initialAmount;
      const alternativeChange = alternativeFinalAmount - initialAmount;
      const marginalQuantity = alternativeChange - baselineChange;
      if (
        Math.abs(marginalQuantity) > 1e-6 ||
        baselineCapacity !== alternativeCapacity
      ) {
        pairedStockChanges.push({
          resourceId,
          initialAmount,
          baselineChange,
          alternativeChange,
          marginalQuantity,
          observedPeriods: horizon,
          capacity: {
            baseline: baselineCapacity,
            alternative: alternativeCapacity,
          },
        });
      }
      if (Math.abs(marginalQuantity) > 1e-6)
        productionChanges.push({
          resourceId,
          poolId: "anywhere",
          netRateDelta: marginalQuantity / horizon,
        });
    }
    const baseRates = recentBase
      .map(({ resources }) => resources[resourceId]?.rate)
      .filter(Number.isFinite);
    const alternativeRates = recentAlternative
      .map(({ resources }) => resources[resourceId]?.rate)
      .filter(Number.isFinite);
    if (!baseRates.length || !alternativeRates.length) continue;
    const median = (values) =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const baseRate = median(baseRates);
    const alternativeRate = median(alternativeRates);
    const delta = alternativeRate - baseRate;
    if (
      resourceId === "Iron" ||
      resourceId === "Steel" ||
      resourceId === "Coal" ||
      baseRates.some((rate) => rate !== 0) ||
      alternativeRates.some((rate) => rate !== 0)
    )
      rateReadings[resourceId] = {
        baselineSamples: baseRates,
        alternativeSamples: alternativeRates,
        baselineMedian: baseRate,
        alternativeMedian: alternativeRate,
        delta,
      };
  }
  const baseStock = capture.currentState.resources.Steel;
  const knownConstructionCommitment =
    capture.preAdjustment.demand.requestedSteel;
  const validityEpoch = `${capture.rootGeneration}:${capture.progressionEpoch}:${capture.saveSha256}`;
  const comparisonStarted = performance.now();
  const comparison = compareGoalStrategies(
    `current-action:${steelGoalAction}`,
    [{ resourceId: "Steel", poolId: "anywhere", amount: steelGoalPrice }],
    Object.entries(capture.currentState.resources).map(
      ([resourceId, value]) => ({
        resourceId,
        poolId: "anywhere",
        amount: value.amount,
        capacity: value.capacity ?? -1,
        netRate: value.rate ?? 0,
        rateConfidence: "observed",
        validityEpoch,
      }),
    ),
    [
      {
        resourceId: "Steel",
        poolId: "anywhere",
        amount: knownConstructionCommitment,
      },
    ],
    [
      {
        id: "steel-oriented-native-allocation",
        goalId: `current-action:${steelGoalAction}`,
        preconditions: { satisfied: true, reasons: [] },
        acquisitionCosts: [],
        productionChanges,
        effectsComplete: pairedStockChanges.every(
          ({ capacity }) => capacity.baseline === capacity.alternative,
        ),
        effectAuthority: "provisional",
        validityEpoch,
        unavailableReasons: [],
      },
    ],
    validityEpoch,
    false,
  );
  const comparisonMs = performance.now() - comparisonStarted;
  const purePlanSamplesMs = Array.from({ length: 25 }, () => {
    const started = performance.now();
    planSmelter(capture.preAdjustment.input);
    return performance.now() - started;
  });
  const sortedPurePlanSamples = [...purePlanSamplesMs].sort((a, b) => a - b);
  const report = {
    inputs: {
      repositoryHead: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      pinnedGame:
        "pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f",
      gameSnapshotSha256: hash(await readFile(gamePath)),
      startingSaveSha256: hash(startSaveText),
      settingsSha256: hash(JSON.stringify(baseSettings)),
      seed,
      epoch,
      noStage3FGatherIntervention: true,
      testBundleSha256: hash(built.outputFiles[0].contents),
    },
    reachableCapture: capture,
    counterfactuals: {
      nativeBaseline: required,
      alternative,
      matchedStart: sameStart,
      settingDifference: "productionSmelting: required -> steel",
      nonSmelterControlUsageEqual: true,
      nonSmelterOrderedNativeInvocationsEqual: true,
      researchDrawCountEqual:
        required.final.randomCalls === alternative.final.randomCalls,
      resourceDiffReadings: rateReadings,
      pairedStockChanges,
      productionChangesAreFiniteHorizonStockDeltas: true,
      productionChanges,
      directAcquisitionCost: {
        amount: 0,
        source:
          "pinned iSmelter.addMetal/subMetal only reassign smelter counts",
      },
      knownConstructionSteelCommitment: knownConstructionCommitment,
      otherCommitmentCoverage:
        "unknown; comparator called with incomplete coverage",
      currentSteelGoalRequirement: {
        actionId: steelGoalAction,
        amount: steelGoalPrice,
      },
      nextActionAffordability: {
        baselineFirstEligiblePeriod: required.samples.find(
          ({ resources }) => resources.Steel?.amount >= steelGoalPrice,
        )?.elapsed,
        alternativeFirstEligiblePeriod: alternative.samples.find(
          ({ resources }) => resources.Steel?.amount >= steelGoalPrice,
        )?.elapsed,
        nativeResearchActionPeriods: {
          baseline: required.final.researchInvocations
            .filter(({ elementId }) => elementId === steelGoalAction)
            .map(({ period }) => period),
          alternative: alternative.final.researchInvocations
            .filter(({ elementId }) => elementId === steelGoalAction)
            .map(({ period }) => period),
        },
      },
      terminalMadCompletionTime: "not estimated",
    },
    comparison: { elapsedMs: comparisonMs, value: comparison },
    performance: {
      nativePlanObservation:
        "captured with the existing test-only readSmelterPlanForTest hook",
      capturedObservationRead: {
        unit: "10 paused-session reads of captured input plus native plan through the diagnostic hook",
        baselineMedianMs: required.observationReadMs
          .slice()
          .sort((a, b) => a - b)[5],
        alternativeMedianMs: alternative.observationReadMs
          .slice()
          .sort((a, b) => a - b)[5],
      },
      pureNativePlanGeneration: {
        repeats: purePlanSamplesMs.length,
        medianMs: sortedPurePlanSamples[12],
        maxMs: sortedPurePlanSamples.at(-1),
      },
      additionalAdvisoryIntentProcessingInOrdinaryRuntime:
        "not scheduled; no cross-worktick signal or worker was added",
      pureMarginalComparisonMs: comparisonMs,
      isolatedNativeControlInvocations: {
        baseline: smelterCalls(required),
        alternative: smelterCalls(alternative),
      },
      rendererWork: {
        baselineTaskSec: required.final.rendererTaskSec,
        baselineScriptSec: required.final.rendererScriptSec,
        alternativeTaskSec: alternative.final.rendererTaskSec,
        alternativeScriptSec: alternative.final.rendererScriptSec,
      },
    },
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outputPath,
        capturedPeriod: capture.period,
        permission: capture.permissions.autoSmelter,
        control: capture.liveControl,
        planDeltaSteel: steelDelta(capture.preAdjustment.decision),
        baselineFinal: required.final.smelter,
        alternativeFinal: alternative.final.smelter,
        comparisonWinner: comparison.winner,
        provisionalWinner: comparison.provisionalWinner,
      },
      null,
      2,
    ),
  );
} finally {
  await runner.close();
}
