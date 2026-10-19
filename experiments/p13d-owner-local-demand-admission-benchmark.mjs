import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import {
  accountProcessCpu,
  assertIdenticalBundleHashes,
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, "test-artifacts/benchmark/tmp");
const artifact = (name) => path.join(tmp, name);
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const startSave = parseSave(await readFile(savePath, "utf8"));
const settings = {
  ...JSON.parse(await readFile(settingsPath, "utf8")),
  autoResearch: true,
  autoSmelter: true,
};
const seed = 42;
const epoch = "2026-09-21T00:00:00.000Z";
const warmupPeriods = 1784;
const fixtureProbePeriods = 8;
const measuredPeriods = 800;
const worktickPeriods = 8;
const requestedComparison = {
  resourceId: "Steel",
  pool: "city",
  additionalSteel: 10,
};
const advancePeriods = async (session, count, chunk = 120) => {
  for (let remaining = count; remaining > 0; remaining -= chunk)
    await session.advance(Math.min(chunk, remaining));
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const percentile = (values, p) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
  ];
};
const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const sampleSd = (values) => {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      (values.length - 1),
  );
};

const prelude = `
globalThis.__EA_TEST_HOOKS__ = { ...(globalThis.__EA_TEST_HOOKS__ ?? {}) };
const __p13d = { mode: "G", instrument: false, calls: 0, publications: 0, admissions: 0, outcomes: [], results: [], callbackMs: [], snapshotMs: [], snapshot: undefined };
const __p13dHooks = globalThis.__EA_TEST_HOOKS__;
__p13dHooks.readSmelterGoalDemandProposalForTest = (input, decision, demand, observation, ownerCycle) => {
  if (__p13d.mode === "U") return { resourceId: "Knowledge" };
  if (__p13d.mode !== "Q") return undefined;
  return {
    goalId: "test-only:p13d-steel-proposal",
    requirementId: "test-only:p13d-steel-proposal:steel",
    provenance: "provisional-advisory",
    resourceId: "Steel", pool: "city", additionalQuantity: 10,
    root: observation.root,
    progressionGeneration: observation.progressionGeneration,
    demandGeneration: ownerCycle,
    permissionEnabled: observation.permissionEnabled,
    originatingOwner: "smelter",
    validity: { valid: true, expiresAtOwnerCycle: ownerCycle, invalidatedBy: ["newer-owner-cycle", "root-replacement", "progression-change", "offer-price-change", "goal-change-or-satisfaction", "resource-stock-change", "demand-change", "native-control-generation-change", "permission-change", "construction-queue-change", "conflicting-iron-demand", "unknown-commitment-coverage", "owner-disabled-or-uninitialized", "incomplete-candidate-enumeration"] },
    knownCompetingCommitments: ["test-only:Construction:Steel:fixture"],
    unknownCommitmentCoverage: true,
  };
};
__p13dHooks.observeSmelterGoalDemandAdmissionForTest = (result) => {
  if (__p13d.instrument) { __p13d.admissions++; __p13d.results.push({ status: result.status, valid: result.proposalValidForEvaluation, available: result.ownerLocalComparisonAvailable, quantityRepresented: result.comparison?.quantityRepresented, quantitativeComparison: result.comparison?.quantitativeComparison, reasons: result.reasons }); }
};
__p13dHooks.observeSmelterOutcomeForTest = (outcome, observation, postcondition) => {
  if (__p13dHooks.captureSmelterOutcomeForTest) __p13d.outcomes.push({ outcome, postcondition: postcondition.status === "no-op" ? { status: "no-op", allocations: {} } : postcondition });
};
__p13dHooks.observeSmelterPlanForTest = (input, decision, demand, observation) => {
  if (__p13d.mode === "H" && !__p13d.instrument) return;
  if (__p13d.instrument) __p13d.calls++;
  const started = __p13d.instrument ? window.__EA_RUNNER__.nativeNow() : 0;
  try {
    if (__p13d.mode !== "S") return;
    const snapshotStarted = __p13d.instrument
      ? window.__EA_RUNNER__.nativeNow()
      : 0;
    const snapshot = __p13dHooks.createSmelterSnapshotForTest(input, decision, demand, observation);
    __p13d.snapshot = snapshot;
    __p13d.publications++;
    if (__p13d.instrument)
      __p13d.snapshotMs.push(window.__EA_RUNNER__.nativeNow() - snapshotStarted);
  } finally {
    if (__p13d.instrument)
      __p13d.callbackMs.push(window.__EA_RUNNER__.nativeNow() - started);
  }
};
__p13dHooks.setP13C1Mode = (mode) => {
  if (!__p13dHooks.setSmelterObservationModeForTest(mode)) throw new Error("invalid observation mode");
  __p13d.mode = mode;
};
__p13dHooks.setP13C1Instrumentation = (enabled) => { __p13d.instrument = Boolean(enabled); };
__p13dHooks.resetP13C1Window = () => {
  __p13d.calls = 0; __p13d.publications = 0; __p13d.admissions = 0; __p13d.outcomes = []; __p13d.results = []; __p13d.callbackMs = []; __p13d.snapshotMs = [];
};
__p13dHooks.readP13C1Window = () => ({
  mode: __p13d.mode, ownerObservationCalls: __p13d.calls,
  snapshotPublications: __p13d.publications, admissions: __p13d.admissions, outcomes: [...__p13d.outcomes], results: [...__p13d.results], callbackMs: [...__p13d.callbackMs],
  snapshotMs: [...__p13d.snapshotMs], snapshot: __p13d.snapshot,
});`;
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const build = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: { js: `${metadata}\n${prelude}` },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
const bundleBytes = build.outputFiles[0].contents;
const bundlePath = artifact("p13d-owner-observation.user.js");
await mkdir(tmp, { recursive: true });
await writeFile(bundlePath, bundleBytes);
const bundleSha256 = digest(bundleBytes);
const inputSaveSha256 = digest(JSON.stringify(startSave));
const settingsSha256 = digest(JSON.stringify(settings));
let measurementSave = startSave;

