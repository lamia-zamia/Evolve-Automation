import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  assessEconomicCrossOwnerDependencies,
  assessEconomicResourceCoordination,
  assessSustainableFoodMinimum,
  calculateNativeFarmerFood,
  compareSustainableJobsPlan,
} from "../../../src/domain/progression/economic-coordination.ts";
import { planJobs } from "../../../src/domain/civic/jobs.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const p38Jobs = JSON.parse(
  readFileSync(
    resolve(root, "experiments/p38-quarry-production-validation-jobs.json"),
    "utf8",
  ),
);
const p38Authority = JSON.parse(
  readFileSync(
    resolve(
      root,
      "experiments/p38-quarry-production-validation-authority.json",
    ),
    "utf8",
  ),
);
const p38HousingAction = p38Authority.arms
  .find((arm) => arm.arm === "B")
  .nativeActionOrder.filter(
    (entry) =>
      entry.period === 720 &&
      entry.elementId === "city-basic_housing" &&
      entry.method === "action",
  );
const p38TargetAt720 = p38Authority.arms
  .find((arm) => arm.arm === "B")
  .p38Events.filter(
    (event) => event.period === 720 && event.type === "authority-observed",
  )
  .at(-1);
const p38SnapshotId = "p38:B:p720:post-gather-purchase-window";

const foodFormula = Object.freeze({
  farmerImpact: 0.82,
  fullFarmBonus: 1.15,
  productionMultiplier: 1.2,
  modifierFingerprint: "standard-human-farm-1-agriculture-2",
  sourceEvidenceIds: Object.freeze([
    "pinned-game:evolve-deadspace.js:105580",
    "pinned-game:evolve-deadspace.js:150654-150678",
    "p37:matched-native-farmer-formula",
  ]),
});

function foodObservation(overrides = {}) {
  return Object.freeze({
    snapshotId: "p38:B:p688",
    period: 688,
    lineageId: "p38:B",
    validityEpoch: "p38-B-replay",
    modifierFingerprint: foodFormula.modifierFingerprint,
    population: 4,
    populationCapacity: 4,
    farmCount: 1,
    farmers: 4,
    foodOutput: 5.315999999999999,
    foodConsumption: 4,
    ...overrides,
  });
}

function jobsAssessmentInput(
  plannerInput,
  observation = foodObservation(),
  overrides = {},
) {
  return {
    snapshotId: observation.snapshotId,
    period: observation.period,
    lineageId: observation.lineageId,
    validityEpoch: observation.validityEpoch,
    ownerWorkCycles: {
      "native:ordinary-jobs": `p38:B:p${observation.period}:jobs`,
      "native:worker-commitment-registry": `${observation.snapshotId}:worker-commitments`,
      "automation:worker-commitment-registry": `${observation.snapshotId}:worker-commitments`,
    },
    plannerInput,
    plannerEvidence: {
      snapshotId: observation.snapshotId,
      period: observation.period,
      lineageId: observation.lineageId,
      validityEpoch: observation.validityEpoch,
      ownerId: "native:ordinary-jobs",
      workCycleId: `p38:B:p${observation.period}:jobs`,
      workCycleProvenance: "normalized-from-captured-period",
      evidenceId: "p38-captured-jobs-input",
      input: plannerInput,
    },
    foodObservation: observation,
    foodFormula,
    availabilityProvenance: "hypothetical",
    productionJobId: "quarry_worker",
    workerCommitments: {
      evidenceStatus: "complete",
      snapshotId: observation.snapshotId,
      period: observation.period,
      validityEpoch: observation.validityEpoch,
      lineageId: observation.lineageId,
      ownerId: "native:worker-commitment-registry",
      workCycleId: `${observation.snapshotId}:worker-commitments`,
      workCycleProvenance: "native-captured",
      evidenceId: "p38-single-native-jobs-owner-capture",
      minimumByJobId: {},
    },
    ...overrides,
    ...(overrides.workerCommitments === undefined
      ? {}
      : {
          workerCommitments: {
            evidenceStatus: "complete",
            snapshotId: observation.snapshotId,
            period: observation.period,
            validityEpoch: observation.validityEpoch,
            lineageId: observation.lineageId,
            ownerId: "native:worker-commitment-registry",
            workCycleId: `${observation.snapshotId}:worker-commitments`,
            workCycleProvenance: "native-captured",
            evidenceId: "p38-single-native-jobs-owner-capture",
            minimumByJobId: {},
            ...overrides.workerCommitments,
          },
        }),
  };
}

