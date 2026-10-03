import assert from "node:assert/strict";

import {
  readAuthorityPolicyView,
  readAuthorityQuantity,
  readCapturedAuthorityPolicyView,
} from "../src/adapters/evolve/civic/authority.ts";

const validGame = {
  global: {
    race: { grenadier: 1 },
    tech: { evil: 2 },
    civic: { govern: { type: "dictator" } },
  },
};
const validSettings = {
  authorityManage: true,
  generalMinimumAuthority: -1,
};
const validResources = {
  Authority: { currentQuantity: 101, maxQuantity: 137 },
};
let traitReads = 0;
const ready = readAuthorityPolicyView(
  validGame,
  validSettings,
  validResources,
  () => {
    traitReads += 1;
    return 50;
  },
);
assert.equal(ready.status, "ready");
assert.equal(traitReads, 1);
assert.deepEqual(ready.view, {
  target: { manage: true, configuredTarget: -1, maximum: 137 },
  current: 101,
  modifiers: {
    evilTechLevel: 2,
    highPopulationPercent: 50,
    grenadier: true,
    governmentType: "dictator",
    authorityLossMultiplier: 1,
  },
});
assert.ok(Object.isFrozen(ready));
assert.ok(Object.isFrozen(ready.view));
assert.ok(Object.isFrozen(ready.view.target));
assert.ok(Object.isFrozen(ready.view.modifiers));

const noEvilTech = readAuthorityPolicyView(
  { ...validGame, global: { ...validGame.global, tech: {} } },
  validSettings,
  validResources,
  () => 100,
);
assert.equal(noEvilTech.status, "ready");
assert.equal(noEvilTech.view.modifiers.evilTechLevel, 0);

for (const [grenadier, active] of [
  [1, true],
  [true, true],
  [0, false],
  [false, false],
  [undefined, false],
]) {
  const result = readAuthorityPolicyView(
    { global: { ...validGame.global, race: { grenadier } } },
    validSettings,
    validResources,
    () => 100,
  );
  assert.equal(result.status, "ready");
  assert.equal(result.view.modifiers.grenadier, active);
}
for (const [despot, multiplier] of [
  [undefined, 1],
  [false, 1],
  [0, 1],
  [1, 1.02],
  [5, 1.1],
  [10, 1.2],
]) {
  const result = readAuthorityPolicyView(
    { global: { ...validGame.global, race: { grenadier: 1, despot } } },
    validSettings,
    validResources,
    () => 100,
  );
  assert.equal(result.status, "ready");
  assert.ok(
    Math.abs(result.view.modifiers.authorityLossMultiplier - multiplier) <
      1e-12,
  );
  assert.equal(
    result.view.current,
    101,
    "the game's floored Authority is unchanged",
  );
}
for (const despot of [-1, NaN, Infinity, "5", {}, null, true]) {
  assert.deepEqual(
    readAuthorityPolicyView(
      { global: { ...validGame.global, race: { despot } } },
      validSettings,
      validResources,
      () => 100,
    ),
    { status: "unavailable", reason: "invalid-trait-value" },
  );
}

function sharedAuthorityReads(root, settings = validSettings) {
  return [
    readCapturedAuthorityPolicyView(root, settings),
    readAuthorityPolicyView(
      { global: root },
      settings,
      {
        Authority: {
          currentQuantity: root.resource?.Authority?.amount,
          maxQuantity: root.resource?.Authority?.max,
        },
      },
      () => (root.race?.high_pop ? 26 : 100),
    ),
  ];
}
for (const grenadier of [1, true, 0, false, undefined]) {
  for (const despot of [
    undefined,
    false,
    0,
    1,
    5,
    10,
    -1,
    NaN,
    Infinity,
    "5",
    {},
    null,
  ]) {
    const root = {
      ...validGame.global,
      race: { grenadier, despot, high_pop: 1 },
      resource: { Authority: { amount: 101, max: 137 } },
    };
    const [captured, normalized] = sharedAuthorityReads(root);
    assert.deepEqual(
      captured,
      normalized,
      "both consumers share the compatibility contract",
    );
  }
}
for (const [patch, settings, reason] of [
  [{}, {}, "invalid-settings"],
  [{ resource: {} }, validSettings, "invalid-resource"],
  [{ tech: { evil: -1 } }, validSettings, "invalid-game-state"],
  [{ civic: { govern: { type: 42 } } }, validSettings, "invalid-game-state"],
]) {
  const root = {
    ...validGame.global,
    resource: { Authority: { amount: 101, max: 137 } },
    ...patch,
  };
  for (const result of sharedAuthorityReads(root, settings)) {
    assert.deepEqual(result, { status: "unavailable", reason });
  }
}
const throwingDespotRoot = {
  ...validGame.global,
  race: {
    get despot() {
      throw new Error("inaccessible rank");
    },
  },
  resource: { Authority: { amount: 101, max: 137 } },
};
for (const result of sharedAuthorityReads(throwingDespotRoot)) {
  assert.deepEqual(result, {
    status: "unavailable",
    reason: "inaccessible-data",
  });
}

assert.deepEqual(readAuthorityQuantity(1.25), {
  status: "ready",
  value: 1.25,
});
assert.deepEqual(readAuthorityQuantity(-1), {
  status: "unavailable",
  reason: "invalid-input",
});
assert.deepEqual(readAuthorityQuantity(NaN), {
  status: "unavailable",
  reason: "invalid-input",
});

assert.deepEqual(
  readAuthorityPolicyView(validGame, {}, validResources, () => 100),
  { status: "unavailable", reason: "invalid-settings" },
);
assert.deepEqual(
  readAuthorityPolicyView(validGame, validSettings, {}, () => 100),
  { status: "unavailable", reason: "invalid-resource" },
);
assert.deepEqual(
  readAuthorityPolicyView({}, validSettings, validResources, () => 100),
  { status: "unavailable", reason: "invalid-game-state" },
);
assert.deepEqual(
  readAuthorityPolicyView(validGame, validSettings, validResources, () => -1),
  { status: "unavailable", reason: "invalid-trait-value" },
);
assert.deepEqual(
  readAuthorityPolicyView(validGame, validSettings, validResources, () => {
    throw new Error("hostile trait reader");
  }),
  { status: "unavailable", reason: "inaccessible-data" },
);

console.log("Authority Evolve adapter contract tests passed");