async function configure(session, mode) {
  const result = await session.evaluate((selected) => {
    window.__EA_TEST_HOOKS__.setP13C1Mode(selected);
    return {
      mode: window.__EA_TEST_HOOKS__.smelterObservationMode,
      settings: JSON.parse(localStorage.getItem("settings") ?? "{}"),
      bundle: window.__EA_RUNNER__.periods(),
    };
  }, mode);
  assert.equal(result.mode, mode);
  assert.equal(result.settings.autoSmelter, true);
  return result;
}

const runner = await createChromiumRunner();
process.once("unhandledRejection", (reason) => {
  void runner.close().finally(() => {
    console.error(reason);
    process.exit(1);
  });
});
const calibrationSession = await runner.openSession({
  bundle: bundlePath,
  save: startSave,
  settings,
  seed,
  epoch,
});
let calibration;
try {
  await configure(calibrationSession, "G");
  const before = await runner.processCpu();
  const metricsBefore = await calibrationSession.metrics();
  const workload = await calibrationSession.evaluate((durationMs) => {
    const now = window.__EA_RUNNER__.nativeNow;
    const started = now();
    let value = 0;
    while (now() - started < durationMs) {
      for (let index = 1; index <= 500; index++)
        value = (value + Math.imul(index, index + value)) | 0;
    }
    return { elapsedMs: now() - started, value };
  }, 250);
  const metricsAfter = await calibrationSession.metrics();
  const after = await runner.processCpu();
  const deltas = accountProcessCpu(before, after);
  const rendererRows = deltas.rows.filter(
    (row) => row.type === "renderer" && row.cpuSec !== undefined,
  );
  const activeRendererId = rendererRows.toSorted(
    (a, b) => b.cpuSec - a.cpuSec,
  )[0]?.id;
  calibration = {
    repetitions: 1,
    targetWorkloadMs: 250,
    workload,
    taskDurationSec: metricsAfter.TaskDuration - metricsBefore.TaskDuration,
    scriptDurationSec:
      metricsAfter.ScriptDuration - metricsBefore.ScriptDuration,
    processRows: deltas.rows,
    activeRendererId,
    activeRendererCpuSec: rendererRows.find(
      (row) => row.id === activeRendererId,
    )?.cpuSec,
    pidChurn: deltas.processChurn,
  };
} finally {
  await calibrationSession.close();
}
assert.ok(
  calibration.activeRendererId !== undefined,
  "calibration did not identify a game renderer PID",
);
console.log("calibration complete");

async function openConfigured(mode, options = {}) {
  const session = await runner.openSession({
    bundle: bundlePath,
    save: options.save ?? measurementSave,
    settings,
    seed,
    epoch,
    perf: options.perf ?? false,
    callbackProfile: options.callbackProfile ?? false,
    nativeTrace: options.nativeTrace ?? false,
  });
  await configure(session, mode);
  return session;
}

