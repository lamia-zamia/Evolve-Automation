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
