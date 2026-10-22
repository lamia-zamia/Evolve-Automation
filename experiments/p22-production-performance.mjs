import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/current-full.json",
);
const outputPath = path.resolve(
  root,
  process.argv.find((value) => value.startsWith("--out="))?.slice(6) ??
    "test-artifacts/benchmark/tmp/p22-production-performance.json",
);
const mode =
  process.argv.find((value) => value.startsWith("--mode="))?.slice(7) ??
  "profile";
const repeats = Number(
  process.argv.find((value) => value.startsWith("--repeats="))?.slice(10) ?? 1,
);
const periods = Number(
  process.argv.find((value) => value.startsWith("--periods="))?.slice(10) ??
    800,
);
const seed = 42;
const epoch = Date.parse("2026-09-21T00:00:00.000Z");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const [saveText, settings, gameText, bundleText] = await Promise.all([
  readFile(savePath, "utf8"),
  readFile(settingsPath, "utf8").then(JSON.parse),
  readFile(path.join(root, "test-artifacts/game/evolve-deadspace.js")),
  readFile(path.join(root, "evolve_automation.user.js")),
]);
assert.ok(Number.isSafeInteger(periods) && periods > 0 && periods % 8 === 0);
assert.ok(Number.isSafeInteger(repeats) && repeats > 0);

function cpuRows(before, after) {
  const left = new Map(before.map((row) => [row.id, row]));
  return after
    .filter((row) => row.type === "renderer")
    .map((row) => ({
      id: row.id,
      cpuSec: Number((row.cpuSec - (left.get(row.id)?.cpuSec ?? 0)).toFixed(4)),
    }));
}

function summarize(samples) {
  if (samples.length === 0) return null;
  const sorted = samples.toSorted((left, right) => left - right);
  const quantile = (q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  return {
    sampleCount: sorted.length,
    p50Ms: Number(quantile(0.5).toFixed(2)),
    p95Ms: Number(quantile(0.95).toFixed(2)),
    p99Ms: Number(quantile(0.99).toFixed(2)),
    maximumMs: Number(sorted.at(-1).toFixed(2)),
  };
}

const runner = await createChromiumRunner();
try {
  const results = [];
  for (let repeat = 1; repeat <= repeats; repeat++) {
    const profiling = mode === "profile";
    const session = await runner.openSession({
      bundle: path.join(root, "evolve_automation.user.js"),
      save: parseSave(saveText),
      settings,
      seed,
      epoch,
      perf: profiling,
      forwardPerfSummary: profiling,
      nativeTrace: profiling,
      callbackProfile: mode === "latency",
    });
    try {
      const startPeriod = await session.periods();
      const [cpuBefore, metricsBefore] = await Promise.all([
        runner.processCpu(),
        session.metrics(),
      ]);
      const advanceStartedAt = performance.now();
      const advanceResult = await session.advance(periods);
      const advanceCompletedAt = performance.now();
      const [cpuAfter, metricsAfter] = await Promise.all([
        runner.processCpu(),
        session.metrics(),
      ]);
      const diagnostics = await session.diagnostics();
      const state = await session.readState();
      const exportSave = await session.exportSave();
      results.push({
        mode,
        repeat,
        startPeriod,
        endPeriod: advanceResult.periods,
        requestedPeriods: periods,
        periodsAdvanced: advanceResult.periods - startPeriod,
        workTicks: diagnostics.workTicks,
        rendererCpuRowsSec: cpuRows(cpuBefore, cpuAfter),
        rendererCpuSec: Number(
          cpuRows(cpuBefore, cpuAfter)
            .reduce((sum, row) => sum + row.cpuSec, 0)
            .toFixed(4),
        ),
        taskDurationSec: Number(
          (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(4),
        ),
        scriptDurationSec: Number(
          (metricsAfter.ScriptDuration - metricsBefore.ScriptDuration).toFixed(
            4,
          ),
        ),
        advanceWallMs: Number(
          (advanceCompletedAt - advanceStartedAt).toFixed(2),
        ),
        randomCalls: diagnostics.randomCalls,
        controlUsage: diagnostics.controlUsage,
        controlCallCount: Object.values(diagnostics.controlUsage).reduce(
          (sum, entry) => sum + entry.returned + entry.threw,
          0,
        ),
        nativeInvocations: diagnostics.nativeInvocations?.length ?? null,
        nativeInvocationSha256:
          diagnostics.nativeInvocations === null
            ? null
            : hash(JSON.stringify(diagnostics.nativeInvocations)),
        callbackLatencyWorkTicksMs:
          diagnostics.callbackDurationsMs === null
            ? null
            : summarize(
                diagnostics.callbackDurationsMs
                  .filter((sample) => sample.period % 8 === 0)
                  .map((sample) => sample.durationMs),
              ),
        callbackLatencyAllMs:
          diagnostics.callbackDurationsMs === null
            ? null
            : summarize(
                diagnostics.callbackDurationsMs.map(
                  (sample) => sample.durationMs,
                ),
              ),
        stateSha256: hash(JSON.stringify(state)),
        exportSha256: hash(exportSave),
        counts: diagnostics.counts,
        perfSummaries: diagnostics.perfSummaries,
        events: diagnostics.events,
      });
    } finally {
      await session.close();
    }
  }
  const report = {
    stage: "P22 production performance profile",
    mode,
    seed,
    epoch,
    periods,
    fixture: "mad-tech-offered-blocked.json",
    saveSha256: hash(saveText),
    settingsSha256: hash(JSON.stringify(settings)),
    gameSnapshotSha256: hash(gameText),
    bundleSha256: hash(bundleText),
    runnerInputs: runner.inputs,
    chromiumVersion: runner.browser.version,
    results,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, mode, runs: results.length }));
} finally {
  await runner.close();
}