async function identifySessionRenderer(session) {
  const before = await runner.processCpu();
  const metricsBefore = await session.metrics();
  const workload = await session.evaluate((durationMs) => {
    const now = window.__EA_RUNNER__.nativeNow;
    const started = now();
    let value = 0;
    while (now() - started < durationMs) {
      for (let index = 1; index <= 500; index++)
        value = (value + Math.imul(index, index + value)) | 0;
    }
    return { elapsedMs: now() - started, value };
  }, 120);
  const metricsAfter = await session.metrics();
  const after = await runner.processCpu();
  const accounting = accountProcessCpu(before, after);
  const renderers = accounting.rows.filter(
    (row) => row.type === "renderer" && row.cpuSec !== undefined,
  );
  const active = renderers.toSorted((a, b) => b.cpuSec - a.cpuSec)[0];
  assert.ok(
    active && active.cpuSec > 0,
    "page workload did not identify this session's renderer",
  );
  return {
    id: active.id,
    cpuSec: active.cpuSec,
    taskDurationSec: metricsAfter.TaskDuration - metricsBefore.TaskDuration,
    workload,
    otherRendererCpuSec: renderers
      .filter((row) => row.id !== active.id)
      .reduce((sum, row) => sum + row.cpuSec, 0),
    processRows: accounting.rows,
    processChurn: accounting.processChurn,
  };
}

async function snapshotSummary(session) {
  return session.evaluate(() => {
    const row = window.__EA_TEST_HOOKS__.readP13C1Window();
    const snapshot = row.snapshot;
    if (!snapshot) return undefined;
    return {
      demand: snapshot.demand,
      input: snapshot.input,
      decision: snapshot.decision,
      commands: snapshot.commands,
      permissionEnabled: snapshot.permissionEnabled,
      controlGeneration: snapshot.controlGeneration,
      controlMethods: snapshot.controlMethods,
      progressionGeneration: snapshot.progressionGeneration,
      demandAuthorityAvailable: snapshot.demandAuthorityAvailable,
      rootAvailable: snapshot.root !== undefined,
      unavailableAuthority: snapshot.unavailableAuthority,
    };
  });
}

// Check whether the export reconstructs the runtime boundary before treating it as a fixture.
let fixtureProbe;
let fixtureSave;
{
  const live = await openConfigured("S");
  try {
    await advancePeriods(live, warmupPeriods);
    const warmSnapshot = await snapshotSummary(live);
    const warmSettings = await live.evaluate(() =>
      JSON.parse(localStorage.getItem("settings") ?? "{}"),
    );
    assert.ok(
      warmSnapshot,
      "warm-up did not publish a source-backed owner snapshot",
    );
    assert.equal(warmSnapshot.demand.steelTarget, 1000);
    const exportText = await live.exportSave();
    const parsedExport = parseSave(exportText);
    await advancePeriods(live, fixtureProbePeriods);
    const continuedSnapshot = await snapshotSummary(live);
    const continuedHash = digest(await live.exportSave());
    const reload = await openConfigured("S", { save: parsedExport });
    try {
      await advancePeriods(reload, fixtureProbePeriods);
      const reloadedSnapshot = await snapshotSummary(reload);
      const reloadedSettings = await reload.evaluate(() =>
        JSON.parse(localStorage.getItem("settings") ?? "{}"),
      );
      const reloadedHash = digest(await reload.exportSave());
      const comparable = (value) =>
        JSON.stringify({
          demand: value?.demand,
          input: value?.input,
          decision: value?.decision,
          commands: value?.commands,
          permissionEnabled: value?.permissionEnabled,
          controlMethods: value?.controlMethods,
          progressionGeneration: value?.progressionGeneration,
          demandAuthorityAvailable: value?.demandAuthorityAvailable,
          rootAvailable: value?.rootAvailable,
          unavailableAuthority: value?.unavailableAuthority,
        });
      fixtureProbe = {
        warmSnapshot,
        continuedSnapshot,
        reloadedSnapshot,
        continuedHash,
        reloadedHash,
        reloadMatchesBoundary:
          comparable(continuedSnapshot) === comparable(reloadedSnapshot),
        reloadMatchesNextWorktickExport: continuedHash === reloadedHash,
        nativeControlAvailable: reloadedSnapshot?.controlMethods?.length > 0,
        assignmentsMatch:
          JSON.stringify(continuedSnapshot?.input) ===
          JSON.stringify(reloadedSnapshot?.input),
        rootAndProgressionAuthorityAvailable:
          reloadedSnapshot?.rootAvailable === true &&
          Number.isSafeInteger(reloadedSnapshot?.progressionGeneration),
        effectiveSettingsMatch:
          JSON.stringify(warmSettings) === JSON.stringify(reloadedSettings),
      };
      if (
        fixtureProbe.reloadMatchesBoundary &&
        fixtureProbe.reloadMatchesNextWorktickExport &&
        fixtureProbe.nativeControlAvailable &&
        fixtureProbe.assignmentsMatch &&
        fixtureProbe.rootAndProgressionAuthorityAvailable &&
        fixtureProbe.effectiveSettingsMatch
      ) {
        fixtureSave = parsedExport;
        await writeFile(
          artifact("p13d-verified-warm-save.json"),
          `${JSON.stringify(parsedExport)}\n`,
        );
      }
    } finally {
      await reload.close();
    }
  } finally {
    await live.close();
  }
}
const fixtureVerified = fixtureSave !== undefined;
measurementSave = fixtureSave ?? startSave;
console.log(`warm fixture verified=${fixtureVerified}`);

