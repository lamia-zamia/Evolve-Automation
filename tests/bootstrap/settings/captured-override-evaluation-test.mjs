import assert from "node:assert/strict";

import {
  capturedOverridesNeedGrantedTechs,
  createCapturedOverrideEvaluation,
} from "../../../src/adapters/evolve/captured-override-evaluation.ts";
import { createCapturedOverrideEditorCatalog } from "../../../src/bootstrap/captured-override-editor-catalog.ts";

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

const researchOverrideSettings = {
  overrides: {
    autoBuild: [
      {
        type1: "Boolean",
        arg1: true,
        type2: "ResearchComplete",
        arg2: "tech-mining",
        cmp: "==",
        ret: true,
      },
    ],
  },
};
assert.equal(capturedOverridesNeedGrantedTechs(undefined), false);
assert.equal(capturedOverridesNeedGrantedTechs(researchOverrideSettings), true);

let sampledOverrideSettings;
const contextEvaluator = createCapturedOverrideEvaluation({
  rootState: {
    readRoot: () => ({
      resource: {
        Money: { amount: 500, max: 1000, display: true },
      },
    }),
  },
  readSettings: () => researchOverrideSettings,
  comparatorSource: { comparisons: {}, rightOperandComparators: [] },
  readConditionContext: (settings) => {
    sampledOverrideSettings = settings;
    return {
      demand: {
        isDemanded: (resourceId) => resourceId === "Money",
        storageRequired: () => 1,
      },
    };
  },
}).sampleEvaluator();
assert.equal(contextEvaluator.readOperand("ResourceDemanded", "Money"), true);
assert.equal(sampledOverrideSettings, researchOverrideSettings);

const catalog = createCapturedOverrideEditorCatalog();
assert.equal(catalog.checkTypes["RaceId"].arg, "string");
assert.equal(catalog.checkTypes["RaceId"].def, "");
assert.equal(catalog.checkTypes["RaceId"].fn("species"), "species");
assert.equal(catalog.checkTypes["Eval"], undefined);

console.log("Captured override evaluation tests passed");
