import assert from "node:assert/strict";

import { createCapturedOverrideEvaluation } from "../src/adapters/evolve/captured-override-evaluation.ts";
import { createCapturedOverrideEditorCatalog } from "../src/bootstrap/captured-override-editor-catalog.ts";

const root = { race: { species: "human", gods: "elven" } };
const evaluator = createCapturedOverrideEvaluation({
  rootState: { readRoot: () => root },
  readSettings: () => ({}),
  comparatorSource: { comparisons: {}, rightOperandComparators: [] },
}).sampleEvaluator();

assert.equal(evaluator.hasOperandType("RaceId"), true);
assert.equal(evaluator.readOperand("RaceId", "species"), "human");
assert.equal(evaluator.readOperand("RaceId", "gods"), "elven");
assert.equal(evaluator.readOperand("RaceId", "srace"), "protoplasm");
assert.equal(evaluator.readOperand("RaceId", "entish"), "entish");
assert.equal(evaluator.hasOperandType("Eval"), false);

const catalog = createCapturedOverrideEditorCatalog();
assert.equal(catalog.checkTypes["RaceId"].arg, "string");
assert.equal(catalog.checkTypes["RaceId"].def, "");
assert.equal(catalog.checkTypes["RaceId"].fn("species"), "species");
assert.equal(catalog.checkTypes["Eval"], undefined);

console.log("Captured override evaluation tests passed");
