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
  P12G_PINNED_COMMIT,
  P12G_CAPTURE_CONTRACT_VERSION,
  validateP12GCapture,
  validateP12GReplayEvidence,
} from "./p12g-capture-contract.mjs";
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
const expectedGameSnapshotSha256 =
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7";
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
const snapshotBytes = await readFile(gamePath);
const snapshotSidecar = JSON.parse(await readFile(gamePath + ".json", "utf8"));
assert.equal(snapshotSidecar.sourceRef, P12G_PINNED_COMMIT);
assert.equal(
  snapshotSidecar.commit.startsWith(P12G_PINNED_COMMIT.slice(0, 8)),
  true,
);
assert.equal(hash(snapshotBytes), expectedGameSnapshotSha256);
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
const expectedInputs = {
  pinnedUpstreamCommit: P12G_PINNED_COMMIT,
  gameSnapshotSha256: hash(snapshotBytes),
  startingSaveSha256: hash(startSaveText),
  effectiveSettingsSha256: hash(JSON.stringify(baseSettings)),
  seed,
  epoch,
  testBundleSha256: hash(built.outputFiles[0].contents),
  testHarnessSha256: hash(
    Buffer.concat(
      await Promise.all(
        [
          fileURLToPath(import.meta.url),
          path.join(root, "experiments/p12g-capture-contract.mjs"),
          path.join(root, "tools/chromium-evolve-runner.mjs"),
          path.join(root, "tools/chromium/bridge.js"),
          path.join(root, "tools/chromium/page-server.mjs"),
          path.join(root, "tools/chromium/chrome.mjs"),
        ].map((file) => readFile(file)),
      ),
    ),
  ),
};

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
    await discovery.evaluate(() => {
      const hooks = window.__EA_TEST_HOOKS__;
      hooks.readPeriodForTest = () => window.__EA_RUNNER__.periods();
      hooks.observeSmelterPlanForTest = (input, decision, demand) => {
        if (
          demand.requestedSteel >= 250 &&
          input.initialised &&
          input.steelCount < 1 &&
          decision.smeltAdjustments?.some(
            (item) => item.productionId === "Steel" && item.delta > 0,
          )
        ) {
          hooks.p12gPlans.push({
            period: window.__EA_RUNNER__.periods(),
            input,
            decision,
            demand,
            exportSave: window.exportGame(),
            smelterAuthority: hooks.readSmelterPlanForTest?.(),
            catalog: hooks.readCurrentResearchCatalog?.(
              "tech-steel_containers",
              false,
            ),
          });
        }
      };
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
        const observation = evidence.plans.findLast(
          (entry) =>
            entry.demand.requestedSteel >= steelGoalPrice &&
            entry.input.steelCount < 1 &&
            steelDelta(entry.decision) > 0,
        );
        if (observation === undefined) continue;
        const catalog = observation.catalog;
        const offer = catalog?.offers?.find(
          ({ elementId }) => elementId === steelGoalAction,
        );
        if (offer?.cost?.Steel !== steelGoalPrice) continue;
        const observedSave = decodeExport(observation.exportSave);
        const observationIdentity = `p12g-smelter-${observation.period}-${hash(observation.exportSave)}`;
        assert.equal(observation.input.initialised, true);
        assert.ok(observation.demand.requestedSteel >= steelGoalPrice);
        assert.equal(catalog?.current, true);
        assert.equal(catalog?.researchPermission, true);
        assert.ok(
          (observedSave.resource?.Steel?.amount ?? Infinity) < steelGoalPrice,
        );
        capture = {
          contractVersion: P12G_CAPTURE_CONTRACT_VERSION,
          inputs: expectedInputs,
          period: observation.period,
          capturePeriod: observation.period,
          exportSave: observation.exportSave,
          exportSaveSha256: hash(observation.exportSave),
          saveSha256: hash(observation.exportSave),
          observationIdentity,
          rootGeneration: catalog.rootGeneration,
          progressionEpoch: catalog.progressionEpoch,
          offer,
          currentOfferEvidence: {
            period: observation.period,
            observationIdentity,
            offer,
            queueEvidence: catalog.queueEvidence,
            researchPermission: catalog.researchPermission,
            source: catalog.source,
          },
          currentDemandEvidence: {
            period: observation.period,
            observationIdentity,
            value: observation.demand,
            source: "readSmelterDemandForTest in Smelter observation callback",
          },
          metadataEvidence: {
            root: {
              source: "readCurrentResearchCatalog.rootGeneration",
              validity: "same-observation-boundary",
              period: observation.period,
              observationIdentity,
            },
            progression: {
              source: "readCurrentResearchCatalog.progressionEpoch",
              validity: "same-observation-boundary",
              period: observation.period,
              observationIdentity,
            },
            offer: {
              source: "readCurrentResearchCatalog.offers",
              validity: "same-observation-boundary",
              period: observation.period,
              observationIdentity,
            },
          },
          smelterObservation: {
            period: observation.period,
            identity: observationIdentity,
            decision: observation.decision,
            input: observation.input,
            nativeControl: observation.smelterAuthority,
          },
          currentState: {
            resources: resourceSnapshot(observedSave),
            smelter: observedSave.city?.smelter,
            demand: observation.demand,
          },
          preAdjustment: observation,
          liveControl: {
            available: observation.smelterAuthority.controlAvailable,
            methods: observation.smelterAuthority.controlMethods,
          },
          permissions: { autoSmelter: baseSettings.autoSmelter },
          currentPlan: observation.smelterAuthority,
          discoveryDiagnostics: {
            workTicks: diagnostics.workTicks,
            controlUsage: diagnostics.controlUsage,
            sameBoundaryResearchCatalogReads: evidence.plans.length,
            sameBoundarySmelterPlanReads: evidence.plans.length,
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
  validateP12GCapture(capture, expectedInputs);

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
      await session.evaluate(() => {
        window.__EA_TEST_HOOKS__.readPeriodForTest = () =>
          window.__EA_RUNNER__.periods();
      });
      const restoredCatalog = await session.evaluate(() => ({
        catalog: window.__EA_TEST_HOOKS__.readCurrentResearchCatalog?.(
          "tech-steel_containers",
          false,
        ),
      }));
      const restoredState = await session.readState();
      assert.deepEqual(
        resourceSnapshot(restoredState),
        capture.currentState.resources,
        "restored resources differ from the captured starting state",
      );
      assert.equal(
        restoredCatalog.catalog?.rootGeneration,
        capture.rootGeneration,
      );
      assert.equal(
        restoredCatalog.catalog?.progressionEpoch,
        capture.progressionEpoch,
      );
      assert.equal(restoredCatalog.catalog?.researchPermission, true);
      await session.advance(10);
      const restoredEvidence = await session.evaluate(() => ({
        plan: window.__EA_TEST_HOOKS__.readSmelterPlanForTest?.(),
        demand: window.__EA_TEST_HOOKS__.readSmelterDemandForTest?.(),
        catalog: window.__EA_TEST_HOOKS__.readCurrentResearchCatalog?.(
          "tech-steel_containers",
          false,
        ),
      }));
      validateP12GReplayEvidence(capture, restoredEvidence);
      const beforeMetrics = await session.metrics();
      const initialState = decodeExport(capture.exportSave);
      const startAuthority = restoredEvidence;
      let observationReadMs = [];
      let observedResearchEventCount = 0;
      let observedNativeInvocationOrder = 0;
      for (let elapsed = 10; elapsed < horizon; elapsed += 10) {
        await session.advance(10);
        const samplePeriod = elapsed + 10;
        const [state, diagnostics, evidence] = await Promise.all([
          session.readState(),
          session.diagnostics(),
          session.evaluate(() => ({
            plan: window.__EA_TEST_HOOKS__.readSmelterPlanForTest?.(),
            demand: window.__EA_TEST_HOOKS__.readSmelterDemandForTest?.(),
            catalog: window.__EA_TEST_HOOKS__.readCurrentResearchCatalog?.(
              "tech-steel_containers",
            ),
            plans: window.__EA_TEST_HOOKS__.p12gPlans,
            ownerEvents:
              window.__EA_TEST_HOOKS__.researchOwnerSelectionEvents ?? [],
          })),
        ]);
        if (samplePeriod === 20) {
          observationReadMs = await session.evaluate(() =>
            Array.from({ length: 10 }, () => {
              const started = performance.now();
              window.__EA_TEST_HOOKS__.readSmelterPlanForTest();
              window.__EA_TEST_HOOKS__.readSmelterDemandForTest();
              return performance.now() - started;
            }),
          );
        }
        const ownerEvents = evidence.ownerEvents.slice(
          observedResearchEventCount,
        );
        observedResearchEventCount = evidence.ownerEvents.length;
        const newNativeInvocations = (
          diagnostics.nativeInvocations ?? []
        ).filter(({ order }) => order > observedNativeInvocationOrder);
        observedNativeInvocationOrder = Math.max(
          observedNativeInvocationOrder,
          ...newNativeInvocations.map(({ order }) => order),
        );
        const targetOffer = evidence.catalog?.offers?.find(
          ({ elementId }) => elementId === steelGoalAction,
        );
        samples.push({
          elapsed: samplePeriod,
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
          newResearchInvocations: newNativeInvocations.filter(({ elementId }) =>
            elementId.startsWith("tech-"),
          ),
          researchDecisionEvidence: {
            period: samplePeriod,
            offerSource: evidence.catalog?.source,
            catalogCurrent: evidence.catalog?.current,
            rootGeneration: evidence.catalog?.rootGeneration,
            progressionEpoch: evidence.catalog?.progressionEpoch,
            permission: evidence.catalog?.researchPermission,
            queueEvidence: evidence.catalog?.queueEvidence,
            eligibility: evidence.catalog?.targetEligibility,
            targetControlGeneration:
              evidence.catalog?.targetControl?.generation,
            offer: targetOffer,
            resources: (evidence.catalog?.resourceSamples ?? []).filter(
              ({ resourceId }) =>
                targetOffer !== undefined &&
                Object.hasOwn(targetOffer.cost, resourceId),
            ),
            ownerEvents,
          },
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
      pinnedGame: `pmotschmann/Evolve @ ${P12G_PINNED_COMMIT}`,
      gameSnapshotSha256: hash(snapshotBytes),
      startingSaveSha256: hash(startSaveText),
      settingsSha256: hash(JSON.stringify(baseSettings)),
      seed,
      epoch,
      noStage3FGatherIntervention: true,
      testBundleSha256: expectedInputs.testBundleSha256,
      testHarnessSha256: expectedInputs.testHarnessSha256,
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
      researchObservationCalls: {
        addedAtCaptureBoundary: {
          researchCatalog:
            capture.discoveryDiagnostics.sameBoundaryResearchCatalogReads,
          smelterPlan:
            capture.discoveryDiagnostics.sameBoundarySmelterPlanReads,
        },
        replayByArm: {
          restoreCatalogValidation: 1,
          restoredNativePlanAndDemand: 1,
          sampledCatalogReads: required.samples.length,
        },
        additionalCatalogReadsPerReplayArm: 1,
        forcedFreshResearchDraws: 0,
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
