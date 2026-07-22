export type TestHooks = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readTestHooks(globalObject: unknown): TestHooks | undefined {
  if (!isRecord(globalObject)) return undefined;
  let hooks: unknown;
  try {
    hooks = globalObject["__EA_TEST_HOOKS__"];
  } catch {
    return undefined;
  }
  return isRecord(hooks) ? hooks : undefined;
}
