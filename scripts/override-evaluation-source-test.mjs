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

// --- One sample reads each distinct operand once, however many conditions name it ---
let counted = 0;
const failure = new Error("resource nonesuch not found");
const countingSource = createOverrideEvaluationSource({
  getCheckTypes: () => ({
    Value: {
      fn: (arg) => {
        counted += 1;
        if (arg === "broken") {
          throw failure;
        }
        return `read:${String(arg)}`;
      },
    },
    Other: {
      fn: (arg) => {
        counted += 1;
        return `other:${String(arg)}`;
      },
    },
  }),
  getCheckCompare: () => ({}),
  getCheckCustom: () => ({}),
  getHaveTask: () => () => false,
});

const pass = countingSource.sampleEvaluator();
assert.equal(pass.readOperand("Value", "foo"), "read:foo");
assert.equal(pass.readOperand("Value", "foo"), "read:foo");
assert.equal(counted, 1);

// A different argument, and the same argument under another operand type, are separate reads
assert.equal(pass.readOperand("Value", "bar"), "read:bar");
assert.equal(pass.readOperand("Other", "foo"), "other:foo");
assert.equal(counted, 3);

// Argument identity decides, so a numeric 0 and the string "0" are not the same read
assert.equal(pass.readOperand("Value", 0), "read:0");
assert.equal(pass.readOperand("Value", "0"), "read:0");
assert.equal(counted, 5);

// A read that throws is sampled too: the repeat reports the same failure without re-reading
assert.throws(() => pass.readOperand("Value", "broken"), failure);
assert.throws(() => pass.readOperand("Value", "broken"), failure);
assert.equal(counted, 6);

// The sample belongs to the pass, so the next pass reads the game again
const nextPass = countingSource.sampleEvaluator();
assert.equal(nextPass.readOperand("Value", "foo"), "read:foo");
assert.equal(counted, 7);

// --- The catalog is read at sample time, so a replaced bag is seen by the next pass ---
checkTypes = { Value: { fn: () => "replaced" } };
checkCompare = { "==": () => false };
checkCustom = {};
assert.equal(evaluator.readOperand("Value", "bar"), "read:bar");
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
