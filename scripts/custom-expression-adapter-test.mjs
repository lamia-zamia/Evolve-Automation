import assert from "node:assert/strict";
import { createCustomExpressionAdapter } from "../src/adapters/evolve/custom-expression.ts";

let scope = { settings: { answer: 40 }, state: { delta: 2 } };
const evaluator = createCustomExpressionAdapter({
  getScope: () => scope,
});

assert.equal(evaluator.cacheSize(), 0);
assert.equal(evaluator.fastEval("settings.answer + state.delta"), 42);
assert.equal(evaluator.cacheSize(), 1);

scope = { settings: { answer: 50 }, state: { delta: -3 } };
assert.equal(evaluator.fastEval("settings.answer + state.delta"), 47);
assert.equal(evaluator.fastEval("(() => settings.answer * 2)()"), 100);
assert.equal(evaluator.cacheSize(), 2);

console.log("Custom expression adapter tests passed");
