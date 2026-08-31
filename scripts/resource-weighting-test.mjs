import assert from "node:assert/strict";

import { findRequiredResourceWeight } from "../src/domain/economy/resources/resource-weighting.ts";

const cases = [
  {
    name: "selects the first ordered shortage",
    requirements: [
      { cost: { Iron: 100 }, weighting: 80 },
      { cost: { Iron: 200 }, weighting: 40 },
    ],
    resource: { id: "Iron", currentQuantity: 50 },
    expected: 80,
  },
  {
    name: "falls through a satisfied higher-priority requirement",
    requirements: [
      { cost: { Iron: 100 }, weighting: 80 },
      { cost: { Iron: 200 }, weighting: 40 },
    ],
    resource: { id: "Iron", currentQuantity: 100 },
    expected: 40,
  },
  {
    name: "uses a strict shortage comparison",
    requirements: [{ cost: { Iron: 100 }, weighting: 80 }],
    resource: { id: "Iron", currentQuantity: 100 },
    expected: undefined,
  },
  {
    name: "ignores requirements for other resources",
    requirements: [{ cost: { Copper: 100 }, weighting: 80 }],
    resource: { id: "Iron", currentQuantity: 0 },
    expected: undefined,
  },
  {
    // The real stall: Mythril held 19,920, the Titan Spaceport needed 19,149,
    // and the higher-priority Cargo Yard needed another 12,000. Comparing each
    // requirement against the gross stock in isolation says "covered", so the
    // craft weighting went to zero and no craftsman was ever assigned - while
    // the build planner, which preserves the Cargo Yard's share, could not
    // spend it either. Requirements have to be measured against what is left
    // after the higher-priority ones ahead of them.
    name: "counts a requirement short once higher-priority claims are counted",
    requirements: [
      { cost: { Mythril: 12000 }, weighting: 300 },
      { cost: { Mythril: 19149 }, weighting: 100 },
    ],
    resource: { id: "Mythril", currentQuantity: 19920 },
    expected: 100,
  },
  {
    name: "still reports no shortage when the stock covers every claim",
    requirements: [
      { cost: { Mythril: 12000 }, weighting: 300 },
      { cost: { Mythril: 19149 }, weighting: 100 },
    ],
    resource: { id: "Mythril", currentQuantity: 31149 },
    expected: undefined,
  },
  {
    name: "returns no weighting for an empty requirement list",
    requirements: [],
    resource: { id: "Iron", currentQuantity: 0 },
    expected: undefined,
  },
];

for (const testCase of cases) {
  const modern = findRequiredResourceWeight(
    testCase.requirements,
    testCase.resource,
  );
  assert.equal(modern, testCase.expected, testCase.name);
}

console.log("Resource weighting module tests passed");