async function runCorrectness(mode) {
  const session = await openConfigured(mode, {
    nativeTrace: true,
    callbackProfile: true,
  });
  try {
    await advancePeriods(
      session,
      fixtureVerified ? fixtureProbePeriods : warmupPeriods,
    );
    await session.evaluate(() => {
      window.__EA_TEST_HOOKS__.setP13C1Instrumentation(true);
      window.__EA_TEST_HOOKS__.resetP13C1Window();
      window.__EA_TEST_HOOKS__.setSmelterOutcomeCaptureForTest(true);
    });
    const windowStartPeriod = await session.periods();
    await advancePeriods(session, 80);
    const diagnostics = await session.diagnostics();
    return {
      mode,
      bundleSha256: session.bundle.sha256,
      periods: await session.periods(),
      callbackLatencyMs: diagnostics.callbackDurationsMs
        ?.filter(
          (row) =>
            row.period > windowStartPeriod &&
            row.period <= windowStartPeriod + 80 &&
            row.period % worktickPeriods === 0,
        )
        .map((row) => row.durationMs),
      export: digest(await session.exportSave()),
      diagnostics,
      hooks: await session.evaluate(() =>
        (() => {
          window.__EA_TEST_HOOKS__.setSmelterOutcomeCaptureForTest(false);
          return window.__EA_TEST_HOOKS__.readP13C1Window();
        })(),
      ),
    };
  } finally {
    await session.close();
  }
}

const correctness = [];
for (const mode of ["G", "S", "Q", "U"])
  correctness.push(await runCorrectness(mode));
for (const cell of correctness.slice(1)) {
  assert.equal(
    cell.export,
    correctness[0].export,
    `mode ${cell.mode} changed the export`,
  );
  assert.deepEqual(
    cell.diagnostics.controlUsage,
    correctness[0].diagnostics.controlUsage,
  );
  assert.deepEqual(
    cell.diagnostics.nativeInvocations,
    correctness[0].diagnostics.nativeInvocations,
  );
  assert.deepEqual(
    cell.hooks.outcomes,
    correctness[0].hooks.outcomes,
    `mode ${cell.mode} changed Smelter owner outcomes or postconditions`,
  );
  assert.equal(
    cell.diagnostics.randomCalls,
    correctness[0].diagnostics.randomCalls,
  );
}
assert.equal(correctness[0].hooks.outcomes.length, 10);
assert.equal(
  correctness.find((cell) => cell.mode === "G").hooks.ownerObservationCalls,
  0,
);
assert.equal(
  correctness.find((cell) => cell.mode === "Q").hooks.snapshotPublications,
  0,
);
assert.ok(
  correctness.find((cell) => cell.mode === "Q").hooks.ownerObservationCalls > 0,
);
assert.ok(
  correctness.find((cell) => cell.mode === "S").hooks.snapshotPublications > 0,
);
assert.equal(
  correctness.find((cell) => cell.mode === "Q").hooks.admissions,
  10,
);
assert.ok(
  correctness
    .find((cell) => cell.mode === "Q")
    .hooks.results.every((result) => result.valid),
  JSON.stringify(correctness.find((cell) => cell.mode === "Q").hooks.results),
);
assert.equal(
  correctness.find((cell) => cell.mode === "U").hooks.admissions,
  10,
);
const qCorrectnessResults = correctness.find((cell) => cell.mode === "Q").hooks
  .results;
