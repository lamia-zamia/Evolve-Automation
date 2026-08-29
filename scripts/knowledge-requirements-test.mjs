import assert from "node:assert/strict";

import { calculateKnowledgeRequirements } from "../src/domain/knowledge-requirements.ts";

const reserved = (knowledgeCost, extra = {}) => ({
  knowledgeCost,
  isTechnology: false,
  isKnowledge: false,
  ...extra,
});
const tech = (knowledgeCost, otherCostsAffordable = true) => ({
  knowledgeCost,
  otherCostsAffordable,
});
const candidate = (knowledgeCost, weighting, extra = {}) => ({
  knowledgeCost,
  weighting,
  isKnowledge: false,
  autoBuildable: true,
  ...extra,
});

// Exact characterized values (mirrors the bundled storage-requirements scenario).
assert.deepEqual(
  calculateKnowledgeRequirements({
    techKnowledgeCosts: [tech(100), tech(50)],
    reservedTargets: [reserved(80), reserved(0)],
    buildCandidates: [
      candidate(200, 5),
      candidate(120, 10),
      candidate(500, 100, { isKnowledge: true }),
      candidate(150, 15),
    ],
  }),
  {
    knowledgeRequiredByTechs: 100,
    cheapestTechKnowledge: 50,
    knowledgeRequiredByBuildTargets: 150,
  },
);

// Empty tech list yields zero for both tech figures.
assert.deepEqual(
  calculateKnowledgeRequirements({
    techKnowledgeCosts: [],
    reservedTargets: [reserved(42)],
    buildCandidates: [],
  }),
  {
    knowledgeRequiredByTechs: 0,
    cheapestTechKnowledge: 0,
    knowledgeRequiredByBuildTargets: 42,
  },
);

// A technology blocked on a non-Knowledge cost still sets the maximum reserve
// but must not answer the cheapest figure: the "need more knowledge" build rule
// reads that figure, and a permanently unaffordable cheap-in-Knowledge tech
// would otherwise retire the rule for the rest of the run.
assert.deepEqual(
  calculateKnowledgeRequirements({
    techKnowledgeCosts: [tech(4950, false), tech(18500), tech(25000)],
    reservedTargets: [],
    buildCandidates: [],
  }),
  {
    knowledgeRequiredByTechs: 25000,
    cheapestTechKnowledge: 18500,
    knowledgeRequiredByBuildTargets: 0,
  },
);

// No reachable technology leaves the cheapest figure at zero, so the rule stays
// off rather than chasing capacity nothing is waiting for.
assert.deepEqual(
  calculateKnowledgeRequirements({
    techKnowledgeCosts: [tech(4950, false)],
    reservedTargets: [],
    buildCandidates: [],
  }),
  {
    knowledgeRequiredByTechs: 4950,
    cheapestTechKnowledge: 0,
    knowledgeRequiredByBuildTargets: 0,
  },
);

// A technology with no Knowledge cost is not waiting on Knowledge capacity.
// Counting it drives the cheapest figure to 0, which is below every capacity,
// so "need more knowledge" could never fire again. tech-unification2 and
// tech-unite report an empty cost until a foreign power is ready and sit in
// the unlocked list for the whole mid-game.
assert.deepEqual(
  calculateKnowledgeRequirements({
    techKnowledgeCosts: [tech(0), tech(220000), tech(135000, false)],
    reservedTargets: [],
    buildCandidates: [],
  }),
  {
    knowledgeRequiredByTechs: 220000,
    cheapestTechKnowledge: 220000,
    knowledgeRequiredByBuildTargets: 0,
  },
);

console.log("Knowledge requirements domain tests passed");
