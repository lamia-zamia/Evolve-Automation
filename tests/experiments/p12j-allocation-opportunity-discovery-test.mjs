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
      alreadyResponding: false,
      controlAvailable: true,
      permission: true,
      expectedReversion: false,
      currentPlanKnown: true,
    },
    ownerKind: "jobs",
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

const p12iObservedJobsBoundary = assessAllocationOpportunity({
  ...evidence(),
  id: "p12i-scientist-boundary",
  action: {
    ...evidence().action,
    shortfalls: [
      { resourceId: "Knowledge", amount: 6849.337465725465 },
      { resourceId: "Steel", amount: 240 },
    ],
  },
  owner: {
    ...evidence().owner,
    currentPlanKnown: false,
    expectedReversion: undefined,
    demandSatisfied: undefined,
    alreadyResponding: undefined,
  },
  evidenceComplete: false,
  target: {
    ...evidence().target,
    nativeMaximum: 1,
    assigned: 1,
    smartMaximumKnown: false,
    smartMaximum: null,
    idleWorkers: 0,
    defaultPoolWorkers: 0,
    controlAvailable: undefined,
  },
});
assert.equal(p12iObservedJobsBoundary.actionable, false);
assert.ok(p12iObservedJobsBoundary.reasons.includes("native-job-cap-reached"));
assert.ok(
  p12iObservedJobsBoundary.reasons.includes("unknown-effective-smart-maximum"),
);
assert.ok(
  p12iObservedJobsBoundary.reasons.includes("no-idle-or-default-pool-worker"),
);
assert.ok(
  p12iObservedJobsBoundary.reasons.includes(
    "native-target-control-availability-unknown",
  ),
);
assert.ok(
  p12iObservedJobsBoundary.reasons.includes("ordinary-owner-reversion-unknown"),
);

const p12gObservedSmelterBoundary = assessAllocationOpportunity({
  ...evidence(),
  id: "p12g-smelter-boundary",
  ownerKind: "smelter",
  action: {
    ...evidence().action,
    shortfalls: [{ resourceId: "Steel", amount: 240 }],
  },
  owner: {
    ...evidence().owner,
    effectResourceIds: ["Steel", "Iron", "Coal"],
    alreadyResponding: true,
    capacity: {
      nativeMaximum: 15,
      totalAssigned: 15,
      targetAssigned: 0,
      targetMaximum: 15,
      requestedDelta: 1,
      sourceAvailable: 1,
      sourceId: "Iron",
      sourceControlAvailable: true,
      sourceProvenance: "captured native Smelter plan",
    },
  },
  target: undefined,
});
assert.equal(p12gObservedSmelterBoundary.actionable, false);
assert.ok(
  p12gObservedSmelterBoundary.reasons.includes(
    "production-owner-already-responding",
  ),
);

const unknownSmelterCapacity = assessAllocationOpportunity({
  ...evidence(),
  ownerKind: "smelter",
  owner: { ...evidence().owner, capacity: undefined },
  target: undefined,
});
assert.ok(
  unknownSmelterCapacity.reasons.includes("native-allocation-capacity-unknown"),
);

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

const missingSmartCap = assessAllocationOpportunity(
  evidence({
    target: {
      ...evidence().target,
      smartMaximumKnown: true,
      smartMaximum: undefined,
    },
  }),
);
assert.ok(missingSmartCap.reasons.includes("unknown-effective-smart-maximum"));

const malformedIdlePool = assessAllocationOpportunity(
  evidence({
    target: { ...evidence().target, idleWorkers: Number.NaN },
  }),
);
assert.ok(malformedIdlePool.reasons.includes("idle-worker-count-unknown"));

const missingJobTarget = assessAllocationOpportunity(
  evidence({ target: undefined }),
);
assert.ok(missingJobTarget.reasons.includes("missing-job-target-evidence"));

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

const unknownOwnerPlan = assessAllocationOpportunity(
  evidence({
    owner: { ...evidence().owner, currentPlanKnown: false },
    target: { ...evidence().target, idleWorkers: 0, defaultPoolWorkers: 1 },
  }),
);
assert.ok(unknownOwnerPlan.reasons.includes("ordinary-owner-plan-unknown"));

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

const unknownControl = assessAllocationOpportunity(
  evidence({ owner: { ...evidence().owner, controlAvailable: undefined } }),
);
assert.ok(
  unknownControl.reasons.includes("native-control-availability-unknown"),
);

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

const unknownAffordability = assessAllocationOpportunity(
  evidence({
    action: { ...evidence().action, affordable: undefined },
  }),
);
assert.ok(
  unknownAffordability.reasons.includes("native-affordability-unknown"),
);

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

for (const incomplete of [
  evidence({ ownerKind: undefined }),
  evidence({ ownerKind: "jobz", target: undefined }),
  evidence({
    rootId: undefined,
    action: { ...evidence().action, rootId: undefined },
  }),
  evidence({
    priceIdentity: undefined,
    action: { ...evidence().action, priceIdentity: undefined },
  }),
  evidence({ action: { ...evidence().action, current: 1 } }),
  evidence({ action: { ...evidence().action, progressionCurrent: "true" } }),
]) {
  assert.equal(assessAllocationOpportunity(incomplete).actionable, false);
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
assert.equal(exhausted.selectedId, undefined);
assert.deepEqual(exhausted.tiedIds, []);
assert.deepEqual(exhausted.potentialIds, ["one"]);

const none = selectAllocationOpportunity([
  evidence({ owner: { ...evidence().owner, demandSatisfied: true } }),
]);
assert.equal(none.selectedId, undefined);
assert.deepEqual(none.tiedIds, []);

console.log("P12J allocation opportunity discovery tests passed");
