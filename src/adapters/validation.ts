export type UnknownRecord = Record<PropertyKey, unknown>;

const MAX_DESCRIBED_STRING_LENGTH = 60;

function describeObject(value: object): string {
  // The rejected value can be a live game object or a Vue reactive proxy, so
  // reading `constructor` is not guaranteed to be side-effect free.
  try {
    const name = (value as { constructor?: { name?: unknown } }).constructor
      ?.name;
    return typeof name === "string" && name.length > 0
      ? `object ${name}`
      : "object";
  } catch {
    return "object";
  }
}

/**
 * Renders a rejected value for an error message: enough to identify it, never
 * a dump of the surrounding game state. Keeps `NaN`, `undefined`, `null` and
 * `"5"` distinguishable, which is the whole point of reporting it at all.
 */
function describeValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string": {
      const text =
        value.length > MAX_DESCRIBED_STRING_LENGTH
          ? `${value.slice(0, MAX_DESCRIBED_STRING_LENGTH)}…`
          : value;
      return `string ${JSON.stringify(text)}`;
    }
    case "number":
    case "boolean":
    case "bigint":
    case "symbol":
      return `${typeof value} ${String(value)}`;
    case "function": {
      const name = (value as { name?: unknown }).name;
      return typeof name === "string" && name.length > 0
        ? `function ${name}`
        : "function";
    }
    default:
      return Array.isArray(value)
        ? `array(${value.length})`
        : describeObject(value as object);
  }
}

export function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(
      `${path} must be an object, got ${describeValue(value)}`,
    );
  }
  return value as UnknownRecord;
}

export function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(
      `${path} must be a string, got ${describeValue(value)}`,
    );
  }
  return value;
}

export function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(
      `${path} must be a finite number, got ${describeValue(value)}`,
    );
  }
  return value;
}

export function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `${path} must be a boolean, got ${describeValue(value)}`,
    );
  }
  return value;
}

export function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(
      `${path} must be an array, got ${describeValue(value)}`,
    );
  }
  return value;
}

export function requireFunction(
  value: unknown,
  path: string,
): (...args: unknown[]) => unknown {
  if (typeof value !== "function") {
    throw new TypeError(
      `${path} must be a function, got ${describeValue(value)}`,
    );
  }
  return value as (...args: unknown[]) => unknown;
}
