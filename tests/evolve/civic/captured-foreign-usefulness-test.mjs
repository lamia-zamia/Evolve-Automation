import assert from "node:assert/strict";

import { planCapturedEspionage } from "../../../src/domain/combat/captured-espionage.ts";
import { capturedForeignEspionageUseful } from "../../../src/adapters/evolve/combat/captured-foreign-state.ts";

function foreignTarget({
  governmentId = 0,
  military = 0,
  spies = 0,
  sabotageProgress = 0,
  hostility = 0,
  unrest = 0,
  economy = 1,
} = {}) {
  return {
    governmentId,
    rank: "Inferior",
    policy: "Ignore",
    military,
    spyCount: spies,
    sabotageProgress,
    activeEspionage: undefined,
    hostility,
    unrest,
    economy,
    occupied: false,
    annexed: false,
    purchased: false,
  };
}

function foreignRoot({ morale = 0, money = 0 } = {}) {
  return {
    city: { morale: { current: morale } },
    resource: { Money: { amount: money } },
  };
}

const sabRoot = foreignRoot();
for (const [spies, military, useful] of [
  [0, 20, true],
  [0, 70, true],
  [1, 74, false],
  [1, 75, true],
  [2, 50, false],
  [2, 51, true],
]) {
  assert.equal(
    capturedForeignEspionageUseful(
      sabRoot,
      foreignTarget({ spies, military }),
      "sabotage",
    ),
    useful,
    `Sabotage: spies=${spies}, military=${military}`,
  );
}

assert.equal(
  capturedForeignEspionageUseful(
    sabRoot,
    foreignTarget({ spies: 0, military: 20, sabotageProgress: 300 }),
    "sabotage",
  ),
  true,
  "Sabotage usefulness is independent of an operation already running",
);
assert.equal(
  planCapturedEspionage({
    enabled: true,
    governmentId: 0,
    policy: "Sabotage",
    spyCount: 1,
    sabotageProgress: 300,
    military: 20,
    hostility: 0,
    unrest: 0,
    occupied: false,
    annexed: false,
    purchased: false,
    requestedOperationUseful: true,
  }),
  null,
  "An active sabotage operation still prevents starting another one",
);

for (const [spies, unrest, useful] of [
  [1, 100, true],
  [2, 100, true],
  [3, 75, true],
  [3, 76, false],
  [4, 99, true],
  [4, 100, false],
]) {
  assert.equal(
    capturedForeignEspionageUseful(
      sabRoot,
      foreignTarget({ governmentId: 4, spies, unrest }),
      "incite",
    ),
    useful,
    `Incite: spies=${spies}, unrest=${unrest}`,
  );
}

for (const [spies, hostility, useful] of [
  [0, 10, false],
  [0, 11, true],
  [1, 0, false],
  [1, 1, true],
]) {
  assert.equal(
    capturedForeignEspionageUseful(
      sabRoot,
      foreignTarget({ spies, hostility }),
      "influence",
    ),
    useful,
    `Influence: spies=${spies}, hostility=${hostility}`,
  );
}

assert.equal(
  capturedForeignEspionageUseful(
    foreignRoot({ morale: 200 }),
    foreignTarget({ governmentId: 3, hostility: 50, unrest: 50 }),
    "annex",
  ),
  true,
  "Annex uses the old equality boundary without a government-index gate",
);
assert.equal(
  capturedForeignEspionageUseful(
    foreignRoot({ morale: 199 }),
    foreignTarget({ hostility: 50, unrest: 50 }),
    "annex",
  ),
  false,
);
assert.equal(
  capturedForeignEspionageUseful(
    foreignRoot({ morale: 500 }),
    foreignTarget({ hostility: 51, unrest: 50 }),
    "annex",
  ),
  false,
);
assert.equal(
  capturedForeignEspionageUseful(
    foreignRoot({ morale: 500 }),
    foreignTarget({ hostility: 50, unrest: 49 }),
    "annex",
  ),
  false,
);

assert.equal(
  capturedForeignEspionageUseful(
    foreignRoot({ money: 100_000 }),
    foreignTarget({ governmentId: 3, spies: 2 }),
    "purchase",
  ),
  false,
);
assert.equal(
  capturedForeignEspionageUseful(
    foreignRoot({ money: 15_383 }),
    foreignTarget({ governmentId: 3, spies: 3 }),
    "purchase",
  ),
  false,
);
assert.equal(
  capturedForeignEspionageUseful(
    foreignRoot({ money: 15_384 }),
    foreignTarget({ governmentId: 3, spies: 3 }),
    "purchase",
  ),
  true,
  "Purchase uses the old spy and exact price boundary without a government-index gate",
);

console.log("captured foreign usefulness truth-table checks passed");
