import assert from "node:assert/strict";
import { applyOverrideEdit } from "../src/domain/override-editing.ts";

const condition = (ret) => ({
  type1: "Boolean",
  arg1: true,
  type2: "Boolean",
  arg2: false,
  cmp: "==",
  ret,
});

// --- A setting with no entry gains one, with the setting's current value as the result ---
let result = applyOverrideEdit(
  {},
  { kind: "add-condition", settingKey: "autoBuild", result: true },
);
assert.equal(result.applied, true);
assert.equal(result.conditionCount, 1);
assert.deepEqual(result.overrides, { autoBuild: [condition(true)] });

// --- Adding to an existing list appends and leaves the input untouched ---
const existing = { autoBuild: [condition(false)] };
result = applyOverrideEdit(existing, {
  kind: "add-condition",
  settingKey: "autoBuild",
  result: true,
});
assert.equal(result.conditionCount, 2);
assert.deepEqual(result.overrides.autoBuild, [
  condition(false),
  condition(true),
]);
assert.equal(existing.autoBuild.length, 1);
assert.notEqual(result.overrides.autoBuild, existing.autoBuild);

// --- Other settings' lists survive the edit ---
result = applyOverrideEdit(
  { autoBuild: [condition(true)], autoTax: [condition(false)] },
  { kind: "remove-condition", settingKey: "autoBuild", index: 0 },
);
assert.deepEqual(Object.keys(result.overrides), ["autoTax"]);

// --- Removing the last condition drops the setting's entry entirely ---
assert.equal(result.conditionCount, 0);
assert.equal(result.applied, true);

// --- Removing one of several keeps the rest in order ---
result = applyOverrideEdit(
  { autoBuild: [condition("a"), condition("b"), condition("c")] },
  { kind: "remove-condition", settingKey: "autoBuild", index: 1 },
);
assert.deepEqual(
  result.overrides.autoBuild.map((entry) => entry.ret),
  ["a", "c"],
);

// --- A duplicate is a copy, not a second reference ---
const source = { autoBuild: [condition("a"), condition("b")] };
result = applyOverrideEdit(source, {
  kind: "duplicate-condition",
  settingKey: "autoBuild",
  index: 1,
});
assert.deepEqual(
  result.overrides.autoBuild.map((entry) => entry.ret),
  ["a", "b", "b"],
);
assert.notEqual(result.overrides.autoBuild[1], result.overrides.autoBuild[2]);

// --- Reordering follows the stored positions the editor reports ---
result = applyOverrideEdit(
  { autoBuild: [condition("a"), condition("b"), condition("c")] },
  { kind: "reorder-conditions", settingKey: "autoBuild", order: [2, 0, 1] },
);
assert.deepEqual(
  result.overrides.autoBuild.map((entry) => entry.ret),
  ["c", "a", "b"],
);

// --- An order that is not a permutation is refused rather than losing conditions ---
const three = { autoBuild: [condition("a"), condition("b"), condition("c")] };
for (const order of [
  [0, 1],
  [0, 1, 1],
  [0, 1, 3],
  [0, 1, 2, 2],
  [0, 1, 1.5],
]) {
  const refused = applyOverrideEdit(three, {
    kind: "reorder-conditions",
    settingKey: "autoBuild",
    order,
  });
  assert.equal(refused.applied, false, `order ${JSON.stringify(order)}`);
  assert.equal(refused.conditionCount, 3);
  assert.deepEqual(refused.overrides, three);
}

// --- Setting an operand type installs that type's default argument, and nothing else changes ---
result = applyOverrideEdit(
  { autoBuild: [condition("a")] },
  {
    kind: "set-operand",
    settingKey: "autoBuild",
    index: 0,
    slot: 2,
    operandType: "ResourceQuantity",
    argument: "Money",
  },
);
assert.deepEqual(result.overrides.autoBuild[0], {
  type1: "Boolean",
  arg1: true,
  type2: "ResourceQuantity",
  arg2: "Money",
  cmp: "==",
  ret: "a",
});

// --- The three single-field edits replace the condition rather than mutating it ---
const single = { autoBuild: [condition("a")] };
result = applyOverrideEdit(single, {
  kind: "set-operand-argument",
  settingKey: "autoBuild",
  index: 0,
  slot: 1,
  argument: false,
});
assert.equal(result.overrides.autoBuild[0].arg1, false);
assert.equal(single.autoBuild[0].arg1, true);
assert.notEqual(result.overrides.autoBuild[0], single.autoBuild[0]);

result = applyOverrideEdit(single, {
  kind: "set-comparator",
  settingKey: "autoBuild",
  index: 0,
  comparator: ">=",
});
assert.equal(result.overrides.autoBuild[0].cmp, ">=");

result = applyOverrideEdit(single, {
  kind: "set-result",
  settingKey: "autoBuild",
  index: 0,
  result: 42,
});
assert.equal(result.overrides.autoBuild[0].ret, 42);

// --- An edit naming a condition that is gone changes nothing ---
for (const edit of [
  { kind: "remove-condition", settingKey: "autoTax", index: 0 },
  { kind: "duplicate-condition", settingKey: "autoBuild", index: 4 },
  {
    kind: "set-comparator",
    settingKey: "autoBuild",
    index: -1,
    comparator: "<",
  },
  { kind: "set-result", settingKey: "autoTax", index: 0, result: 1 },
]) {
  const refused = applyOverrideEdit(single, edit);
  assert.equal(refused.applied, false, edit.kind);
  assert.deepEqual(refused.overrides, single);
}
assert.equal(
  applyOverrideEdit(single, {
    kind: "remove-condition",
    settingKey: "autoTax",
    index: 0,
  }).conditionCount,
  0,
);

console.log("Override editing domain tests passed");
