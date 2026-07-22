type RuntimeRecord = Record<PropertyKey, unknown>;
type RuntimeFunction = (...args: unknown[]) => unknown;

export interface LegacyRuntimeEnvironment {
  readonly document: unknown;
  readonly window: unknown;
  readonly storage: unknown;
  readonly schedule: RuntimeFunction;
  readonly repeat: RuntimeFunction;
  readonly MutationObserver: unknown;
  readonly ResizeObserver: unknown;
  readonly HTMLElement: unknown;
  readonly KeyboardEvent: unknown;
  readonly Node: unknown;
  readonly alert: RuntimeFunction;
  readonly confirm: RuntimeFunction;
  readonly log: RuntimeFunction;
  readonly error: RuntimeFunction;
}

function asRecord(value: unknown): RuntimeRecord | undefined {
  return (typeof value === "object" && value !== null) ||
    typeof value === "function"
    ? (value as RuntimeRecord)
    : undefined;
}

function readProperty(owner: unknown, key: PropertyKey): unknown {
  return asRecord(owner)?.[key];
}

function bindFunction(
  owner: unknown,
  key: PropertyKey,
  fallback: RuntimeFunction,
): RuntimeFunction {
  const candidate = readProperty(owner, key);
  return typeof candidate === "function"
    ? (...args) => Reflect.apply(candidate, owner, args)
    : fallback;
}

const noOperation: RuntimeFunction = () => undefined;
const confirmByDefault: RuntimeFunction = () => true;

export function createLegacyRuntimeEnvironment(
  globalObject: unknown,
): LegacyRuntimeEnvironment {
  const window = readProperty(globalObject, "window") ?? globalObject;
  const document = readProperty(globalObject, "document");
  const consoleObject = readProperty(globalObject, "console");

  return Object.freeze({
    document,
    window,
    storage: readProperty(globalObject, "localStorage"),
    schedule: bindFunction(globalObject, "setTimeout", noOperation),
    repeat: bindFunction(globalObject, "setInterval", noOperation),
    MutationObserver: readProperty(globalObject, "MutationObserver"),
    ResizeObserver: readProperty(globalObject, "ResizeObserver"),
    HTMLElement: readProperty(globalObject, "HTMLElement"),
    KeyboardEvent: readProperty(globalObject, "KeyboardEvent"),
    Node: readProperty(globalObject, "Node"),
    alert: bindFunction(globalObject, "alert", noOperation),
    confirm: bindFunction(globalObject, "confirm", confirmByDefault),
    log: bindFunction(consoleObject, "log", noOperation),
    error: bindFunction(consoleObject, "error", noOperation),
  });
}
