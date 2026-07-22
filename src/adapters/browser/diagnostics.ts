export interface BrowserDiagnostics {
  readonly readMechDebugEnabled: () => boolean;
  readonly nowMs: () => number;
  readonly publishPerformance: (value: unknown) => void;
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

  const publishPerformance = (value: unknown) => {
    if (isRecord(globalObject)) globalObject["__EAperf"] = value;
  };

  return Object.freeze({
    readMechDebugEnabled,
    nowMs,
    publishPerformance,
  });
}