const p38Cycle = Object.freeze({
  ownerId: "automation:p38-test-gather",
  workCycleId: "p38:B:p720",
  workCycleProvenance: "normalized-from-captured-period",
  rootGeneration: p38TargetAt720.rootGeneration,
  progressionGeneration: p38TargetAt720.progressionGeneration,
  controlGeneration: p38TargetAt720.controlGeneration,
  evidenceId: "p38-quarry-authority-p720",
});
const constructionCycle = Object.freeze({
  ...p38Cycle,
  ownerId: "native:construction",
  evidenceId: "p38-native-construction-action-p720",
});
const resourceInput = Object.freeze({
  goal: {
    targetId: "city-rock_quarry",
    price: Object.freeze({ Lumber: 50, Stone: 10 }),
    priceComplete: true,
    provenance: Object.freeze({
      source: "economic-goal-graph",
      goalId: "economic:positive-stone-without-food-or-population-sacrifice",
      evidenceIds: Object.freeze([
        "p37-economic-goal-dependencies.json",
        "p38-quarry-production-validation-evidence.json",
      ]),
      playerSelected: false,
      executionAuthority: "none",
    }),
  },
  proposal: {
    owner: p38Cycle,
    snapshotId: p38SnapshotId,
    targetId: "city-rock_quarry",
    protectedAmounts: Object.freeze({ Lumber: 50, Stone: 10 }),
  },
  currentTarget: {
    owner: constructionCycle,
    snapshotId: p38SnapshotId,
    targetId: "city-rock_quarry",
    price: Object.freeze({ Lumber: 50, Stone: 10 }),
    priceComplete: true,
  },
  currentEpoch: {
    snapshotId: p38SnapshotId,
    snapshotProvenance: "normalized-from-captured-period",
    validityEpoch: "p38-B-p720-current-generations",
    lineageId: "p38:B",
    period: 720,
    rootGeneration: p38TargetAt720.rootGeneration,
    progressionGeneration: p38TargetAt720.progressionGeneration,
    controlGeneration: p38TargetAt720.controlGeneration,
    ownerWorkCycles: {
      [p38Cycle.ownerId]: p38Cycle.workCycleId,
      [constructionCycle.ownerId]: constructionCycle.workCycleId,
    },
  },
  stocks: {
    Lumber: {
      name: "Lumber",
      currentQuantity: 49,
      capacity: 500,
      snapshotId: p38SnapshotId,
      evidenceId: "p38-B-p720-lumber-stock",
    },
    Stone: {
      name: "Stone",
      currentQuantity: 10,
      capacity: 500,
      snapshotId: p38SnapshotId,
      evidenceId: "p38-B-p720-stone-stock",
    },
  },
  nativeQueues: { complete: true, snapshotId: p38SnapshotId, commitments: [] },
  competingAutomationClaims: {
    complete: true,
    snapshotId: p38SnapshotId,
    claims: [],
  },
  nextPurchase: {
    owner: constructionCycle,
    snapshotId: p38SnapshotId,
    targetId: "city-basic_housing",
    cost: Object.freeze({ Lumber: 22 }),
    independentlyObserved: true,
    evidenceId: "p38-B-p720-basic-housing-action-and-stock-delta",
  },
});

{
  assert.equal(p38HousingAction.length, 2);
  assert.equal(p38TargetAt720.targetId, "city-rock_quarry");
  assert.deepEqual(p38TargetAt720.price, { Lumber: 50, Stone: 10 });
  const result = assessEconomicResourceCoordination(resourceInput);
  assert.equal(result.status, "conflict");
  assert.equal(result.reservationValidity, "current");
  assert.equal(result.nextPurchaseConflict?.resourceId, "Lumber");
  assert.equal(
    result.nextPurchaseConflict?.targetName,
    "Proposed goal reserve: city-rock_quarry",
  );
  assert.equal(result.proposal?.provenance.playerSelected, false);
  assert.equal(result.executionAuthority, "none");
}

