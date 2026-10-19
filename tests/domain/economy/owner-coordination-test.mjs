import assert from "node:assert/strict";
import {
  assessOwnerCoordination,
  compareOwnerCoordination,
} from "../../../src/domain/economy/owner-coordination.ts";

let sourceGeneration = 0;
function evidence(overrides = {}) {
  const rootIdentity = {};
  const progressionGeneration = ++sourceGeneration;
  const controlGeneration = ++sourceGeneration;
  return {
    goalId: "goal-1",
    requirementId: "need-1",
    provenance: "verified-mandatory",
    resourceId: "Steel",
    poolId: "city",
    targetAmount: 100,
    coveredAmount: 20,
    coverageComplete: true,
    explicitQueueActive: false,
    playerPermitted: true,
    excluded: false,
    ownerId: "smelter",
    capability: "steel-production",
    targetOwner: "smelter",
    requestPortAvailable: true,
    nativeControlAvailable: true,
    nativeCapAvailable: true,
    capacityAuthority: {
      ownerType: "smelter",
      availableCapacityKnown: true,
      sourceTargetAllocationKnown: true,
      fuelAllocationKnown: true,
      supportedDisplacementKnown: true,
    },
    rootIdentity,
    currentRootIdentity: rootIdentity,
    progressionGeneration,
    currentProgressionGeneration: progressionGeneration,
    priceIdentity: "price-1",
    currentPriceIdentity: "price-1",
    controlGeneration,
    currentControlGeneration: controlGeneration,
    permissionEnabled: true,
    currentPermissionEnabled: true,
    incumbentCommandIntention: ["addMetal:Steel", "subMetal:Iron"],
    proposedCommandIntention: [
      "addMetal:Steel",
      "subMetal:Iron",
      "addFuel:Coal",
    ],
    incumbentEffects: [
      { resourceId: "Steel", poolId: "city", amount: 2 },
      { resourceId: "Iron", poolId: "city", amount: 8 },
      { resourceId: "Coal", poolId: "city", amount: 6 },
    ],
    proposedEffects: [
      { resourceId: "Steel", poolId: "city", amount: 3 },
      { resourceId: "Iron", poolId: "city", amount: 7 },
      { resourceId: "Coal", poolId: "city", amount: 5 },
    ],
    commitmentClaimsComplete: true,
    conflictingClaims: [],
    affectedCommitmentIds: [],
    ownerWillReverse: false,
    supportedConstraintId: "research-steel-containers",
    incumbentConstraintProgress: 0,
    proposedConstraintProgress: 0,
    objectiveIdentity: "purchase-tech-steel-containers",
    immediateConstraintIdentity: "steel-containers-affordability",
    metricIdentity: "time-to-purchase",
    metricUnit: "periods",
    betterDirection: "smaller",
    observationScope: "same-save-window",
    observationFreshness: "same-cycle",
    supportedValue: 0,
    collateralSupported: true,
    opportunityCostSupported: true,
    effectEvidence: "measured-production-marginals",
    effectsComplete: true,
    budgetExhausted: false,
    ...overrides,
  };
}

const noIncrement = assessOwnerCoordination(evidence());
assert.equal(noIncrement.structurallyValid, true);
assert.equal(noIncrement.executable, true);
assert.equal(noIncrement.incrementalEffect, "none");
assert.equal(noIncrement.useful, false);
assert.equal(noIncrement.classification, "redundant");
assert.equal(noIncrement.mayRequestOwner, false);
assert.equal(noIncrement.authorizedToExecute, false);

const incumbentMeetsDemand = assessOwnerCoordination(
  evidence({
    coveredAmount: 100,
    incumbentConstraintProgress: 1,
    proposedConstraintProgress: 1,
  }),
);
assert.equal(incumbentMeetsDemand.classification, "redundant");
assert.ok(
  incumbentMeetsDemand.reasons.includes("incumbent-already-covers-demand"),
);

