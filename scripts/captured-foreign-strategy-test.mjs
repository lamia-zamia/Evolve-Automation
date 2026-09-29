import assert from "node:assert/strict";

import { selectCapturedForeignStrategy } from "../src/adapters/evolve/combat/captured-foreign-state.ts";

const root = {
  tech: { unify: 0 },
  city: { morale: { current: 500 } },
  resource: { Money: { amount: 100_000, max: 100_000 } },
  stats: { attacks: 0, achieve: {} },
};

const settings = {
  foreignPolicyInferior: "Ignore",
  foreignPolicySuperior: "Ignore",
  foreignPolicyRival: "Ignore",
  foreignForceSabotage: false,
  foreignUnification: false,
  foreignOccupyLast: false,
  foreignPacifist: false,
  achievementGuards: false,
};

function government(governmentId, overrides = {}) {
  const policy = overrides.policy ?? "Ignore";
  return Object.freeze({
    governmentId,
    rank: governmentId < 2 ? "Inferior" : "Superior",
    policy,
    military: 40,
    spyCount: 0,
    sabotageProgress: 0,
    activeEspionage: "none",
    hostility: 30,
    unrest: 20,
    economy: 1,
    occupied: false,
    annexed: false,
    purchased: false,
    ...overrides,
  });
}

function strategy(governments, settingsOverrides = {}, rootValue = root) {
  return selectCapturedForeignStrategy(
    rootValue,
    { ...settings, ...settingsOverrides },
    governments,
  );
}

function policies(result) {
  return result.governments.map(({ governmentId, policy }) => [
    governmentId,
    policy,
  ]);
}

const twoInferiors = [government(0), government(1), government(2)];

// Old SpyManager.updateForeigns() overwrote the candidate while walking active foreigns.
assert.equal(
  strategy(twoInferiors).selectedTargetId,
  1,
  "the last eligible Inferior wins",
);

assert.equal(
  strategy([government(0), government(1, { annexed: true }), government(2)])
    .selectedTargetId,
  0,
  "an annexed final Inferior is excluded",
);
assert.equal(
  strategy([government(0), government(1, { purchased: true }), government(2)])
    .selectedTargetId,
  0,
  "a purchased final Inferior is excluded",
);

assert.equal(
  strategy([
    government(0, { occupied: true }),
    government(1, { occupied: true }),
    government(2, { rank: "Inferior" }),
  ]).selectedTargetId,
  2,
  "occupied Inferiors remain eligible and the later uncontrolled Inferior wins",
);
assert.equal(
  strategy([
    government(0, { occupied: true, annexed: true }),
    government(1, { occupied: true, purchased: true }),
    government(2),
  ]).selectedTargetId,
  0,
  "with no eligible Inferior, the first occupied foreign wins",
);
assert.equal(
  strategy([
    government(0, { annexed: true }),
    government(1, { purchased: true }),
    government(2),
  ]).selectedTargetId,
  0,
  "without an occupied foreign, fallback is the first active foreign",
);

const sabotage = strategy(twoInferiors, { foreignForceSabotage: true });
assert.deepEqual(policies(sabotage), [
  [0, "Ignore"],
  [1, "Sabotage"],
  [2, "Ignore"],
]);
assert.equal(sabotage.selectedTargetId, 1);
assert.equal(
  sabotage.battleTargetId,
  1,
  "Battle uses the same adjusted target as old SpyManager.foreignTarget",
);

const annex = strategy(
  [
    government(0, { policy: "Annex", spyCount: 3 }),
    government(1, {
      policy: "Annex",
      spyCount: 3,
      hostility: 30,
      unrest: 80,
    }),
    government(2),
  ],
  { foreignPolicyInferior: "Annex" },
);
assert.equal(annex.selectedTargetId, 1);
assert.deepEqual(policies(annex), [
  [0, "Annex"],
  [1, "Ignore"],
  [2, "Ignore"],
]);

const purchase = strategy(
  [
    government(0, { policy: "Purchase", spyCount: 3 }),
    government(1, { policy: "Purchase", spyCount: 3 }),
    government(2),
  ],
  { foreignPolicyInferior: "Purchase" },
);
assert.equal(purchase.selectedTargetId, 1);
assert.deepEqual(policies(purchase), [
  [0, "Purchase"],
  [1, "Ignore"],
  [2, "Ignore"],
]);

const occupyLast = strategy(twoInferiors, {
  foreignUnification: true,
  foreignOccupyLast: true,
});
assert.equal(occupyLast.selectedTargetId, 1);
assert.deepEqual(policies(occupyLast), [
  [0, "Ignore"],
  [1, "Sabotage"],
  [2, "Ignore"],
]);

const readyToUnify = strategy(
  [
    government(0, { occupied: true, policy: "Occupy" }),
    government(1),
    government(2, { occupied: true, policy: "Occupy" }),
  ],
  {
    foreignUnification: true,
    foreignOccupyLast: true,
  },
  {
    ...root,
    tech: { unify: 1 },
  },
);
assert.equal(readyToUnify.selectedTargetId, 1);
assert.deepEqual(policies(readyToUnify), [
  [0, "Occupy"],
  [1, "Occupy"],
  [2, "Occupy"],
]);
assert.equal(readyToUnify.battleTargetId, 1);

const betrayal = strategy([
  government(0, { policy: "Ignore" }),
  government(1, { policy: "Betrayal", military: 80 }),
  government(2),
]);
assert.equal(betrayal.selectedTargetId, 1);
assert.equal(
  betrayal.battleTargetId,
  null,
  "Betrayal over 75 clears the old foreignTarget after policy adjustments",
);

const pacifist = strategy(twoInferiors, {
  foreignPacifist: true,
  foreignForceSabotage: true,
});
assert.equal(pacifist.selectedTargetId, null);
assert.equal(pacifist.battleTargetId, null);
assert.deepEqual(policies(pacifist), [
  [0, "Ignore"],
  [1, "Ignore"],
  [2, "Ignore"],
]);

console.log("captured foreign strategy checks passed");