{
  const result = assessEconomicResourceCoordination({
    ...resourceInput,
    proposal: undefined,
  });
  assert.equal(result.status, "unreserved");
}

{
  const stale = {
    ...resourceInput,
    currentEpoch: {
      ...resourceInput.currentEpoch,
      rootGeneration: resourceInput.currentEpoch.rootGeneration + 1,
    },
  };
  const result = assessEconomicResourceCoordination(stale);
  assert.equal(result.status, "unavailable");
  assert.equal(result.reservationValidity, "invalid");
  assert.ok(result.invalidationConditions.includes("root-generation-changed"));
}

{
  const stale = {
    ...resourceInput,
    nextPurchase: {
      ...resourceInput.nextPurchase,
      snapshotId: "p38:B:p712",
    },
  };
  const result = assessEconomicResourceCoordination(stale);
  assert.equal(result.status, "unavailable");
  assert.equal(result.reservationValidity, "invalid");
  assert.ok(result.invalidationConditions.includes("source-snapshot-changed"));
}

{
  const missingOwnerCycle = {
    ...resourceInput,
    currentTarget: {
      ...resourceInput.currentTarget,
      owner: {
        ...resourceInput.currentTarget.owner,
        workCycleProvenance: undefined,
      },
    },
  };
  const result = assessEconomicResourceCoordination(missingOwnerCycle);
  assert.equal(result.status, "unavailable");
  assert.equal(result.reservationValidity, "invalid");
}

{
  const stale = {
    ...resourceInput,
    stocks: {
      ...resourceInput.stocks,
      Lumber: {
        ...resourceInput.stocks.Lumber,
        snapshotId: "p38:B:p712",
      },
    },
  };
  const result = assessEconomicResourceCoordination(stale);
  assert.equal(result.status, "unavailable");
  assert.equal(result.reservationValidity, "invalid");
}

{
  const result = assessEconomicResourceCoordination({
    ...resourceInput,
    competingAutomationClaims: {
      complete: false,
      snapshotId: p38SnapshotId,
      claims: [],
    },
  });
  assert.equal(result.status, "unavailable");
}

{
  const queueOwner = {
    ...constructionCycle,
    ownerId: "native:build-queue",
  };
  const automationOwner = {
    ...p38Cycle,
    ownerId: "automation:other-material-goal",
  };
  const result = assessEconomicResourceCoordination({
    ...resourceInput,
    currentEpoch: {
      ...resourceInput.currentEpoch,
      ownerWorkCycles: {
        ...resourceInput.currentEpoch.ownerWorkCycles,
        [queueOwner.ownerId]: queueOwner.workCycleId,
        [automationOwner.ownerId]: automationOwner.workCycleId,
      },
    },
    nativeQueues: {
      complete: true,
      snapshotId: p38SnapshotId,
      commitments: [
        {
          name: "Existing native queue item",
          cause: "Queue",
          cost: { Lumber: 30 },
          owner: queueOwner,
        },
      ],
    },
    competingAutomationClaims: {
      complete: true,
      snapshotId: p38SnapshotId,
      claims: [
        {
          name: "Other automation goal",
          cause: "Automation claim",
          cost: { Lumber: 28 },
          owner: automationOwner,
        },
      ],
    },
  });
  assert.equal(result.status, "conflict");
  assert.ok(
    result.nextPurchaseConflict?.targetNames.includes(
      "Existing native queue item",
    ),
  );
  assert.ok(
    result.nextPurchaseConflict?.targetNames.includes("Other automation goal"),
  );
  assert.ok(
    result.nextPurchaseConflict?.targetNames.includes(
      "Proposed goal reserve: city-rock_quarry",
    ),
  );
}

{
  const result = assessEconomicResourceCoordination({
    ...resourceInput,
    goal: {
      ...resourceInput.goal,
      provenance: { ...resourceInput.goal.provenance, evidenceIds: [] },
    },
  });
  assert.equal(result.status, "unavailable");
}

