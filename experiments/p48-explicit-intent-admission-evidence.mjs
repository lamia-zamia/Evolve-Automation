import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { format } from "prettier";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const periods = 400;
const snapshotPeriods = [200, 400];
const seed = 42;
const epoch = Date.parse("2026-09-21T00:00:00.000Z");
const requestTemplate = Object.freeze({
  origin: "test-only",
  objectiveId: "maintain-food-buffer-and-useful-stone-production",
  requestedScope: "food-sustainability-and-useful-stone-replenishment",
  generation: 1,
  active: true,
  authorityClassification: "observation-only",
});
const readCounterPattern =
  /^(jobs\.full\.(readFullCycleCalls|jobCatalogReads|craftsmenCycleReads|demandReads|craftCostReads|buildTargetReads|buildCostReads)|demand\.sample\.(inputCaptures|queueReservationReads|actionCostReads|actionCostCacheHits|offeredTechnologyReads|buildingCatalogReads)|action-cost\.)/;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const round = (value) =>
  Number.isFinite(value) ? Number(value.toFixed(6)) : null;

function aggregatePerformanceCounts(summaries) {
  const result = {};
  for (const summary of summaries) {
    const counts = summary[2] ?? {};
    for (const [name, value] of Object.entries(counts))
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
        "all P48 callback timings require the native monotonic clock",
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
    controlResolutionReadsDuringObservation: events.reduce(
      (sum, event) => sum + event.controlResolutionReadsDuringObservation,
      0,
    ),
    existingSettingsReadsDuringObservation: events.reduce(
      (sum, event) => sum + event.settingsReadsDuringObservation,
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
      nativeRootExposed,
      controlResolutionCountAtObservation,
      controlResolutionReadsDuringObservation,
      settingsReadCountAtObservation,
      settingsReadsDuringObservation,
    }) => ({
      admission,
      evidence,
      kind,
      nativeRootExposed,
      controlResolutionCountAtObservation,
      controlResolutionReadsDuringObservation,
      settingsReadCountAtObservation,
      settingsReadsDuringObservation,
    }),
  );
}

function summarizeTrace(values) {
  return {
    samples: values.length,
    first: values[0] ?? null,
    last: values.at(-1) ?? null,
    sha256: sha256(JSON.stringify(values)),
  };
}

function compactRun(run, includeAdmissionSample) {
  const { admissions, controlResolutionTrace, settingsReadTrace, ...summary } =
    run;
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
    controlResolutionTrace: summarizeTrace(controlResolutionTrace),
    settingsReadTrace: summarizeTrace(settingsReadTrace),
  };
}

