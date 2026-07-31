import assert from "node:assert/strict";
import { createOverrideEvaluationSource } from "../src/adapters/evolve/override-evaluation.ts";

let checkTypes = {
  Boolean: { fn: (arg) => arg },
  Value: { fn: (arg) => `read:${arg}` },
};
let checkCompare = {
  "==": (a, b) => a === b,
  AND: (a, b) => a && b,
};
let checkCustom = { AND: true };
const tasks = new Set();

const source = createOverrideEvaluationSource({
  getCheckTypes: () => checkTypes,
  getCheckCompare: () => checkCompare,
  getCheckCustom: () => checkCustom,
  getHaveTask: () => (task) => tasks.has(task),
});

// --- Operand reads and comparisons go through the catalog the sample captured ---
const evaluator = source.sampleEvaluator();
assert.equal(evaluator.hasOperandType("Value"), true);
assert.equal(evaluator.hasOperandType("Missing"), false);
assert.equal(evaluator.readOperand("Value", "foo"), "read:foo");
assert.equal(evaluator.hasComparator("=="), true);
assert.equal(evaluator.hasComparator("<"), false);
assert.equal(evaluator.compare("==", 3, 3), true);
assert.equal(evaluator.compare("==", 3, 4), false);

// --- Only the comparators listed as custom yield the right operand ---
assert.equal(evaluator.comparatorReturnsRightOperand("AND"), true);
assert.equal(evaluator.comparatorReturnsRightOperand("=="), false);

// --- A missing entry names itself rather than throwing a TypeError ---
assert.throws(
  () => evaluator.readOperand("Missing", 1),
  /^Error: Missing variable not found$/,
);
assert.throws(
  () => evaluator.compare("<", 1, 2),
  /^Error: < comparator not found$/,
);

// --- The catalog is read at sample time, so a replaced bag is seen by the next pass ---
checkTypes = { Value: { fn: () => "replaced" } };
checkCompare = { "==": () => false };
checkCustom = {};
assert.equal(evaluator.readOperand("Value", "foo"), "read:foo");
const resampled = source.sampleEvaluator();
assert.equal(resampled.readOperand("Value", "foo"), "replaced");
assert.equal(resampled.compare("==", 3, 3), false);
assert.equal(resampled.comparatorReturnsRightOperand("AND"), false);

// --- Storage is forced by either of the game's two storage tasks ---
assert.deepEqual(source.readForcedTasks(), {
  storageTaskActive: false,
  trashTaskActive: false,
  taxTaskActive: false,
});
tasks.add("bal_storage");
assert.equal(source.readForcedTasks().storageTaskActive, true);
tasks.clear();
tasks.add("combo_storage");
assert.equal(source.readForcedTasks().storageTaskActive, true);
tasks.add("trash");
tasks.add("tax");
assert.deepEqual(source.readForcedTasks(), {
  storageTaskActive: true,
  trashTaskActive: true,
  taxTaskActive: true,
});
tasks.clear();

console.log("Override evaluation source adapter tests passed");
