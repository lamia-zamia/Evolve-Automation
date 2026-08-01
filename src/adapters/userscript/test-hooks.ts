import { isNonArrayRecord } from "../validation.ts";

export type TestHooks = Record<string, unknown>;

export function readTestHooks(globalObject: unknown): TestHooks | undefined {
  if (!isNonArrayRecord(globalObject)) return undefined;
  let hooks: unknown;
  try {
    hooks = globalObject["__EA_TEST_HOOKS__"];
  } catch {
    return undefined;
  }
  return isNonArrayRecord(hooks) ? hooks : undefined;
}
