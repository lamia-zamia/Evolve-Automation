import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import { compareOwnerCoordination } from "../src/domain/economy/owner-coordination.ts";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, "test-artifacts/benchmark/tmp");
const p12g = JSON.parse(
  await readFile(
    path.join(tmp, "p12g-controlled-production-marginal.json"),
    "utf8",
  ),
);
const p12i = JSON.parse(
  await readFile(
    path.join(tmp, "p12i-knowledge-job-counterfactual.json"),
    "utf8",
  ),
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const save = parseSave(p12g.reachableCapture.exportSave);
const settings = {
  ...JSON.parse(await readFile(settingsPath, "utf8")),
  autoResearch: true,
  autoSmelter: true,
};
const expectedCaptureHash = p12g.reachableCapture.saveSha256;
const digest = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(
  p12g.inputs.pinnedGame,
  "pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f",
);
assert.equal(p12g.inputs.gameSnapshotSha256, p12i.inputs.gameSnapshotSha256);
assert.equal(
  p12g.reachableCapture.saveSha256,
  p12i.sourceProvenance.captureSha256,
);
assert.equal(p12g.reachableCapture.period, 1784);
assert.equal(digest(JSON.stringify(settings)), p12g.inputs.settingsSha256);

const baselineEffects = p12g.counterfactuals.pairedStockChanges.map((item) => ({
  resourceId: item.resourceId,
  poolId: "city",
  amount: item.baselineChange / item.observedPeriods,
}));
const alternativeEffects = p12g.counterfactuals.pairedStockChanges.map(
  (item) => ({
    resourceId: item.resourceId,
    poolId: "city",
    amount: item.alternativeChange / item.observedPeriods,
  }),
);
const currentEvidence = {
  goalId: "tech-steel_containers",
  requirementId: "p12g-current-steel-need",
  provenance: "existing-owner-demand",
  resourceId: "Steel",
  poolId: "city",
  targetAmount: 250,
  coveredAmount: p12g.reachableCapture.currentState.resources.Steel.amount,
  coverageComplete: false,
  explicitQueueActive: false,
  playerPermitted: true,
  excluded: false,
  ownerId: "smelter",
  capability: "steel-production",
  targetOwner: "smelter",
  requestPortAvailable: false,
  nativeControlAvailable: p12g.reachableCapture.liveControl.available,
  nativeCapAvailable: true,
  capacityAuthority: {
    ownerType: "smelter",
    availableCapacityKnown: true,
    sourceTargetAllocationKnown: true,
    fuelAllocationKnown: true,
    supportedDisplacementKnown: true,
  },
  rootIdentity: undefined,
  currentRootIdentity: undefined,
  progressionGeneration: undefined,
  currentProgressionGeneration: undefined,
  priceIdentity: `${p12g.reachableCapture.offer.generation}:${JSON.stringify(p12g.reachableCapture.offer.cost)}`,
  currentPriceIdentity: `${p12g.reachableCapture.offer.generation}:${JSON.stringify(p12g.reachableCapture.offer.cost)}`,
  controlGeneration: undefined,
  currentControlGeneration: undefined,
  permissionEnabled: true,
  currentPermissionEnabled: true,
  incumbentCommandIntention: ["subMetal:Iron", "addMetal:Steel"],
  proposedCommandIntention: ["subMetal:Iron", "addMetal:Steel"],
  incumbentEffects: baselineEffects,
  proposedEffects: alternativeEffects,
  commitmentClaimsComplete: false,
  conflictingClaims: [],
  affectedCommitmentIds: ["construction-city-coal_power"],
  ownerWillReverse: false,
  supportedConstraintId: "research-steel-containers-knowledge-threshold",
  incumbentConstraintProgress: 0,
  proposedConstraintProgress: 0,
  objectiveIdentity: "tech-steel_containers-purchase",
  immediateConstraintIdentity: "tech-steel_containers-affordability",
  metricIdentity: "purchase-time-saving",
  metricUnit: "periods-saved",
  betterDirection: "larger",
  observationScope: "matched-p12g-100-period-window",
  observationFreshness: "measured-window",
  supportedValue: 0,
  collateralSupported: true,
  opportunityCostSupported: true,
  effectEvidence: "measured-production-marginals",
  effectsComplete: true,
  budgetExhausted: false,
};
const staleJobsEvidence = {
  ...currentEvidence,
  requirementId: "p12i-scientist-need",
  provenance: "verified-mandatory",
  resourceId: "Knowledge",
  targetAmount: 9000,
  coveredAmount: p12i.sourceProvenance.currentKnowledge.amount,
  ownerId: "jobs",
  targetOwner: "jobs",
  capability: "scientist-allocation",
  nativeCapAvailable:
    p12i.sourceProvenance.assignments.scientist.workers <
    p12i.sourceProvenance.assignments.scientist.maximum,
  capacityAuthority: { ownerType: "other" },
  incumbentCommandIntention: undefined,
  proposedCommandIntention: undefined,
  incumbentEffects: undefined,
  proposedEffects: undefined,
  commitmentClaimsComplete: false,
  ownerWillReverse: undefined,
  currentRootIdentity: {},
};

const bundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/domain/economy/owner-coordination.ts"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  globalName: "P13AOwnerCoordination",
  target: ["es2022"],
});
const moduleText = bundle.outputFiles[0].text;

