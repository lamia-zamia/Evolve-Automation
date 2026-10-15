// Summarizes full-runtime-profile.mjs result files (baseline, latency, phases, realtime, trace).
//   node experiments/full-runtime-profile-summary.mjs <mode> <result.json> [...] [--json out.json]
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const jsonIndex = args.indexOf("--json");
const jsonOut = jsonIndex >= 0 ? args.splice(jsonIndex, 2)[1] : undefined;
const [mode, ...files] = args;
const reports = await Promise.all(
  files.map(async (file) => JSON.parse(await readFile(file, "utf8"))),
);
const runs = reports.flatMap((report) => report.runs ?? []);

const quantile = (values, q) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
const r = (value, digits = 2) =>
  value === null || value === undefined ? null : Number(value.toFixed(digits));
const dist = (values) => ({
  n: values.length,
  mean: r(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length), 3),
  p50: r(quantile(values, 0.5), 3),
  p95: r(quantile(values, 0.95), 3),
  p99: r(quantile(values, 0.99), 3),
  max: r(values.length ? Math.max(...values) : null, 3),
  sum: r(
    values.reduce((a, b) => a + b, 0),
    2,
  ),
});
const median = (values) => quantile(values, 0.5);
const group = (items, key) => {
  const out = new Map();
  for (const item of items) {
    const k = key(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
};
/** Per-call quantile from the collector's log histogram (upper bucket edge). */
const histQuantile = (hist, q) => {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let seen = 0;
  for (let index = 0; index < hist.length; index++) {
    seen += hist[index];
    if (seen >= q * total) return 10 ** ((index + 1) / 20 - 4);
  }
  return null;
};

function baseline() {
  const out = {};
  for (const [save, saveRuns] of group(runs, (run) => run.saveName)) {
    const arms = {};
    for (const [arm, armRuns] of group(saveRuns, (run) => run.arm)) {
      const cpu = armRuns.map((run) => run.rendererCpuSec);
      const task = armRuns.map((run) => run.taskDurationSec);
      const periods = armRuns[0].periods;
      arms[arm] = {
        repeats: armRuns.length,
        periods,
        problems: [...new Set(armRuns.flatMap((run) => run.problems))],
        cpuSec: {
          median: r(median(cpu), 3),
          min: Math.min(...cpu),
          max: Math.max(...cpu),
        },
        taskSec: {
          median: r(median(task), 3),
          min: r(Math.min(...task), 3),
          max: r(Math.max(...task), 3),
        },
        wallMs: r(median(armRuns.map((run) => run.wallMs)), 0),
        scriptSecReferenceOnly: r(
          median(armRuns.map((run) => run.scriptDurationSecReferenceOnly)),
          3,
        ),
        layoutSec: r(median(armRuns.map((run) => run.layoutDurationSec)), 3),
        recalcStyleSec: r(
          median(armRuns.map((run) => run.recalcStyleDurationSec)),
          3,
        ),
        layoutCount: median(armRuns.map((run) => run.layoutCount)),
        cpuMsPerPeriod: r((median(cpu) * 1000) / periods, 2),
        taskMsPerPeriod: r((median(task) * 1000) / periods, 2),
        domNodes: median(armRuns.map((run) => run.domNodes)),
        jsHeapUsedMB: median(armRuns.map((run) => run.jsHeapUsedMB)),
        endDay: median(armRuns.map((run) => run.end.summary.day)),
        controlCalls: median(armRuns.map((run) => run.end.controlCalls)),
        exports: [...new Set(armRuns.map((run) => run.end.exportSha256))],
        errors: [
          ...new Set(
            armRuns.flatMap((run) =>
              run.end.errors.map((e) => e.text.slice(0, 120)),
            ),
          ),
        ],
      };
    }
    // Paired by repeat index: each repeat ran the arms back to back.
    const paired = (a, b, field) =>
      [...group(saveRuns, (run) => run.repeat).values()]
        .map((set) => {
          const x = set.find((run) => run.arm === a);
          const y = set.find((run) => run.arm === b);
          return x && y ? y[field] - x[field] : null;
        })
        .filter((value) => value !== null);
    const workTicks = arms.active ? arms.active.periods / 8 : null;
    const activeMinusNative = paired("native", "active", "rendererCpuSec");
    const inactiveMinusNative = paired("native", "inactive", "rendererCpuSec");
    out[save] = {
      arms,
      pairedCpuSec: {
        inactiveMinusNative: inactiveMinusNative.map((v) => r(v, 3)),
        activeMinusNative: activeMinusNative.map((v) => r(v, 3)),
        activeMinusInactive: paired("inactive", "active", "rendererCpuSec").map(
          (v) => r(v, 3),
        ),
      },
      pairedTaskSec: {
        activeMinusNative: paired("native", "active", "taskDurationSec").map(
          (v) => r(v, 3),
        ),
      },
      workTicksAssumed: workTicks,
      automationCpuMsPerWorkTick: workTicks
        ? r((median(activeMinusNative) * 1000) / workTicks, 1)
        : null,
      automationShareOfActiveCpu: arms.active
        ? r((100 * median(activeMinusNative)) / arms.active.cpuSec.median, 1)
        : null,
    };
  }
  return out;
}

function latency() {
  const out = {};
  for (const [save, saveRuns] of group(runs, (run) => run.saveName)) {
    out[save] = {};
    for (const [arm, armRuns] of group(saveRuns, (run) => run.arm)) {
      const bridge = armRuns.flatMap((run) =>
        (run.end.callbackDurationsMs ?? []).slice(-run.periods),
      );
      const longTasks = armRuns.flatMap(
        (run) => run.end.longTaskDurationsMs ?? [],
      );
      const entry = {
        repeats: armRuns.length,
        cpuSec: armRuns.map((run) => run.rendererCpuSec),
        taskSec: armRuns.map((run) => run.taskDurationSec),
        bridgeCallbackMs: dist(bridge),
        longTasksOver50ms: { count: longTasks.length, ...dist(longTasks) },
      };
      const rows = armRuns.flatMap((run) => run.collected?.periods ?? []);
      if (rows.length > 0) {
        const work = rows.filter((row) => row[4] > 0);
        const skipped = rows.filter((row) => row[4] === 0);
        entry.periods = rows.length;
        entry.workTicks = work.length;
        entry.periodsPerWorkTick = r(rows.length / Math.max(1, work.length), 2);
        entry.gameListenerMs = dist(rows.map((row) => row[2]));
        entry.automationPerPeriodMs = dist(rows.map((row) => row[3]));
        entry.listenerTotalMs = dist(rows.map((row) => row[2] + row[3]));
        entry.workTickListenerTotalMs = dist(
          work.map((row) => row[2] + row[3]),
        );
        entry.workCycleMs = dist(work.map((row) => row[4]));
        entry.workTickAutomationOutsideCycleMs = dist(
          work.map((row) => row[3] - row[4]),
        );
        entry.skippedPeriodAutomationMs = dist(skipped.map((row) => row[3]));
        entry.skippedPeriodListenerTotalMs = dist(
          skipped.map((row) => row[2] + row[3]),
        );
        entry.gameMsOnWorkTicks = dist(work.map((row) => row[2]));
        entry.gameMsOnSkippedPeriods = dist(skipped.map((row) => row[2]));
      }
      out[save][arm] = entry;
    }
  }
  return out;
}

const STRUCTURAL = (name) =>
  name === "tick" ||
  name.startsWith("incl:") ||
  name.startsWith("fn:") ||
  name.startsWith("fnx:");
function phases() {
  const out = {};
  for (const [save, saveRuns] of group(runs, (run) => run.saveName)) {
    const ticks = saveRuns.flatMap((run) => run.collected.ticks);
    const periodsTotal = saveRuns.reduce(
      (sum, run) => sum + run.collected.periods.length,
      0,
    );
    const merged = new Map();
    for (const run of saveRuns) {
      for (const [name, stat] of Object.entries(run.collected.phaseStats)) {
        const entry = merged.get(name) ?? {
          calls: 0,
          totalMs: 0,
          maxMs: 0,
          periodMs: 0,
          periodCalls: 0,
          hist: new Array(stat.hist.length).fill(0),
        };
        entry.calls += stat.calls;
        entry.totalMs += stat.totalMs;
        entry.maxMs = Math.max(entry.maxMs, stat.maxMs);
        entry.periodMs += stat.periodMs;
        entry.periodCalls += stat.periodCalls;
        stat.hist.forEach((count, index) => (entry.hist[index] += count));
        merged.set(name, entry);
      }
    }
    const cycleTotal = ticks.reduce((sum, tick) => sum + tick.cycleMs, 0);
    const perTick = (name) => ticks.map((tick) => tick.phases[name]?.[1] ?? 0);
    const table = [...merged]
      .map(([name, entry]) => {
        const ticksValues = perTick(name);
        return {
          name,
          calls: entry.calls,
          callsPerWorkTick: r(
            (entry.calls - entry.periodCalls) / ticks.length,
            2,
          ),
          totalMs: r(entry.totalMs, 1),
          inCycleMsPerWorkTick: r(
            (entry.totalMs - entry.periodMs) / ticks.length,
            3,
          ),
          outsideCycleMsPerPeriod: r(entry.periodMs / periodsTotal, 4),
          perCallP50: r(histQuantile(entry.hist, 0.5), 4),
          perCallP95: r(histQuantile(entry.hist, 0.95), 4),
          perCallP99: r(histQuantile(entry.hist, 0.99), 4),
          perCallMax: r(entry.maxMs, 3),
          perTickP50: r(quantile(ticksValues, 0.5), 3),
          perTickP95: r(quantile(ticksValues, 0.95), 3),
          perTickMax: r(Math.max(...ticksValues), 3),
          shareOfCyclePct: STRUCTURAL(name)
            ? null
            : r((100 * (entry.totalMs - entry.periodMs)) / cycleTotal, 2),
        };
      })
      .sort((a, b) => b.totalMs - a.totalMs);
    const exclusiveInCycle = table
      .filter((row) => !STRUCTURAL(row.name) && !row.name.startsWith("period."))
      .reduce((sum, row) => sum + row.inCycleMsPerWorkTick, 0);
    const tickRow = table.find((row) => row.name === "tick");
    // Counters: total, per work tick, max per call, max per work tick.
    const counters = {};
    for (const run of saveRuns) {
      for (const [name, entry] of Object.entries(run.collected.counterStats)) {
        const c = (counters[name] ??= {
          calls: 0,
          total: 0,
          maxPerCall: 0,
          maxPerWorkTick: 0,
          outsideCycle: 0,
        });
        c.calls += entry.calls;
        c.total += entry.total;
        c.maxPerCall = Math.max(c.maxPerCall, entry.maxPerCall);
        c.maxPerWorkTick = Math.max(c.maxPerWorkTick, entry.maxTick);
        c.outsideCycle += entry.period;
      }
    }
    for (const c of Object.values(counters))
      c.perWorkTick = r((c.total - c.outsideCycle) / ticks.length, 2);
    // Controls per work tick and ticks with no state-changing control call.
    const controlTotals = {};
    for (const tick of ticks)
      for (const [key, value] of Object.entries(tick.controls))
        controlTotals[key] = (controlTotals[key] ?? 0) + value;
    out[save] = {
      runs: saveRuns.length,
      periods: periodsTotal,
      workTicks: ticks.length,
      cycleMs: dist(ticks.map((tick) => tick.cycleMs)),
      tickTimerMs: tickRow ? { perTick: tickRow.inCycleMsPerWorkTick } : null,
      reconciliation: {
        cycleWrapperMsPerTick: r(cycleTotal / ticks.length, 3),
        tickTimerMsPerTick: tickRow?.inCycleMsPerWorkTick,
        sumExclusivePhasesMsPerTick: r(exclusiveInCycle, 3),
        scaffoldingMsPerTick: table.find(
          (row) => row.name === "tick.scaffolding",
        )?.inCycleMsPerWorkTick,
      },
      table,
      counters,
      controlsPerWorkTick: Object.fromEntries(
        Object.entries(controlTotals)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => [k, r(v / ticks.length, 2)]),
      ),
      ticks,
    };
  }
  return out;
}

function realtime() {
  return runs.map((run) => {
    const rows = run.collected?.profile?.periods ?? [];
    const work = rows.filter((row) => row[4] > 0);
    const gaps = rows.slice(1).map((row, index) => row[1] - rows[index][1]);
    return {
      saveName: run.saveName,
      arm: run.arm,
      periods: run.periods,
      wallMs: run.wallMs,
      rendererCpuSec: run.rendererCpuSec,
      cpuMsPerPeriod: r((run.rendererCpuSec * 1000) / run.periods, 2),
      taskSec: run.taskDurationSec,
      longTasks: {
        count: run.collected.longTasks.length,
        ...dist(run.collected.longTasks.map((t) => t[1])),
      },
      listenerTotalMs: rows.length
        ? dist(rows.map((row) => row[2] + row[3]))
        : null,
      gameListenerMs: rows.length ? dist(rows.map((row) => row[2])) : null,
      workCycleMs: work.length ? dist(work.map((row) => row[4])) : null,
      periodStartGapMs: gaps.length ? dist(gaps) : null,
      workTicks: work.length,
    };
  });
}

const handlers = { baseline, latency, phases, realtime };
const result = handlers[mode]();
if (jsonOut) await writeFile(jsonOut, `${JSON.stringify(result, null, 1)}\n`);
const printable =
  mode === "phases"
    ? Object.fromEntries(
        Object.entries(result).map(([k, v]) => [
          k,
          {
            ...v,
            ticks: `${v.ticks.length} rows`,
            table: v.table.slice(0, 60),
          },
        ]),
      )
    : result;
console.log(JSON.stringify(printable, null, 1));