{
  const result = assessEconomicResourceCoordination({
    ...resourceInput,
    goal: {
      ...resourceInput.goal,
      provenance: { ...resourceInput.goal.provenance, playerSelected: true },
    },
  });
  assert.equal(result.status, "unavailable");
}

{
  const result = assessEconomicResourceCoordination({
    ...resourceInput,
    // This arbitrary object is not evidence of a supported native contract.
    supportedContract: {
      status: "independently-demonstrated",
      contractId: "construction-owner-contract-test-fixture",
      acceptedByOwnerId: constructionCycle.ownerId,
      targetId: "city-rock_quarry",
      protectedAmounts: { Lumber: 50, Stone: 10 },
      authority: constructionCycle,
      evidenceId: "explicit-supported-owner-contract-fixture",
      snapshotId: p38SnapshotId,
      checkedBeforePurchase: true,
    },
  });
  assert.equal(result.status, "conflict");
  assert.equal(result.executionAuthority, "none");
}

{
  const locked = compareSustainableJobsPlan(
    jobsAssessmentInput(p38Jobs.capturedP688Input, foodObservation(), {
      availabilityProvenance: "observed",
    }),
  );
  assert.equal(locked.status, "sustainable");
  assert.equal(locked.productiveJob.availabilityProvenance, "unavailable");
  assert.equal(locked.productiveJob.currentWorkers, null);
  assert.equal(locked.food.minimumFarmers, 3);
  assert.equal(
    locked.ordinaryProposal?.assignments.find(
      (assignment) =>
        assignment.jobToken === p38Jobs.capturedP688Input.farmerToken,
    )?.workers,
    4,
  );
}

{
  const input = jobsAssessmentInput(p38Jobs.hypotheticalUnlockedInput);
  const result = compareSustainableJobsPlan(input);
  const assignments = new Map(
    result.ordinaryProposal?.assignments.map((assignment) => [
      assignment.jobToken,
      assignment.workers,
    ]),
  );
  assert.equal(result.status, "conflict");
  assert.equal(result.food.minimumFarmers, 3);
  assert.equal(
    assignments.get(p38Jobs.hypotheticalUnlockedInput.farmerToken),
    2,
  );
  assert.equal(
    assignments.get(p38Jobs.hypotheticalUnlockedInput.quarryToken),
    2,
  );
  assert.ok(Math.abs((result.ordinaryFood?.foodOutput ?? 0) - 3.348) < 1e-9);
  assert.ok(Math.abs((result.ordinaryFood?.netFood ?? 0) + 0.652) < 1e-9);
  assert.equal(result.constrainedAlternative?.status, "feasible");
  assert.equal(
    result.constrainedAlternative?.availabilityProvenance,
    "hypothetical",
  );
  assert.deepEqual(
    result.constrainedAlternative?.changedAssignments.map((assignment) => [
      assignment.jobToken,
      assignment.workers,
    ]),
    [
      [p38Jobs.hypotheticalUnlockedInput.farmerToken, 3],
      [p38Jobs.hypotheticalUnlockedInput.quarryToken, 1],
    ],
  );
  assert.equal(result.constrainedAlternative?.exceedsFarmerSmartMaximum, true);
  assert.equal(result.constrainedAlternative?.workerCommitmentsPreserved, true);
  assert.equal(
    result.constrainedAlternative?.decision?.assignments.reduce(
      (total, assignment) => total + assignment.workers + assignment.servants,
      0,
    ),
    4,
  );
  assert.equal(result.executionAuthority, "none");

  const conditionalCommitments = compareSustainableJobsPlan(
    jobsAssessmentInput(p38Jobs.hypotheticalUnlockedInput, foodObservation(), {
      workerCommitments: {
        evidenceStatus: "assumed-empty",
        snapshotId: "p38:B:p688",
        period: 688,
        validityEpoch: "p38-B-replay",
        lineageId: "p38:B",
        ownerId: "automation:worker-commitment-registry",
        workCycleId: "p38:B:p688:worker-commitments",
        workCycleProvenance: "normalized-from-captured-period",
        evidenceId: "separate-worker-commitment-registry-not-captured",
        minimumByJobId: {},
      },
    }),
  );
  assert.equal(
    conditionalCommitments.constrainedAlternative?.status,
    "conditional",
  );
  assert.equal(
    conditionalCommitments.constrainedAlternative?.workerCommitmentsPreserved,
    false,
  );
  assert.equal(
    conditionalCommitments.constrainedAlternative
      ?.workerCommitmentsEvidenceStatus,
    "assumed-empty",
  );
}

