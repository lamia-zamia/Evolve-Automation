import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
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
const periods = Number(option("periods", "1000"));
const warmup = Number(option("warmup", "600"));
const pairs = Number(option("pairs", "12"));
const out = resolve(option("out", "test-artifacts/perf-profile/p4-ab.json"));
const expectedBaselineSha256 =
  "b0a8809307505903a1f3b34b59459348aa708847b2624f77e8f1cc4f51124540";
const expectedWorkTicks = 125;
// These fixed fixtures have no enabled switch-condition consumers. Baseline calls
// once per captured switchable building per observation pass; the candidate must
// eliminate exactly those availability reads, while preserving native controls.
const expectedOnCapCalls = { late: 85_878, mid: 2_028 };
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(root, "tools/chromium-evolve-runner.mjs"))
);

const hash = (value) => createHash("sha256").update(value).digest("hex");
function rendererCpu(rows) {
  return rows
    .filter((row) => row.type === "renderer")
    .reduce((sum, row) => sum + row.cpuSec, 0);
}
function usageCounts(usage) {
  return Object.fromEntries(
    Object.entries(usage ?? {}).map(([key, value]) => [
      key,
      { returned: value.returned ?? 0, threw: value.threw ?? 0 },
    ]),
  );
}
function usageTotal(value) {
  return (value?.returned ?? 0) + (value?.threw ?? 0);
}
// The game updates these volatile display/accounting fields at non-periodic task boundaries.
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
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function pairedSummary(rows, metric) {
  const reductions = rows.map(
    (row) =>
      ((row.baseline[metric] - row.candidate[metric]) / row.baseline[metric]) *
      100,
  );
  const mean =
    reductions.reduce((sum, value) => sum + value, 0) / reductions.length;
  const variance =
    reductions.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (reductions.length - 1);
  const margin = 2.201 * Math.sqrt(variance / reductions.length);
  const meanFor = (selected) => {
    const values = selected.map(
      (row) =>
        ((row.baseline[metric] - row.candidate[metric]) /
          row.baseline[metric]) *
        100,
    );
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  return {
    metric,
    pairReductionsPercent: reductions,
    meanReductionPercent: mean,
    confidence95Percent: [mean - margin, mean + margin],
    firstHalfMeanPercent: meanFor(rows.slice(0, 6)),
    secondHalfMeanPercent: meanFor(rows.slice(6)),
    baselineFirstMeanPercent: meanFor(
      rows.filter((row) => row.order === "baseline-candidate"),
    ),
    candidateFirstMeanPercent: meanFor(
      rows.filter((row) => row.order === "candidate-baseline"),
    ),
  };
}

assert(
  pairs === 12,
  "Use exactly 12 pairs for the preregistered paired t interval",
);
assert(
  periods === 1000 && warmup === 600,
  "Use the established 600/1,000 windows",
);
assert(
  periods % 8 === 0,
  "Measured periods must contain complete 8-period workticks",
);
const baselineBytes = await readFile(baseline);
const baselineSha256 = hash(baselineBytes);
assert(
  baselineSha256 === expectedBaselineSha256,
  `Baseline bundle hash mismatch: ${baselineSha256}`,
);
const gameSha256 = hash(await readFile(game));
const gameMetadata = JSON.parse(await readFile(`${game}.json`, "utf8"));
assert(
  gameMetadata.sourceRef === "db38e2af831907d49aeb5348d678d8d8745d6c3f",
  `Unexpected pinned game commit: ${gameMetadata.sourceRef}`,
);
assert(
  gameSha256 ===
    "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
  `Unexpected game snapshot hash: ${gameSha256}`,
);

const runner = await createChromiumRunner({ game });
const results = [];
const parityFailures = [];
try {
  for (const [scenario, savePath] of Object.entries(scenarios)) {
    const save = parseSave(await readFile(savePath, "utf8"));
    for (let pair = 0; pair < pairs; pair += 1) {
      const order =
        pair % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
      const members = {};
      for (const label of order) {
        const bundle = label === "baseline" ? baseline : candidate;
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
          const cpuBefore = rendererCpu(await runner.processCpu());
          const metricsBefore = await session.metrics();
          await session.advance(periods);
          const measurementEndPeriod = await session.periods();
          const cpuAfter = rendererCpu(await runner.processCpu());
          const metricsAfter = await session.metrics();
          const state = await session.readState();
          const exportText = await session.exportSave();
          const diagnosticsAfter = await session.diagnostics();
          const measuredPeriods = measurementEndPeriod - measurementStartPeriod;
          // The exact runner advances one worktick per eight game periods; leave
          // the production page uninstrumented so this inference adds no probe cost.
          const workTicks = measuredPeriods / 8;
          const errors = diagnosticsAfter.counts ?? {};
          const events = diagnosticsAfter.events ?? [];
          const errorEvents = events.filter(({ kind }) =>
            ["error", "pageerror", "rejection"].includes(kind),
          );
          const controlUsage = usageCounts(diagnosticsAfter.controlUsage);
          const row = {
            scenario,
            pair,
            order: order.join("-"),
            bundle: label,
            measurementStartPeriod,
            measurementEndPeriod,
            measuredPeriods,
            expectedWorkTicks,
            workTicks: Number.isFinite(workTicks) ? workTicks : null,
            rendererCpuSec: Number((cpuAfter - cpuBefore).toFixed(6)),
            taskDurationSec: Number(
              (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(
                6,
              ),
            ),
            errors,
            events,
            errorEvents,
            captureComplete: diagnosticsAfter.captureComplete,
            onCapCalls: Object.entries(controlUsage)
              .filter(([key]) => key.endsWith(".on_cap"))
              .reduce((sum, [, count]) => sum + usageTotal(count), 0),
            controlUsage,
            exportSha256: hash(exportText),
            stableStateSha256: hash(JSON.stringify(stableState(state))),
            gameDay: state?.stats?.days ?? state?.stats?.day ?? null,
          };
          members[label] = row;
          results.push(row);
        } finally {
          await session.close();
        }
      }
      const baselineRow = members.baseline;
      const candidateRow = members.candidate;
      const check = (condition, message) => {
        if (!condition)
          parityFailures.push(`${scenario} pair ${pair}: ${message}`);
      };
      check(
        baselineRow.measuredPeriods === periods,
        "baseline period window mismatch",
      );
      check(
        candidateRow.measuredPeriods === periods,
        "candidate period window mismatch",
      );
      check(
        baselineRow.workTicks === expectedWorkTicks,
        "baseline worktick count mismatch",
      );
      check(
        candidateRow.workTicks === expectedWorkTicks,
        "candidate worktick count mismatch",
      );
      check(
        baselineRow.errorEvents.length === 0,
        "baseline reported unexpected errors",
      );
      check(
        candidateRow.errorEvents.length === 0,
        "candidate reported unexpected errors",
      );
      check(
        Object.values(baselineRow.errors).every((count) => count === 0),
        "baseline error counters nonzero",
      );
      check(
        Object.values(candidateRow.errors).every((count) => count === 0),
        "candidate error counters nonzero",
      );
      check(
        baselineRow.captureComplete === true,
        "baseline observations are unavailable",
      );
      check(
        candidateRow.captureComplete === true,
        "candidate observations are unavailable",
      );
      check(
        Object.values(baselineRow.controlUsage).every(
          (count) => count.threw === 0,
        ),
        "baseline native control threw",
      );
      check(
        Object.values(candidateRow.controlUsage).every(
          (count) => count.threw === 0,
        ),
        "candidate native control threw",
      );
      check(
        baselineRow.exportSha256 === candidateRow.exportSha256,
        "exported saves differ",
      );
      check(
        baselineRow.stableStateSha256 === candidateRow.stableStateSha256,
        "stable game state differs",
      );
      const usageKeys = new Set([
        ...Object.keys(baselineRow.controlUsage),
        ...Object.keys(candidateRow.controlUsage),
      ]);
      for (const key of usageKeys) {
        if (key.endsWith(".on_cap")) {
          check(
            usageTotal(candidateRow.controlUsage[key]) === 0,
            `candidate unexpectedly called ${key}`,
          );
        } else {
          check(
            usageTotal(candidateRow.controlUsage[key]) ===
              usageTotal(baselineRow.controlUsage[key]),
            `native control usage differs for ${key}`,
          );
        }
      }
      check(
        baselineRow.onCapCalls === expectedOnCapCalls[scenario],
        `baseline ${scenario} on_cap calls were ${baselineRow.onCapCalls}, expected ${expectedOnCapCalls[scenario]}`,
      );
      check(
        candidateRow.onCapCalls === 0,
        `candidate ${scenario} on_cap calls were ${candidateRow.onCapCalls}, expected zero for the no-trigger fixture`,
      );
    }
  }
} finally {
  await runner.close();
}

const paired = Object.fromEntries(
  Object.keys(scenarios).map((scenario) => [
    scenario,
    Array.from({ length: pairs }, (_, pair) => {
      const rows = results.filter(
        (row) => row.scenario === scenario && row.pair === pair,
      );
      return {
        scenario,
        pair,
        order: rows[0]?.order,
        baseline: {
          rendererCpuSec: rows.find((row) => row.bundle === "baseline")
            ?.rendererCpuSec,
          taskDurationSec: rows.find((row) => row.bundle === "baseline")
            ?.taskDurationSec,
        },
        candidate: {
          rendererCpuSec: rows.find((row) => row.bundle === "candidate")
            ?.rendererCpuSec,
          taskDurationSec: rows.find((row) => row.bundle === "candidate")
            ?.taskDurationSec,
        },
      };
    }),
  ]),
);
const summary = Object.fromEntries(
  Object.keys(scenarios).map((scenario) => {
    const rows = paired[scenario];
    return [
      scenario,
      {
        rendererCpu: pairedSummary(rows, "rendererCpuSec"),
        taskDuration: pairedSummary(rows, "taskDurationSec"),
      },
    ];
  }),
);
const lateCpu = summary.late.rendererCpu;
summary.late.performanceClassification =
  lateCpu.confidence95Percent[1] < 0
    ? "regressed"
    : lateCpu.confidence95Percent[0] > 0 && lateCpu.meanReductionPercent >= 2
      ? "clearly-positive-at-least-2-percent"
      : lateCpu.confidence95Percent[0] > 0
        ? "clearly-positive-below-2-percent"
        : "inconclusive";
const report = {
  game,
  gameSha256,
  gameCommit: gameMetadata.sourceRef,
  baseline: { path: baseline, sha256: baselineSha256 },
  candidate: { path: candidate, sha256: hash(await readFile(candidate)) },
  settings: settingsPath,
  savePaths: scenarios,
  seed: 42,
  warmup,
  periods,
  expectedWorkTicks,
  workTickCountMethod:
    "measured exact-runner periods / 8; no in-page instrumentation",
  pairs,
  alternatingOrder: true,
  profilerEnabled: false,
  lateCpuDecisionRule:
    "Paired 95% t interval: upper bound below zero is regressed; lower bound above zero plus mean reduction >=2% passes; lower bound above zero with mean <2% is clearly positive below target; otherwise inconclusive.",
  nondeterministicStableStateExclusions: [
    "stats.current",
    "city.market.mtrade",
  ],
  behavioralParity: {
    passed: parityFailures.length === 0,
    failures: parityFailures,
  },
  paired,
  summary,
  results,
};
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      out,
      runs: results.length,
      baselineSha256,
      behavioralParity: report.behavioralParity,
      summary,
    },
    null,
    2,
  ),
);
assert(report.behavioralParity.passed, "Behavioral parity failed; see report");
