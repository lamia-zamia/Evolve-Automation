import { isRecord } from "../validation.ts";

export type JQueryGlobal = ((...args: unknown[]) => unknown) &
  Record<string, unknown>;

export function readJQueryGlobal(globalObject: unknown): JQueryGlobal {
  if (!isRecord(globalObject) || typeof globalObject["$"] !== "function") {
    throw new Error("jQuery is not available on the browser global");
  }
  return globalObject["$"] as JQueryGlobal;
}