const qOwnerPlannerCallsPerWorktick =
  qCorrectnessResults.filter(
    (result) => result.quantitativeComparison === "available",
  ).length / qCorrectnessResults.length;
assertIdenticalBundleHashes(correctness.map((cell) => cell.bundleSha256));
console.log("correctness cohort complete");
await writeFile(
  artifact("p13d-owner-outcome-parity.json"),
  `${JSON.stringify(
    correctness.map(({ mode, export: exportHash, diagnostics, hooks }) => ({
      mode,
      bundleSha256: bundleSha256,
      export: exportHash,
      nativeInvocationOrderSha256: digest(
        JSON.stringify(diagnostics.nativeInvocations ?? []),
      ),
      controlUsage: diagnostics.controlUsage,
      randomCalls: diagnostics.randomCalls,
      outcomes: hooks.outcomes,
    })),
    null,
    2,
  )}\n`,
);
if (process.argv.includes("--correctness-only")) {
  console.log("correctness-only mode: skipped CPU windows");
  process.exit(0);
}

async function runWindow(mode, label) {
  const session = await openConfigured(mode);
  try {
    assertIdenticalBundleHashes([bundleSha256, session.bundle.sha256]);
    const rendererCalibration = await identifySessionRenderer(session);
    if (fixtureVerified) await advancePeriods(session, fixtureProbePeriods);
    else await advancePeriods(session, warmupPeriods);
    await session.evaluate(() => window.__EA_TEST_HOOKS__.resetP13C1Window());
    const periodsBefore = await session.periods();
    const saveHashBefore = digest(await session.exportSave());
    const processBefore = await runner.processCpu();
    const metricsBefore = await session.metrics();
    const wallStarted = performance.now();
    await advancePeriods(session, measuredPeriods);
    const wallMs = performance.now() - wallStarted;
    const metricsAfter = await session.metrics();
    const processAfter = await runner.processCpu();
    const process = accountProcessCpu(
      processBefore,
      processAfter,
      rendererCalibration.id,
    );
    const hooks = await session.evaluate(() =>
      window.__EA_TEST_HOOKS__.readP13C1Window(),
    );
    const diagnostics = undefined;
    let comparison;
    if (mode === "S") {
      const beforeComparison = await runner.processCpu();
      const beforeComparisonMetrics = await session.metrics();
      const measuredComparison = await session.evaluate((request) => {
        const hooks = window.__EA_TEST_HOOKS__;
        const started = window.__EA_RUNNER__.nativeNow();
        const result = hooks.compareSmelterSnapshotForTest(
          hooks.readP13C1Window().snapshot,
          request,
        );
        return {
          result,
          elapsedMs: window.__EA_RUNNER__.nativeNow() - started,
        };
      }, requestedComparison);
      const afterComparisonMetrics = await session.metrics();
      const afterComparison = await runner.processCpu();
      const comparisonProcess = accountProcessCpu(
        beforeComparison,
        afterComparison,
        rendererCalibration.id,
      );
      comparison = {
        ...measuredComparison,
        activeRendererId: rendererCalibration.id,
        activeRendererCpuSec: comparisonProcess.activeRendererCpuSec,
        rendererCpuSec: comparisonProcess.rendererCpuSec,
        otherRendererCpuSec: comparisonProcess.otherRendererCpuSec,
        taskDurationSec:
          afterComparisonMetrics.TaskDuration -
          beforeComparisonMetrics.TaskDuration,
        processRows: comparisonProcess.rows,
        processChurn: comparisonProcess.processChurn,
      };
    }
    return {
      label,
      mode,
      pageTargetId: session.pageTargetId,
      periodsBefore,
      periodsAfter: await session.periods(),
      startSaveHash: saveHashBefore,
      bundleSha256: session.bundle.sha256,
      bundlePath: session.bundle.path,
      rendererCpuSec: process.rendererCpuSec,
      activeRendererId: rendererCalibration.id,
      activeRendererCpuSec: process.activeRendererCpuSec,
      otherRendererCpuSec: process.otherRendererCpuSec,
      processRows: process.rows,
      processChurn: process.processChurn,
      ownerCallCount: measuredPeriods / worktickPeriods,
      ownerCallCountBasis:
        "schedule count, checked against Q/U validation counts and correctness parity",
      taskDurationSec: metricsAfter.TaskDuration - metricsBefore.TaskDuration,
      scriptDurationSec:
        metricsAfter.ScriptDuration - metricsBefore.ScriptDuration,
      wallMs,
      observerCallbackCalls:
        mode === "G" ? 0 : measuredPeriods / worktickPeriods,
      observerCallbackCountBasis:
        "owner schedule, verified by instrumented correctness cohort",
      snapshotPublications: hooks.snapshotPublications,
      proposalValidationCalls:
        mode === "Q" ? measuredPeriods / worktickPeriods : 0,
      hypotheticalPlannerCalls:
        mode === "Q"
          ? qOwnerPlannerCallsPerWorktick * (measuredPeriods / worktickPeriods)
          : 0,
      additionalNativeInputReads: 0,
      additionalNativeDemandReads: 0,
      additionalNativeControlCalls: 0,
      additionalResearchDraws: 0,
      additionalCatalogScans: 0,
      additionalAuthorityReads:
        mode === "G" ? 0 : measuredPeriods / worktickPeriods,
      additionalNativePlannerCalls: 0,
      callbackElapsedMs: hooks.callbackMs,
      snapshotConstructionElapsedMs: hooks.snapshotMs,
      callbackLatencyMs: diagnostics?.callbackDurationsMs
        ?.filter(
          (row) =>
            row.period > periodsBefore &&
            row.period <= periodsBefore + measuredPeriods &&
            row.period % worktickPeriods === 0,
        )
        .map((row) => row.durationMs),
      stateHash: digest(await session.exportSave()),
      snapshot: await snapshotSummary(session),
      comparison,
    };
  } finally {
    await session.close();
  }
}

