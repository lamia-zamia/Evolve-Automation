import assert from "node:assert/strict";

import {
  assessAuthorityRemoval,
  calculateRequiredAuthorityGarrison,
  resolveAuthorityTarget,
} from "../src/domain/civic/authority.ts";

function view({
  manage = true,
  configuredTarget = 100,
  maximum = 137,
  current = 100,
  evilTechLevel = 1,
  highPopulationPercent = 100,
  grenadier = false,
  governmentType = "federation",
} = {}) {
  return {
    target: { manage, configuredTarget, maximum },
    current,
    modifiers: {
      evilTechLevel,
      highPopulationPercent,
      grenadier,
      governmentType,
    },
  };
}

for (const testCase of [
  { input: view({ configuredTarget: 0 }), expected: null },
  { input: view({ manage: false, configuredTarget: -1 }), expected: null },
  { input: view({ configuredTarget: -1 }), expected: 137 },
  { input: view({ configuredTarget: -25, maximum: 150 }), expected: 150 },
  { input: view({ configuredTarget: 100 }), expected: 100 },
]) {
  const modern = resolveAuthorityTarget(testCase.input.target);
  assert.equal(modern, testCase.expected);
}

for (const testCase of [
  { input: view({ configuredTarget: 0, current: 20 }), garrison: 25 },
  { input: view({ current: 100 }), garrison: 25 },
  { input: view({ current: 96 }), garrison: 20 },
  { input: view({ current: 110 }), garrison: 25 },
  {
    input: view({ current: 100, highPopulationPercent: 0 }),
    garrison: 25,
  },
]) {
  const modern = calculateRequiredAuthorityGarrison(
    testCase.input,
    testCase.garrison,
  );
  assert.equal(modern.status, "ready");
  assert.ok(Object.isFrozen(modern));
}

assert.deepEqual(assessAuthorityRemoval(view(), 2), {
  status: "ready",
  target: 100,
  predicted: 98,
  blocksRemoval: true,
});
assert.deepEqual(assessAuthorityRemoval(view({ configuredTarget: 0 }), 2), {
  status: "unmanaged",
});
assert.ok(Object.isFrozen(assessAuthorityRemoval(view(), 2)));

console.log("Authority policy module tests passed");
