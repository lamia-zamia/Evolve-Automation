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
const measuredPeriods = 80;
const worktickPeriods = 8;
const request = { resourceId: "Steel", pool: "city", additionalSteel: 10 };
const digest = (value) => createHash("sha256").update(value).digest("hex");
const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const sd = (values) =>
  values.length < 2
    ? 0
    : Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0) /
          (values.length - 1),
      );
const interval = (values) => {
  const average = mean(values);
  const tCritical = values.length === 12 ? 2.201 : 1.96;
  const half =
    values.length < 2 ? 0 : (tCritical * sd(values)) / Math.sqrt(values.length);
  return {
    mean: average,
    sd: sd(values),
    ci95: [average - half, average + half],
    min: Math.min(...values),
    max: Math.max(...values),
  };
};
const advance = async (session, count, chunk = 120) => {
  for (let left = count; left > 0; left -= chunk)
    await session.advance(Math.min(chunk, left));
};

const prelude = `
globalThis.__EA_TEST_HOOKS__ = { ...(globalThis.__EA_TEST_HOOKS__ ?? {}) };
const __p13f = { mode: "G", instrument: false, comparisonMode: "I", ownerObservations: 0, proposalProviderReads: 0, proposalChecks: 0, valid: 0, invalid: 0, represented: 0, invariant: 0, sensitive: 0, plannerCalls: 0, changedCommands: 0, unknownAuthority: 0, snapshots: 0, results: [], captured: undefined };
const __p13fHooks = globalThis.__EA_TEST_HOOKS__;
__p13fHooks.observeSmelterComparisonSnapshotForTest = (snapshot, ownerCycle) => {
  if (ownerCycle === 224 && __p13f.captured === undefined) __p13f.captured = snapshot;
};
__p13fHooks.readSmelterGoalDemandProposalForTest = (input, decision, demand, observation, ownerCycle) => {
  __p13f.proposalProviderReads++;
  if (__p13f.mode === "N") return undefined;
  if (__p13f.mode === "U") return { resourceId: "Knowledge" };
  if (__p13f.mode !== "Q") return undefined;
  return {
    goalId: "test-only:p13f-steel-proposal", requirementId: "test-only:p13f-steel-proposal:steel",
    provenance: "provisional-advisory", resourceId: "Steel", pool: "city", additionalQuantity: 10,
    root: observation.root, progressionGeneration: observation.progressionGeneration,
    demandGeneration: ownerCycle, permissionEnabled: observation.permissionEnabled, originatingOwner: "smelter",
    validity: { valid: true, expiresAtOwnerCycle: ownerCycle, invalidatedBy: ["newer-owner-cycle", "root-replacement", "progression-change", "offer-price-change", "goal-change-or-satisfaction", "resource-stock-change", "demand-change", "native-control-generation-change", "permission-change", "construction-queue-change", "conflicting-iron-demand", "unknown-commitment-coverage", "owner-disabled-or-uninitialized", "incomplete-candidate-enumeration"] },
    knownCompetingCommitments: ["test-only:Construction:Steel:fixture"], unknownCommitmentCoverage: true,
  };
};
__p13fHooks.observeSmelterPlanForTest = (input, decision, demand, observation) => {
  if (!__p13f.instrument) return;
  __p13f.ownerObservations++;
  if (__p13f.mode === "S") {
    __p13f.captured = __p13fHooks.createSmelterSnapshotForTest(input, decision, demand, observation);
    __p13f.snapshots++;
  }
};
__p13fHooks.observeSmelterGoalDemandAdmissionForTest = (result) => {
  if (!__p13f.instrument) return;
  __p13f.proposalChecks++;
  __p13f.valid += result.structurallyValid && result.proposalValidForEvaluation ? 1 : 0;
  __p13f.invalid += result.proposalValidForEvaluation ? 0 : 1;
  __p13f.snapshots++;
  __p13f.represented += result.comparison?.quantityRepresented ? 1 : 0;
  __p13f.invariant += result.comparison?.comparisonMethod === "proven-invariant" ? 1 : 0;
  __p13f.sensitive += result.comparison?.comparisonMethod === "planned" ? 1 : 0;
  __p13f.plannerCalls += result.comparison?.hypotheticalPlannerCalls ?? 0;
  __p13f.changedCommands += result.comparison?.commandsChanged ? 1 : 0;
  __p13f.unknownAuthority += result.unknownCommitmentCoverage === true ? 1 : 0;
  __p13f.results.push({ status: result.status, structurallyValid: result.structurallyValid, valid: result.proposalValidForEvaluation, represented: result.comparison?.quantityRepresented, commandsChanged: result.comparison?.commandsChanged, proposedInput: result.comparison?.proposedInput, proposedDecision: result.comparison?.proposedDecision, proposedCommands: result.comparison?.proposedCommands, proposedAllocation: result.comparison?.proposedAllocation, reasons: result.reasons });
};
__p13fHooks.setP13FMode = (mode, comparisonMode = "I") => {
  if (!__p13fHooks.setSmelterObservationModeForTest(mode === "N" ? "Q" : mode)) throw new Error("invalid P13F mode");
  if (comparisonMode !== "P" && comparisonMode !== "I") throw new Error("invalid comparison mode");
  __p13f.mode = mode; __p13f.comparisonMode = comparisonMode;
  __p13fHooks.smelterComparisonModeForTest = comparisonMode;
};
__p13fHooks.resetP13F = () => { Object.assign(__p13f, { ownerObservations: 0, proposalProviderReads: 0, proposalChecks: 0, valid: 0, invalid: 0, represented: 0, invariant: 0, sensitive: 0, plannerCalls: 0, changedCommands: 0, unknownAuthority: 0, snapshots: 0, results: [], captured: undefined }); };
__p13fHooks.setP13FInstrumentation = (enabled) => { __p13f.instrument = Boolean(enabled); };
__p13fHooks.readP13F = () => ({ ...__p13f, results: [...__p13f.results] });`;

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
await mkdir(tmp, { recursive: true });
const bundleBytes = build.outputFiles[0].contents;
const bundlePath = artifact("p13f-smelter-shadow-cost.user.js");
await writeFile(bundlePath, bundleBytes);
const bundleSha256 = digest(bundleBytes);

