import assert from "node:assert/strict";
import {
  assessAllocationOpportunity,
  selectAllocationOpportunity,
} from "../../experiments/p12j-allocation-opportunity-discovery.mjs";

function evidence(overrides = {}) {
  return {
    id: "candidate-a",
    rootId: "root-1",
    priceIdentity: "price-1",
    action: {
      current: true,
      rootId: "root-1",
      progressionCurrent: true,
      priceCurrent: true,
      priceIdentity: "price-1",
      permitted: true,
      affordable: false,
      shortfalls: [{ resourceId: "r1", amount: 3 }],
    },
    owner: {
      effectResourceIds: ["r1"],
      demandSatisfied: false,
      controlAvailable: true,
      permission: true,
      expectedReversion: false,
    },
    target: {
      nativeMaximum: 5,
      assigned: 2,
      smartMaximumKnown: true,
      smartMaximum: 4,
      permission: true,
      controlAvailable: true,
      foundryCoupled: false,
      idleWorkers: 1,
      defaultPoolWorkers: 0,
    },
    evidenceComplete: true,
    budgetExhausted: false,
    ...overrides,
  };
}

const executable = assessAllocationOpportunity(evidence());
assert.equal(executable.actionable, true);
assert.deepEqual(executable.reasons, []);

const nativeCap = assessAllocationOpportunity(
  evidence({
    target: { ...evidence().target, assigned: 5 },
  }),
);
assert.ok(nativeCap.reasons.includes("native-job-cap-reached"));

const smartCap = assessAllocationOpportunity(
  evidence({
    target: { ...evidence().target, assigned: 4 },
  }),
);
assert.ok(smartCap.reasons.includes("smart-maximum-reached"));

const noIdle = assessAllocationOpportunity(
  evidence({
    target: { ...evidence().target, idleWorkers: 0, defaultPoolWorkers: 0 },
  }),
);
assert.ok(noIdle.reasons.includes("no-idle-or-default-pool-worker"));

const defaultPool = assessAllocationOpportunity(
  evidence({
    target: { ...evidence().target, idleWorkers: 0, defaultPoolWorkers: 1 },
  }),
);
assert.equal(defaultPool.actionable, true);

const protectedSource = assessAllocationOpportunity(
  evidence({
    target: { ...evidence().target, idleWorkers: 0, defaultPoolWorkers: 0 },
    source: {
      assigned: 4,
      protectedMinimum: 4,
      permission: true,
      currentPolicyKnown: true,
      ownerPlanKnown: true,
    },
  }),
);
assert.ok(protectedSource.reasons.includes("source-assignment-protected"));

const unknownSource = assessAllocationOpportunity(
  evidence({
    target: { ...evidence().target, idleWorkers: 0, defaultPoolWorkers: 0 },
    source: { assigned: 4, protectedMinimum: 1 },
  }),
);
assert.ok(unknownSource.reasons.includes("source-obligations-not-established"));

const foundryCoupled = assessAllocationOpportunity(
  evidence({
    target: {
      ...evidence().target,
      foundryCoupled: true,
      couplingRepresented: false,
    },
  }),
);
assert.ok(foundryCoupled.reasons.includes("foundry-coupling-not-represented"));

const missingControl = assessAllocationOpportunity(
  evidence({
    owner: { ...evidence().owner, controlAvailable: false },
  }),
);
assert.ok(missingControl.reasons.includes("native-control-unavailable"));

const reversal = assessAllocationOpportunity(
  evidence({
    owner: { ...evidence().owner, expectedReversion: true },
  }),
);
assert.ok(reversal.reasons.includes("ordinary-owner-will-revert"));

const sufficient = assessAllocationOpportunity(
  evidence({
    action: { ...evidence().action, affordable: true },
  }),
);
assert.ok(sufficient.reasons.includes("resource-already-sufficient"));

const ownerSatisfied = assessAllocationOpportunity(
  evidence({
    owner: { ...evidence().owner, demandSatisfied: true },
  }),
);
assert.ok(
  ownerSatisfied.reasons.includes("production-owner-already-satisfies-demand"),
);

const missingEffect = assessAllocationOpportunity(
  evidence({ evidenceComplete: false }),
);
assert.ok(
  missingEffect.reasons.includes("missing-effect-or-authority-evidence"),
);

for (const changed of [
  evidence({ action: { ...evidence().action, priceIdentity: "price-2" } }),
  evidence({ action: { ...evidence().action, rootId: "root-2" } }),
  evidence({ action: { ...evidence().action, progressionCurrent: false } }),
]) {
  const assessment = assessAllocationOpportunity(changed);
  assert.equal(assessment.actionable, false);
  assert.ok(assessment.reasons.some((reason) => reason.startsWith("changed-")));
}

const tied = selectAllocationOpportunity([
  evidence({ id: "zeta" }),
  evidence({ id: "alpha" }),
]);
assert.equal(tied.selectedId, "alpha");
assert.deepEqual(tied.tiedIds, ["alpha", "zeta"]);

const exhausted = selectAllocationOpportunity(
  [evidence({ id: "one" }), evidence({ id: "two" })],
  { maxCandidates: 1 },
);
assert.equal(exhausted.budgetExhausted, true);
assert.equal(exhausted.selectedId, "one");

const none = selectAllocationOpportunity([
  evidence({ owner: { ...evidence().owner, demandSatisfied: true } }),
]);
assert.equal(none.selectedId, undefined);
assert.deepEqual(none.tiedIds, []);

console.log("P12J allocation opportunity discovery tests passed");
