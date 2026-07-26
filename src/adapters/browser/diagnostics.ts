export interface BrowserDiagnostics {
  readonly readMechDebugEnabled: () => boolean;
  readonly nowMs: () => number;
  readonly readPerformanceEnabled: () => boolean;
  readonly recordPerformance: (phase: string, durationMs: number) => void;
  readonly flushPerformance: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createBrowserDiagnostics(
  globalObject: unknown,
): BrowserDiagnostics {
  const readMechDebugEnabled = () =>
    isRecord(globalObject) && globalObject["mechDebug"] === true;

  const performance =
    isRecord(globalObject) && isRecord(globalObject["performance"])
      ? globalObject["performance"]
      : undefined;
  const performanceNow = performance?.["now"];
  const consoleObject =
    isRecord(globalObject) && isRecord(globalObject["console"])
      ? globalObject["console"]
      : undefined;
  const consoleLog = consoleObject?.["log"];
  const samples = new Map<
    string,
    { count: number; totalMs: number; maxMs: number }
  >();
  let pendingTicks = 0;

  const readPerformanceEnabled = () =>
    isRecord(globalObject) && globalObject["eaPerformance"] === true;

  const nowMs = () => {
    if (typeof performanceNow === "function") {
      try {
        const value = Reflect.apply(performanceNow, performance, []);
        if (typeof value === "number" && Number.isFinite(value)) return value;
      } catch {
        // Fall back to Date.now when the browser performance object is unavailable.
      }
    }
    return Date.now();
  };

  const recordPerformance = (phase: string, durationMs: number) => {
    if (!readPerformanceEnabled() || !Number.isFinite(durationMs)) {
      return;
    }
    const sample = samples.get(phase) ?? { count: 0, totalMs: 0, maxMs: 0 };
    sample.count++;
    sample.totalMs += durationMs;
    sample.maxMs = Math.max(sample.maxMs, durationMs);
    samples.set(phase, sample);
    if (phase === "tick") {
      pendingTicks++;
    }
  };

  const flushPerformance = () => {
    if (!readPerformanceEnabled()) {
      samples.clear();
      pendingTicks = 0;
      return;
    }
    if (pendingTicks < 25 || typeof consoleLog !== "function") {
      return;
    }
    const summary = Object.fromEntries(
      [...samples.entries()].map(([phase, sample]) => [
        phase,
        {
          count: sample.count,
          averageMs: Number((sample.totalMs / sample.count).toFixed(2)),
          maxMs: Number(sample.maxMs.toFixed(2)),
        },
      ]),
    );
    try {
      Reflect.apply(consoleLog, consoleObject, [
        `[EA perf] ${pendingTicks} work ticks`,
        summary,
      ]);
    } catch {
      // Diagnostics must never interfere with automation when console logging is unavailable.
    }
    samples.clear();
    pendingTicks = 0;
  };

  return Object.freeze({
    readMechDebugEnabled,
    nowMs,
    readPerformanceEnabled,
    recordPerformance,
    flushPerformance,
  });
}
