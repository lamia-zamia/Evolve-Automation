import assert from "node:assert/strict";
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  "test-artifacts/benchmark/tmp/p34-allocation-execution-cost.user.js",
);
const evidencePath = path.join(
  root,
  "experiments/p34-allocation-execution-cost-evidence.json",
);
const fixtureSha256 =
  "2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684";
const seed = 44;
const epoch = "2026-09-21T00:00:00.000Z";
const checkpoints = [8, 48, 56, 64, 72, 80, 96, 112, 272, 1_000, 5_000];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const quantile = (values, q) =>
  values.toSorted((left, right) => left - right)[
    Math.max(0, Math.ceil(values.length * q) - 1)
  ] ?? 0;

const [fixtureText, settingsText, gameBytes, metadata] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(gamePath),
  readFile(metadataPath, "utf8"),
]);
const settings = JSON.parse(settingsText);
assert.equal(hash(fixtureText), fixtureSha256);
assert.equal(settings.buildingAlwaysClick, false);
assert.equal(settings.autoBuild, true);

await mkdir(path.dirname(bundlePath), { recursive: true });
const build = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}), constructionSavingTargetObservations: [], civilizationBootstrapEvents: [], civilizationHandoffEvents: [], p32LiveAuthority: [], p34PhaseEvents: [], p34NativeNow() { return globalThis.eaDiagnosticsNow(); }, readRunnerPeriod() { return window.__EA_RUNNER__?.periods?.() ?? null; }, captureConstructionSavingTargetForTest(target, authority) { this.constructionSavingTargetObservations.push({ period: window.__EA_RUNNER__?.periods?.() ?? null, target, authority }); } };`,
  },
  plugins: [
    {
      name: "p34-native-clock",
      setup(build) {
        build.onLoad(
          { filter: /captured-runtime-control\.ts$/ },
          async (args) => {
            let source = await readFile(args.path, "utf8");
            const from = `                const now = () => {\n                  const performanceObject = readProperty(\n                    settingsHostWindow,\n                    "performance",\n                  );\n                  const nowMethod = readProperty(performanceObject, "now");\n                  return typeof nowMethod === "function"\n                    ? Number(Reflect.apply(nowMethod, performanceObject, []))\n                    : Date.now();\n                };`;
            const to = `                const now = () => Number(Reflect.apply(readProperty(hooks, "p34NativeNow"), hooks, []));`;
            assert.equal(
              source.split(from).length - 1,
              1,
              "P33 virtual-clock timing anchor changed",
            );
            source = source.replace(from, to);
            const replaceOnce = (before, after) => {
              assert.equal(
                source.split(before).length - 1,
                1,
                `P34 phase anchor changed: ${before.slice(0, 60)}`,
              );
              source = source.replace(before, after);
            };
            replaceOnce(
              "                const startedAt = now();",
              '                const startedAt = now();\n                const phaseMs = {};\n                const phaseStart = (name) => now();\n                const phaseEnd = (name, started) => { phaseMs[name] = (phaseMs[name] ?? 0) + now() - started; };\n                if (isRecord(hooks)) Reflect.set(hooks, "p34ReadFreshNativePrice", (actionId) => buildCosts.readCost(actionId));',
            );
            replaceOnce(
              '                const priorGeneration = readProperty(\n                  hooks,\n                  "p32OrderingGeneration",\n                );',
              '                const orderingStarted = phaseStart("orderingGenerationStamp");\n                const priorGeneration = readProperty(\n                  hooks,\n                  "p32OrderingGeneration",\n                );',
            );
            replaceOnce(
              '                const recordsValue = readProperty(hooks, "p32LiveAuthority");',
              '                phaseEnd("orderingGenerationStamp", orderingStarted);\n                const recordsValue = readProperty(hooks, "p32LiveAuthority");',
            );
            replaceOnce(
              "                  const root = pageCapture.rootState.readRoot();",
              '                  const rootStarted = phaseStart("rootProgressionControlGenerationCapture");\n                  const root = pageCapture.rootState.readRoot();\n                  phaseEnd("rootProgressionControlGenerationCapture", rootStarted);',
            );
            replaceOnce(
              "                  const target = gatherEnabled\n                    ? cycleConstructionObservations.readSavingTarget()\n                    : null;\n                  if (gatherEnabled) savingTargetThisCycle = target;",
              '                  const targetStarted = phaseStart("currentTargetEvidencePublication");\n                  const target = gatherEnabled\n                    ? cycleConstructionObservations.readSavingTarget()\n                    : null;\n                  phaseEnd("currentTargetEvidencePublication", targetStarted);\n                  if (gatherEnabled) savingTargetThisCycle = target;',
            );
            replaceOnce(
              '                  const buildQueue = readProperty(\n                    readProperty(root, "queue"),\n                    "queue",\n                  );',
              '                  phaseEnd("rootProgressionControlGenerationCapture", controlsStarted);\n                  const queueStarted = phaseStart("resourceAndQueueObservations");\n                  const buildQueue = readProperty(\n                    readProperty(root, "queue"),\n                    "queue",\n                  );',
            );
            replaceOnce(
              "                  const targetId = target?.name;",
              '                  const targetId = target?.name;\n                  const controlsStarted = phaseStart("rootProgressionControlGenerationCapture");',
            );
            replaceOnce(
              '                  const intervention = readProperty(\n                    hooks,\n                    "gatherIntervention",\n                  );',
              '                  phaseEnd("resourceAndQueueObservations", queueStarted);\n                  const claimsStarted = phaseStart("handoffAndCompetingClaimObservation");\n                  const intervention = readProperty(\n                    hooks,\n                    "gatherIntervention",\n                  );',
            );
            replaceOnce(
              "                  const targetEvidence =\n                    target === null",
              '                  phaseEnd("handoffAndCompetingClaimObservation", claimsStarted);\n                  const targetEvidence =\n                    target === null',
            );
            replaceOnce(
              '                  const resourceRoot = readProperty(root, "resource");',
              '                  const resourceStarted = phaseStart("resourceAndQueueObservations");\n                  const resourceRoot = readProperty(root, "resource");',
            );
            replaceOnce(
              "                  const rootGeneration = progression.readRootGeneration();",
              '                  phaseEnd("resourceAndQueueObservations", resourceStarted);\n                  const generationStarted = phaseStart("rootProgressionControlGenerationCapture");\n                  const rootGeneration = progression.readRootGeneration();',
            );
            replaceOnce(
              "                  const emptyNativeQueues =",
              '                  phaseEnd("rootProgressionControlGenerationCapture", generationStarted);\n                  const emptyNativeQueues =',
            );
            replaceOnce(
              "                      const sample = queueReservations.readReservations();",
              '                      const reservationStarted = phaseStart("reservationCapture");\n                      const sample = queueReservations.readReservations();\n                      phaseEnd("reservationCapture", reservationStarted);',
            );
            replaceOnce(
              "                  const observation = Object.freeze({",
              '                  const snapshotStarted = phaseStart("snapshotFreezingAndDiagnosticRecording");\n                  const observation = Object.freeze({',
            );
            replaceOnce(
              "                  const shadow = evaluateConstructionAllocationShadow({",
              '                  phaseEnd("snapshotFreezingAndDiagnosticRecording", snapshotStarted);\n                  const evaluationStarted = phaseStart("pureShadowEvaluation");\n                  const shadow = evaluateConstructionAllocationShadow({',
            );
            replaceOnce(
              "                    ...observation,\n                  });\n                  records.push(",
              '                    ...observation,\n                  });\n                  phaseEnd("pureShadowEvaluation", evaluationStarted);\n                  const recordingStarted = phaseStart("snapshotFreezingAndDiagnosticRecording");\n                  records.push(',
            );
            replaceOnce(
              "                      shadowInvocations: 1,\n                    }),\n                  );",
              '                      shadowInvocations: 1,\n                      phaseMs: Object.freeze({ ...phaseMs }),\n                    }),\n                  );\n                  phaseEnd("snapshotFreezingAndDiagnosticRecording", recordingStarted);',
            );
            replaceOnce(
              '                  phaseEnd("snapshotFreezingAndDiagnosticRecording", recordingStarted);',
              '                  phaseEnd("snapshotFreezingAndDiagnosticRecording", recordingStarted);\n                  const phaseEvents = readProperty(hooks, "p34PhaseEvents");\n                  if (Array.isArray(phaseEvents)) phaseEvents.push({ period: observation.period, phaseMs: { ...phaseMs, snapshotFreezingAndDiagnosticRecording: Math.max(0, phaseMs.snapshotFreezingAndDiagnosticRecording - phaseMs.reservationCapture) } });',
            );
            return { contents: source, loader: "ts" };
          },
        );
      },
    },
  ],
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
await writeFile(bundlePath, build.outputFiles[0].contents);

const runner = await createChromiumRunner({ game: gamePath });
let clockCalibration;

async function capture(session, period) {
  const [state, diagnostics, hooks] = await Promise.all([
    session.readState(),
    session.diagnostics(),
    session.evaluate(() => {
      const testHooks = window.__EA_TEST_HOOKS__;
      return {
        targets: testHooks?.constructionSavingTargetObservations ?? [],
        bootstrap: testHooks?.civilizationBootstrapEvents ?? [],
        handoff: testHooks?.civilizationHandoffEvents ?? [],
        shadow: testHooks?.p32LiveAuthority ?? [],
        phaseEvents: testHooks?.p34PhaseEvents ?? [],
        summary: testHooks?.p32LiveAuthoritySummary ?? null,
      };
    }),
  ]);
  const species = state.race?.species;
  return {
    period,
    saveSha256: hash(await session.exportSave()),
    state: {
      race: state.race,
      days: state.stats?.days ?? null,
      starved: state.stats?.starved ?? null,
      deaths: state.stats?.died ?? null,
      population: state.resource?.[species]?.amount ?? null,
      resources: Object.fromEntries(
        ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
          id,
          state.resource?.[id]
            ? {
                amount: state.resource[id].amount,
                max: state.resource[id].max,
                diff: state.resource[id].diff ?? null,
              }
            : null,
        ]),
      ),
      buildings: Object.fromEntries(
        Object.entries(state.city ?? {})
          .filter(([, value]) => Number(value?.count) > 0)
          .map(([id, value]) => [id, value.count]),
      ),
      jobs: Object.fromEntries(
        Object.entries(state.civic ?? {})
          .filter(([, value]) => Number(value?.workers) > 0)
          .map(([id, value]) => [id, value.workers]),
      ),
    },
    controlUsage: diagnostics.controlUsage ?? {},
    nativeCalls: (diagnostics.nativeInvocations ?? [])
      .filter(
        (entry) =>
          entry.method === "action" &&
          (/^(undefined-food|city-lumber|undefined-stone)$/.test(
            entry.elementId ?? "",
          ) ||
            /^(tech-|city-)/.test(entry.elementId ?? "")),
      )
      .map(({ period: callPeriod, elementId }) => ({
        period: callPeriod,
        elementId,
      })),
    randomCalls: diagnostics.randomCalls,
    rngState: diagnostics.rngState,
    hooks,
  };
}

async function replay(arm) {
  const save = parseSave(fixtureText);
  const session = await runner.openSession({
    bundle: bundlePath,
    save,
    settings,
    seed,
    epoch,
    perf: true,
    nativeTrace: true,
  });
  try {
    if (arm === "A")
      clockCalibration = await session.evaluate(() => {
        const virtualStart = performance.now();
        const nativeStart = eaDiagnosticsNow();
        let accumulator = 1;
        do {
          for (let index = 0; index < 50_000; index += 1)
            accumulator = Math.imul(accumulator ^ index, 16_777_619);
        } while (eaDiagnosticsNow() - nativeStart < 40);
        return {
          workload: "bounded integer-mix synchronous loop",
          accumulator,
          virtualElapsedMs: performance.now() - virtualStart,
          nativeElapsedMs: eaDiagnosticsNow() - nativeStart,
        };
      });
    if (arm !== "A")
      await session.evaluate((shadowEnabled) => {
        const hooks = window.__EA_TEST_HOOKS__;
        hooks.gatherIntervention = {
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
        if (shadowEnabled)
          hooks.constructionAllocationShadowBudgets = {
            perCycle: 5,
            perTargetEpisode: 80,
            totalEpisode: 140,
          };
      }, arm === "C");

    const captured = [];
    let elapsed = 0;
    let executionValidation = null;
    for (const targetPeriod of checkpoints) {
      await session.advance(targetPeriod - elapsed);
      elapsed = targetPeriod;
      captured.push(await capture(session, targetPeriod));
    }
    const final = captured.at(-1);
    const allTargets = final.hooks.targets;
    const transitions = [];
    for (const entry of allTargets) {
      const previous = transitions.at(-1);
      if (
        !previous ||
        JSON.stringify(previous.target) !== JSON.stringify(entry.target)
      )
        transitions.push(entry);
    }
    return {
      arm,
      periods: 5_000,
      checkpoints: captured.map(({ hooks, ...checkpoint }) => ({
        ...checkpoint,
        targetObservationCount: hooks.targets.length,
        latestTargetObservation: hooks.targets.at(-1) ?? null,
        bootstrapEventCount: hooks.bootstrap.length,
        handoffEventCount: hooks.handoff.length,
        shadowSummary: hooks.summary,
      })),
      targetTransitions: transitions,
      bootstrapEvents: final.hooks.bootstrap,
      handoffEvents: final.hooks.handoff,
      shadowSummary: final.hooks.summary,
      shadowRecords: arm === "C" ? final.hooks.shadow : [],
      phaseEvents: arm === "C" ? final.hooks.phaseEvents : [],
      finalControlUsage: final.controlUsage,
      nativeCallsAtP5000: final.nativeCalls,
      rng: { calls: final.randomCalls, state: final.rngState },
    };
  } finally {
    await session.close();
  }
}

async function measureExecutionValidation() {
  const session = await runner.openSession({
    bundle: bundlePath,
    save: parseSave(fixtureText),
    settings,
    seed,
    epoch,
    perf: true,
    nativeTrace: true,
  });
  try {
    await session.evaluate(() => {
      const hooks = window.__EA_TEST_HOOKS__;
      hooks.gatherIntervention = {
        civilizationBootstrap: {
          authorized: true,
          authorizationId: "p19-human-candidate-1",
        },
        constructionHandoffEnabled: true,
        civilizationBootstrapObserver() {},
        civilizationHandoffObserver() {},
      };
      hooks.constructionAllocationShadowBudgets = {
        perCycle: 5,
        perTargetEpisode: 80,
        totalEpisode: 140,
      };
    });
    await session.advance(80);
    const beforeSave = await session.exportSave();
    const beforeDiagnostics = await session.diagnostics();
    const measured = await session.evaluate(() => {
      const hooks = window.__EA_TEST_HOOKS__;
      const record = hooks.p32LiveAuthority.find(
        (entry) => entry.period === 80,
      );
      const actionId = record?.target?.id;
      if (
        !actionId ||
        record.shadow?.authorized !== true ||
        typeof hooks.p34ReadFreshNativePrice !== "function"
      )
        throw new Error(
          "P34 fresh execution price source unavailable at the first eligible Farm boundary",
        );
      const started = eaDiagnosticsNow();
      const freshPrice = hooks.p34ReadFreshNativePrice(actionId);
      return {
        period: record.period,
        actionId,
        capturedOrderPrice: record.target.cost,
        freshPrice,
        elapsedMs: eaDiagnosticsNow() - started,
      };
    });
    const samples = await session.evaluate((count) => {
      const hooks = window.__EA_TEST_HOOKS__;
      const record = hooks.p32LiveAuthority.find(
        (entry) => entry.period === 80,
      );
      const values = [];
      for (let index = 0; index < count; index += 1) {
        const started = eaDiagnosticsNow();
        const price = hooks.p34ReadFreshNativePrice(record.target.id);
        values.push({ elapsedMs: eaDiagnosticsNow() - started, price });
      }
      return values;
    }, 280);
    const afterDiagnostics = await session.diagnostics();
    const afterSave = await session.exportSave();
    const actionCount = (diagnostics) =>
      (diagnostics.nativeInvocations ?? []).filter(
        (entry) => entry.method === "action",
      ).length;
    return {
      phase: "period-80 first positive Farm authority, non-spending probe",
      measured,
      actionPriceProbeCount: samples.length,
      projectedActions: 140,
      checksPerAction: 2,
      priceChecksPerClick: 2,
      costProbeDistributionMs: {
        p50: quantile(
          samples.map((sample) => sample.elapsedMs),
          0.5,
        ),
        p95: quantile(
          samples.map((sample) => sample.elapsedMs),
          0.95,
        ),
        max: Math.max(...samples.map((sample) => sample.elapsedMs)),
        total: samples.reduce((sum, sample) => sum + sample.elapsedMs, 0),
      },
      allFreshPricesMatchCurrentOrder: samples.every(
        (sample) =>
          JSON.stringify(sample.price?.cost) ===
          JSON.stringify(measured.capturedOrderPrice),
      ),
      exportUnchanged: beforeSave === afterSave,
      nativeActionsIssued:
        actionCount(afterDiagnostics) - actionCount(beforeDiagnostics),
    };
  } finally {
    await session.close();
  }
}

try {
  const arms = [];
  for (const arm of ["A", "B", "C"]) arms.push(await replay(arm));
  const [ordinary, p19, observed] = arms;
  const executionValidation = await measureExecutionValidation();
  const byPeriod = (arm) =>
    new Map(arm.checkpoints.map((item) => [item.period, item]));
  const p19Checkpoints = byPeriod(p19);
  const shadowCheckpoints = byPeriod(observed);
  let progressionChanged = false;
  let firstTargetAfterProgressionChange = null;
  let previousProgressionGeneration;
  for (const record of observed.shadowRecords) {
    if (
      previousProgressionGeneration !== undefined &&
      record.progressionGeneration !== previousProgressionGeneration
    )
      progressionChanged = true;
    if (progressionChanged && record.target) {
      firstTargetAfterProgressionChange = record;
      break;
    }
    previousProgressionGeneration = record.progressionGeneration;
  }
  const p19Parity = p19.checkpoints.map((checkpoint) => {
    const comparison = shadowCheckpoints.get(checkpoint.period);
    return {
      period: checkpoint.period,
      nativeCallsEqual:
        JSON.stringify(checkpoint.nativeCalls) ===
        JSON.stringify(comparison.nativeCalls),
      stateEqual:
        JSON.stringify(checkpoint.state) === JSON.stringify(comparison.state),
      controlUsageEqual:
        JSON.stringify(checkpoint.controlUsage) ===
        JSON.stringify(comparison.controlUsage),
      rngEqual:
        JSON.stringify(checkpoint.rngState) ===
          JSON.stringify(comparison.rngState) &&
        checkpoint.randomCalls === comparison.randomCalls,
      exportHashEqual: checkpoint.saveSha256 === comparison.saveSha256,
    };
  });
  const evidence = {
    implementationCommit: (await import("node:child_process"))
      .execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      })
      .trim(),
    pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
    gameSha256: hash(gameBytes),
    fixture:
      "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
    fixtureSha256: hash(fixtureText),
    settings: "experiments/p18-standard-human-settings.json",
    settingsSha256: hash(JSON.stringify(settings)),
    testBundleSha256: hash(build.outputFiles[0].contents),
    seed,
    epoch,
    clockCalibration,
    debugExposeSet: false,
    debugGlobalsUsed: false,
    p19Intervention: {
      source: "experiments/p19-civilization-bootstrap-exact.mjs",
      civilizationBootstrap: {
        authorized: true,
        authorizationId: "p19-human-candidate-1",
      },
      constructionHandoffEnabled: true,
      nativePolicyBudgetsChanged: false,
    },
    syntheticAdverseRegressions: [
      "target with no gatherable shortage",
      "non-gatherable Money cost unaffordable",
      "stale progression generation",
      "missing or replaced native Gather/target controls",
      "Build queue conflict",
      "reservation evidence unknown/conflicting",
      "active or unavailable handoff",
      "competing resource claim",
    ],
    checkpointsRequested: checkpoints,
    arms,
    p19VsShadowParity: p19Parity,
    policyRequestPresence: {
      armCRequests: observed.shadowRecords.filter(
        (record) => record.targetSelection?.policyRequestPresent === true,
      ).length,
      note: "counted independently from shadow eligibility; no allocation callback is installed",
    },
    authorityCounts: {
      positiveEligible: observed.shadowRecords.filter(
        (record) => record.shadow?.authorized,
      ).length,
      targetObservedRejected: observed.shadowRecords.filter(
        (record) => record.target && !record.shadow?.authorized,
      ).length,
      rejectionReasons: observed.shadowSummary?.rejectionReasons ?? {},
      firstPositive:
        observed.shadowRecords.find(
          (record) => record.target && record.shadow?.authorized,
        ) ?? null,
      firstProgressionStaleRejection:
        observed.shadowRecords.find((record) =>
          record.shadow?.reasons?.includes("stale-progression-generation"),
        ) ?? null,
      firstTargetAfterProgressionChange,
      firstRejectedTarget:
        observed.shadowRecords.find(
          (record) => record.target && !record.shadow?.authorized,
        ) ?? null,
    },
    measurement: {
      shadowInvocations: observed.shadowSummary?.shadowInvocations ?? null,
      reservationCapturePasses:
        observed.shadowSummary?.reservationCapturePasses ?? null,
      extraNativeCatalogOrPriceProbes:
        observed.shadowSummary?.extraNativeCatalogOrPriceProbes ?? null,
      unmeasuredCatalogOrPriceProbeCycles:
        observed.shadowSummary?.unmeasuredCatalogOrPriceProbeCycles ?? null,
      controlCallParity: p19Parity.every((entry) => entry.controlUsageEqual),
      priceSource:
        "the captured current pre-Gather Construction order; no independent execution-time native price probe is performed",
      reservationSource:
        "existing captured queue reservation authority; a nonempty queue may require native cost/catalog reads, counted above",
      nativeShadowDirectElapsedMs: {
        count: observed.shadowRecords.length,
        p50: quantile(
          observed.shadowRecords.map((record) => record.elapsedMs),
          0.5,
        ),
        p95: quantile(
          observed.shadowRecords.map((record) => record.elapsedMs),
          0.95,
        ),
        max: Math.max(
          ...observed.shadowRecords.map((record) => record.elapsedMs),
        ),
        total: observed.shadowSummary?.elapsedMs ?? null,
      },
      nonOverlappingPhaseSamples: Object.fromEntries(
        [
          "orderingGenerationStamp",
          "currentTargetEvidencePublication",
          "rootProgressionControlGenerationCapture",
          "resourceAndQueueObservations",
          "handoffAndCompetingClaimObservation",
          "reservationCapture",
          "pureShadowEvaluation",
          "snapshotFreezingAndDiagnosticRecording",
        ].map((phase) => {
          const samples = observed.phaseEvents
            .map((record) => record.phaseMs?.[phase])
            .filter((value) => typeof value === "number");
          return [
            phase,
            {
              count: samples.length,
              p50: quantile(samples, 0.5),
              p95: quantile(samples, 0.95),
              max: Math.max(0, ...samples),
              total: samples.reduce((sum, value) => sum + value, 0),
            },
          ];
        }),
      ),
    },
    executionTimeValidation: executionValidation,
  };
  assert.equal(ordinary.checkpoints.at(-1).period, 5_000);
  assert.equal(ordinary.checkpoints.at(-1).state.population, 0);
  assert.ok(
    ordinary.targetTransitions.every((entry) => entry.target === null),
    "ordinary P18 baseline remains the negative control with no Construction target",
  );
  assert.ok(
    p19.bootstrapEvents.some((event) => event.period === 8),
    "P19 startup bootstrap is installed and runs at p8",
  );
  assert.ok(
    p19.targetTransitions.some((entry) => entry.target?.name === "city-farm"),
    "P19 must publish a genuine Farm target",
  );
  assert.equal(
    p19.bootstrapEvents.length,
    10,
    "P19 must preserve its ten-click startup budget",
  );
  assert.ok(
    p19.bootstrapEvents.every((event) => event.period === 8),
    "P19 startup clicks retain their p8 timing",
  );
  assert.equal(
    p19.handoffEvents.length,
    10,
    "P19 must preserve its ten-click Construction handoff budget",
  );
  assert.ok(
    p19Parity.every(
      (entry) =>
        entry.nativeCallsEqual &&
        entry.stateEqual &&
        entry.controlUsageEqual &&
        entry.rngEqual &&
        entry.exportHashEqual,
    ),
    "the shadow must preserve P19 native and exported state at every checkpoint",
  );
  assert.ok(p19Checkpoints.has(5_000));
  const p19At5000 = p19Checkpoints.get(5_000).state;
  const p19ProgressionPreserved =
    p19At5000.population === 3 &&
    p19At5000.jobs.farmer === 3 &&
    p19At5000.buildings.farm === 1 &&
    p19At5000.starved === 0 &&
    p19At5000.deaths === 0;
  const genuineLiveTargetObserved = observed.shadowRecords.some(
    (record) => record.target?.id === "city-farm",
  );
  const positiveRecords = observed.shadowRecords.filter(
    (record) => record.target && record.shadow?.authorized,
  );
  const positiveEligibleTargetObserved = positiveRecords.length > 0;
  const mandatoryAuthorityProvenanceValid = positiveRecords.every(
    (record) =>
      record.targetAuthority ===
        "successful-current-pre-Gather-order-publication" &&
      record.priceAuthority === "current-pre-gather-construction-order" &&
      record.reservations?.authority === "captured-queue-reservation-source" &&
      record.reservations.status === "clear" &&
      record.handoff?.authority === "p19-civilization-bootstrap-state" &&
      record.handoff.status === "inactive" &&
      record.claimsAuthority ===
        "gatherIntervention.resourceClaims-and-resourceClaim" &&
      record.rootGeneration === record.currentRootGeneration &&
      record.progressionGeneration === record.currentProgressionGeneration,
  );
  const decision =
    !p19ProgressionPreserved ||
    !genuineLiveTargetObserved ||
    (positiveEligibleTargetObserved && !mandatoryAuthorityProvenanceValid)
      ? "C"
      : positiveEligibleTargetObserved
        ? "A"
        : "B";
  assert.ok(clockCalibration.nativeElapsedMs >= 40);
  assert.equal(clockCalibration.virtualElapsedMs, 0);
  assert.equal(executionValidation.actionPriceProbeCount, 280);
  assert.equal(executionValidation.allFreshPricesMatchCurrentOrder, true);
  assert.equal(executionValidation.exportUnchanged, true);
  assert.equal(executionValidation.nativeActionsIssued, 0);
  assert.ok(observed.shadowSummary.elapsedMs > 0);
  evidence.decision = {
    outcome: decision === "C" ? "C" : "B",
    p19ProgressionPreserved,
    genuineLiveTargetObserved,
    positiveEligibleTargetObserved,
    mandatoryAuthorityProvenanceValid,
    liveEligibilityDoesNotRequestSpending: true,
    cpuTwoPercentRequirement:
      "unresolved: conservative direct elapsed bound excludes indirect rendering, asynchronous work, garbage collection, and control effects",
  };
  await writeFile(
    evidencePath,
    await prettier.format(JSON.stringify(evidence), { parser: "json" }),
  );
  process.stdout.write(
    `${JSON.stringify({
      evidencePath: path.relative(root, evidencePath).replaceAll("\\", "/"),
      clockCalibration,
      p5000: arms.map((arm) => ({
        arm: arm.arm,
        population: arm.checkpoints.at(-1).state.population,
        exportHash: arm.checkpoints.at(-1).saveSha256,
      })),
      transitions: observed.targetTransitions.map(({ period, target }) => ({
        period,
        target,
      })),
      shadowSummary: observed.shadowSummary,
      parity: p19Parity,
      decision,
    })}\n`,
  );
} finally {
  await runner.close();
}