async function runArm({
  runner,
  fixture,
  arm,
  request,
  allowUnavailableFullJobs = false,
}) {
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
      : {
          initialTestInterventions: {
            allocationDiagnosticRequest: request,
          },
        }),
  });
  try {
    await session.advance(periods);
    const diagnostics = await session.diagnostics();
    const admissionHooks = await session.evaluate(() => ({
      present: window.__EA_TEST_HOOKS__ !== undefined,
      observer:
        typeof window.__EA_TEST_HOOKS__?.observeAllocationDiagnosticAdmission,
      requestPresent:
        window.__EA_TEST_HOOKS__?.allocationDiagnosticRequest !== undefined,
    }));
    const admissions = await session.evaluate(
      () => window.__EA_TEST_HOOKS__?.allocationDiagnosticAdmissions ?? [],
    );
    const snapshots = await session.snapshots();
    const checkpointEvidence = Object.fromEntries(
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
    assert.equal(diagnostics.periods, periods);
    assert.equal(diagnostics.captureComplete, true);
    if (allowUnavailableFullJobs)
      assert.equal(
        admissions.length,
        0,
        `${fixture.id} ${arm} unexpectedly reached Full Jobs despite being qualified as unavailable`,
      );
    else
      assert.ok(
        admissions.length > 0,
        `${fixture.id} ${arm} did not reach Full Jobs: ${JSON.stringify({
          periods: diagnostics.periods,
          workTicks: diagnostics.workTicks,
          captureComplete: diagnostics.captureComplete,
          admissionHooks,
          jobCounters: Object.fromEntries(
            Object.entries(performanceCounts).filter(([name]) =>
              name.startsWith("jobs.full."),
            ),
          ),
          measuredJobsPhases: diagnostics.perfSummaries.flatMap((summary) =>
            Object.keys(summary[1] ?? {}).filter((name) =>
              name.startsWith("jobs.full."),
            ),
          ),
          events: diagnostics.events.slice(0, 8),
          lines: diagnostics.lines.slice(0, 8),
        })}`,
      );
    const acceptedStatuses = admissions.map((event) => event.admission?.status);
    assert.ok(
      acceptedStatuses.every((status) =>
        request === undefined
          ? status === "inactive"
          : status === "admitted-for-observation",
      ),
      `${fixture.id} ${arm} had an unexpected admission result: ${acceptedStatuses.join(",")}`,
    );
    if (request !== undefined)
      assert.ok(
        admissions.every(
          (event) =>
            event.admission?.executionAuthority === "none" &&
            event.evidence?.executionAuthority === "none" &&
            event.nativeRootExposed === false,
        ),
      );
    assert.ok(
      admissions.every(
        (event) => event.controlResolutionReadsDuringObservation === 0,
      ),
      `${fixture.id} ${arm} made a control-registry resolution during P48 observation`,
    );
    assert.ok(
      admissions.every((event) => event.settingsReadsDuringObservation === 0),
      `${fixture.id} ${arm} reread Full Jobs settings during P48 observation`,
    );
    assert.ok(
      (performanceCounts["jobs.full.jobCatalogReads"] ?? 0) > 0,
      `${fixture.id} ${arm} did not prepare a captured Jobs catalog`,
    );
    assert.ok(
      (performanceCounts["jobs.full.craftsmenCycleReads"] ?? 0) > 0,
      `${fixture.id} ${arm} did not prepare the Foundry cycle`,
    );
    const readCounters = Object.fromEntries(
      Object.entries(performanceCounts).filter(([name]) =>
        readCounterPattern.test(name),
      ),
    );
    const finalState = await session.readState();
    const exportSave = await session.exportSave();
    const nativeInvocations = diagnostics.nativeInvocations ?? [];
    return {
      arm,
      request: request ?? null,
      periods: diagnostics.periods,
      workTicks: diagnostics.workTicks,
      admissions,
      fullJobsOwnerObservations: admissions.length,
      fullJobsPlanCalls: performanceCounts["jobs.full.planCalls"] ?? 0,
      controlResolutionTrace: admissions.map(
        (event) => event.controlResolutionCountAtObservation ?? null,
      ),
      settingsReadTrace: admissions.map(
        (event) => event.settingsReadCountAtObservation ?? null,
      ),
      observationCosts: summarizeObservationCosts(admissions),
      readCounters,
      nativeInvocations: {
        count: nativeInvocations.length,
        sha256: sha256(JSON.stringify(nativeInvocations)),
      },
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
      checkpoints: checkpointEvidence,
      finalStateSha256: sha256(JSON.stringify(finalState)),
      finalExportSha256: sha256(exportSave),
      finalRngCalls: diagnostics.randomCalls,
      finalRngState: diagnostics.rngState,
      perfSummaryCount: diagnostics.perfSummaries.length,
      perfSummaryTicks: diagnostics.workTicks,
      errors: {
        page: diagnostics.counts.pageerror ?? 0,
        rejected: diagnostics.counts.rejection ?? 0,
        loop: diagnostics.counts.loopError ?? 0,
        dialogs: diagnostics.dialogs.length,
      },
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
    assert.deepEqual(other.errors, a.errors);
  }
  assert.deepEqual(
    semanticAdmissions(b.admissions),
    semanticAdmissions(repeat.admissions),
  );
  assert.deepEqual(b.controlResolutionTrace, a.controlResolutionTrace);
  assert.deepEqual(repeat.controlResolutionTrace, a.controlResolutionTrace);
  assert.deepEqual(b.settingsReadTrace, a.settingsReadTrace);
  assert.deepEqual(repeat.settingsReadTrace, a.settingsReadTrace);
}

async function loadFixture({ id, savePath, settingsPath }) {
  const saveText = readFileSync(resolve(repositoryDirectory, savePath), "utf8");
  const settingsText = readFileSync(
    resolve(repositoryDirectory, settingsPath),
    "utf8",
  );
  const settings = JSON.parse(settingsText);
  assert.equal(settings.autoJobs, true, `${id} Full Jobs requires autoJobs`);
  assert.equal(
    settings.autoCraftsmen,
    true,
    `${id} Full Jobs requires autoCraftsmen`,
  );
  return {
    id,
    savePath,
    settingsPath,
    saveText,
    settings,
    saveSha256: sha256(saveText),
    settingsSha256: sha256(settingsText),
  };
}

export async function runP48Proof() {
  execFileSync(process.execPath, ["build.mjs", "--local", "--test-surface"], {
    cwd: repositoryDirectory,
    stdio: "inherit",
  });
  assert.ok(existsSync(testBundlePath), "test-surface bundle was not built");
  const fixtures = [
    await loadFixture({
      id: "late-game-mad-tech-offered-blocked",
      savePath:
        "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
      settingsPath:
        "test-artifacts/benchmark/slice0/settings/current-full.json",
    }),
    await loadFixture({
      id: "authentic-standard-human",
      savePath:
        "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
      settingsPath: "experiments/p18-standard-human-settings.json",
    }),
  ];
  const missingNativeParitySettings =
    "test-artifacts/benchmark/settings/baseline-tuned.json";
  const runner = await createChromiumRunner({ headless: true });
  try {
    const results = [];
    for (const fixture of fixtures) {
      const request = Object.freeze({
        ...requestTemplate,
        requestId: `fixture:p48:${fixture.id}:1`,
      });
      console.log(`[P48] ${fixture.id} A`);
      const isStandardHuman = fixture.id === "authentic-standard-human";
      const allowUnavailableFullJobs = isStandardHuman;
      const a = await runArm({
        runner,
        fixture,
        arm: "A",
        request: undefined,
        allowUnavailableFullJobs,
      });
      console.log(`[P48] ${fixture.id} B`);
      const b = await runArm({
        runner,
        fixture,
        arm: "B",
        request,
        allowUnavailableFullJobs,
      });
      console.log(`[P48] ${fixture.id} B-repeat`);
      const repeat = await runArm({
        runner,
        fixture,
        arm: "B-repeat",
        request,
        allowUnavailableFullJobs,
      });
      compareArms(a, b, repeat);
      const ownerBoundaryReached =
        a.fullJobsOwnerObservations > 0 &&
        b.fullJobsOwnerObservations > 0 &&
        repeat.fullJobsOwnerObservations > 0;
      if (isStandardHuman)
        assert.ok(
          !ownerBoundaryReached &&
            a.fullJobsPlanCalls === 0 &&
            b.fullJobsPlanCalls === 0 &&
            repeat.fullJobsPlanCalls === 0,
          "the retained authentic Standard/Human fixture should remain unavailable for the prepared Full Jobs owner boundary",
        );
      results.push({
        fixture: fixture.id,
        ownerBoundaryReached,
        boundaryAvailability: ownerBoundaryReached
          ? "prepared-full-jobs-session-reached"
          : "prepared-full-jobs-session-unavailable",
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
      "build.mjs",
      "build-config.mjs",
      "tools/chromium-evolve-runner.mjs",
      "tools/chromium/bridge.js",
      "experiments/p48-explicit-intent-admission-evidence.mjs",
    ];
    const sourceHashes = Object.fromEntries(
      sourcePaths.map((relativePath) => [
        relativePath,
        sha256(readFileSync(resolve(repositoryDirectory, relativePath))),
      ]),
    );
    const evidence = {
      schema: "p48-explicit-intent-admission-v1",
      pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      startCommits: { report: "baf633e1", tooling: "bbf285fe" },
      experiment: {
        periodsPerArm: periods,
        totalRuns: fixtures.length * 3,
        seed,
        epoch,
        snapshotPeriods,
        bundlePath:
          "test-artifacts/local/evolve_automation.test-surface.user.js",
        bundleSha256: sha256(readFileSync(testBundlePath)),
        maxCampaign: "400 periods per arm; no p10000 campaign",
        rendererCpuGate:
          "not evaluated; callback timing is not renderer CPU evidence",
      },
      requestTemplate,
      fixtures: fixtures.map(
        ({ id, savePath, settingsPath, saveSha256, settingsSha256 }) => ({
          id,
          savePath,
          settingsPath,
          saveSha256,
          settingsSha256,
          fullJobsSettings: { autoJobs: true, autoCraftsmen: true },
        }),
      ),
      results,
      parity: {
        status:
          "late-game-owner-boundary-parity-passed; authentic-standard-human-boundary-unavailable",
        checked: [
          "ordered native control invocations",
          "native control usage",
          "Jobs and Foundry assignment summaries at both checkpoints",
          "Research and Construction outcomes through full exported-state hashes",
          "RNG count and state at both checkpoints and final state",
          "export and decoded-state hashes at both checkpoints and final state",
          "owner read counters for Full Jobs, demand resources, prices, queue reservations, and demand",
          "deterministic B-repeat admissions",
          "control-registry-resolution count at each owner-local observation",
          "existing Full Jobs settings-read count at each owner-local observation",
          "zero registry resolutions during admission projection and predicate",
          "zero Full Jobs settings reads during admission projection and predicate",
        ],
        nativeParityCoverage: {
          status: "limited-existing-fixture-missing",
          fixturePath: missingNativeParitySettings,
          fixturePresent: existsSync(
            resolve(repositoryDirectory, missingNativeParitySettings),
          ),
          limitation:
            "The missing baseline-tuned settings fixture continues to limit the existing native-timer parity run; P48 uses controlled A/B/B-repeat only.",
        },
      },
      readCounterInterpretation: {
        zeroIncrementVerifiedBy:
          "equal instrumented Full Jobs and demand sample counters across A, B, and B-repeat, exact native-control usage parity, and the admission function's read-free input signature",
        nativeRootOrControlObjectPassedToAdmission: false,
        controlRegistryResolutionMeasurement:
          "test-surface-only Full Jobs registry wrapper records the cumulative resolve count at the boundary and the before/after delta during the observation; per-observation delta is asserted zero and A/B/B-repeat traces match",
        settingsReadMeasurement:
          "test-surface-only counter records existing Full Jobs settings reads at each observation and the before/after delta; the admission path performs zero additional settings reads and A/B/B-repeat traces match",
        authenticStandardHumanLimitation:
          "the retained P18 authentic Human checkpoint reaches the Full Jobs catalog, demand, ordinary and Foundry sampling phases but never yields an available combined session or plan call; A/B/B-repeat therefore verify unchanged state and counters but cannot qualify as an admission boundary",
        retainedEvidenceMemory:
          "serialized retained observer-event bytes are reported as a payload-size proxy; final evidence retains one representative admitted envelope plus per-cycle semantic trace hashes, not every projected Jobs fact; no renderer heap or CPU claim is made",
      },
      sourceHashes,
    };
    return evidence;
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
    "p48-explicit-intent-admission-evidence.json",
  );
  const evidence = await runP48Proof();
  writeFileSync(
    outputPath,
    await format(`${JSON.stringify(evidence, null, 2)}\n`, { parser: "json" }),
  );
  console.log(`Wrote ${outputPath}`);
}
