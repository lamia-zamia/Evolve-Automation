import assert from "node:assert/strict";
import { assessProductionInterventionEvidence } from "../../../src/domain/economy/production-intervention-evidence.ts";

const matched = Object.freeze({
  startingStateMatched: true,
  evidenceCurrent: true,
  priceUnchanged: true,
  baselineReadyPeriod: 20,
  interventionReadyPeriod: 18,
  targetResourceCurrentlyScarce: true,
  targetResourceId: "Knowledge",
  targetWasLastThreshold: true,
  interventionAvailable: true,
  targetProductionDelta: 4,
  collateralProductionChanges: Object.freeze([
    Object.freeze({ resourceId: "Food", delta: -2 }),
    Object.freeze({ resourceId: "Iron", delta: 1 }),
  ]),
  collateralEffectsComplete: false,
  nonTargetActionsMatchedUntilReadiness: true,
  foodSustainable: true,
  externalCommitmentsKnown: false,
});

const advanced = assessProductionInterventionEvidence(matched);
assert.equal(advanced.outcome, "advanced");
assert.equal(advanced.targetResourceId, "Knowledge");
assert.equal(advanced.resourceCurrentlyScarce, true);
assert.equal(advanced.resourceWasLastThreshold, true);
assert.equal(advanced.interventionAvailable, true);
assert.equal(advanced.resourceProductionIncreased, true);
assert.equal(advanced.actionReadinessAdvanced, true);
assert.deepEqual(advanced.collateralProductionLosses, [
  { resourceId: "Food", delta: -2 },
]);
assert.equal(advanced.forecastComplete, false);
assert.ok(
  advanced.reasons.includes("collateral production effects are incomplete"),
);
assert.ok(
  advanced.reasons.includes("external resource commitments are incomplete"),
);

assert.equal(
  assessProductionInterventionEvidence({
    ...matched,
    targetResourceCurrentlyScarce: false,
  }).resourceCurrentlyScarce,
  false,
);

const unavailable = assessProductionInterventionEvidence({
  ...matched,
  interventionAvailable: false,
  interventionUnavailableReason:
    "no idle worker; Scientist is at native capacity",
});
assert.equal(unavailable.outcome, "inconclusive");
assert.ok(
  unavailable.reasons.includes(
    "no idle worker; Scientist is at native capacity",
  ),
);

for (const interventionUnavailableReason of [
  "native job control is missing",
  "native job control generation changed",
  "source assignment is protected",
]) {
  const result = assessProductionInterventionEvidence({
    ...matched,
    interventionAvailable: false,
    interventionUnavailableReason,
  });
  assert.equal(result.outcome, "inconclusive");
  assert.ok(result.reasons.includes(interventionUnavailableReason));
}

assert.equal(
  assessProductionInterventionEvidence({
    ...matched,
    foodSustainable: false,
  }).outcome,
  "harmful",
);
assert.equal(
  assessProductionInterventionEvidence({
    ...matched,
    nonTargetActionsMatchedUntilReadiness: false,
  }).outcome,
  "inconclusive",
);

const redundant = assessProductionInterventionEvidence({
  ...matched,
  interventionReadyPeriod: matched.baselineReadyPeriod,
});
assert.equal(redundant.outcome, "redundant");
assert.equal(redundant.resourceProductionIncreased, true);
assert.equal(redundant.actionReadinessAdvanced, false);
assert.equal(redundant.actionReadinessWorsened, false);

assert.equal(
  assessProductionInterventionEvidence({
    ...matched,
    interventionReadyPeriod: 24,
  }).outcome,
  "harmful",
  "a later actual action readiness time is harmful",
);

assert.equal(
  assessProductionInterventionEvidence({
    ...matched,
    targetWasLastThreshold: false,
    interventionReadyPeriod: matched.baselineReadyPeriod,
  }).outcome,
  "redundant",
  "a competing priced resource can remain the last blocker",
);

for (const changes of [
  { targetWasLastThreshold: undefined },
  { priceUnchanged: false },
  { evidenceCurrent: false },
  { targetProductionDelta: undefined },
  { targetProductionDelta: 0 },
  { startingStateMatched: false },
  { foodSustainable: undefined },
]) {
  assert.equal(
    assessProductionInterventionEvidence({ ...matched, ...changes }).outcome,
    "inconclusive",
  );
}

for (const reason of [
  "root changed before the paired action boundary",
  "Research offer generation was rebound",
  "cached affordability did not match the current draw",
]) {
  assert.equal(
    assessProductionInterventionEvidence({
      ...matched,
      evidenceCurrent: false,
      evidenceInvalidReason: reason,
    }).outcome,
    "inconclusive",
    reason,
  );
}

console.log("production intervention evidence tests passed");
