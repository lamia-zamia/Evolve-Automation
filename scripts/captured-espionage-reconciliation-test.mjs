import assert from "node:assert/strict";

import { createCapturedEspionageRunner } from "../src/application/captured-espionage.ts";
import { planCapturedEspionage } from "../src/domain/combat/captured-espionage.ts";

function input(overrides = {}) {
  return {
    enabled: true,
    governmentId: 0,
    policy: "Influence",
    spyCount: 3,
    sabotageProgress: 0,
    military: 80,
    hostility: 0,
    unrest: 20,
    occupied: false,
    annexed: false,
    purchased: false,
    useful: true,
    purchaseMoney: 0,
    purchaseForeign: false,
    elusive: false,
    ...overrides,
  };
}

function release(overrides) {
  const decision = planCapturedEspionage(input(overrides));
  assert.equal(decision?.kind, "release-foreign");
  return decision;
}

function noDecision(overrides) {
  assert.equal(planCapturedEspionage(input(overrides)), null);
}

// Reconciliation follows mission selection and its old gates, but does not require a useful mission.
assert.equal(release({ annexed: true, useful: false }).governmentId, 0);
assert.equal(
  release({ policy: "Sabotage", purchased: true, useful: false }).kind,
  "release-foreign",
);
noDecision({ policy: "Occupy", occupied: true });
noDecision({ policy: "Annex", annexed: true });
noDecision({ policy: "Purchase", purchased: true, spyCount: 3 });
release({ policy: "Influence", occupied: true, useful: false });
release({ policy: "Annex", occupied: true, useful: false });
noDecision({ policy: "Ignore", annexed: true });
noDecision({ policy: "None", annexed: true });
noDecision({ policy: "Unmapped", annexed: true });
noDecision({ policy: "Influence", occupied: true, sabotageProgress: 1 });
noDecision({ policy: "Influence", occupied: true, spyCount: 0 });
release({ policy: "Betrayal", purchased: true, military: 75, useful: false });

// The Purchase hold applies before reconciliation, and only when all its old terms hold.
noDecision({
  policy: "Purchase",
  occupied: true,
  spyCount: 2,
  purchaseMoney: 100,
  purchaseForeign: true,
});
noDecision({
  policy: "Purchase",
  occupied: true,
  spyCount: 2,
  purchaseMoney: 100,
  purchaseForeign: undefined,
});
release({ policy: "Purchase", occupied: true, spyCount: 2, purchaseMoney: 0 });
release({
  policy: "Purchase",
  occupied: true,
  spyCount: 2,
  purchaseMoney: 100,
  purchaseForeign: false,
});
release({
  policy: "Purchase",
  occupied: true,
  spyCount: 3,
  purchaseMoney: 100,
  purchaseForeign: true,
});
release({
  policy: "Purchase",
  occupied: true,
  spyCount: 2,
  purchaseMoney: 100,
  purchaseForeign: true,
  elusive: true,
});
noDecision({
  policy: "Purchase",
  occupied: true,
  spyCount: 2,
  purchaseMoney: undefined,
  purchaseForeign: true,
});
release({
  policy: "Purchase",
  occupied: true,
  spyCount: 2,
  purchaseMoney: undefined,
  purchaseForeign: false,
});
release({
  policy: "Purchase",
  occupied: true,
  spyCount: 2,
  purchaseMoney: 0,
  purchaseForeign: undefined,
});

assert.equal(
  planCapturedEspionage(input({ policy: "Influence", useful: true }))?.kind,
  "captured-espionage",
);
noDecision({ policy: "Influence", useful: false });

// A release advances the existing per-government rotation before the next normal operation.
{
  const inputs = [
    input({ governmentId: 0, policy: "Ignore" }),
    input({ governmentId: 1, policy: "Influence", annexed: true }),
    input({ governmentId: 2, policy: "Sabotage" }),
  ];
  const decisions = [];
  const run = createCapturedEspionageRunner({
    reader: { readAll: () => inputs },
    executor: {
      execute(decision) {
        decisions.push(decision);
        return { status: "succeeded" };
      },
    },
    isGovernorEspionageOwned: () => false,
    standDown: () => {},
  });

  assert.equal(run().status, "succeeded");
  assert.deepEqual(
    decisions.map(({ kind, governmentId }) => [kind, governmentId]),
    [["release-foreign", 1]],
  );
  assert.equal(run().status, "succeeded");
  assert.deepEqual(
    decisions.map(({ kind, governmentId }) => [kind, governmentId]),
    [
      ["release-foreign", 1],
      ["captured-espionage", 2],
    ],
  );
}

console.log("captured espionage reconciliation checks passed");
