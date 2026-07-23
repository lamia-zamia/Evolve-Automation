import assert from "node:assert/strict";

import {
  readAuthorityPolicyView,
  readAuthorityQuantity,
} from "../src/adapters/evolve/civic/authority.ts";

const validGame = {
  global: {
    race: { grenadier: true },
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
