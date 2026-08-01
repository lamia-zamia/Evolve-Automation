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

/** Non-throwing counterpart of `requireRecord`: any non-null object, arrays included. */
export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/**
 * As `isRecord`, but rejects arrays. Game data that must be a keyed bag reads through this one,
 * because an array satisfies `typeof value === "object"` and would otherwise pass as a record
 * whose keys are its indices.
 */
export function isNonArrayRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Non-throwing counterpart of `requireNumber`. `NaN` and both infinities are rejected. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** As `isFiniteNumber`, for the game counts and quantities that cannot be negative. */
export function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
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

/**
 * Calls a required predicate method on a validated game record, bound to that record. `path` names
 * the record in the error a missing method throws. The result is coerced rather than validated,
 * because these game predicates answer with whatever their live model holds.
 */
export function callBoolean(
  record: UnknownRecord,
  name: string,
  path: string,
  ...args: unknown[]
): boolean {
  const method = requireFunction(record[name], `${path}.${name}`);
  return Boolean(Reflect.apply(method, record, args));
}

/** As `callBoolean`, except the method's result must be a finite number. */
export function callNumber(
  record: UnknownRecord,
  name: string,
  path: string,
  ...args: unknown[]
): number {
  const method = requireFunction(record[name], `${path}.${name}`);
  return requireNumber(
    Reflect.apply(method, record, args),
    `${path}.${name}()`,
  );
}
