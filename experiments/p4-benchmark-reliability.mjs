import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.findIndex((value) => value === `--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const baseline = resolve(
  option("baseline", "test-artifacts/perf-profile/p4-baseline.user.js"),
);
const candidate = resolve(option("candidate", "evolve_automation.user.js"));
const game = resolve(option("game", "test-artifacts/game/evolve-deadspace.js"));
const settingsPath = resolve(
  option(
    "settings",
    "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
  ),
);
const scenarios = {
  late: resolve(
    option(
      "late-save",
      "test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
    ),
  ),
  mid: resolve(
    option(
      "mid-save",
      "test-artifacts/benchmark/slice0/saves/stage2f-through-7600-export.json",
    ),
  ),
};
const periods = 1000;
const warmup = 600;
const pairs = Number(option("pairs", "6"));
const phase = option("phase", "all");
const out = resolve(
  option("out", `test-artifacts/perf-profile/p4-reliability-${phase}.json`),
);
const baselineSha256Expected =
  "b0a8809307505903a1f3b34b59459348aa708847b2624f77e8f1cc4f51124540";
const gameSha256Expected =
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7";
const gameCommitExpected = "db38e2af831907d49aeb5348d678d8d8745d6c3f";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(root, "tools/chromium-evolve-runner.mjs"))
);
const baselineSha256 = hash(await readFile(baseline));
const candidateSha256 = hash(await readFile(candidate));
const gameSha256 = hash(await readFile(game));
const gameMetadata = JSON.parse(await readFile(`${game}.json`, "utf8"));
assert(
  baselineSha256 === baselineSha256Expected,
  `Unexpected baseline bundle: ${baselineSha256}`,
);
assert(
  gameSha256 === gameSha256Expected &&
    gameMetadata.sourceRef === gameCommitExpected,
  `Unexpected game snapshot: ${gameSha256} ${gameMetadata.sourceRef}`,
);
assert(Number.isInteger(pairs) && pairs >= 6, "Use at least six A/A pairs");
assert(["aa", "ab", "all"].includes(phase), "Use --phase aa, ab, or all");

const scenarioSaves = Object.fromEntries(
  await Promise.all(
    Object.entries(scenarios).map(async ([name, path]) => [
      name,
      parseSave(await readFile(path, "utf8")),
    ]),
  ),
);
const arms = [];
for (const { mode, scenario } of [
  { mode: "persistent", scenario: "late" },
  { mode: "fresh", scenario: "late" },
  { mode: "fresh", scenario: "mid" },
  { mode: "persistent", scenario: "mid" },
]) {
  if (phase !== "ab") {
    for (let pair = 0; pair < pairs; pair += 1) {
      arms.push(
        {
          mode,
          scenario,
          phase: "aa-baseline",
          block: pair,
          bundle: "baseline",
        },
        {
          mode,
          scenario,
          phase: "aa-baseline",
          block: pair,
          bundle: "baseline",
        },
        {
          mode,
          scenario,
          phase: "aa-candidate",
          block: pair,
          bundle: "candidate",
        },
        {
          mode,
          scenario,
          phase: "aa-candidate",
          block: pair,
          bundle: "candidate",
        },
      );
    }
  }
  if (phase !== "aa") {
    for (const sequence of ["ABBA", "BAAB"]) {
      for (let repetition = 0; repetition < 2; repetition += 1) {
        arms.push(
          ...sequence.split("").map((bundle) => ({
            mode,
            scenario,
            phase: "ab-block",
            block: `${sequence}-${repetition}`,
            bundle: bundle === "A" ? "baseline" : "candidate",
          })),
        );
      }
    }
  }
}

const results = [];
const parityFailures = [];
let persistentRunner;
const elapsedStart = performance.now();
let sequence = 0;
async function runArm(arm) {
  sequence += 1;
  const bundle = arm.bundle === "baseline" ? baseline : candidate;
  const save = scenarioSaves[arm.scenario];
  let runner = null;
  let runnerCreated = false;
  const wallStartedAt = new Date().toISOString();
  const armStarted = performance.now();
  try {
    if (arm.mode === "fresh") {
      runner = await createChromiumRunner({ game });
      runnerCreated = true;
    } else {
      persistentRunner ??= await createChromiumRunner({ game });
      runner = persistentRunner;
    }
    const browser = runner.browser;
    const session = await runner.openSession({
      bundle,
      save,
      settings,
      seed: 42,
    });
    try {
      await session.advance(warmup);
      const measurementStartPeriod = await session.periods();
      const diagnosticsBefore = await session.diagnostics();
      const processBefore = await runner.processCpu();
      const metricsBefore = await session.metrics();
      const measuredStarted = performance.now();
      await session.advance(periods);
      const advanceReturnedAt = performance.now();
      const metricsAfter = await session.metrics();
      const processAfter = await runner.processCpu();
      const measuredEnded = performance.now();
      const measurementEndPeriod = await session.periods();
      const state = await session.readState();
      const exportText = await session.exportSave();
      const diagnosticsAfter = await session.diagnostics();
      const cpuRows = processCpuDelta(processBefore, processAfter);
      const errors = diagnosticsAfter.events.filter(({ kind }) =>
        ["error", "pageerror", "rejection"].includes(kind),
      );
      const actualPeriods = measurementEndPeriod - measurementStartPeriod;
      const row = {
        sequence,
        ...arm,
        wallStartedAt,
        wallEndedAt: new Date().toISOString(),
        armWallMs: Number((performance.now() - armStarted).toFixed(3)),
        measuredWallMs: Number((measuredEnded - measuredStarted).toFixed(3)),
        advanceToMetricMs: Number(
          (advanceReturnedAt - measuredStarted).toFixed(3),
        ),
        browserVersion: browser.version,
        browserPid: browser.pid,
        browserLaunchMs: Number(browser.launchMs.toFixed(3)),
        contextMs: Number(session.timings.contextMs.toFixed(3)),
        pageLoadMs: Number(session.timings.loadMs.toFixed(3)),
        processBefore,
        processAfter,
        rendererPidsBefore: processBefore
          .filter(({ type }) => type === "renderer")
          .map(({ id }) => id),
        rendererPidsAfter: processAfter
          .filter(({ type }) => type === "renderer")
          .map(({ id }) => id),
        rendererCpuSec: cpuRows.rendererCpuSec,
        rendererCpuByPid: cpuRows.rendererCpuByPid,
        exitedRendererPids: cpuRows.exitedRendererPids,
        taskDurationSec: Number(
          (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(6),
        ),
        scriptDurationSec: Number(
          (metricsAfter.ScriptDuration - metricsBefore.ScriptDuration).toFixed(
            6,
          ),
        ),
        measurementStartPeriod,
        measurementEndPeriod,
        measuredPeriods: actualPeriods,
        workTicks: actualPeriods / 8,
        errors,
        captureComplete: diagnosticsAfter.captureComplete,
        exportSha256: hash(exportText),
        stableStateSha256: hash(JSON.stringify(stableState(state))),
        gameDay: state?.stats?.days ?? state?.stats?.day ?? null,
        pageTargets: await pageTargets(session),
      };
      results.push(row);
      await mkdir(resolve(out, ".."), { recursive: true });
      await writeFile(
        out,
        `${JSON.stringify({ phase, lastCompleted: row.sequence, runs: results }, null, 2)}\n`,
      );
      if (actualPeriods !== periods || row.workTicks !== 125)
        parityFailures.push(
          `run ${row.sequence}: wrong period or work tick count`,
        );
      if (errors.length || diagnosticsAfter.captureComplete !== true)
        parityFailures.push(`run ${row.sequence}: error or incomplete capture`);
      return row;
    } finally {
      await session.close();
    }
  } finally {
    if (runnerCreated) await runner.close();
  }
}

function processCpuDelta(before, after) {
  const previous = new Map(before.map((row) => [row.id, row]));
  const current = new Map(after.map((row) => [row.id, row]));
  const rows = [];
  const exitedRendererPids = [];
  for (const [id, now] of current) {
    const then = previous.get(id);
    rows.push({
      type: now.type,
      id,
      beforeCpuSec: then?.cpuSec ?? null,
      afterCpuSec: now.cpuSec,
      deltaCpuSec: then === undefined ? now.cpuSec : now.cpuSec - then.cpuSec,
      appearedDuringWindow: then === undefined,
    });
  }
  for (const [id, then] of previous) {
    if (!current.has(id) && then.type === "renderer")
      exitedRendererPids.push(id);
  }
  return {
    rendererCpuSec: Number(
      rows
        .filter(({ type }) => type === "renderer")
        .reduce((sum, row) => sum + row.deltaCpuSec, 0)
        .toFixed(6),
    ),
    rendererCpuByPid: rows.filter(({ type }) => type === "renderer"),
    exitedRendererPids,
  };
}

async function pageTargets(session) {
  const sessionId = session.page.target()._targetId;
  return [{ targetId: sessionId, url: session.page.url() }];
}

function stableState(value, path = "") {
  if (Array.isArray(value))
    return value.map((entry, index) => stableState(entry, `${path}.${index}`));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => {
        const address = `${path}.${key}`;
        return (
          address !== ".stats.current" && address !== ".city.market.mtrade"
        );
      })
      .map(([key, entry]) => [key, stableState(entry, `${path}.${key}`)]),
  );
}

try {
  for (const arm of arms) {
    const row = await runArm(arm);
    console.log(
      `${row.sequence}/${arms.length} ${row.mode} ${row.scenario} ${row.phase} ${row.block} ${row.bundle}: renderer=${row.rendererCpuSec}s task=${row.taskDurationSec}s wall=${row.measuredWallMs}ms`,
    );
  }
} finally {
  await persistentRunner?.close();
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function summarize(values) {
  const center = mean(values);
  const variance = mean(values.map((value) => (value - center) ** 2));
  return {
    count: values.length,
    mean: center,
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    sd: Math.sqrt(variance),
  };
}
function correlation(left, right) {
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce(
    (sum, value, index) =>
      sum + (value - leftMean) * (right[index] - rightMean),
    0,
  );
  const denominator = Math.sqrt(
    left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) *
      right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0),
  );
  return denominator === 0 ? null : numerator / denominator;
}
function summarizeGroups(rows) {
  const summaries = {};
  for (const mode of ["persistent", "fresh"]) {
    for (const scenario of Object.keys(scenarios)) {
      const selected = results.filter(
        (row) => row.mode === mode && row.scenario === scenario,
      );
      const control = (phase) =>
        selected
          .filter((row) => row.phase === phase)
          .map((row) => row.rendererCpuSec);
      const baseAa = control("aa-baseline");
      const candidateAa = control("aa-candidate");
      const blocks = new Map();
      for (const row of selected.filter(
        (entry) => entry.phase === "ab-block",
      )) {
        const group = blocks.get(row.block) ?? { baseline: [], candidate: [] };
        group[row.bundle].push(row.rendererCpuSec);
        blocks.set(row.block, group);
      }
      const blockEffects = [...blocks.entries()].map(([block, group]) => ({
        block,
        baselineMeanCpuSec: mean(group.baseline),
        candidateMeanCpuSec: mean(group.candidate),
        reductionPercent:
          ((mean(group.baseline) - mean(group.candidate)) /
            mean(group.baseline)) *
          100,
      }));
      const baselineTrend = selected.filter((row) => row.bundle === "baseline");
      const candidateTrend = selected.filter(
        (row) => row.bundle === "candidate",
      );
      const trend = (items) => ({
        count: items.length,
        firstHalfMeanCpuSec: mean(
          items
            .slice(0, Math.floor(items.length / 2))
            .map((row) => row.rendererCpuSec),
        ),
        secondHalfMeanCpuSec: mean(
          items
            .slice(Math.floor(items.length / 2))
            .map((row) => row.rendererCpuSec),
        ),
        wallSequenceCorrelation: correlation(
          items.map((row) => row.sequence),
          items.map((row) => row.rendererCpuSec),
        ),
      });
      const pairedNoise = (phase) => {
        const phaseRows = selected.filter((row) => row.phase === phase);
        const differences = [];
        for (let index = 0; index < phaseRows.length; index += 2) {
          const first = phaseRows[index];
          const second = phaseRows[index + 1];
          if (first && second)
            differences.push(
              ((first.rendererCpuSec - second.rendererCpuSec) /
                first.rendererCpuSec) *
                100,
            );
        }
        return {
          differencesPercent: differences,
          summary: summarize(differences),
        };
      };
      summaries[`${mode}-${scenario}`] = {
        baselineAaCpuSec: summarize(baseAa),
        candidateAaCpuSec: summarize(candidateAa),
        baselineAaFalseEffects: pairedNoise("aa-baseline"),
        candidateAaFalseEffects: pairedNoise("aa-candidate"),
        baselineTrend: trend(baselineTrend),
        candidateTrend: trend(candidateTrend),
        blockEffects,
        blockEffectSummaryPercent: summarize(
          blockEffects.map((row) => row.reductionPercent),
        ),
      };
    }
  }
  return summaries;
}

const summary = summarizeGroups(results);
const report = {
  createdAt: new Date().toISOString(),
  elapsedWallMs: Number((performance.now() - elapsedStart).toFixed(3)),
  methodology: {
    modes: [
      "persistent: one Chrome process per fixture, fresh closed context per arm",
      "fresh: a new Chrome process for every measured arm",
    ],
    seed: 42,
    warmupPeriods: warmup,
    measuredPeriods: periods,
    expectedWorkTicks: 125,
    pairsPerAaControl: pairs,
    runPhase: phase,
    settingsPath,
    settingsMutation: "autoPrestige=false (same as established P4 experiment)",
    aaControlOrder:
      "each pair runs baseline-baseline then candidate-candidate; A/A arms have no distinct treatment order",
    treatmentBlocks:
      "two ABBA and two BAAB blocks per fixture and browser mode",
    cpuSampling:
      "SystemInfo.getProcessInfo all-process counters, full CDP precision; per-PID renderer deltas",
    taskSampling: "page-target Performance.getMetrics TaskDuration delta",
  },
  game: { path: game, sha256: gameSha256, commit: gameMetadata.sourceRef },
  bundles: {
    baseline: { path: baseline, sha256: baselineSha256 },
    candidate: { path: candidate, sha256: candidateSha256 },
  },
  saves: scenarios,
  summary,
  parityFailures,
  runs: results,
};
await mkdir(resolve(out, ".."), { recursive: true });
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ out, summary, parityFailures }, null, 2));
if (parityFailures.length) process.exitCode = 1;