const worktickHarness = (mode, valid, stale) => {
  window.__P13A = {
    mode,
    calls: 0,
    durations: [],
    outcomes: [],
    admissions: 0,
  };
  const clock = () => window.__EA_RUNNER__.nativeNow();
  const run = (candidate) => {
    const start = clock();
    const result =
      window.P13AOwnerCoordination.compareOwnerCoordination(candidate);
    window.__P13A.durations.push(clock() - start);
    window.__P13A.calls++;
    window.__P13A.admissions += result.assessments.filter(
      (item) => item.mayRequestOwner,
    ).length;
    window.__P13A.outcomes.push(
      result.assessments[0]?.classification ?? "no-signal",
    );
  };
  if (mode === "G") return;
  if (mode === "H") {
    window.__P13A.timer = window.setInterval(() => window.__P13A.calls++, 2000);
    return;
  }
  if (mode === "S1") {
    window.setTimeout(() => run([valid]), 0);
    window.__P13A.timer = window.setInterval(() => run([stale]), 2000);
  } else {
    window.__P13A.timer = window.setInterval(() => {
      run(mode === "S0" ? [] : [stale]);
    }, 2000);
  }
};

function percentile(values, p) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

function cpuByRenderer(rows) {
  return new Map(
    rows
      .filter((row) => row.type === "renderer")
      .map(({ id, cpuSec }) => [id, cpuSec]),
  );
}

async function runCell(runner, mode, orderGroup, orderIndex) {
  const session = await runner.openSession({
    save,
    settings,
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    perf: true,
    callbackProfile: true,
    nativeTrace: true,
  });
  try {
    const beforeCpu = cpuByRenderer(await runner.processCpu());
    const before = await session.metrics();
    await session.page.addScriptTag({ content: moduleText });
    await session.evaluate(
      worktickHarness,
      mode,
      currentEvidence,
      staleJobsEvidence,
    );
    await session.advance(800);
    const afterCpu = cpuByRenderer(await runner.processCpu());
    const after = await session.metrics();
    const diagnostics = await session.diagnostics();
    const exported = await session.exportSave();
    const shadow = await session.evaluate(
      () =>
        window.__P13A ?? {
          calls: 0,
          durations: [],
          outcomes: [],
          admissions: 0,
        },
    );
    const worktickCallbacks = (diagnostics.callbackDurationsMs ?? [])
      .filter(({ period }) => period % 8 === 0)
      .map(({ durationMs }) => durationMs);
    const cpuSec = [...afterCpu].reduce(
      (sum, [id, value]) => sum + Math.max(0, value - (beforeCpu.get(id) ?? 0)),
      0,
    );
    const invocations = diagnostics.nativeInvocations ?? [];
    return {
      mode,
      orderGroup,
      orderIndex,
      gamePeriodAtStart: 1784,
      endPeriod: diagnostics.periods,
      rendererCpuSec: cpuSec,
      taskDurationSec: after.TaskDuration - before.TaskDuration,
      scriptDurationSec: after.ScriptDuration - before.ScriptDuration,
      callbackLatencyMs: {
        p50: percentile(worktickCallbacks, 0.5),
        p95: percentile(worktickCallbacks, 0.95),
        p99: percentile(worktickCallbacks, 0.99),
        count: worktickCallbacks.length,
      },
      pureCoordinatorMs: {
        p50: percentile(shadow.durations, 0.5),
        p95: percentile(shadow.durations, 0.95),
        p99: percentile(shadow.durations, 0.99),
        count: shadow.calls,
      },
      shadowAdmissions: shadow.admissions,
      classifications: [...new Set(shadow.outcomes)],
      researchActionInvocations: invocations.filter(
        (item) => item.elementId === "iResearch",
      ).length,
      allNativeInvocations: invocations.length,
      controlUsage: diagnostics.controlUsage,
      randomCalls: diagnostics.randomCalls,
      workTicks: diagnostics.workTicks,
      taskHeapDeltaBytes: after.JSHeapUsedSize - before.JSHeapUsedSize,
      domNodeDelta: after.Nodes - before.Nodes,
      stateHash: digest(exported),
      errors: diagnostics.events.filter((event) =>
        ["pageerror", "rejection"].includes(event.kind),
      ),
      testHarnessOwnerCaptureCalls: 0,
      testHarnessDomScans: 0,
      testHarnessControlRebinds: 0,
    };
  } finally {
    await session.close();
  }
}