{
  const fiveResidentObservation = foodObservation({
    snapshotId: "p38:B:p10000",
    period: 10000,
    population: 5,
    populationCapacity: 5,
    farmers: 5,
    foodOutput: 6.3,
    foodConsumption: 5,
  });
  const result = assessSustainableFoodMinimum(
    fiveResidentObservation,
    foodFormula,
    2,
  );
  assert.equal(result.status, "feasible");
  assert.equal(result.minimumFarmers, 4);
  assert.ok(
    Math.abs(calculateNativeFarmerFood(foodFormula, 1, 3) - 4.332) < 1e-9,
  );
  assert.ok(
    Math.abs(calculateNativeFarmerFood(foodFormula, 1, 4) - 5.316) < 1e-9,
  );

  const fiveResidentJobsInput = structuredClone(
    p38Jobs.hypotheticalUnlockedInput,
  );
  fiveResidentJobsInput.population = 5;
  const farmer = fiveResidentJobsInput.jobs.find(
    (job) => job.kind === "farmer",
  );
  farmer.workers = 5;
  farmer.count = 5;
  const jobsResult = compareSustainableJobsPlan(
    jobsAssessmentInput(fiveResidentJobsInput, fiveResidentObservation),
  );
  const ordinary = new Map(
    jobsResult.ordinaryProposal?.assignments.map((assignment) => [
      assignment.jobToken,
      assignment.workers,
    ]),
  );
  const alternative = new Map(
    jobsResult.constrainedAlternative?.decision?.assignments.map(
      (assignment) => [assignment.jobToken, assignment.workers],
    ),
  );
  assert.equal(jobsResult.food.minimumFarmers, 4);
  assert.equal(jobsResult.status, "conflict");
  assert.equal(ordinary.get(fiveResidentJobsInput.farmerToken), 2);
  assert.equal(ordinary.get(fiveResidentJobsInput.quarryToken), 3);
  assert.equal(alternative.get(fiveResidentJobsInput.farmerToken), 4);
  assert.equal(alternative.get(fiveResidentJobsInput.quarryToken), 1);
}

{
  const changedConsumption = assessSustainableFoodMinimum(
    foodObservation({ foodConsumption: 4.5 }),
    foodFormula,
    2,
  );
  assert.equal(changedConsumption.minimumFarmers, 4);
  const changedFormula = {
    ...foodFormula,
    productionMultiplier: 1,
    modifierFingerprint: "standard-human-farm-1-agriculture-2-modified",
  };
  const changedModifiers = assessSustainableFoodMinimum(
    foodObservation({
      foodOutput: calculateNativeFarmerFood(changedFormula, 1, 4),
      modifierFingerprint: changedFormula.modifierFingerprint,
    }),
    changedFormula,
    2,
  );
  assert.equal(changedModifiers.minimumFarmers, 4);
  const missingProduction = assessSustainableFoodMinimum(
    foodObservation({ foodOutput: Number.NaN }),
    foodFormula,
    2,
  );
  const missingProductionField = assessSustainableFoodMinimum(
    foodObservation({ foodOutput: undefined }),
    foodFormula,
    2,
  );
  const missingValidityEpoch = assessSustainableFoodMinimum(
    foodObservation({ validityEpoch: undefined }),
    foodFormula,
    2,
  );
  assert.equal(missingProduction.status, "unavailable");
  assert.equal(missingProductionField.status, "unavailable");
  assert.equal(missingValidityEpoch.status, "unavailable");
  assert.equal(
    assessSustainableFoodMinimum(
      foodObservation(),
      { ...foodFormula, sourceEvidenceIds: [""] },
      2,
    ).status,
    "unavailable",
  );
}

