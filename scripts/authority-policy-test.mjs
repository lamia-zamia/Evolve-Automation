import assert from "node:assert/strict";

import {
  assessAuthorityRemoval,
  calculateRequiredAuthorityGarrison,
  calculateAuthorityPerSoldier,
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
  authorityLossMultiplier = 1,
} = {}) {
  return {
    target: { manage, configuredTarget, maximum },
    current,
    modifiers: {
      evilTechLevel,
      highPopulationPercent,
      grenadier,
      governmentType,
      authorityLossMultiplier,
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

assert.equal(
  assessAuthorityRemoval(view({ current: 102 }), 2).blocksRemoval,
  false,
);
assert.deepEqual(
  assessAuthorityRemoval(view({ current: 102, grenadier: true }), 2),
  {
    status: "ready",
    target: 100,
    predicted: 99,
    blocksRemoval: true,
  },
);
assert.equal(
  assessAuthorityRemoval(view({ current: 102, evilTechLevel: 2 }), 2)
    .blocksRemoval,
  false,
);
assert.deepEqual(
  assessAuthorityRemoval(
    view({ current: 102, evilTechLevel: 2, authorityLossMultiplier: 1.2 }),
    2,
  ),
  {
    status: "ready",
    target: 100,
    predicted: 99,
    blocksRemoval: true,
  },
);
for (const [governmentType, factor] of [
  ["federation", 1],
  ["autocracy", 1.08],
  ["dictator", 1.12],
]) {
  assert.ok(
    Math.abs(
      calculateAuthorityPerSoldier(
        view({
          evilTechLevel: 2,
          highPopulationPercent: 50,
          grenadier: true,
          governmentType,
        }).modifiers,
      ) -
        0.9 * 0.5 * 1.75 * factor,
    ) < 1e-12,
  );
}

// The game's pre-floor remainder and a weak gene can only make the actual
// remaining Authority higher than this prediction from the already floored amount.
for (const remainder of [0, 0.25, 0.99]) {
  for (const actualMultiplier of [1.1, 1.2]) {
    const input = view({
      current: 102,
      evilTechLevel: 2,
      authorityLossMultiplier: 1.2,
    });
    const prediction = assessAuthorityRemoval(input, 2).predicted;
    assert.ok(
      prediction <= Math.floor(102 + remainder - 2 * 0.9 * actualMultiplier),
    );
  }
}

console.log("Authority policy module tests passed");
