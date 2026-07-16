import assert from "node:assert/strict";
import { createFastEvaluator } from "../src/utils/fast-evaluator.ts";

let compileCount = 0;
const context = { value: 2 };
const { fastEval, cacheSize } = createFastEvaluator({
  compileExpression: (source) => {
    compileCount++;
    return () => (source === "double" ? context.value * 2 : context.value + 1);
  },
});

assert.equal(fastEval("double"), 4);
assert.equal(fastEval("double"), 4);
assert.equal(compileCount, 1);
assert.equal(cacheSize(), 1);
context.value = 5;
assert.equal(fastEval("double"), 10);
assert.equal(fastEval("increment"), 6);
assert.equal(compileCount, 2);
assert.equal(cacheSize(), 2);

console.log("Fast evaluator tests passed");