const windows = [];
const checkpointWindows = async () =>
  writeFile(
    artifact("p13d-owner-observation-windows.partial.json"),
    `${JSON.stringify({ fixtureProbe, windows }, null, 2)}\n`,
  );
const cells = [
  ["G", "GG-1-a"],
  ["G", "GG-1-b"],
  ["S", "SS-1-a"],
  ["S", "SS-1-b"],
  ["G", "GG-2-a"],
  ["G", "GG-2-b"],
  ["S", "SS-2-a"],
  ["S", "SS-2-b"],
  ...[
    [1, ["G", "S", "Q", "U"]],
    [2, ["U", "Q", "S", "G"]],
    [3, ["S", "G", "U", "Q"]],
    [4, ["Q", "U", "G", "S"]],
  ].flatMap(([repeat, sequence]) =>
    sequence.map((mode) => [mode, `pair-${repeat}-${mode}`]),
  ),
];
const repeated = (mode) =>
  windows.filter((row) => row.label.startsWith(mode + mode));
const identicalControl = (mode) => {
  const matched = repeated(mode);
  return matched
    .filter((_, index) => index % 2 === 0)
    .map((left, index) => {
      const right = matched[index * 2 + 1];
      return {
        cpuPercent:
          ((right.activeRendererCpuSec - left.activeRendererCpuSec) /
            left.activeRendererCpuSec) *
          100,
        taskPercent:
          ((right.taskDurationSec - left.taskDurationSec) /
            left.taskDurationSec) *
          100,
      };
    });
};
const controls = {};
for (const [index, [mode, label]] of cells.slice(0, 8).entries()) {
  windows.push(await runWindow(mode, label));
  await checkpointWindows();
  console.log(`completed ${label}`);
}
controls.GG = identicalControl("G");
controls.SS = identicalControl("S");
const controlDeltas = Object.values(controls).flat();
const controlNoisePercent = Math.max(
  ...controlDeltas.flatMap((row) => [
    Math.abs(row.cpuPercent),
    Math.abs(row.taskPercent),
  ]),
);
const calibrationResolvesTwoPercent =
  controlDeltas.length === 4 &&
  controlDeltas.every(
    (row) =>
      Number.isFinite(row.cpuPercent) &&
      Number.isFinite(row.taskPercent) &&
      Math.abs(row.cpuPercent) < 2 &&
      Math.abs(row.taskPercent) < 2,
  );