const runner = await createChromiumRunner();
let cells;
const partialPath = path.join(
  tmp,
  "p13a-owner-coordination-feasibility.partial.json",
);
try {
  cells = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const [orderGroup, order] of [
      ["G-H-S0-S1-S2", ["G", "H", "S0", "S1", "S2"]],
      ["S2-S1-S0-H-G", ["S2", "S1", "S0", "H", "G"]],
    ]) {
      for (const [orderIndex, mode] of order.entries()) {
        cells.push(
          await runCell(runner, mode, `${repeat}-${orderGroup}`, orderIndex),
        );
        await writeFile(partialPath, `${JSON.stringify({ cells }, null, 2)}\n`);
      }
    }
  }
} finally {
  await runner.close();
}

for (const cell of cells) assert.equal(cell.endPeriod, 800);
const baselines = cells.filter(({ mode }) => mode === "G");
assert.equal(baselines.length, 6);
for (const control of cells) {
  assert.equal(
    control.stateHash,
    baselines[0].stateHash,
    `state mismatch in ${control.mode}`,
  );
  assert.deepEqual(
    control.controlUsage,
    baselines[0].controlUsage,
    `native control mismatch in ${control.mode}`,
  );
  assert.equal(
    control.randomCalls,
    baselines[0].randomCalls,
    `random stream mismatch in ${control.mode}`,
  );
  assert.deepEqual(control.errors, [], `${control.mode} emitted a page error`);
}

const result = {
  evidence: {
    p12gCaptureSha256: expectedCaptureHash,
    p12iCaptureSha256: p12i.sourceProvenance.captureSha256,
    saveSha256: expectedCaptureHash,
    settingsSha256: p12g.inputs.settingsSha256,
    gameSnapshotSha256: p12g.inputs.gameSnapshotSha256,
    bundleSha256: digest(moduleText),
    timerCadenceMs: 2000,
    periodsPerCell: 800,
    worktickCountPerCell: cells[0].workTicks,
    note: "S1 consumes the P12G/P12I captured boundary once; its following callbacks use the invalidated S2 path. The harness performs no owner rediscovery.",
  },
  cells,
  cpuDeltasVsSameOrderG: cells.map((cell) => {
    const baseline = cells.find(
      (item) => item.mode === "G" && item.orderGroup === cell.orderGroup,
    );
    return {
      mode: cell.mode,
      orderIndex: cell.orderIndex,
      rendererCpuPercent: baseline
        ? (cell.rendererCpuSec / baseline.rendererCpuSec - 1) * 100
        : undefined,
      taskDurationPercent: baseline
        ? (cell.taskDurationSec / baseline.taskDurationSec - 1) * 100
        : undefined,
    };
  }),
};
const outputPath = path.join(tmp, "p13a-owner-coordination-feasibility.json");
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
await import("node:fs/promises").then(({ unlink }) => unlink(partialPath));
process.stdout.write(
  `${JSON.stringify({ outputPath, cells: cells.map(({ mode, orderIndex, rendererCpuSec, taskDurationSec, pureCoordinatorMs, workTicks }) => ({ mode, orderIndex, rendererCpuSec, taskDurationSec, pureCoordinatorMs, workTicks })) }, null, 2)}\n`,
);