const usefulIncrement = assessOwnerCoordination(
  evidence({
    proposedConstraintProgress: 2,
    proposedCommandIntention: [
      "addMetal:Steel",
      "subMetal:Iron",
      "addMetal:Iridium",
    ],
    proposedEffects: [
      { resourceId: "Steel", poolId: "city", amount: 4 },
      { resourceId: "Iron", poolId: "city", amount: 6 },
      { resourceId: "Coal", poolId: "city", amount: 4 },
    ],
  }),
);
assert.equal(usefulIncrement.incrementalEffect, "supported");
assert.equal(usefulIncrement.useful, true);
assert.equal(usefulIncrement.classification, "incremental");
assert.equal(usefulIncrement.mayRequestOwner, true);
assert.equal(usefulIncrement.commandChanges, true);
assert.equal(
  usefulIncrement.effectChanges.find(({ resourceId }) => resourceId === "Steel")
    .productionDelta,
  2,
);
assert.equal(
  usefulIncrement.effectChanges.find(({ resourceId }) => resourceId === "Iron")
    .productionDelta,
  -2,
);
assert.deepEqual(usefulIncrement.affectedCommitmentIds, []);

const unknownGoalBenefit = assessOwnerCoordination(
  evidence({ proposedConstraintProgress: 1 }),
);
assert.equal(unknownGoalBenefit.incrementalEffect, "supported");
assert.equal(unknownGoalBenefit.useful, true);

const collateralLoss = assessOwnerCoordination(
  evidence({
    proposedConstraintProgress: 2,
    proposedEffects: [
      { resourceId: "Steel", poolId: "city", amount: 4 },
      { resourceId: "Iron", poolId: "city", amount: 2 },
      { resourceId: "Coal", poolId: "city", amount: 1 },
    ],
  }),
);
assert.equal(collateralLoss.mayRequestOwner, true);
assert.deepEqual(collateralLoss.reasons, []);

const sameResourceOtherPool = assessOwnerCoordination(
  evidence({
    proposedConstraintProgress: 2,
    proposedEffects: [{ resourceId: "Steel", poolId: "orbital", amount: 4 }],
  }),
);
assert.equal(sameResourceOtherPool.incrementalEffect, "none");
assert.equal(sameResourceOtherPool.mayRequestOwner, false);

const differentPoolClaim = assessOwnerCoordination(
  evidence({
    proposedConstraintProgress: 2,
    proposedEffects: [
      { resourceId: "Steel", poolId: "orbital", amount: 4 },
      { resourceId: "Iron", poolId: "city", amount: 6 },
    ],
  }),
);
assert.equal(
  differentPoolClaim.effectChanges.find(
    ({ poolId, resourceId }) => poolId === "orbital" && resourceId === "Steel",
  ).productionDelta,
  4,
);
assert.equal(
  differentPoolClaim.effectChanges.find(
    ({ poolId, resourceId }) => poolId === "city" && resourceId === "Steel",
  ).productionDelta,
  -2,
);

const owners = compareOwnerCoordination([
  evidence({
    requirementId: "smelter-steel",
    ownerId: "smelter",
    targetOwner: "smelter",
    proposedConstraintProgress: 2,
  }),
  evidence({
    requirementId: "factory-steel",
    ownerId: "factory",
    targetOwner: "factory",
    proposedConstraintProgress: 2,
  }),
]);
assert.deepEqual(owners.preferredIds, ["smelter-steel"]);

const redundantAlternative = compareOwnerCoordination([
  evidence({
    requirementId: "smelter",
    ownerId: "smelter",
    targetOwner: "smelter",
    proposedConstraintProgress: 2,
  }),
  evidence({
    requirementId: "factory",
    ownerId: "factory",
    targetOwner: "factory",
    coveredAmount: 100,
    proposedConstraintProgress: 0,
  }),
]);
assert.deepEqual(redundantAlternative.preferredIds, ["smelter"]);

