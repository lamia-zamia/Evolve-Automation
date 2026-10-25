import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { format } from "prettier";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  decodeExport,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const experimentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(experimentDirectory, "..");
const testBundlePath = resolve(
  repositoryDirectory,
  "test-artifacts/local/evolve_automation.test-surface.user.js",
);
const periodsPerArm = 400;
const snapshotPeriods = [200, 400];
const seed = 44;
const epoch = "2026-09-21T00:00:00.000Z";
const positiveCheckpointPeriod = 250;
const p19AuthorizationId = "p19-human-candidate-1";
const requestTemplate = Object.freeze({
  origin: "test-only",
  objectiveId: "maintain-food-buffer-and-useful-stone-production",
  requestedScope: "food-sustainability-and-useful-stone-replenishment",
  generation: 1,
  active: true,
  authorityClassification: "observation-only",
});
const readCounterPattern = /^(jobs\.full\.|demand\.sample\.|action-cost\.)/;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const round = (value) =>
  Number.isFinite(value) ? Number(value.toFixed(6)) : null;

async function buildP19CompatibleTestBundle() {
  const metadata = readFileSync(
    resolve(repositoryDirectory, "src/userscript.meta.js"),
    "utf8",
  );
  mkdirSync(dirname(testBundlePath), { recursive: true });
  const result = await esbuild.build({
    absWorkingDir: repositoryDirectory,
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    banner: {
      js: `${metadata.trimEnd()}\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}), constructionSavingTargetObservations: [], civilizationBootstrapEvents: [], civilizationHandoffEvents: [], captureConstructionSavingTargetForTest(target) { this.constructionSavingTargetObservations.push({ period: window.__EA_RUNNER__?.periods?.() ?? null, target }); } };`,
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
  const testBundle = result.outputFiles[0].contents;
  writeFileSync(testBundlePath, testBundle);
  return sha256(testBundle);
}

function aggregatePerformanceCounts(summaries) {
  const result = {};
  for (const summary of summaries) {
    for (const [name, value] of Object.entries(summary[2] ?? {}))
      result[name] = (result[name] ?? 0) + Number(value.total ?? 0);
  }
  return Object.fromEntries(
    Object.entries(result).toSorted(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function summarizeAssignments(state) {
  const civic = state?.civic ?? {};
  const ordinaryJobs = Object.entries(civic)
    .filter(([, value]) => value !== null && typeof value === "object")
    .filter(([, value]) => typeof value.job === "string")
    .map(([id, value]) => [id, value.workers ?? null, value.assigned ?? null])
    .toSorted(([left], [right]) => String(left).localeCompare(String(right)));
  const foundry = state?.city?.foundry;
  const foundryWorkers =
    foundry !== null && typeof foundry === "object"
      ? Object.entries(foundry)
          .filter(([, value]) => typeof value === "number")
          .toSorted(([left], [right]) => left.localeCompare(right))
      : null;
  return { ordinaryJobs, foundryWorkers };
}

function summarizeNativeControlUsage(usage) {
  return Object.fromEntries(
    Object.entries(usage ?? {}).toSorted(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function summarizeObservationCosts(events) {
  const timings = events.map((event) => ({
    requestPresenceCheckMs: event.requestPresenceCheckMs,
    inputProjectionMs: event.inputProjectionMs,
    envelopeConstructionMs: event.envelopeConstructionMs,
    admissionPredicateMs: event.admissionPredicateMs,
    additionalSynchronousCallbackMs: event.additionalSynchronousCallbackMs,
  }));
  for (const timing of timings)
    for (const duration of Object.values(timing))
      assert.ok(
        Number.isFinite(duration) && duration >= 0,
        "all P49 callback timings require the native monotonic clock",
      );
  const maximum = (key) =>
    timings.length ? Math.max(...timings.map((timing) => timing[key])) : 0;
  return {
    events: events.length,
    requestPresenceChecks: events.reduce(
      (sum, event) => sum + event.requestPresenceChecks,
      0,
    ),
    admissionEvaluations: events.reduce(
      (sum, event) => sum + event.admissionEvaluations,
      0,
    ),
    maxRequestPresenceCheckMs: round(maximum("requestPresenceCheckMs")),
    maxInputProjectionMs: round(maximum("inputProjectionMs")),
    maxEnvelopeConstructionMs: round(maximum("envelopeConstructionMs")),
    maxAdmissionPredicateMs: round(maximum("admissionPredicateMs")),
    maxAdditionalSynchronousCallbackMs: round(
      maximum("additionalSynchronousCallbackMs"),
    ),
    serializedRetainedEvidenceBytes: Buffer.byteLength(
      JSON.stringify(events),
      "utf8",
    ),
    nativeClock: "window.eaDiagnosticsNow backed by native performance.now",
  };
}

function semanticAdmissions(events) {
  return events.map(
    ({
      admission,
      evidence,
      kind,
      ownerScope,
      nativeRootExposed,
      controlResolutionCountAtObservation,
      controlResolutionReadsDuringObservation,
      settingsReadCountAtObservation,
      settingsReadsDuringObservation,
      catalogReadCountAtObservation,
      catalogReadsDuringObservation,
      demandReadCountAtObservation,
      demandReadsDuringObservation,
      nativeRootReadCountAtObservation,
      nativeRootReadsDuringObservation,
    }) => ({
      admission,
      evidence,
      kind,
      ownerScope,
      nativeRootExposed,
      controlResolutionCountAtObservation,
      controlResolutionReadsDuringObservation,
      settingsReadCountAtObservation,
      settingsReadsDuringObservation,
      catalogReadCountAtObservation,
      catalogReadsDuringObservation,
      demandReadCountAtObservation,
      demandReadsDuringObservation,
      nativeRootReadCountAtObservation,
      nativeRootReadsDuringObservation,
    }),
  );
}

function compactRun(run, includeAdmissionSample) {
  const { admissions, ...summary } = run;
  const statusCounts = Object.fromEntries(
    Object.entries(
      admissions.reduce((counts, event) => {
        const status = event.admission?.status ?? "unknown";
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {}),
    ).toSorted(([left], [right]) => left.localeCompare(right)),
  );
  return {
    ...summary,
    admissionEvidence: {
      eventCount: admissions.length,
      statusCounts,
      semanticTraceSha256: sha256(
        JSON.stringify(semanticAdmissions(admissions)),
      ),
      sample:
        includeAdmissionSample && admissions.length > 0
          ? (admissions.find(
              (event) => event.admission?.status === "admitted-for-observation",
            ) ?? admissions[0])
          : null,
    },
  };
}

function nativeInvocationSummary(diagnostics) {
  const nativeInvocations = diagnostics.nativeInvocations ?? [];
  return {
    count: nativeInvocations.length,
    orderedTraceSha256: sha256(JSON.stringify(nativeInvocations)),
    first: nativeInvocations[0] ?? null,
    last: nativeInvocations.at(-1) ?? null,
  };
}

async function replayP19Checkpoint(runner, testBundlePath) {
  const fixturePath = resolve(
    repositoryDirectory,
    "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
  );
  const settingsPath = resolve(
    repositoryDirectory,
    "experiments/p18-standard-human-settings.json",
  );
  const saveText = readFileSync(fixturePath, "utf8");
  const save = parseSave(saveText);
  const settingsText = readFileSync(settingsPath, "utf8");
  const settings = JSON.parse(settingsText);
  assert.equal(save.settings?.expose, false, "P49 must not enable game expose");
  assert.notEqual(settings.expose, true, "P49 must not enable game expose");
  assert.equal(settings.autoJobs, true);
  assert.equal(settings.autoCraftsmen, true);

  const session = await runner.openSession({
    bundle: testBundlePath,
    save,
    settings,
    seed,
    epoch,
    perf: true,
    nativeTrace: true,
    forwardPerfSummary: true,
  });
  try {
    await session.evaluate((authorizationId) => {
      const hooks = window.__EA_TEST_HOOKS__;
      hooks.gatherIntervention = {
        civilizationBootstrap: { authorized: true, authorizationId },
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
    }, p19AuthorizationId);
    await session.advance(positiveCheckpointPeriod);
    const diagnostics = await session.diagnostics();
    const exportedSave = await session.exportSave();
    const state = decodeExport(exportedSave);
    const runnerState = await session.readState();
    const policyEvents = await session.evaluate(() => ({
      bootstrap: window.__EA_TEST_HOOKS__?.civilizationBootstrapEvents ?? [],
      handoff: window.__EA_TEST_HOOKS__?.civilizationHandoffEvents ?? [],
    }));
    const population = state.resource?.[state.race?.species]?.amount ?? null;
    const runnerPopulation =
      runnerState.resource?.[runnerState.race?.species]?.amount ?? null;
    const native = nativeInvocationSummary(diagnostics);
    const gatherUsage = summarizeNativeControlUsage(diagnostics.controlUsage);
    assert.equal(diagnostics.periods, positiveCheckpointPeriod);
    assert.equal(diagnostics.captureComplete, true);
    assert.equal(state.race?.species, "human");
    assert.ok(Number.isFinite(population) && population > 0);
    assert.equal(runnerState.race?.species, state.race?.species);
    assert.equal(runnerPopulation, population);
    assert.equal(state.settings?.expose, false);
    assert.equal(
      gatherUsage["undefined-stone.action"]?.returned,
      20,
      "the P19 replay must retain its ten bootstrap and ten handoff Gather actions",
    );
    assert.equal(policyEvents.bootstrap.length, 10);
    assert.equal(policyEvents.handoff.length, 10);

    const p19Evidence = JSON.parse(
      readFileSync(
        resolve(
          repositoryDirectory,
          "experiments/p19-civilization-bootstrap-evidence.json",
        ),
        "utf8",
      ),
    );
    const retainedCheckpoint = p19Evidence.candidate.checkpoints.find(
      (entry) => entry.period === positiveCheckpointPeriod,
    );
    assert.ok(retainedCheckpoint, "P19 must retain the p250 checkpoint");
    assert.equal(population, retainedCheckpoint.population);
    assert.deepEqual(state.tech, retainedCheckpoint.tech);

    return {
      saveText: exportedSave,
      saveSha256: sha256(exportedSave),
      settings,
      settingsSha256: sha256(settingsText),
      fixtureSha256: sha256(saveText),
      period: diagnostics.periods,
      workTicks: diagnostics.workTicks,
      population,
      species: state.race.species,
      universe: state.race.universe,
      technology: state.tech,
      assignments: summarizeAssignments(state),
      food: state.resource?.Food?.amount ?? null,
      lumber: state.resource?.Lumber?.amount ?? null,
      stone: state.resource?.Stone?.amount ?? null,
      foundryPresent: Boolean(state.city?.foundry),
      expose: state.settings?.expose ?? false,
      p19InterventionProvenance: {
        authorizationId: p19AuthorizationId,
        bootstrapGatherClicks: policyEvents.bootstrap.length,
        constructionHandoffGatherClicks: policyEvents.handoff.length,
        totalStoneGatherActions:
          gatherUsage["undefined-stone.action"]?.returned ?? 0,
        nativeInvocationCount: native.count,
        orderedNativeTraceSha256: native.orderedTraceSha256,
      },
      p19RetainedCheckpointMatch: {
        period: retainedCheckpoint.period,
        population: retainedCheckpoint.population,
        technology: retainedCheckpoint.tech,
      },
    };
  } finally {
    await session.close();
  }
}

async function runArm({ runner, fixture, arm, request }) {
  const session = await runner.openSession({
    bundle: testBundlePath,
    save: parseSave(fixture.saveText),
    settings: fixture.settings,
    seed,
    epoch,
    perf: true,
    callbackProfile: true,
    nativeTrace: true,
    captureAllocationDiagnosticAdmission: true,
    forwardPerfSummary: true,
    snapshotAt: snapshotPeriods,
    ...(request === undefined
      ? {}
      : { initialTestInterventions: { allocationDiagnosticRequest: request } }),
  });
  try {
    await session.advance(periodsPerArm);
    const diagnostics = await session.diagnostics();
    const admissions = await session.evaluate(
      () => window.__EA_TEST_HOOKS__?.allocationDiagnosticAdmissions ?? [],
    );
    const snapshots = await session.snapshots();
    const checkpoints = Object.fromEntries(
      snapshotPeriods.map((period) => {
        const snapshot = snapshots[period];
        assert.ok(snapshot, `${fixture.id} ${arm} missed period ${period}`);
        const state = decodeExport(snapshot.exportSave);
        return [
          period,
          {
            exportSha256: sha256(snapshot.exportSave),
            stateSha256: sha256(JSON.stringify(state)),
            rngCalls: snapshot.randomCalls,
            rngState: snapshot.rngState,
            controlUsage: summarizeNativeControlUsage(snapshot.controlUsage),
            assignments: summarizeAssignments(state),
          },
        ];
      }),
    );
    const performanceCounts = aggregatePerformanceCounts(
      diagnostics.perfSummaries,
    );
    const fullJobsPlanCalls = performanceCounts["jobs.full.planCalls"] ?? 0;
    const fullJobsPrepareCalls =
      performanceCounts["jobs.full.readFullCycleCalls"] ?? 0;
    assert.equal(diagnostics.periods, periodsPerArm);
    assert.equal(diagnostics.captureComplete, true);
    assert.ok(
      admissions.length > 0,
      `${fixture.id} ${arm} did not reach a qualified Jobs owner cycle`,
    );
    assert.ok(
      admissions.length <= diagnostics.workTicks,
      `${fixture.id} ${arm} observed more than once per qualified work cycle`,
    );
    const expectedStatus =
      request === undefined ? "inactive" : "admitted-for-observation";
    assert.ok(
      admissions.every((event) => event.admission?.status === expectedStatus),
      `${fixture.id} ${arm} had an unexpected admission status`,
    );
    assert.ok(
      admissions.every((event) =>
        ["ordinary-jobs-only", "full-jobs-and-foundry"].includes(
          event.ownerScope,
        ),
      ),
      `${fixture.id} ${arm} did not identify its Jobs owner scope`,
    );
    if (request === undefined) {
      assert.ok(
        admissions.every(
          (event) =>
            event.admissionEvaluations === 0 &&
            event.evidence === undefined &&
            event.requestPresenceChecks === 1,
        ),
        `${fixture.id} ${arm} constructed evidence without a request`,
      );
    } else {
      assert.ok(
        admissions.every(
          (event) =>
            event.admissionEvaluations === 1 &&
            event.evidence?.executionAuthority === "none" &&
            event.admission?.executionAuthority === "none" &&
            event.nativeRootExposed === false,
        ),
        `${fixture.id} ${arm} did not preserve observation-only authority`,
      );
      assert.ok(
        admissions.every(
          (event) =>
            event.evidence?.ownerScope === event.ownerScope &&
            event.evidence?.workCycleIdentity !== null &&
            event.evidence?.jobsPreparationGeneration ===
              event.evidence?.capturedRootIdentity?.preparationGeneration,
        ),
        `${fixture.id} ${arm} has inconsistent owner-local identities`,
      );
      const workCycles = admissions.map(
        (event) => event.evidence.workCycleIdentity,
      );
      assert.equal(
        new Set(workCycles).size,
        workCycles.length,
        `${fixture.id} ${arm} observed a Jobs owner cycle more than once`,
      );
    }
    assert.ok(
      admissions.every(
        (event) =>
          event.controlResolutionReadsDuringObservation === 0 &&
          event.settingsReadsDuringObservation === 0 &&
          event.catalogReadsDuringObservation === 0 &&
          event.demandReadsDuringObservation === 0 &&
          event.nativeRootReadsDuringObservation === 0,
      ),
      `${fixture.id} ${arm} performed an existing or native read during observation`,
    );

    const ownerScopes = [
      ...new Set(admissions.map((event) => event.ownerScope)),
    ];
    const finalState = await session.readState();
    const exportSave = await session.exportSave();
    const readCounters = Object.fromEntries(
      Object.entries(performanceCounts).filter(([name]) =>
        readCounterPattern.test(name),
      ),
    );
    return {
      arm,
      request: request ?? null,
      periods: diagnostics.periods,
      workTicks: diagnostics.workTicks,
      ownerScopes,
      ownerObservations: admissions.length,
      fullJobsPrepareCalls,
      fullJobsPlanCalls,
      observationCosts: summarizeObservationCosts(admissions),
      ownerReadCountsAtLastObservation:
        admissions.at(-1) === undefined
          ? null
          : {
              controlResolutions:
                admissions.at(-1).controlResolutionCountAtObservation,
              settingsReads: admissions.at(-1).settingsReadCountAtObservation,
              catalogReads: admissions.at(-1).catalogReadCountAtObservation,
              demandReads: admissions.at(-1).demandReadCountAtObservation,
              nativeRootReads:
                admissions.at(-1).nativeRootReadCountAtObservation,
            },
      readCounters,
      nativeInvocations: nativeInvocationSummary(diagnostics),
      controlUsage: summarizeNativeControlUsage(diagnostics.controlUsage),
      callbackProfile: {
        samples: diagnostics.callbackDurationsMs?.length ?? null,
        maxDispatchDurationMs: round(
          Math.max(
            0,
            ...(diagnostics.callbackDurationsMs ?? []).map(
              (entry) => entry.durationMs,
            ),
          ),
        ),
      },
      checkpoints,
      finalStateSha256: sha256(JSON.stringify(finalState)),
      finalExportSha256: sha256(exportSave),
      finalRngCalls: diagnostics.randomCalls,
      finalRngState: diagnostics.rngState,
      perfSummaryCount: diagnostics.perfSummaries.length,
      errors: {
        page: diagnostics.counts.pageerror ?? 0,
        rejected: diagnostics.counts.rejection ?? 0,
        loop: diagnostics.counts.loopError ?? 0,
        dialogs: diagnostics.dialogs.length,
      },
      admissions,
    };
  } finally {
    await session.close();
  }
}

function compareArms(a, b, repeat) {
  for (const other of [b, repeat]) {
    assert.deepEqual(other.checkpoints, a.checkpoints);
    assert.equal(other.finalStateSha256, a.finalStateSha256);
    assert.equal(other.finalExportSha256, a.finalExportSha256);
    assert.equal(other.finalRngCalls, a.finalRngCalls);
    assert.equal(other.finalRngState, a.finalRngState);
    assert.deepEqual(other.controlUsage, a.controlUsage);
    assert.deepEqual(other.nativeInvocations, a.nativeInvocations);
    assert.deepEqual(other.readCounters, a.readCounters);
    assert.equal(other.fullJobsPrepareCalls, a.fullJobsPrepareCalls);
    assert.equal(other.fullJobsPlanCalls, a.fullJobsPlanCalls);
    assert.deepEqual(other.errors, a.errors);
  }
  assert.deepEqual(
    semanticAdmissions(b.admissions),
    semanticAdmissions(repeat.admissions),
  );
}

function loadFileFixture(id, savePath, settingsPath) {
  const saveText = readFileSync(resolve(repositoryDirectory, savePath), "utf8");
  const settingsText = readFileSync(
    resolve(repositoryDirectory, settingsPath),
    "utf8",
  );
  const settings = JSON.parse(settingsText);
  assert.equal(settings.autoJobs, true, `${id} requires Auto Jobs`);
  assert.equal(settings.autoCraftsmen, true, `${id} requires Auto Craftsmen`);
  return {
    id,
    saveText,
    settings,
    savePath,
    settingsPath,
    saveSha256: sha256(saveText),
    settingsSha256: sha256(settingsText),
  };
}

export async function runP49Proof() {
  const testBundleSha256 = await buildP19CompatibleTestBundle();
  assert.ok(existsSync(testBundlePath), "test-surface bundle was not built");
  const runner = await createChromiumRunner({ headless: true });
  try {
    const lateGame = loadFileFixture(
      "late-game-mad-tech-offered-blocked",
      "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
      "test-artifacts/benchmark/slice0/settings/current-full.json",
    );
    const p19Checkpoint = await replayP19Checkpoint(runner, testBundlePath);
    const positivePopulation = {
      id: "standard-human-p19-p250-positive-population",
      saveText: p19Checkpoint.saveText,
      settings: p19Checkpoint.settings,
      savePath: "P19 native replay export at p250 (in-memory)",
      settingsPath: "experiments/p18-standard-human-settings.json",
      saveSha256: p19Checkpoint.saveSha256,
      settingsSha256: p19Checkpoint.settingsSha256,
    };
    const fixtures = [lateGame, positivePopulation];
    const results = [];
    for (const fixture of fixtures) {
      const request = Object.freeze({
        ...requestTemplate,
        requestId: `fixture:p49:${fixture.id}:1`,
      });
      console.log(`[P49] ${fixture.id} A`);
      const a = await runArm({ runner, fixture, arm: "A", request: undefined });
      console.log(`[P49] ${fixture.id} B`);
      const b = await runArm({ runner, fixture, arm: "B", request });
      console.log(`[P49] ${fixture.id} B-repeat`);
      const repeat = await runArm({
        runner,
        fixture,
        arm: "B-repeat",
        request,
      });
      compareArms(a, b, repeat);
      const expectedScope =
        fixture === lateGame ? "full-jobs-and-foundry" : "ordinary-jobs-only";
      for (const run of [a, b, repeat])
        assert.deepEqual(run.ownerScopes, [expectedScope]);
      if (fixture === positivePopulation)
        for (const run of [a, b, repeat])
          assert.ok(
            run.fullJobsPrepareCalls > 0 && run.fullJobsPlanCalls === 0,
            "positive-population checkpoint must exercise unavailable Full Jobs before ordinary fallback",
          );
      else
        for (const run of [a, b, repeat]) assert.ok(run.fullJobsPlanCalls > 0);
      results.push({
        fixture: fixture.id,
        expectedOwnerScope: expectedScope,
        fullJobsAvailability:
          fixture === lateGame
            ? "prepared"
            : "unavailable; ordinary fallback reached",
        runs: {
          A: compactRun(a, false),
          B: compactRun(b, true),
          BRepeat: compactRun(repeat, false),
        },
      });
    }
    const sourcePaths = [
      "src/domain/civic/allocation-diagnostic-admission.ts",
      "src/adapters/evolve/civic/captured-ordinary-jobs.ts",
      "src/bootstrap/captured-runtime-control.ts",
      "experiments/p18-standard-human-settings.json",
      "experiments/p19-civilization-bootstrap-exact.mjs",
      "experiments/p19-civilization-bootstrap-evidence.json",
      "experiments/p48-explicit-intent-admission-evidence.mjs",
      "experiments/p49-jobs-admission-evidence.mjs",
      "tools/chromium-evolve-runner.mjs",
      "tools/chromium/bridge.js",
    ];
    const sourceHashes = Object.fromEntries(
      sourcePaths.map((relativePath) => [
        relativePath,
        sha256(readFileSync(resolve(repositoryDirectory, relativePath))),
      ]),
    );
    return {
      schema: "p49-jobs-admission-coverage-v1",
      pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      startCommits: {
        evidence: "14428200",
        implementation: "53fdd252",
        tests: "c2a1167b",
      },
      experiment: {
        periodsPerArm,
        totalTreatmentRuns: fixtures.length * 3,
        p19CheckpointPeriod: positiveCheckpointPeriod,
        p19ReplaySeed: seed,
        epoch,
        snapshotPeriods,
        requestTemplate,
        testBundlePath:
          "test-artifacts/local/evolve_automation.test-surface.user.js",
        testBundleSha256,
        rendererCpuGate:
          "unresolved; callback increments do not establish renderer CPU share",
      },
      positivePopulationCheckpoint: {
        period: p19Checkpoint.period,
        saveSha256: p19Checkpoint.saveSha256,
        settingsSha256: p19Checkpoint.settingsSha256,
        population: p19Checkpoint.population,
        species: p19Checkpoint.species,
        universe: p19Checkpoint.universe,
        technology: p19Checkpoint.technology,
        assignments: p19Checkpoint.assignments,
        foundryPresent: p19Checkpoint.foundryPresent,
        expose: p19Checkpoint.expose,
        p19InterventionProvenance: p19Checkpoint.p19InterventionProvenance,
        p19RetainedCheckpointMatch: p19Checkpoint.p19RetainedCheckpointMatch,
      },
      results,
      parity: {
        status:
          "late-game Full Jobs and positive-population ordinary-only Jobs parity passed",
        checked: [
          "ordered native control invocations and invocation counts",
          "native control usage",
          "Jobs and Craftsmen assignments at both checkpoints",
          "Research and Construction behavior through exported-state and invocation hashes",
          "RNG count and state at both checkpoints and final state",
          "export and decoded-state hashes at both checkpoints and final state",
          "Full Jobs and demand/resource/cost read counters",
          "ordinary Jobs catalog, demand, root, settings and control-resolution counters",
          "no request means zero admission evaluations and no evidence envelope",
          "B and B-repeat owner-local identity and admission semantics match",
          "zero additional root, settings, catalog, demand, or control reads during observation",
        ],
        fixtureProvenance:
          "The positive-population state is the P19 authorized Standard/Human replay at p250. The seed replay includes the accepted ten-click Stone bootstrap and ten-click Construction handoff. Treatment arms begin from its native export and add no Gather, purchase, or worker-assignment intervention.",
        nativeParityCoverage: {
          status: "limited-existing-fixture-missing",
          fixturePath: "test-artifacts/benchmark/settings/baseline-tuned.json",
          fixturePresent: existsSync(
            resolve(
              repositoryDirectory,
              "test-artifacts/benchmark/settings/baseline-tuned.json",
            ),
          ),
          limitation:
            "The existing native-timer parity fixture baseline-tuned.json remains absent; P49 uses controlled Chromium A/B/B-repeat.",
        },
      },
      sourceHashes,
    };
  } finally {
    await runner.close();
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const outputPath = resolve(
    experimentDirectory,
    "p49-jobs-admission-evidence.json",
  );
  const evidence = await runP49Proof();
  writeFileSync(
    outputPath,
    await format(`${JSON.stringify(evidence, null, 2)}\n`, { parser: "json" }),
  );
  console.log(`Wrote ${outputPath}`);
}