{
  const staleFood = compareSustainableJobsPlan(
    jobsAssessmentInput(
      p38Jobs.hypotheticalUnlockedInput,
      foodObservation({ snapshotId: "stale-food-sample" }),
      { snapshotId: "p38:B:p688" },
    ),
  );
  const missingControls = compareSustainableJobsPlan(
    jobsAssessmentInput(p38Jobs.hypotheticalUnlockedInput, foodObservation(), {
      availabilityProvenance: "unavailable",
    }),
  );
  const incompleteCommitments = compareSustainableJobsPlan(
    jobsAssessmentInput(p38Jobs.hypotheticalUnlockedInput, foodObservation(), {
      workerCommitments: {
        evidenceStatus: "unavailable",
        evidenceId: "",
        minimumByJobId: {},
      },
    }),
  );
  const completeCommitmentInput = jobsAssessmentInput(
    p38Jobs.hypotheticalUnlockedInput,
  );
  const staleCommitments = compareSustainableJobsPlan({
    ...completeCommitmentInput,
    workerCommitments: {
      ...completeCommitmentInput.workerCommitments,
      validityEpoch: "stale-worker-commitments",
    },
  });
  const staleCommitmentCycle = compareSustainableJobsPlan({
    ...completeCommitmentInput,
    workerCommitments: {
      ...completeCommitmentInput.workerCommitments,
      workCycleId: "older-worker-commitment-cycle",
    },
  });
  const stalePlannerInput = jobsAssessmentInput(
    p38Jobs.hypotheticalUnlockedInput,
  );
  const plannerEvidenceMismatch = compareSustainableJobsPlan({
    ...stalePlannerInput,
    plannerEvidence: {
      ...stalePlannerInput.plannerEvidence,
      input: p38Jobs.capturedP688Input,
    },
  });
  const populationMismatch = compareSustainableJobsPlan(
    jobsAssessmentInput(
      p38Jobs.hypotheticalUnlockedInput,
      foodObservation({ population: 5 }),
    ),
  );
  assert.equal(staleFood.status, "unavailable");
  assert.equal(missingControls.constrainedAlternative?.status, "unavailable");
  assert.equal(incompleteCommitments.status, "unavailable");
  assert.equal(staleCommitments.status, "unavailable");
  assert.equal(staleCommitmentCycle.status, "unavailable");
  assert.equal(plannerEvidenceMismatch.status, "unavailable");
  assert.equal(populationMismatch.status, "unavailable");
  const farmerMismatchInput = structuredClone(p38Jobs.capturedP688Input);
  const capturedFarmer = farmerMismatchInput.jobs.find(
    (job) => job.kind === "farmer",
  );
  capturedFarmer.workers = 3;
  capturedFarmer.count = 3;
  assert.equal(
    compareSustainableJobsPlan(jobsAssessmentInput(farmerMismatchInput)).status,
    "unavailable",
  );
}

{
  const capacityLimited = structuredClone(p38Jobs.hypotheticalUnlockedInput);
  capacityLimited.jobs.find((job) => job.kind === "farmer").maximum = 2;
  const capacityResult = compareSustainableJobsPlan(
    jobsAssessmentInput(capacityLimited),
  );
  assert.equal(capacityResult.status, "conflict");
  assert.equal(capacityResult.constrainedAlternative?.status, "unavailable");

  const alreadySustainableCommitment = compareSustainableJobsPlan(
    jobsAssessmentInput(p38Jobs.capturedP688Input, foodObservation(), {
      availabilityProvenance: "observed",
      workerCommitments: {
        evidenceStatus: "complete",
        evidenceId: "farmer-floor-exceeds-current-assignment",
        minimumByJobId: { farmer: 5 },
      },
    }),
  );
  assert.equal(alreadySustainableCommitment.status, "unavailable");

  const commitmentBlocked = compareSustainableJobsPlan(
    jobsAssessmentInput(p38Jobs.hypotheticalUnlockedInput, foodObservation(), {
      workerCommitments: {
        evidenceStatus: "complete",
        evidenceId: "native-quarry-worker-commitment",
        minimumByJobId: { quarry_worker: 2 },
      },
    }),
  );
  assert.equal(commitmentBlocked.constrainedAlternative?.status, "unavailable");

  const defaultFloorInput = structuredClone(p38Jobs.hypotheticalUnlockedInput);
  const quarry = defaultFloorInput.jobs.find(
    (job) => job.id === "quarry_worker",
  );
  defaultFloorInput.defaultJobToken = quarry.token;
  defaultFloorInput.minimumDefault = 2;
  const defaultFloor = compareSustainableJobsPlan(
    jobsAssessmentInput(defaultFloorInput),
  );
  assert.equal(defaultFloor.status, "conflict");
  assert.equal(defaultFloor.constrainedAlternative?.status, "unavailable");
}

