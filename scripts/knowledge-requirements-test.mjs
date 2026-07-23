import assert from "node:assert/strict";

import { calculateKnowledgeRequirements } from "../src/domain/knowledge-requirements.ts";

const reserved = (knowledgeCost, extra = {}) => ({
  knowledgeCost,
  isTechnology: false,
  isKnowledge: false,
  ...extra,
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
    techKnowledgeCosts: [100, 50],
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

console.log("Knowledge requirements domain tests passed");