const incomparable = compareOwnerCoordination([
  evidence({
    requirementId: "a",
    proposedConstraintProgress: 2,
    supportedValue: 3,
    metricIdentity: "time-to-purchase",
    metricUnit: "periods",
  }),
  evidence({
    requirementId: "b",
    proposedConstraintProgress: 2,
    supportedValue: 8,
    metricIdentity: "steel-production",
    metricUnit: "steel/period",
  }),
]);
assert.deepEqual(incomparable.preferredIds, []);

const genuineTie = compareOwnerCoordination([
  evidence({
    requirementId: "z",
    proposedConstraintProgress: 2,
    supportedValue: 3,
  }),
  evidence({
    requirementId: "a",
    proposedConstraintProgress: 2,
    supportedValue: 3,
  }),
]);
assert.deepEqual(genuineTie.preferredIds, ["z", "a"]);

const shorterTimeWins = compareOwnerCoordination([
  evidence({
    requirementId: "short",
    proposedConstraintProgress: 2,
    supportedValue: 4,
  }),
  evidence({
    requirementId: "long",
    proposedConstraintProgress: 2,
    supportedValue: 9,
  }),
]);
assert.deepEqual(shorterTimeWins.preferredIds, ["short"]);
const unknownCollateral = compareOwnerCoordination([
  evidence({
    requirementId: "known",
    proposedConstraintProgress: 2,
    supportedValue: 4,
  }),
  evidence({
    requirementId: "unknown",
    proposedConstraintProgress: 2,
    supportedValue: 1,
    collateralSupported: false,
  }),
]);
assert.deepEqual(unknownCollateral.preferredIds, ["known"]);
assert.equal(
  unknownCollateral.assessments.find(({ id }) => id === "unknown").preferred,
  false,
);

const identicalCommands = assessOwnerCoordination(
  evidence({
    incumbentCommandIntention: ["addMetal:Steel", "subMetal:Iron"],
    proposedCommandIntention: ["addMetal:Steel", "subMetal:Iron"],
  }),
);
assert.equal(identicalCommands.commandChanges, false);
const commandOrderChanges = assessOwnerCoordination(
  evidence({
    incumbentCommandIntention: ["subMetal:Iron", "addMetal:Steel"],
    proposedCommandIntention: ["addMetal:Steel", "subMetal:Iron"],
  }),
);
assert.equal(commandOrderChanges.commandChanges, true);
const identicalCommandCannotClaimIntervention = assessOwnerCoordination(
  evidence({
    proposedConstraintProgress: 2,
    incumbentCommandIntention: ["addMetal:Steel"],
    proposedCommandIntention: ["addMetal:Steel"],
  }),
);
assert.equal(identicalCommandCannotClaimIntervention.incrementalEffect, "none");
assert.equal(identicalCommandCannotClaimIntervention.mayRequestOwner, false);
const unknownCommands = assessOwnerCoordination(
  evidence({ proposedCommandIntention: undefined }),
);
assert.equal(unknownCommands.commandChanges, undefined);
assert.equal(unknownCommands.incrementalEffect, "unknown");
assert.equal(unknownCommands.classification, "unavailable");
assert.ok(unknownCommands.reasons.includes("native-command-intention-unknown"));
const plannedCommandsAreNotMarginals = assessOwnerCoordination(
  evidence({
    effectEvidence: "planned-commands",
    proposedConstraintProgress: 2,
  }),
);
assert.equal(plannedCommandsAreNotMarginals.incrementalEffect, "unknown");
assert.equal(plannedCommandsAreNotMarginals.effectChanges, undefined);
const unknownOwnerCapacity = assessOwnerCoordination(
  evidence({
    capacityAuthority: { ownerType: "other" },
  }),
);
assert.equal(unknownOwnerCapacity.executable, false);
assert.equal(unknownOwnerCapacity.physicalFeasibility, "unknown");
assert.ok(
  unknownOwnerCapacity.reasons.includes("owner-capacity-authority-unavailable"),
);
assert.equal(
  assessOwnerCoordination(evidence({ capacityAuthority: undefined }))
    .executable,
  false,
);
const characterizedJobsCapacity = assessOwnerCoordination(
  evidence({
    ownerId: "jobs",
    targetOwner: "jobs",
    capacityAuthority: {
      ownerType: "jobs",
      sourceAssignmentKnown: true,
      protectedMinimumKnown: true,
      defaultPoolKnown: true,
      workerCapacityKnown: true,
      foundryCouplingKnown: true,
    },
  }),
);
assert.equal(characterizedJobsCapacity.physicalFeasibility, "supported");