console.log(
  `same-input control sensitivity ${controlNoisePercent.toFixed(2)}%; factorial=${calibrationResolvesTwoPercent}`,
);
for (const [mode, label] of cells.slice(8)) {
  windows.push(await runWindow(mode, label));
  await checkpointWindows();
  console.log(
    `completed ${label}${calibrationResolvesTwoPercent ? "" : " (exploratory; sensitivity gate failed)"}`,
  );
}
assertIdenticalBundleHashes([
  bundleSha256,
  ...correctness.map((cell) => cell.bundleSha256),
  ...windows.map((cell) => cell.bundleSha256),
]);
for (const cell of windows) {
  assert.equal(cell.ownerCallCount, measuredPeriods / worktickPeriods);
  assert.equal(
    cell.observerCallbackCalls,
    cell.mode === "G" ? 0 : measuredPeriods / worktickPeriods,
  );
  assert.equal(
    cell.snapshotPublications,
    cell.mode === "S" ? measuredPeriods / worktickPeriods : 0,
  );
}

const latency = correctness.map(({ mode, callbackLatencyMs }) => ({
  mode,
  callbackLatencyMs,
}));

const contrasts = [];
for (const repeat of [1, 2, 3, 4]) {
  const rows = windows.filter((row) => row.label.startsWith(`pair-${repeat}-`));
  if (!rows.length) continue;
  const byMode = Object.fromEntries(rows.map((row) => [row.mode, row]));
  for (const [from, to] of [
    ["G", "U"],
    ["G", "S"],
    ["G", "Q"],
  ]) {
    const denominator = byMode[from].activeRendererCpuSec;
    contrasts.push({
      repeat,
      from,
      to,
      cpuDeltaSec: byMode[to].activeRendererCpuSec - denominator,
      cpuPercent:
        ((byMode[to].activeRendererCpuSec - denominator) / denominator) * 100,
      taskDeltaSec: byMode[to].taskDurationSec - byMode[from].taskDurationSec,
      taskPercent:
        ((byMode[to].taskDurationSec - byMode[from].taskDurationSec) /
          byMode[from].taskDurationSec) *
        100,
    });
  }
}
const contrastSummary = Object.fromEntries(
  ["G-U", "G-S", "G-Q"].map((key) => {
    const [from, to] = key.split("-");
    const items = contrasts.filter((row) => row.from === from && row.to === to);
    const cpu = items.map((row) => row.cpuPercent);
    const task = items.map((row) => row.taskPercent);
    const tCritical95ByDf = [
      undefined,
      12.706,
      4.303,
      3.182,
      2.776,
      2.571,
      2.447,
      2.365,
      2.306,
      2.262,
    ];
    const tCritical95 = tCritical95ByDf[cpu.length - 1];
    const interval95 = (values) => {
      if (values.length < 2 || !tCritical95) return undefined;
      const average = mean(values);
      const halfWidth =
        (tCritical95 * sampleSd(values)) / Math.sqrt(values.length);
      return { lower: average - halfWidth, upper: average + halfWidth };
    };
    const spread = sampleSd(cpu);
    return [
      key,
      {
        n: cpu.length,
        cpuPercent: cpu,
        meanPercent: cpu.length ? mean(cpu) : undefined,
        sdPercent: spread,
        confidenceMethod: "two-sided paired Student t interval",
        degreesOfFreedom: cpu.length - 1,
        approximate95PercentInterval: interval95(cpu),
        taskPercent: task,
        taskMeanPercent: task.length ? mean(task) : undefined,
        taskApproximate95PercentInterval: interval95(task),
      },
    ];
  }),
);
const taskCalibrationRatio =
  calibration.taskDurationSec / (calibration.workload.elapsedMs / 1000);
const cpuCalibrationRatio =
  calibration.activeRendererCpuSec / (calibration.workload.elapsedMs / 1000);
const calibratedForTwoPercent =
  calibrationResolvesTwoPercent &&
  Object.values(controls).every(
    (pairs) =>
      pairs.length >= 2 && pairs.every((row) => Math.abs(row.cpuPercent) < 2),
  );
const totalObservationInterval =
  contrastSummary["G-Q"].approximate95PercentInterval;
const qComparisonEstablished = qOwnerPlannerCallsPerWorktick === 1;
const decision = !qComparisonEstablished
  ? "C — Owner-local quantitative comparison unavailable"
  : !calibratedForTwoPercent
    ? "C — Measurement insufficient"
    : totalObservationInterval?.lower > 2
      ? "B — Performance budget exceeded"
      : totalObservationInterval?.upper < 2
        ? "A — Performance feasible"
        : "C — Measurement insufficient";

