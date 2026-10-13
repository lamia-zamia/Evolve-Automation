import assert from "node:assert/strict";

import { createCapturedTechPrerequisiteLevelReader } from "../../../src/adapters/evolve/progression/research/captured-tech-prerequisite-levels.ts";

const definitions = [
  {
    grantTechnology: "mad",
    prerequisites: {
      kind: "declared",
      requirements: [{ technologyId: "uranium", requiredLevel: 1 }],
    },
  },
];
const readLevels = createCapturedTechPrerequisiteLevelReader();

{
  const levels = readLevels({ tech: { mad: 0, uranium: 1 } }, definitions);
  assert.equal(levels?.get("mad"), 0);
  assert.equal(levels?.get("uranium"), 1);
}

{
  // Native checkTechRequirements uses `global.tech[req] || 0`; an absent lazy key is level zero.
  const levels = readLevels({ tech: {} }, definitions);
  assert.equal(levels?.get("mad"), 0);
  assert.equal(levels?.get("uranium"), 0);
}

assert.equal(readLevels({ tech: {} }, undefined), undefined);
assert.equal(readLevels({ tech: null }, definitions), undefined);
assert.equal(readLevels({ tech: { mad: "1" } }, definitions), undefined);

assert.equal(
  readLevels({ tech: { mad: 1, uranium: 3 } }, definitions)?.get("uranium"),
  3,
  "indexed technology identities still read fresh levels",
);

console.log("captured native Research prerequisite level tests passed");
