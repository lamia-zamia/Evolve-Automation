// Test-only in-page collector for experiments/full-runtime-profile.mjs. It is prepended to an
// experiment bundle as a banner and never reaches the production build. Everything is held in
// bounded memory and read back once per window; nothing is streamed to the console.
//
// Clock: the exact runner's native clock (`__EA_RUNNER__.nativeNow`) in controlled mode, where page
// `performance.now` is virtual; the page's own `performance.now` in native-clock mode.
(() => {
  "use strict";
  const runner = globalThis.__EA_RUNNER__;
  const nativePerformance = globalThis.performance;
  const now =
    typeof runner?.nativeNow === "function"
      ? runner.nativeNow
      : () => nativePerformance.now();
  const runnerPeriods = () =>
    typeof runner?.periods === "function" ? runner.periods() : -1;
  const MAX_ROWS = 40_000;
  const MAX_TICKS = 4_000;
  // Log buckets, 20 per decade from 0.1 us to 10 s: per-call quantiles within ~12%.
  const BUCKETS = 160;
  const bucketOf = (ms) =>
    ms <= 1e-4
      ? 0
      : Math.min(
          BUCKETS - 1,
          Math.max(0, Math.floor((Math.log10(ms) + 4) * 20)),
        );

  let enabled = true;
  // Per main-loop period: runner period, start, game listener end, automation end, cycle ms.
  const periodRows = new Float64Array(MAX_ROWS * 5);
  let periodCount = 0;
  let cycleMsThisPeriod = 0;
  let inCycle = false;
  const stats = new Map();
  const statOf = (name) => {
    let entry = stats.get(name);
    if (entry === undefined) {
      entry = {
        calls: 0,
        totalMs: 0,
        maxMs: 0,
        hist: new Uint32Array(BUCKETS),
        tickCalls: 0,
        tickMs: 0,
        maxTickMs: 0,
        periodCalls: 0,
        periodMs: 0,
      };
      stats.set(name, entry);
    }
    return entry;
  };
  const record = (name, ms) => {
    if (!enabled || !Number.isFinite(ms)) return;
    const entry = statOf(name);
    entry.calls++;
    entry.totalMs += ms;
    if (ms > entry.maxMs) entry.maxMs = ms;
    entry.hist[bucketOf(ms)]++;
    if (inCycle) {
      entry.tickCalls++;
      entry.tickMs += ms;
    } else {
      entry.periodCalls++;
      entry.periodMs += ms;
    }
  };
  const counters = new Map();
  const tickRows = [];
  let tickTouched = new Set();
  const touch = (name) => tickTouched.add(name);
  const CAPTURE = Symbol.for("evolve-automation.page-capture");
  let lastUsage = null;
  const usageTotals = () => {
    const entries = globalThis[CAPTURE]?.controlUsage?.readUsage?.() ?? [];
    const out = {};
    for (const entry of entries)
      out[`${entry.elementId}.${entry.method}`] = entry.returned + entry.threw;
    return out;
  };
  // Probe call stack for exclusive-of-other-probes time.
  const probeStack = [];

  const profile = {
    mode: "marker",
    now,
    setEnabled(value) {
      enabled = value === true;
    },
    /** Worker-capture listener wrapper: the whole main-loop listener, split at the game/automation seam. */
    period(event, startedAt, gameEndedAt, endedAt) {
      if (!enabled || event?.data?.loop !== "main" || periodCount >= MAX_ROWS) {
        cycleMsThisPeriod = 0;
        return;
      }
      const base = periodCount * 5;
      periodRows[base] = runnerPeriods();
      periodRows[base + 1] = startedAt;
      periodRows[base + 2] = gameEndedAt - startedAt;
      periodRows[base + 3] = endedAt - gameEndedAt;
      periodRows[base + 4] = cycleMsThisPeriod;
      periodCount++;
      cycleMsThisPeriod = 0;
    },
    /** Wraps runCycle: the automation work cycle, measured outside its own `tick` timer. */
    cycle(body) {
      if (!enabled) return body();
      const started = now();
      inCycle = true;
      try {
        return body();
      } finally {
        const ms = now() - started;
        inCycle = false;
        cycleMsThisPeriod += ms;
        if (profile.mode === "phases" && tickRows.length < MAX_TICKS) {
          const phases = {};
          for (const name of tickTouched) {
            const entry = stats.get(name);
            if (entry === undefined || entry.tickCalls === 0) continue;
            phases[name] = [entry.tickCalls, Number(entry.tickMs.toFixed(4))];
            if (entry.tickMs > entry.maxTickMs) entry.maxTickMs = entry.tickMs;
            entry.tickCalls = 0;
            entry.tickMs = 0;
          }
          const counts = {};
          for (const [name, entry] of counters) {
            if (entry.tick === 0) continue;
            counts[name] = entry.tick;
            if (entry.tick > entry.maxTick) entry.maxTick = entry.tick;
            entry.tick = 0;
          }
          const usage = usageTotals();
          const controls = {};
          if (lastUsage !== null) {
            for (const [key, value] of Object.entries(usage)) {
              const delta = value - (lastUsage[key] ?? 0);
              if (delta > 0) controls[key] = delta;
            }
          }
          lastUsage = usage;
          tickRows.push({
            period: runnerPeriods(),
            cycleMs: Number(ms.toFixed(4)),
            phases,
            counts,
            controls,
          });
          tickTouched = new Set();
        }
      }
    },
    /** Intercept of diagnostics.recordPerformance: existing exclusive phase durations. */
    phase(name, ms) {
      record(name, ms);
      if (inCycle) touch(name);
    },
    /** Intercept of the phase helpers' elapsed time: inclusive phase durations. */
    inclusive(name, ms) {
      const key = `incl:${name}`;
      record(key, ms);
      if (inCycle) touch(key);
    },
    /** Intercept of diagnostics.recordCount. */
    count(name, amount) {
      if (!enabled || !Number.isFinite(amount)) return;
      let entry = counters.get(name);
      if (entry === undefined) {
        entry = {
          calls: 0,
          total: 0,
          maxPerCall: 0,
          tick: 0,
          maxTick: 0,
          period: 0,
        };
        counters.set(name, entry);
      }
      entry.calls++;
      entry.total += amount;
      if (amount > entry.maxPerCall) entry.maxPerCall = amount;
      if (inCycle) entry.tick += amount;
      else entry.period += amount;
    },
    /** Function probe: inclusive and exclusive-of-nested-probes time. */
    call(name, fn, self, args) {
      if (!enabled) return Reflect.apply(fn, self, args);
      const frame = { child: 0 };
      probeStack.push(frame);
      const started = now();
      try {
        return Reflect.apply(fn, self, args);
      } finally {
        const ms = now() - started;
        probeStack.pop();
        const parent = probeStack[probeStack.length - 1];
        if (parent !== undefined) parent.child += ms;
        const inclusiveKey = `fn:${name}`;
        const exclusiveKey = `fnx:${name}`;
        record(inclusiveKey, ms);
        record(exclusiveKey, Math.max(0, ms - frame.child));
        if (inCycle) {
          touch(inclusiveKey);
          touch(exclusiveKey);
        }
      }
    },
    /** Wraps a function value for an object-literal property probe. */
    wrap(name, fn) {
      if (typeof fn !== "function") return fn;
      return function probed(...args) {
        return profile.call(name, fn, this, args);
      };
    },
    reset() {
      periodCount = 0;
      cycleMsThisPeriod = 0;
      stats.clear();
      counters.clear();
      tickRows.length = 0;
      tickTouched = new Set();
      lastUsage = profile.mode === "phases" ? usageTotals() : null;
    },
    /** Calibration: the cost of the collector's own clock read, per call. */
    clockCostUs(samples = 200_000) {
      const started = now();
      let sink = 0;
      for (let index = 0; index < samples; index++) sink += now();
      return {
        perCallUs: ((now() - started) * 1000) / samples,
        sink: sink > 0,
      };
    },
    read() {
      const periods = [];
      for (let index = 0; index < periodCount; index++) {
        const base = index * 5;
        periods.push([
          periodRows[base],
          Number(periodRows[base + 1].toFixed(3)),
          Number(periodRows[base + 2].toFixed(4)),
          Number(periodRows[base + 3].toFixed(4)),
          Number(periodRows[base + 4].toFixed(4)),
        ]);
      }
      const phaseStats = {};
      for (const [name, entry] of stats) {
        phaseStats[name] = {
          calls: entry.calls,
          totalMs: Number(entry.totalMs.toFixed(4)),
          maxMs: Number(entry.maxMs.toFixed(4)),
          maxTickMs: Number(entry.maxTickMs.toFixed(4)),
          periodCalls: entry.periodCalls,
          periodMs: Number(entry.periodMs.toFixed(4)),
          hist: Array.from(entry.hist),
        };
      }
      const counterStats = {};
      for (const [name, entry] of counters) counterStats[name] = { ...entry };
      return {
        mode: profile.mode,
        periods,
        phaseStats,
        counterStats,
        ticks: tickRows.slice(),
      };
    },
  };
  Object.defineProperty(globalThis, "__eaProfile", {
    value: profile,
    configurable: false,
    writable: false,
  });
})();
