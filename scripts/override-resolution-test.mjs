import assert from "node:assert/strict";
import {
  describeOverrideFailure,
  normalizeTickRate,
  overridesForcedByActiveTasks,
  parseOverrideCondition,
  resolveOverrides,
} from "../src/domain/override-resolution.ts";

const noTasks = {
  storageTaskActive: false,
  trashTaskActive: false,
  taxTaskActive: false,
};

// Operand types and comparators shaped like the ones the override catalog registers.
function evaluator({ probe = {}, throwOn = null } = {}) {
  return {
    hasOperandType: (type) =>
      type === "Boolean" || type === "Number" || type === "Value",
    readOperand: (type, argument) => {
      if (type === throwOn) {
        throw new Error("operand exploded");
      }
      return type === "Value" ? probe[argument] : argument;
    },
    hasComparator: (comparator) => ["==", ">=", "AND"].includes(comparator),
    compare: (comparator, left, right) => {
      if (comparator === "==") return left === right;
      if (comparator === ">=") return left >= right;
      return Boolean(left && right);
    },
    comparatorReturnsRightOperand: (comparator) => comparator === "AND",
  };
}

function condition(overrides = {}) {
  return {
    type1: "Boolean",
    arg1: true,
    type2: "Boolean",
    arg2: true,
    cmp: "==",
    ret: true,
    ...overrides,
  };
}

// --- Condition shape ---
assert.equal(parseOverrideCondition(null), undefined);
assert.equal(parseOverrideCondition(42), undefined);
assert.equal(parseOverrideCondition({ type1: "Boolean" }), undefined);
assert.deepEqual(parseOverrideCondition(condition()), {
  type1: "Boolean",
  arg1: true,
  type2: "Boolean",
  arg2: true,
  comparator: "==",
  result: true,
});
// Stored field names stay at the boundary; the domain condition renames them.
assert.equal(parseOverrideCondition(condition()).cmp, undefined);

// --- Tick rate normalization ---
assert.equal(normalizeTickRate(5.3), 5.5);
assert.equal(normalizeTickRate(1000), 240);
// Rounding happens in doubled units, so the floor is half a tick rather than one.
assert.equal(normalizeTickRate(0), 0.5);
assert.equal(normalizeTickRate(-10), 0.5);
assert.ok(Number.isNaN(normalizeTickRate(undefined)));

// --- Forced task overrides ---
assert.deepEqual(overridesForcedByActiveTasks(noTasks), {});
assert.deepEqual(
  overridesForcedByActiveTasks({
    storageTaskActive: true,
    trashTaskActive: true,
    taxTaskActive: true,
  }),
  { autoStorage: false, autoEject: false, autoTax: false },
);

// --- First matching condition wins and stops the setting's list ---
{
  const settingsRaw = {
    autoBuild: false,
    tickRate: 2,
    overrides: {
      autoBuild: [
        condition({ arg1: false }), // no match
        condition({ ret: true }),
        condition({ ret: false }), // never reached
      ],
    },
  };
  const resolution = resolveOverrides({
    settingsRaw,
    evaluator: evaluator(),
    activeTasks: noTasks,
  });
  assert.equal(resolution.values.autoBuild, true);
  assert.deepEqual(resolution.failures, []);
  assert.deepEqual(resolution.lists, {});
  // The raw settings are never written to.
  assert.equal(settingsRaw.autoBuild, false);
}

// --- Custom comparator returns the right operand instead of the stored result ---
{
  const resolution = resolveOverrides({
    settingsRaw: {
      someNumber: 0,
      tickRate: 1,
      overrides: {
        someNumber: [
          condition({ type2: "Value", arg2: "foo", cmp: "AND", ret: 999 }),
        ],
      },
    },
    evaluator: evaluator({ probe: { foo: 42 } }),
    activeTasks: noTasks,
  });
  assert.equal(resolution.values.someNumber, 42);
}

