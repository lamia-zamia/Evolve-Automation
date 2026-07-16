import assert from "node:assert/strict";

import { isCostAffordable } from "../src/domain/cost-affordability.ts";
import { legacyCheckAffordableCustom } from "./test-support/legacy-queue-items.mjs";

const cases = [
  {
    name: "empty cost",
    requirements: [],
    cost: {},
    resources: {},
    maximum: false,
    expected: true,
  },
  {
    name: "exact current quantity",
    requirements: [
      { resourceId: "Money", requiredQuantity: 10, availableQuantity: 10 },
    ],
    cost: { Money: 10 },
    resources: { Money: { currentQuantity: 10, maxQuantity: 100 } },
    maximum: false,
    expected: true,
  },
  {
    name: "insufficient current quantity",
    requirements: [
      { resourceId: "Money", requiredQuantity: 11, availableQuantity: 10 },
    ],
    cost: { Money: 11 },
    resources: { Money: { currentQuantity: 10, maxQuantity: 100 } },
    maximum: false,
    expected: false,
  },
  {
    name: "maximum capacity",
    requirements: [
      { resourceId: "Money", requiredQuantity: 99, availableQuantity: 100 },
    ],
    cost: { Money: 99 },
    resources: { Money: { currentQuantity: 10, maxQuantity: 100 } },
    maximum: true,
    expected: true,
  },
  {
    name: "all requirements must pass",
    requirements: [
      { resourceId: "Money", requiredQuantity: 5, availableQuantity: 10 },
      { resourceId: "Stone", requiredQuantity: 2, availableQuantity: 1 },
    ],
    cost: { Money: 5, Stone: 2 },
    resources: {
      Money: { currentQuantity: 10, maxQuantity: 10 },
      Stone: { currentQuantity: 1, maxQuantity: 1 },
    },
    maximum: false,
    expected: false,
  },
];

for (const testCase of cases) {
  const input = Object.freeze({
    requirements: Object.freeze(
      testCase.requirements.map((requirement) => Object.freeze(requirement)),
    ),
  });
  const modern = isCostAffordable(input);
  assert.equal(modern, testCase.expected, testCase.name);
  assert.equal(
    modern,
    legacyCheckAffordableCustom(
      testCase.cost,
      testCase.resources,
      testCase.maximum,
    ),
    `${testCase.name}: legacy comparison`,
  );
}

console.log("Queue cost affordability domain tests passed");
