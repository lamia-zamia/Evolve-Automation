function isPlainObject(value) {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneData(value, path = "fixture") {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => cloneData(entry, `${path}[${index}]`));
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`${path} must contain only plain data`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      cloneData(entry, `${path}.${key}`),
    ]),
  );
}

function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function mergeData(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return cloneData(overrides);
  }
  const merged = cloneData(base);
  for (const [key, override] of Object.entries(overrides)) {
    merged[key] =
      key in base && isPlainObject(base[key]) && isPlainObject(override)
        ? mergeData(base[key], override)
        : cloneData(override);
  }
  return merged;
}

export function createFixtureBuilder(defaultFixture) {
  const defaults = deepFreeze(cloneData(defaultFixture));
  return function buildFixture(overrides = {}) {
    return deepFreeze(mergeData(defaults, overrides));
  };
}

const traceCategories = new Set([
  "command",
  "manager-call",
  "state-change",
  "log",
]);

export function createTraceRecorder() {
  const events = [];

  function record(category, name, details = {}) {
    if (!traceCategories.has(category)) {
      throw new TypeError(`unknown trace category: ${category}`);
    }
    events.push(
      deepFreeze({
        category,
        name,
        details: cloneData(details, `trace ${category}:${name}`),
      }),
    );
  }

  return Object.freeze({
    command: (name, details) => record("command", name, details),
    managerCall: (name, details) => record("manager-call", name, details),
    stateChange: (name, details) => record("state-change", name, details),
    log: (name, details) => record("log", name, details),
    snapshot: () => deepFreeze(cloneData(events, "trace")),
  });
}
