import assert from "node:assert/strict";

import { planResearch } from "../../../src/domain/progression/research/research.ts";

// These constructed observations are synthetic policy inputs, not gameplay evidence.
const ordinary = Object.freeze({
  index: 0,
  id: "tech-theology",
  affordable: true,
  hasCostConflict: false,
  hasTechConflict: false,
});
const mad = Object.freeze({
  index: 2,
  id: "tech-mad",
  affordable: true,
  hasCostConflict: false,
  hasTechConflict: false,
});

assert.deepEqual(
  planResearch({ techs: [ordinary], madGoalCandidate: mad }),
  { index: 2, techId: "tech-mad" },
  "a fully eligible exact MAD candidate outranks the ordinary selection",
);

for (const rejectedMad of [
  { ...mad, affordable: false },
  { ...mad, hasCostConflict: true, costConflictEvidence: "unavailable" },
  { ...mad, hasTechConflict: true, exclusionEvidence: "unavailable" },
  { ...mad, mutationUncertain: true },
  { ...mad, id: "tech-other" },
]) {
  assert.deepEqual(
    planResearch({ techs: [ordinary], madGoalCandidate: rejectedMad }),
    { index: 0, techId: "tech-theology" },
  );
}

assert.deepEqual(
  planResearch({
    techs: [
      { ...mad, mutationUncertain: true },
      { ...ordinary, index: 1 },
    ],
  }),
  { index: 1, techId: "tech-theology" },
  "an action with an uncertain prior invocation is never selected again",
);

console.log("research goal priority ok (synthetic inputs)");