for (const [override, reason] of [
  [{ explicitQueueActive: true }, "explicit-user-queue-precedence"],
  [{ playerPermitted: false }, "player-permission-denied"],
  [{ excluded: true }, "player-exclusion"],
  [{ commitmentClaimsComplete: false }, "commitment-coverage-incomplete"],
  [{ conflictingClaims: ["iron:other-owner"] }, "conflicting-source-claims"],
  [{ requestPortAvailable: false }, "owner-request-port-unavailable"],
  [{ nativeControlAvailable: false }, "native-control-unavailable"],
  [{ nativeCapAvailable: false }, "native-cap-unavailable"],
  [
    {
      capacityAuthority: {
        ownerType: "smelter",
        availableCapacityKnown: false,
        sourceTargetAllocationKnown: true,
        fuelAllocationKnown: true,
        supportedDisplacementKnown: true,
      },
    },
    "owner-capacity-authority-unavailable",
  ],
  [{ ownerWillReverse: true }, "owner-will-reverse"],
  [{ ownerWillReverse: undefined }, "owner-reversal-unknown"],
  [{ currentRootIdentity: {} }, "stale-owner-snapshot"],
  [{ currentProgressionGeneration: 999 }, "stale-owner-snapshot"],
  [{ currentPriceIdentity: "price-2" }, "stale-owner-snapshot"],
  [{ currentControlGeneration: 999 }, "stale-owner-snapshot"],
  [{ currentPermissionEnabled: false }, "stale-owner-snapshot"],
]) {
  const result = assessOwnerCoordination(
    evidence({ ...override, proposedConstraintProgress: 2 }),
  );
  assert.equal(result.executable, false, reason);
  assert.ok(result.reasons.includes(reason));
}

const advisory = assessOwnerCoordination(
  evidence({
    provenance: "provisional-advisory",
    proposedConstraintProgress: 2,
  }),
);
assert.equal(advisory.mayRequestOwner, false);
assert.ok(
  advisory.reasons.includes("advisory-cannot-reserve-or-override-owner-demand"),
);

const incompleteCoverage = assessOwnerCoordination(
  evidence({ coverageComplete: false, proposedConstraintProgress: 2 }),
);
assert.equal(incompleteCoverage.mayRequestOwner, false);
assert.equal(incompleteCoverage.executable, false);
assert.equal(incompleteCoverage.physicalFeasibility, "supported");
assert.ok(incompleteCoverage.reasons.length > 0);
assert.ok(incompleteCoverage.reasons.includes("demand-coverage-unknown"));

const noGoalSignal = compareOwnerCoordination([]);
assert.deepEqual(noGoalSignal.preferredIds, []);
assert.equal(noGoalSignal.budgetExhausted, false);

const exhausted = compareOwnerCoordination(
  [
    evidence({ proposedConstraintProgress: 2 }),
    evidence({ requirementId: "2" }),
  ],
  1,
);
assert.equal(exhausted.budgetExhausted, true);
assert.deepEqual(exhausted.preferredIds, []);
assert.equal(exhausted.assessments[0].mayRequestOwner, false);
assert.ok(exhausted.assessments[0].reasons.includes("budget-exhausted"));

console.log("Owner coordination tests passed");
