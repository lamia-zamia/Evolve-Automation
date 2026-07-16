import assert from "node:assert/strict";

import {
  assessAuthorityRemoval,
  calculateAuthorityPerSoldier,
  calculateRequiredAuthorityGarrison,
  predictAuthorityAfterRemovingSoldiers,
  resolveAuthorityTarget,
} from "../src/domain/authority.ts";
import {
  legacyAuthorityPerSoldier,
  legacyAuthorityTarget,
  legacyPredictedAuthority,
  legacyRequiredAuthorityGarrison,
} from "./test-support/legacy-authority.mjs";

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
  assert.equal(modern, legacyAuthorityTarget(testCase.input));
}

for (const input of [
  view(),
  view({
    highPopulationPercent: 50,
    grenadier: true,
    governmentType: "dictator",
  }),
  view({ evilTechLevel: 0, governmentType: "autocracy" }),
  view({ highPopulationPercent: 0 }),
]) {
  const modern = calculateAuthorityPerSoldier(input.modifiers);
  assert.ok(Math.abs(modern - legacyAuthorityPerSoldier(input)) < 1e-12);
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
  const legacy = legacyRequiredAuthorityGarrison(
    testCase.input,
    testCase.garrison,
  );
  assert.equal(modern.status, "ready");
  assert.equal(modern.requiredGarrison, legacy);
  assert.ok(Object.isFrozen(modern));
}

for (const removed of [0, 1.25, 2, 10]) {
  const input = view();
  assert.equal(
    predictAuthorityAfterRemovingSoldiers(input, removed),
    legacyPredictedAuthority(input, removed),
  );
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