// --- List settings toggle rather than replace ---
{
  const settingsRaw = {
    ignoredList: ["a", "b", "c"],
    tickRate: 1,
    overrides: {
      ignoredList: [condition({ ret: "b" }), condition({ ret: "d" })],
    },
  };
  const resolution = resolveOverrides({
    settingsRaw,
    evaluator: evaluator(),
    activeTasks: noTasks,
  });
  assert.deepEqual(resolution.lists.ignoredList, ["a", "c", "d"]);
  assert.deepEqual(settingsRaw.ignoredList, ["a", "b", "c"]);
  assert.equal(resolution.values.ignoredList, undefined);
}

// --- An object-typed result beats the list branch and ends the list ---
{
  const resolution = resolveOverrides({
    settingsRaw: {
      ignoredList: ["a"],
      tickRate: 1,
      overrides: {
        ignoredList: [condition({ ret: ["z"] }), condition({ ret: "a" })],
      },
    },
    evaluator: evaluator(),
    activeTasks: noTasks,
  });
  assert.deepEqual(resolution.values.ignoredList, ["z"]);
  assert.deepEqual(resolution.lists, {});
}

// --- Failure reasons are data, one per rejected condition ---
{
  const resolution = resolveOverrides({
    settingsRaw: {
      autoBuild: false,
      someNumber: 0,
      shape: { nested: true },
      tickRate: 1,
      overrides: {
        autoBuild: [
          7, // not a condition at all
          condition({ type1: "Nope" }),
          condition({ type2: "Nope" }),
          condition({ cmp: "~=" }),
          condition({ type1: "Value" }), // operand read throws
        ],
        someNumber: [condition({ ret: "text" })],
        shape: [condition({ ret: "text" })],
      },
    },
    evaluator: evaluator({ throwOn: "Value" }),
    activeTasks: noTasks,
  });
  assert.deepEqual(
    resolution.failures.map((failure) => [
      failure.settingKey,
      failure.conditionNumber,
      failure.reason.kind,
    ]),
    [
      ["autoBuild", 1, "malformed-condition"],
      ["autoBuild", 2, "unknown-operand-type"],
      ["autoBuild", 3, "unknown-operand-type"],
      ["autoBuild", 4, "unknown-comparator"],
      ["autoBuild", 5, "evaluation-error"],
      ["someNumber", 1, "type-mismatch"],
      // A non-array object base can never toggle; it is a mismatch instead of a crash.
      ["shape", 1, "type-mismatch"],
    ],
  );
  assert.equal(resolution.values.autoBuild, undefined);
  const messages = resolution.failures.map(describeOverrideFailure);
  assert.equal(
    messages[1],
    "Condition 2 for setting autoBuild invalid! Fix or remove it. (Nope variable not found)",
  );
  // The comparator is named; the bundled implementation printed "undefined" here.
  assert.match(messages[3], /\(~= comparator not found\)$/);
  assert.match(messages[4], /\(Error: operand exploded\)$/);
  assert.match(
    messages[5],
    /\(Expected type: number; Override type: string\)$/,
  );
}

// --- Active tasks override a matching condition, and the tick rate is always resolved ---
{
  const resolution = resolveOverrides({
    settingsRaw: {
      autoStorage: true,
      autoEject: true,
      autoTax: true,
      tickRate: 5.3,
      overrides: {
        autoStorage: [condition()],
        tickRate: [condition({ ret: 1000 })],
      },
    },
    evaluator: evaluator(),
    activeTasks: {
      storageTaskActive: true,
      trashTaskActive: true,
      taxTaskActive: true,
    },
  });
  assert.equal(resolution.values.autoStorage, false);
  assert.equal(resolution.values.autoEject, false);
  assert.equal(resolution.values.autoTax, false);
  // The overriding condition's value is normalized, not the raw one.
  assert.equal(resolution.values.tickRate, 240);
}

// --- Missing or malformed override storage resolves to the tick rate alone ---
for (const overrides of [undefined, null, 5, { autoBuild: "not a list" }]) {
  const resolution = resolveOverrides({
    settingsRaw: { autoBuild: false, tickRate: 4, overrides },
    evaluator: evaluator(),
    activeTasks: noTasks,
  });
  assert.deepEqual(resolution.values, { tickRate: 4 });
  assert.deepEqual(resolution.failures, []);
}

console.log("Override resolution domain tests passed");
