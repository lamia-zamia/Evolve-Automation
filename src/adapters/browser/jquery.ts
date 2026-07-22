export type JQueryGlobal = ((...args: unknown[]) => unknown) &
  Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readJQueryGlobal(globalObject: unknown): JQueryGlobal {
  if (!isRecord(globalObject) || typeof globalObject["$"] !== "function") {
    throw new Error("jQuery is not available on the browser global");
  }
  return globalObject["$"] as JQueryGlobal;
}
