import assert from "node:assert/strict";

import { calculateKnowledgeRequirements } from "../src/domain/knowledge-requirements.ts";
import { legacyCalculateKnowledgeRequirements } from "./test-support/legacy-knowledge-requirements.mjs";

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

const cases = [
  { techKnowledgeCosts: [], reservedTargets: [], buildCandidates: [] },
  {
    techKnowledgeCosts: [100, 50],
    reservedTargets: [reserved(80), reserved(0), reserved(70)],
    buildCandidates: [
      candidate(200, 5),
      candidate(120, 10),
      candidate(500, 100, { isKnowledge: true }), // excluded: Knowledge producer
      candidate(150, 15), // top by weighting → 150 reserved
    ],
  },
  {
    // Technologies and Knowledge producers among reserved targets are skipped.
    techKnowledgeCosts: [300],
    reservedTargets: [
      reserved(999, { isTechnology: true }),
      reserved(999, { isKnowledge: true }),
      reserved(40),
    ],
    buildCandidates: [candidate(60, 3, { autoBuildable: false })], // not buildable
  },
  {
    // Highest weighting wins even if a cheaper-knowledge candidate sorts first.
    techKnowledgeCosts: [10],
    reservedTargets: [],
    buildCandidates: [candidate(500, 1), candidate(90, 99)],
  },
  {
    // Top target has zero Knowledge cost → contributes nothing.
    techKnowledgeCosts: [5],
    reservedTargets: [],
    buildCandidates: [candidate(0, 50)],
  },
];

for (const input of cases) {
  assert.deepEqual(
    calculateKnowledgeRequirements(input),
    legacyCalculateKnowledgeRequirements(input),
    `mismatch: ${JSON.stringify(input)}`,
  );
}

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
