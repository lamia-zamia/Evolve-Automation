export type UnknownRecord = Record<PropertyKey, unknown>;

export function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as UnknownRecord;
}

export function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`);
  }
  return value;
}

export function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${path} must be a boolean`);
  }
  return value;
}

export function requireFunction(
  value: unknown,
  path: string,
): (...args: unknown[]) => unknown {
  if (typeof value !== "function") {
    throw new TypeError(`${path} must be a function`);
  }
  return value as (...args: unknown[]) => unknown;
}
