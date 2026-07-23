import assert from "node:assert/strict";

import { readCostConflictInput } from "../src/adapters/evolve/cost-conflicts.ts";
import { findCostConflict } from "../src/domain/cost-conflicts.ts";

function modernConflict(state, resources, action) {
  const readResult = readCostConflictInput(state, resources, action);
  assert.equal(readResult.status, "ready");
  return findCostConflict(readResult.input);
}

const cases = [
  {
    name: "no reservations",
    state: { conflictTargets: [] },
    resources: {},
    action: { cost: {} },
    expected: null,
  },
  {
    name: "aggregates shared resource conflicts in stable order",
    state: {
      conflictTargets: [
        {
          name: "Research",
          cause: "Queue",
          cost: { Iron: 80, Knowledge: 90 },
        },
      ],
    },
    resources: {
      Iron: { name: "Iron", currentQuantity: 100 },
      Knowledge: { name: "Knowledge", currentQuantity: 100 },
    },
    action: { cost: { Iron: 30, Knowledge: 20 } },
    expected: {
      status: "conflict",
      resourceId: "Knowledge",
      targetName: "Research",
      targetCause: "Queue",
      resourceNames: ["Iron", "Knowledge"],
      targetNames: ["Research"],
    },
  },
  {
    name: "absent action cost means no shared spend",
    state: {
      conflictTargets: [
        { name: "Research", cause: "Queue", cost: { Iron: 80 } },
      ],
    },
    resources: { Iron: { name: "Iron", currentQuantity: 50 } },
    action: { cost: {} },
    expected: null,
  },
  {
    name: "explicit zero retains legacy conflict for an existing shortage",
    state: {
      conflictTargets: [
        { name: "Research", cause: "Queue", cost: { Iron: 80 } },
      ],
    },
    resources: { Iron: { name: "Iron", currentQuantity: 50 } },
    action: { cost: { Iron: 0 } },
    expected: {
      status: "conflict",
      resourceId: "Iron",
      targetName: "Research",
      targetCause: "Queue",
      resourceNames: ["Iron"],
      targetNames: ["Research"],
    },
  },
  {
    name: "defers Knowledge while another target cost is unaffordable",
    state: {
      conflictTargets: [
        {
          name: "Project",
          cause: "Trigger",
          cost: { Copper: 60, Knowledge: 2000 },
        },
      ],
    },
    resources: {
      Copper: { name: "Copper", currentQuantity: 50 },
      Knowledge: { name: "Knowledge", currentQuantity: 1000 },
    },
    action: { cost: { Knowledge: 100 } },
    expected: null,
  },
  {
    name: "retains the final target cause while aggregating target names",
    state: {
      conflictTargets: [
        { name: "First", cause: "Queue", cost: { Iron: 80 } },
        { name: "Second", cause: "Trigger", cost: { Iron: 90 } },
      ],
    },
    resources: { Iron: { name: "Iron", currentQuantity: 100 } },
    action: { cost: { Iron: 30 } },
    expected: {
      status: "conflict",
      resourceId: "Iron",
      targetName: "Second",
      targetCause: "Trigger",
      resourceNames: ["Iron"],
      targetNames: ["First", "Second"],
    },
  },
];

for (const testCase of cases) {
  const modern = modernConflict(
    testCase.state,
    testCase.resources,
    testCase.action,
  );
  assert.deepEqual(modern, testCase.expected, testCase.name);
  if (modern !== null) {
    assert.ok(Object.isFrozen(modern));
    assert.ok(Object.isFrozen(modern.resourceNames));
    assert.ok(Object.isFrozen(modern.targetNames));
  }
}

console.log("Cost conflict module tests passed");