const runner = await createChromiumRunner();
process.once(
  "unhandledRejection",
  (reason) =>
    void runner.close().finally(() => {
      console.error(reason);
      process.exit(1);
    }),
);
const session = await runner.openSession({
  bundle: bundlePath,
  save: startSave,
  settings,
  seed,
  epoch,
});
const setMode = async (mode, comparisonMode = "I", instrument = false) =>
  session.evaluate(
    (m, c, i) => {
      window.__EA_TEST_HOOKS__.setP13FMode(m, c);
      window.__EA_TEST_HOOKS__.setP13FInstrumentation(i);
      return { mode: m, comparisonMode: c };
    },
    mode,
    comparisonMode,
    instrument,
  );
let result;
try {
  await setMode("Q", "I", false);
  await advance(session, warmupPeriods + fixtureProbePeriods);
  const snapshotInfo = await session.evaluate(() => {
    const h = window.__EA_TEST_HOOKS__;
    const captured = h.readP13F().captured;
    if (!captured) throw new Error("no P13D.1 cycle snapshot captured");
    window.__P13F_CAPTURED = captured;
    return {
      demand: captured.demand,
      input: captured.input,
      decision: captured.decision,
      commands: captured.commands,
      period: window.__EA_RUNNER__.periods(),
      progressionGeneration: captured.progressionGeneration,
      steel: captured.steelResource,
      scope: captured.steelSupplyScope,
    };
  });
  await session.evaluate(() =>
    window.__EA_TEST_HOOKS__.setP13FInstrumentation(false),
  );
  const calibrationBefore = await runner.processCpu();
  const calibrationMetricsBefore = await session.metrics();
  const calibration = await session.evaluate((durationMs) => {
    const now = window.__EA_RUNNER__.nativeNow;
    const started = now();
    let value = 0;
    while (now() - started < durationMs)
      for (let i = 1; i <= 500; i++)
        value = (value + Math.imul(i, i + value)) | 0;
    return { elapsedMs: now() - started, value };
  }, 250);
  const calibrationMetricsAfter = await session.metrics();
  const calibrationAfter = await runner.processCpu();
  const calibrationAccounting = accountProcessCpu(
    calibrationBefore,
    calibrationAfter,
  );
  const rendererRows = calibrationAccounting.rows.filter(
    (row) => row.type === "renderer" && row.cpuSec !== undefined,
  );
  const rendererId = rendererRows.toSorted((a, b) => b.cpuSec - a.cpuSec)[0]
    ?.id;
  assert.ok(rendererId, "calibration did not identify game renderer");
  const calibrationData = {
    targetMs: 250,
    ...calibration,
    taskDurationSec:
      calibrationMetricsAfter.TaskDuration -
      calibrationMetricsBefore.TaskDuration,
    scriptDurationSec:
      calibrationMetricsAfter.ScriptDuration -
      calibrationMetricsBefore.ScriptDuration,
    rendererCpuSec: rendererRows.find((row) => row.id === rendererId)?.cpuSec,
    rendererId,
    processRows: calibrationAccounting.rows,
  };

  const prepared = await session.evaluate(() => {
    const h = window.__EA_TEST_HOOKS__;
    const live = window.__P13F_CAPTURED;
    const deepFreeze = (value) => {
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
        Object.freeze(value);
      }
      return value;
    };
    const input = deepFreeze({
      initialised: true,
      hasForge: true,
      totalSmelters: 2,
      extraOperating: 0,
      consumptionBalanceMin: 0.5,
      fuels: Object.freeze([]),
      ironCount: 2,
      steelCount: 0,
      iridiumCount: 0,
      iridiumUnlocked: false,
      iridiumCapped: true,
      productionSmeltingIridium: 0.5,
      productionSmelting: "required",
      steelCost: Object.freeze([]),
      ironTimeToFull: 10,
      ironTimeToRequired: 20,
      ironDemanded: false,
      steelTimeToFull: 15,
      steelTimeToRequired: 0,
      steelDemanded: false,
      minerCount: 1,
      beltIronShipStateOnCount: 0,
      titaniumStorageRatio: 1,
      haveTitaniumTech: true,
    });
    const decision = h.planSmelterForTest(input);
    const sensitive = h.createSmelterSnapshotForTest(
      input,
      decision,
      { requestedSteel: 0, isSteelDemanded: false, savingTarget: undefined },
      {
        root: live.root,
        permissionEnabled: true,
        controlGeneration: live.controlGeneration,
        controlMethods: live.controlMethods,
        plannedCommands: [],
        progressionGeneration: live.progressionGeneration,
        steelResource: { amount: 0, maximum: 1000, rate: 10 },
        steelSupplyScope: "civilization-wide",
        demandAuthorityAvailable: true,
      },
    );
    window.__P13F_SENSITIVE = sensitive;
    return { input, decision, sensitiveInput: sensitive.input };
  });

  const profiles = await session.evaluate(
    (requestValue, profileCalls) => {
      const h = window.__EA_TEST_HOOKS__;
      const now = () => window.__EA_RUNNER__.nativeNow();
      const live = window.__P13F_CAPTURED;
      const invalidProposal = { resourceId: "Knowledge" };
      const startInvalid = now();
      for (let i = 0; i < profileCalls; i++)
        h.evaluateSmelterGoalDemandProposalForTest(
          live,
          invalidProposal,
          224,
          "I",
        );
      const invalidProposalValidationMs = (now() - startInvalid) / profileCalls;
      const makeSnapshot = () =>
        h.createSmelterSnapshotForTest(
          live.input,
          live.decision,
          {
            requestedSteel: live.demand.requestedSteel,
            isSteelDemanded: live.demand.steelDemanded,
            savingTarget: undefined,
          },
          {
            root: live.root,
            permissionEnabled: live.permissionEnabled,
            controlGeneration: live.controlGeneration,
            controlMethods: live.controlMethods,
            plannedCommands: live.commands,
            progressionGeneration: live.progressionGeneration,
            steelResource: live.steelResource,
            steelSupplyScope: live.steelSupplyScope,
            demandAuthorityAvailable: live.demandAuthorityAvailable,
          },
        );
      const snapshotStarted = now();
      for (let i = 0; i < profileCalls; i++) makeSnapshot();
      const snapshotConstructionMs = (now() - snapshotStarted) / profileCalls;
      const cases = {};
      for (const [name, snapshot] of [
        ["p13d1-ten-cycle-state", live],
        ["sensitive-pure-fixture", window.__P13F_SENSITIVE],
      ]) {
        for (const mode of ["P", "I"]) {
          const sums = {};
          const profiler = {
            now,
            record: (phase, elapsedMs) => {
              sums[phase] = (sums[phase] ?? 0) + elapsedMs;
            },
          };
          const start = now();
          let compared;
          for (let i = 0; i < profileCalls; i++)
            compared = h.compareSmelterSnapshotForTest(
              snapshot,
              requestValue,
              mode,
              profiler,
            );
          const elapsedMs = (now() - start) / profileCalls;
          cases[`${name}-${mode}`] = {
            elapsedMs,
            phaseTotalsMs: sums,
            phaseMeanMs: Object.fromEntries(
              Object.entries(sums).map(([phase, total]) => [
                phase,
                total / profileCalls,
              ]),
            ),
            decision: compared.proposedDecision,
            commands: compared.proposedCommands,
            method: compared.comparisonMethod,
            invariantReason: compared.invarianceReason,
            plannerCalls: compared.hypotheticalPlannerCalls,
          };
        }
      }
      const proposal = {
        goalId: "test-only:p13f",
        requirementId: "test-only:p13f:steel",
        provenance: "provisional-advisory",
        resourceId: "Steel",
        pool: "city",
        additionalQuantity: 10,
        root: live.root,
        progressionGeneration: live.progressionGeneration,
        demandGeneration: 224,
        permissionEnabled: live.permissionEnabled,
        originatingOwner: "smelter",
        validity: {
          valid: true,
          expiresAtOwnerCycle: 224,
          invalidatedBy: [
            "newer-owner-cycle",
            "root-replacement",
            "progression-change",
            "offer-price-change",
            "goal-change-or-satisfaction",
            "resource-stock-change",
            "demand-change",
            "native-control-generation-change",
            "permission-change",
            "construction-queue-change",
            "conflicting-iron-demand",
            "unknown-commitment-coverage",
            "owner-disabled-or-uninitialized",
            "incomplete-candidate-enumeration",
          ],
        },
        knownCompetingCommitments: [],
        unknownCommitmentCoverage: true,
      };
      const validStarted = now();
      for (let i = 0; i < profileCalls; i++)
        h.evaluateSmelterGoalDemandProposalForTest(live, proposal, 224, "I");
      const validProposalAdmissionMs = (now() - validStarted) / profileCalls;
      return {
        profileCalls,
        invalidProposalValidationMs,
        snapshotConstructionMs,
        validProposalAdmissionMs,
        cases,
      };
    },
    request,
    2500,
  );
  const p13d1Case = profiles.cases["p13d1-ten-cycle-state-I"];
  const sensitiveCase = profiles.cases["sensitive-pure-fixture-I"];
  assert.equal(p13d1Case.method, "proven-invariant");
  assert.equal(sensitiveCase.method, "planned");
  assert.deepEqual(
    profiles.cases["p13d1-ten-cycle-state-P"].decision,
    p13d1Case.decision,
  );
  assert.deepEqual(
    profiles.cases["p13d1-ten-cycle-state-P"].commands,
    p13d1Case.commands,
  );
  assert.deepEqual(
    profiles.cases["sensitive-pure-fixture-P"].decision,
    sensitiveCase.decision,
  );
  assert.deepEqual(
    profiles.cases["sensitive-pure-fixture-P"].commands,
    sensitiveCase.commands,
  );

  const pilot = await session.evaluate(
    (n, req) => {
      const h = window.__EA_TEST_HOOKS__;
      const rows = {};
      for (const fixture of ["live", "sensitive"])
        for (const mode of ["P", "I"]) {
          const snapshot =
            fixture === "live"
              ? window.__P13F_CAPTURED
              : window.__P13F_SENSITIVE;
          const start = window.__EA_RUNNER__.nativeNow();
          for (let i = 0; i < n; i++)
            h.compareSmelterSnapshotForTest(snapshot, req, mode);
          rows[`${fixture}-${mode}`] = window.__EA_RUNNER__.nativeNow() - start;
        }
      return rows;
    },
    1200,
    request,
  );
  const slowestPilotMs = Math.max(...Object.values(pilot));
  const batchSize = Math.max(
    1600,
    Math.min(6000, Math.ceil((35 / slowestPilotMs) * 1200)),
  );
  const microbatches = [];
  const batch = async (fixture, mode) => {
    const snapshotKey =
      fixture === "live" ? "__P13F_CAPTURED" : "__P13F_SENSITIVE";
    const beforeMetrics = await session.metrics();
    const beforeCpu = await runner.processCpu();
    const timing = await session.evaluate(
      ({ n, req, selectedMode, key }) => {
        const h = window.__EA_TEST_HOOKS__;
        const snapshot = window[key];
        const start = window.__EA_RUNNER__.nativeNow();
        for (let i = 0; i < n; i++)
          h.compareSmelterSnapshotForTest(snapshot, req, selectedMode);
        return window.__EA_RUNNER__.nativeNow() - start;
      },
      { n: batchSize, req: request, selectedMode: mode, key: snapshotKey },
    );
    const afterMetrics = await session.metrics();
    const afterCpu = await runner.processCpu();
    const cpu = accountProcessCpu(beforeCpu, afterCpu, rendererId);
    return {
      fixture,
      mode,
      calls: batchSize,
      elapsedMs: timing,
      taskDurationSec: afterMetrics.TaskDuration - beforeMetrics.TaskDuration,
      rendererCpuSec: cpu.activeRendererCpuSec,
      rendererTotalSec: cpu.rendererCpuSec,
      otherRendererCpuSec: cpu.otherRendererCpuSec,
      processRows: cpu.rows,
    };
  };
  for (const fixture of ["live", "sensitive"]) {
    for (let pair = 0; pair < 12; pair++) {
      const order = pair % 2 === 0 ? ["P", "I"] : ["I", "P"];
      for (const mode of order)
        microbatches.push({ pair, ...(await batch(fixture, mode)) });
      const emptyBeforeMetrics = await session.metrics();
      const emptyBeforeCpu = await runner.processCpu();
      const emptyMs = await session.evaluate((n) => {
        const start = window.__EA_RUNNER__.nativeNow();
        let value = 0;
        const noop = () => {};
        for (let i = 0; i < n; i++) noop();
        window.__P13F_EMPTY_SINK = value;
        return window.__EA_RUNNER__.nativeNow() - start;
      }, batchSize);
      const emptyAfterMetrics = await session.metrics();
      const emptyAfterCpu = await runner.processCpu();
      const emptyCpu = accountProcessCpu(
        emptyBeforeCpu,
        emptyAfterCpu,
        rendererId,
      );
      microbatches.push({
        fixture,
        mode: "empty",
        pair,
        calls: batchSize,
        elapsedMs: emptyMs,
        taskDurationSec:
          emptyAfterMetrics.TaskDuration - emptyBeforeMetrics.TaskDuration,
        rendererCpuSec: emptyCpu.activeRendererCpuSec,
        rendererTotalSec: emptyCpu.rendererCpuSec,
        processRows: emptyCpu.rows,
      });
    }
  }

  const heapProfiler = await session.page.createCDPSession();
  const allocationRows = [];
  for (const fixture of ["live", "sensitive"])
    for (const mode of ["P", "I"]) {
      await heapProfiler.send("HeapProfiler.collectGarbage");
      const before = await heapProfiler.send("Runtime.getHeapUsage");
      await heapProfiler.send("HeapProfiler.startSampling", {
        samplingInterval: 16384,
        includeObjectsCollected: true,
      });
      await session.evaluate(
        ({ n, req, selectedMode, key }) => {
          const h = window.__EA_TEST_HOOKS__;
          const snapshot = window[key];
          for (let i = 0; i < n * 4; i++)
            h.compareSmelterSnapshotForTest(snapshot, req, selectedMode);
        },
        {
          n: batchSize,
          req: request,
          selectedMode: mode,
          key: fixture === "live" ? "__P13F_CAPTURED" : "__P13F_SENSITIVE",
        },
      );
      const profile = await heapProfiler.send("HeapProfiler.stopSampling");
      const after = await heapProfiler.send("Runtime.getHeapUsage");
      const samples = [];
      const visit = (node) => {
        if (node.selfSize > 0)
          samples.push({
            functionName: node.callFrame.functionName,
            selfSize: node.selfSize,
            count: node.allocations?.length,
          });
        for (const child of node.children ?? []) visit(child);
      };
      visit(profile.profile.head);
      allocationRows.push({
        fixture,
        mode,
        calls: batchSize * 4,
        heapUsedDeltaBytes: after.usedSize - before.usedSize,
        sampledAllocationBytes: profile.profile.samples?.reduce(
          (sum, sample) => sum + sample.size,
          0,
        ),
        samples,
      });
    }
  await heapProfiler.detach();

  const cpuSummary = Object.fromEntries(
    ["live", "sensitive"].map((fixture) => {
      const rows = microbatches.filter((row) => row.fixture === fixture);
      const paired = [];
      for (let pair = 0; pair < 12; pair++) {
        const p = rows.find((row) => row.pair === pair && row.mode === "P");
        const i = rows.find((row) => row.pair === pair && row.mode === "I");
        const e = rows.find((row) => row.pair === pair && row.mode === "empty");
        paired.push({
          taskDeltaSec: p.taskDurationSec - i.taskDurationSec,
          rendererDeltaSec: p.rendererCpuSec - i.rendererCpuSec,
          taskPMinusEmptySec: p.taskDurationSec - e.taskDurationSec,
          taskIMinusEmptySec: i.taskDurationSec - e.taskDurationSec,
          nativePMinusEmptyMs: p.elapsedMs - e.elapsedMs,
          nativeIMinusEmptyMs: i.elapsedMs - e.elapsedMs,
        });
      }
      return [
        fixture,
        {
          callsPerCell: batchSize,
          alternatingOrder: true,
          pairs: paired,
          taskPMinusI: interval(
            paired.map((row) => (row.taskDeltaSec / batchSize) * 1000),
          ),
          rendererPMinusI: interval(
            paired.map((row) => (row.rendererDeltaSec / batchSize) * 1000),
          ),
          nativePMinusEmpty: interval(
            paired.map((row) => (row.nativePMinusEmptyMs / batchSize) * 1000),
          ),
          nativeIMinusEmpty: interval(
            paired.map((row) => (row.nativeIMinusEmptyMs / batchSize) * 1000),
          ),
        },
      ];
    }),
  );

  const runCorrectness = async (mode, comparisonMode) => {
    const exact = await runner.openSession({
      bundle: bundlePath,
      save: startSave,
      settings,
      seed,
      epoch,
      nativeTrace: true,
    });
    try {
      await exact.evaluate(
        (m, c) => {
          window.__EA_TEST_HOOKS__.setP13FMode(m, c);
          window.__EA_TEST_HOOKS__.setP13FInstrumentation(true);
        },
        mode,
        comparisonMode,
      );
      await advance(exact, warmupPeriods + fixtureProbePeriods);
      await exact.evaluate(() => {
        window.__EA_TEST_HOOKS__.resetP13F();
        window.__EA_TEST_HOOKS__.setSmelterOutcomeCaptureForTest(true);
      });
      const startPeriod = await exact.periods();
      await advance(exact, measuredPeriods);
      const diagnostics = await exact.diagnostics();
      const hooks = await exact.evaluate(() => {
        window.__EA_TEST_HOOKS__.setSmelterOutcomeCaptureForTest(false);
        return window.__EA_TEST_HOOKS__.readP13F();
      });
      return {
        mode,
        comparisonMode,
        startPeriod,
        endPeriod: await exact.periods(),
        exportHash: digest(await exact.exportSave()),
        diagnostics,
        hooks,
      };
    } finally {
      await exact.close();
    }
  };
  const parityRuns = [];
  for (const [mode, comparisonMode] of [
    ["G", "I"],
    ["N", "I"],
    ["Q", "I"],
    ["Q", "P"],
    ["U", "I"],
  ])
    parityRuns.push(await runCorrectness(mode, comparisonMode));
  const ordinary = parityRuns.find((row) => row.mode === "G");
  for (const row of parityRuns.slice(1)) {
    assert.equal(
      row.exportHash,
      ordinary.exportHash,
      `${row.mode}-${row.comparisonMode} changed ordinary export`,
    );
    assert.deepEqual(
      row.diagnostics.controlUsage,
      ordinary.diagnostics.controlUsage,
    );
    assert.deepEqual(
      row.diagnostics.nativeInvocations,
      ordinary.diagnostics.nativeInvocations,
    );
    assert.equal(row.diagnostics.randomCalls, ordinary.diagnostics.randomCalls);
    assert.deepEqual(
      row.diagnostics.events?.filter((event) => event.type === "error") ?? [],
      [],
    );
  }
  const qI = parityRuns.find(
    (row) => row.mode === "Q" && row.comparisonMode === "I",
  );
  const qP = parityRuns.find(
    (row) => row.mode === "Q" && row.comparisonMode === "P",
  );
  const noProposal = parityRuns.find((row) => row.mode === "N");
  assert.deepEqual(qI.hooks.results, qP.hooks.results);
  assert.equal(qI.hooks.ownerObservations, measuredPeriods / worktickPeriods);
  assert.equal(qI.hooks.invariant, measuredPeriods / worktickPeriods);
  assert.equal(qP.hooks.plannerCalls, measuredPeriods / worktickPeriods);
  assert.equal(
    noProposal.hooks.proposalProviderReads,
    measuredPeriods / worktickPeriods,
  );
  assert.equal(noProposal.hooks.proposalChecks, 0);
  assert.equal(noProposal.hooks.snapshots, 0);
  assert.equal(noProposal.hooks.plannerCalls, 0);
  const correctnessParity = parityRuns.map((row) => ({
    mode: row.mode,
    comparisonMode: row.comparisonMode,
    exportHash: row.exportHash,
    nativeInvocationCount: row.diagnostics.nativeInvocations?.length,
    randomCalls: row.diagnostics.randomCalls,
  }));

  const runCpuCell = async (mode, comparisonMode, label) => {
    const cpuSession = await runner.openSession({
      bundle: bundlePath,
      save: startSave,
      settings,
      seed,
      epoch,
    });
    try {
      await cpuSession.evaluate(
        (m, c) => window.__EA_TEST_HOOKS__.setP13FMode(m, c),
        mode,
        comparisonMode,
      );
      await advance(cpuSession, warmupPeriods + fixtureProbePeriods);
      const beforeCalibration = await runner.processCpu();
      const beforeCalibrationMetrics = await cpuSession.metrics();
      const calibrationWork = await cpuSession.evaluate(() => {
        const now = window.__EA_RUNNER__.nativeNow;
        const start = now();
        let x = 0;
        while (now() - start < 120)
          for (let i = 1; i <= 500; i++) x = (x + Math.imul(i, i + x)) | 0;
        return { elapsedMs: now() - start, x };
      });
      const afterCalibrationMetrics = await cpuSession.metrics();
      const afterCalibration = await runner.processCpu();
      const calibrationAccounting = accountProcessCpu(
        beforeCalibration,
        afterCalibration,
      );
      const rows = calibrationAccounting.rows.filter(
        (row) => row.type === "renderer" && row.cpuSec !== undefined,
      );
      const selectedRenderer = rows.toSorted((a, b) => b.cpuSec - a.cpuSec)[0];
      assert.ok(selectedRenderer && selectedRenderer.cpuSec > 0);
      const before = await runner.processCpu();
      const beforeMetrics = await cpuSession.metrics();
      const begin = performance.now();
      await advance(cpuSession, 800);
      const wallMs = performance.now() - begin;
      const afterMetrics = await cpuSession.metrics();
      const after = await runner.processCpu();
      const cpu = accountProcessCpu(before, after, selectedRenderer.id);
      return {
        label,
        mode,
        comparisonMode,
        rendererId: selectedRenderer.id,
        calibrationWork,
        calibrationTaskDurationSec:
          afterCalibrationMetrics.TaskDuration -
          beforeCalibrationMetrics.TaskDuration,
        rendererCpuSec: cpu.rendererCpuSec,
        activeRendererCpuSec: cpu.activeRendererCpuSec,
        taskDurationSec: afterMetrics.TaskDuration - beforeMetrics.TaskDuration,
        scriptDurationSec:
          afterMetrics.ScriptDuration - beforeMetrics.ScriptDuration,
        wallMs,
        rows: cpu.rows,
      };
    } finally {
      await cpuSession.close();
    }
  };
  const endToEndControls = [];
  for (let repeat = 0; repeat < 4; repeat++)
    endToEndControls.push(await runCpuCell("G", "I", `GG-${repeat + 1}`));
  const gCpu = endToEndControls.map((row) => row.activeRendererCpuSec);
  const controlVariationPercent =
    ((Math.max(...gCpu) - Math.min(...gCpu)) / mean(gCpu)) * 100;
  const endToEndCalibrationResolvesTwoPercent =
    controlVariationPercent < 2 &&
    endToEndControls.every((row) => row.taskDurationSec > 0);
  const endToEndCells = [];
  if (endToEndCalibrationResolvesTwoPercent) {
    const sequence = [
      ["N", "I"],
      ["Q", "I"],
      ["Q", "P"],
      ["U", "I"],
      ["U", "I"],
      ["Q", "P"],
      ["Q", "I"],
      ["N", "I"],
    ];
    for (let index = 0; index < sequence.length; index++) {
      const [mode, comparisonMode] = sequence[index];
      endToEndCells.push(
        await runCpuCell(mode, comparisonMode, `counterbalanced-${index + 1}`),
      );
    }
  }
  result = {
    schema: "p13f-smelter-shadow-cost-v1",
    repository: {
      branch: "deadspace",
      expectedHead: "d0a61b43f930a298c465afab51742f6de96904f1",
    },
    game: {
      upstream: "pmotschmann/Evolve",
      sourceRef: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
    },
    environment: {
      chromium: runner.browser.version,
      rendererId,
      bundleSha256,
      seed,
      epoch,
      warmupPeriods,
      fixtureProbePeriods,
      measuredPeriods,
      worktickPeriods,
    },
    capturedState: snapshotInfo,
    calibration: calibrationData,
    profileCohort: {
      cpuMicrobenchProfilerEnabled: false,
      phaseInstrumentationSeparate: true,
      structuralInvalidProposalMs: profiles.invalidProposalValidationMs,
      snapshotConstructionMs: profiles.snapshotConstructionMs,
      validProposalAdmissionIncludingComparisonMs:
        profiles.validProposalAdmissionMs,
      profiledComparisonCalls: profiles.profileCalls,
      cases: profiles.cases,
      pilotMsPer1200Calls: pilot,
      batchSize,
      microbatches: microbatches.slice(0, 3),
      summary: cpuSummary,
    },
    allocation: { instrumentedSeparateCohort: true, rows: allocationRows },
    ownerCells: correctnessParity,
    ownerFrequencies: parityRuns.map(({ mode, comparisonMode, hooks }) => ({
      mode,
      comparisonMode,
      cycles: measuredPeriods / worktickPeriods,
      proposalChecks: hooks.proposalChecks,
      proposalProviderReads: hooks.proposalProviderReads,
      valid: hooks.valid,
      rejected: hooks.invalid,
      represented: hooks.represented,
      invariant: hooks.invariant,
      sensitive: hooks.sensitive,
      plannerCalls: hooks.plannerCalls,
      changedNativeCommands: hooks.changedCommands,
      unknownCommitmentCoverage: hooks.unknownAuthority,
      fullIncumbentSnapshots: hooks.snapshots,
      ownerObservations: hooks.ownerObservations,
      syntheticProposal: mode === "Q" || mode === "U",
    })),
    endToEnd: {
      controls: endToEndControls,
      repeatedControlVariationPercent: controlVariationPercent,
      resolvesTwoPercent: endToEndCalibrationResolvesTwoPercent,
      cells: endToEndCells,
      decision: endToEndCalibrationResolvesTwoPercent
        ? "measured"
        : "unresolved-control-variation-exceeded-2-percent",
    },
  };
  assertIdenticalBundleHashes([bundleSha256, session.bundle.sha256]);
  await writeFile(
    artifact("p13f-smelter-shadow-cost-benchmark.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  await writeFile(
    artifact("p13f-smelter-shadow-cost-command.txt"),
    `node experiments/p13f-smelter-shadow-cost-benchmark.mjs\nBundle SHA-256: ${bundleSha256}\n`,
  );
} finally {
  await session.close();
  await runner.close();
}
console.log(
  JSON.stringify(
    {
      bundleSha256,
      raw: path.relative(
        root,
        artifact("p13f-smelter-shadow-cost-benchmark.json"),
      ),
      calibration: result?.calibration,
      summary: result?.profileCohort.summary,
    },
    null,
    2,
  ),
);