{
  const lockedServantInput = structuredClone(p38Jobs.hypotheticalUnlockedInput);
  lockedServantInput.population = 5;
  lockedServantInput.servantsMaximum = 1;
  lockedServantInput.servantModifier = 2;
  const farmer = lockedServantInput.jobs.find((job) => job.kind === "farmer");
  farmer.workers = 5;
  farmer.count = 5;
  const quarry = lockedServantInput.jobs.find(
    (job) => job.id === "quarry_worker",
  );
  quarry.serves = true;
  quarry.unlocked = false;
  quarry.maximum = 3;
  const ordinary = planJobs(lockedServantInput);
  assert.ok(
    (ordinary?.assignments.find(
      (assignment) => assignment.jobToken === quarry.token,
    )?.servants ?? 0) > 0,
  );
  const result = compareSustainableJobsPlan(
    jobsAssessmentInput(
      lockedServantInput,
      foodObservation({
        snapshotId: "p38:B:p10000",
        period: 10000,
        population: 5,
        populationCapacity: 5,
        farmers: 5,
        foodOutput: 6.3,
        foodConsumption: 5,
      }),
    ),
  );
  assert.equal(result.status, "unavailable");
}

{
  const hypotheticalJobs = compareSustainableJobsPlan(
    jobsAssessmentInput(p38Jobs.hypotheticalUnlockedInput),
  );
  const dependencyInput = {
    lineageId: "p38:B",
    materialAcquisition: {
      status: "observed",
      evidenceId: "p38-test-only-quarry-lumber-gather-18",
      snapshotId: p38SnapshotId,
      validityEpoch: resourceInput.currentEpoch.validityEpoch,
      testOnly: true,
      targetId: "city-rock_quarry",
      lineageId: "p38:B",
      period: 720,
    },
    resourceCoordination: resourceInput,
    constructionOffer: {
      offerObserved: true,
      completePriceObserved: true,
      purchaseAuthorityObserved: false,
      evidenceId: "p38-B-native-quarry-current-target-p720",
      snapshotId: p38SnapshotId,
      validityEpoch: resourceInput.currentEpoch.validityEpoch,
      lineageId: "p38:B",
      period: 720,
      targetId: "city-rock_quarry",
    },
    housingPopulation: {
      snapshotId: "p38:B:p688",
      lineageId: "p38:B",
      period: 688,
      validityEpoch: "p38-B-replay",
      evidenceId: "p38-B-native-state-p688",
      population: 4,
      capacity: 4,
      retainAllResidents: true,
    },
    jobs: hypotheticalJobs,
    stoneProduction: {
      snapshotId: "p38:B:p10000",
      lineageId: "p38:B",
      period: 10000,
      validityEpoch: "p38-B-replay",
      provenance: "native-observation",
      evidenceId: "native-state-B-p10000",
      amountPerTick: 0,
    },
    goalGraph: {
      snapshotId: "p38:B:p10000",
      lineageId: "p38:B",
      period: 10000,
      validityEpoch: "p38-B-replay",
      objectiveStatus: "unavailable",
      positiveStoneStatus: "unsatisfied",
      evidenceId: "p38-production-B-p10000-economic-goal-graph",
    },
  };
  const dependencies = assessEconomicCrossOwnerDependencies(dependencyInput);
  assert.equal(
    dependencies.requirements.authorizedMaterialAcquisition.status,
    "provisional",
  );
  assert.equal(
    dependencies.requirements.compatibleResourceCommitment.status,
    "blocked",
  );
  assert.equal(
    dependencies.requirements.currentQuarryOfferAndPurchaseAuthority.status,
    "provisional",
  );
  assert.equal(
    dependencies.requirements.sufficientHousingAndPopulation.status,
    "observed",
  );
  assert.equal(
    dependencies.requirements.sustainableJobsAssignment.status,
    "provisional",
  );
  assert.equal(
    dependencies.requirements.positiveStoneProductionObserved.status,
    "blocked",
  );
  assert.equal(dependencies.objectiveStatus, "unavailable");
  assert.equal(
    dependencies.firstMissingCapability,
    "Construction coordination",
  );
  assert.equal(dependencies.executionAuthority, "none");
  assert.equal(
    assessEconomicResourceCoordination(resourceInput).snapshotProvenance,
    "normalized-from-captured-period",
  );
  const lockedDependency = assessEconomicCrossOwnerDependencies({
    ...dependencyInput,
    jobs: compareSustainableJobsPlan(
      jobsAssessmentInput(p38Jobs.capturedP688Input, foodObservation(), {
        availabilityProvenance: "observed",
      }),
    ),
  });
  assert.equal(
    lockedDependency.requirements.sustainableJobsAssignment.status,
    "unavailable",
  );
  const hypotheticalStone = assessEconomicCrossOwnerDependencies({
    ...dependencyInput,
    stoneProduction: {
      ...dependencyInput.stoneProduction,
      amountPerTick: 0.25,
      provenance: "hypothetical",
    },
    goalGraph: {
      ...dependencyInput.goalGraph,
      objectiveStatus: "unsatisfied",
      positiveStoneStatus: "unsatisfied",
    },
  });
  assert.equal(
    hypotheticalStone.requirements.positiveStoneProductionObserved.status,
    "provisional",
  );
  assert.equal(hypotheticalStone.objectiveStatus, "unsatisfied");

  const emptyProvenance = assessEconomicResourceCoordination({
    ...resourceInput,
    goal: {
      ...resourceInput.goal,
      provenance: {
        ...resourceInput.goal.provenance,
        evidenceIds: [""],
      },
    },
  });
  assert.equal(emptyProvenance.status, "unavailable");

  const mismatchedLineage = assessEconomicCrossOwnerDependencies({
    ...dependencyInput,
    stoneProduction: {
      ...dependencyInput.stoneProduction,
      lineageId: "other-run",
      amountPerTick: 0.25,
    },
  });
  assert.equal(
    mismatchedLineage.requirements.positiveStoneProductionObserved.status,
    "unavailable",
  );
  const mismatchedAcquisition = assessEconomicCrossOwnerDependencies({
    ...dependencyInput,
    materialAcquisition: {
      ...dependencyInput.materialAcquisition,
      snapshotId: "another-snapshot",
    },
  });
  assert.equal(
    mismatchedAcquisition.requirements.authorizedMaterialAcquisition.status,
    "unavailable",
  );
  const mismatchedOfferTarget = assessEconomicCrossOwnerDependencies({
    ...dependencyInput,
    constructionOffer: {
      ...dependencyInput.constructionOffer,
      targetId: "city-basic_housing",
    },
  });
  assert.equal(
    mismatchedOfferTarget.requirements.currentQuarryOfferAndPurchaseAuthority
      .status,
    "unavailable",
  );
  const staleHousingJoin = assessEconomicCrossOwnerDependencies({
    ...dependencyInput,
    housingPopulation: {
      ...dependencyInput.housingPopulation,
      snapshotId: "stale-housing-snapshot",
    },
  });
  assert.equal(
    staleHousingJoin.requirements.sufficientHousingAndPopulation.status,
    "unavailable",
  );
  const staleGoalGraphJoin = assessEconomicCrossOwnerDependencies({
    ...dependencyInput,
    goalGraph: {
      ...dependencyInput.goalGraph,
      validityEpoch: "stale-epoch",
    },
  });
  assert.equal(
    staleGoalGraphJoin.requirements.positiveStoneProductionObserved.status,
    "unavailable",
  );
}

console.log("Economic coordination diagnostic tests passed");
