import assert from "node:assert/strict";

import {
  overrideComparatorExpressions,
  overrideComparators,
  overrideComparisons,
} from "../src/settings/override-comparators.ts";

const compare = (id, left, right) => overrideComparisons[id](left, right);

// --- Equality stays loose, and the strict pair stays beside it ---
assert.equal(compare("==", 1, "1"), true);
assert.equal(compare("==", true, 1), true);
assert.equal(compare("==", undefined, null), true);
assert.equal(compare("==", 1, 2), false);
assert.equal(compare("!=", 1, "1"), false);
assert.equal(compare("===", 1, "1"), false);
assert.equal(compare("!==", 1, "1"), true);

// --- Relational operands order as strings only when both are strings ---
assert.equal(compare(">", "b", "a"), true);
assert.equal(compare("<", "10", "9"), true);
assert.equal(compare(">", "10", 9), true);
assert.equal(compare(">=", "5", 5), true);
assert.equal(compare("<=", true, 1), true);
assert.equal(compare(">", null, -1), true);

// A value with no numeric order answers false in every direction, as `<` already does.
for (const id of [">", "<", ">=", "<="]) {
  assert.equal(compare(id, undefined, 0), false, id);
  assert.equal(compare(id, 0, undefined), false, id);
  assert.equal(compare(id, Symbol("s"), 0), false, id);
}

// --- The logical comparators answer with a boolean, not with an operand ---
assert.equal(compare("AND", 2, 3), true);
assert.equal(compare("AND", 2, 0), false);
assert.equal(compare("OR", 0, ""), false);
assert.equal(compare("OR", 0, "x"), true);
assert.equal(compare("NAND", 1, 1), false);
assert.equal(compare("NOR", 0, 0), true);
assert.equal(compare("XOR", 1, 0), true);
assert.equal(compare("XOR", 1, 2), false);
assert.equal(compare("XNOR", 0, ""), true);
assert.equal(compare("AND!", 1, 0), true);
assert.equal(compare("AND!", 1, 1), false);
assert.equal(compare("OR!", 0, 0), true);
assert.equal(compare("OR!", 0, 1), false);

// The two result-carrying comparators read their left operand and ignore their right.
assert.equal(compare("A?B", 5, undefined), true);
assert.equal(compare("A?B", 0, 5), false);
assert.equal(compare("!A?B", 0, undefined), true);
assert.equal(compare("!A?B", 5, 0), false);

for (const id of Object.keys(overrideComparators)) {
  assert.equal(typeof compare(id, 1, 1), "boolean", id);
}

// --- Every comparator writes itself as the custom expression the editor shows ---
assert.deepEqual(
  Object.fromEntries(
    Object.entries(overrideComparatorExpressions).map(([id, express]) => [
      id,
      express("a", "b"),
    ]),
  ),
  {
    "==": "a == b",
    "!=": "a != b",
    ">": "a > b",
    "<": "a < b",
    ">=": "a >= b",
    "<=": "a <= b",
    "===": "a === b",
    "!==": "a !== b",
    AND: "a && b",
    OR: "a || b",
    NAND: "!(a && b)",
    NOR: "!(a || b)",
    XOR: "!a != !b",
    XNOR: "!a == !b",
    "AND!": "a && !b",
    "OR!": "a || !b",
    "A?B": "a",
    "!A?B": "!a",
  },
);

assert.equal(
  overrideComparatorExpressions["<="]('_("Number",1)', "(x + 1)"),
  '_("Number",1) <= (x + 1)',
);
assert.deepEqual(
  Object.keys(overrideComparatorExpressions),
  Object.keys(overrideComparisons),
);

console.log("Override comparator tests passed");