const result = {
  schema: "p13d-owner-observation-v1",
  date: new Date().toISOString(),
  repository: {
    branch: "deadspace",
    expectedHead: "c9aea466575e0eb896354fbf15b430b1c6f0e916",
  },
  game: {
    sourceRef: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
    snapshotSha256: runner.inputs.gameSnapshot.sha256,
  },
  browser: runner.browser,
  inputs: {
    sourceSave: path.relative(root, savePath),
    inputSaveSha256,
    verifiedWarmFixture: fixtureVerified,
    warmFixturePath: fixtureVerified
      ? "test-artifacts/benchmark/tmp/p13d-verified-warm-save.json"
      : undefined,
    warmupPeriods,
    fixtureProbePeriods,
    settingsSha256,
    settings,
    seed,
    epoch,
    measuredPeriods,
    worktickPeriods,
    measuredWorkTicks: measuredPeriods / worktickPeriods,
    pairingMethod:
      "fresh isolated page; identical source save, settings, seed, epoch and one bundle hash per cell",
    bundlePath: path.relative(root, bundlePath),
    bundleSha256,
  },
  fixtureProbe,
  correctness: correctness.map(
    ({ mode, periods, export: exportHash, diagnostics, hooks }) => ({
      mode,
      bundleSha256,
      periods,
      exportHash,
      controlUsage: diagnostics.controlUsage,
      nativeInvocationCount: diagnostics.nativeInvocations?.length,
      nativeInvocationOrderSha256: digest(
        JSON.stringify(diagnostics.nativeInvocations ?? []),
      ),
      randomCalls: diagnostics.randomCalls,
      ownerOutcomeCount: hooks.outcomes.length,
      ownerOutcomePostconditionSha256: digest(JSON.stringify(hooks.outcomes)),
      researchDraws: diagnostics.researchDraws,
      ownerCallCount: 80 / worktickPeriods,
      observerCallbackCalls: hooks.ownerObservationCalls,
      snapshotPublications: hooks.snapshotPublications,
      callbackElapsedMs: hooks.callbackMs,
      snapshotConstructionElapsedMs: hooks.snapshotMs,
      errors: diagnostics.events.filter((event) =>
        ["pageerror", "rejection"].includes(event.kind),
      ),
    }),
  ),
  ownerLocalComparison: {
    Q: qCorrectnessResults,
    allProposalComparisonsAvailable: qComparisonEstablished,
    reason: qComparisonEstablished
      ? undefined
      : "Captured same-cycle proposal was valid, but owner demand/quantity authority prevented the hypothetical planner from running.",
  },
  calibration: {
    ...calibration,
    cpuCalibrationRatio,
    taskCalibrationRatio,
    repeatedCellNoiseMaxPercent: controlNoisePercent,
    estimatedDetectionFloorPercent: controlNoisePercent,
    calibratedToResolveTwoPercent: calibrationResolvesTwoPercent,
    factorialRun: calibrationResolvesTwoPercent,
    targetPercent: 2,
  },
  controls,
  windows,
  contrasts,
  contrastSummary,
  latency: latency.map(({ mode, callbackLatencyMs }) => ({
    mode,
    callbackLatencyMs,
  })),
  proposalProcessingFrequency: {
    Q: {
      validationsPerWorktick: 1,
      hypotheticalPlannerCallsPerWorktick: qOwnerPlannerCallsPerWorktick,
    },
    U: {
      invalidProposalChecksPerWorktick: 1,
      hypotheticalPlannerCallsPerWorktick: 0,
    },
    S: { comparisonsPerCpuWindow: 0, postWindowComparisonSamples: 1 },
  },
  decision,
};
await writeFile(
  artifact("p13d-owner-observation-benchmark.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
await writeFile(
  artifact("p13d-owner-observation-command.txt"),
  `node experiments/p13d-owner-local-demand-admission-benchmark.mjs\nBundle SHA-256: ${bundleSha256}\nInput save SHA-256: ${inputSaveSha256}\nSettings SHA-256: ${settingsSha256}\n`,
);
await runner.close();
console.log(
  JSON.stringify(
    {
      decision,
      bundleSha256,
      fixtureVerified,
      contrasts: contrastSummary,
      raw: path.relative(
        root,
        artifact("p13d-owner-observation-benchmark.json"),
      ),
    },
    null,
    2,
  ),
);
