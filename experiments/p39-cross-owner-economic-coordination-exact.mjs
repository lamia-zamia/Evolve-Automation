import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { performance as monotonicPerformance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessEconomicCrossOwnerDependencies,
  assessEconomicResourceCoordination,
  calculateNativeFarmerFood,
  compareSustainableJobsPlan,
} from "../src/domain/progression/economic-coordination.ts";
import { planJobs } from "../src/domain/civic/jobs.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePaths = Object.freeze({
  p37Graph: "experiments/p37-economic-goal-dependencies.json",
  p38Exact: "experiments/p38-quarry-production-validation-evidence.json",
  p38Jobs: "experiments/p38-quarry-production-validation-jobs.json",
  p38Authority: "experiments/p38-quarry-production-validation-authority.json",
  p38Production: "experiments/p38-quarry-production-validation-production.json",
});
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const p37 = readJson(evidencePaths.p37Graph);
const p38Exact = readJson(evidencePaths.p38Exact);
const p38Jobs = readJson(evidencePaths.p38Jobs);
const p38Authority = readJson(evidencePaths.p38Authority);
const p38Production = readJson(evidencePaths.p38Production);

const p38Arm = p38Exact.arms.find((arm) => arm.arm === "B");
const p688 = p38Arm?.checkpoints.find(
  (checkpoint) => checkpoint.period === 688,
);
const p10000 = p38Arm?.checkpoints.find(
  (checkpoint) => checkpoint.period === 10000,
);
const authorityArm = p38Authority.arms.find((arm) => arm.arm === "B");
const p720Authority = authorityArm?.p38Events.find(
  (event) =>
    event.type === "authority-observed" &&
    event.period === 720 &&
    event.targetId === "city-rock_quarry",
);
const p720GatherEvents = authorityArm?.gatherActions.filter(
  (event) => event.type === "gather-click" && event.period === 720,
);
const p728Stop = authorityArm?.p38Events.find(
  (event) => event.type === "p38-stopped" && event.period === 728,
);
const p720HousingActions = authorityArm?.nativeActionOrder.filter(
  (entry) =>
    entry.period === 720 &&
    entry.elementId === "city-basic_housing" &&
    entry.method === "action",
);
const p720HousingCount = p688?.state.buildings.basic_housing ?? 0;
const p10000Graph = p38Production.graphAnalyzer?.B?.graph;
const p10000GraphState = p38Production.graphAnalyzer?.B?.input?.state;
assert.ok(
  p688 &&
    p10000 &&
    p720Authority &&
    p728Stop &&
    p10000Graph &&
    p10000GraphState,
);
assert.equal(p720HousingActions?.length, 2);
assert.equal(p720GatherEvents?.length, 2);
assert.equal(p720Authority.currentSavingTargetMatchesPublication, true);
assert.equal(p720Authority.targetId, "city-rock_quarry");
assert.equal(p720Authority.queuesEmpty, true);
assert.equal(p720Authority.competingClaims, false);
assert.equal(p728Stop.currentStock.Lumber, 27);
assert.equal(p728Stop.expectedStock.Lumber, 49);
assert.equal(p688.state.resources.Lumber.amount, 32);
assert.equal(p688.state.buildings.basic_housing, 4);
assert.equal(p10000.state.populationCapacity, 5);
assert.equal(p10000.production.stoneOutput, 0);
assert.equal(
  p37.graph.objective.id,
  p10000Graph.objective.id,
  "P38 must retain P37's economic objective identity",
);

const p720StockAfterGather = p720GatherEvents.at(-1).afterStock;
const housingLumberDelta =
  p728Stop.expectedStock.Lumber - p728Stop.currentStock.Lumber;
assert.equal(p720StockAfterGather.Lumber, 49);
assert.equal(housingLumberDelta, 22);
assert.equal(
  p10000Graph.goals.find(
    (goal) => goal.id === "economic:positive-stone-production",
  )?.status,
  "unsatisfied",
);
assert.equal(p10000Graph.objective.status, "unavailable");

const snapshotId = "p38:B:p720:post-gather-purchase-window";
const resourceValidityEpoch = "p38-B-p720-current-generations";
const proposalOwner = Object.freeze({
  ownerId: "automation:p38-test-gather",
  workCycleId: "p38:B:p720",
  workCycleProvenance: "normalized-from-captured-period",
  rootGeneration: p720Authority.rootGeneration,
  progressionGeneration: p720Authority.progressionGeneration,
  controlGeneration: p720Authority.controlGeneration,
  evidenceId: "p38-quarry-gather-authority-p720",
});
const constructionOwner = Object.freeze({
  ...proposalOwner,
  ownerId: "native:construction",
  evidenceId: "p38-native-construction-action-p720",
});
const resourceInput = Object.freeze({
  goal: Object.freeze({
    targetId: "city-rock_quarry",
    price: Object.freeze({ ...p720Authority.price }),
    priceComplete: true,
    provenance: Object.freeze({
      source: "economic-goal-graph",
      goalId: p37.graph.objective.id,
      evidenceIds: Object.freeze([
        evidencePaths.p37Graph,
        evidencePaths.p38Exact,
        evidencePaths.p38Production,
      ]),
      playerSelected: false,
      executionAuthority: "none",
    }),
  }),
  proposal: Object.freeze({
    owner: proposalOwner,
    snapshotId,
    targetId: "city-rock_quarry",
    protectedAmounts: Object.freeze({ ...p720Authority.price }),
  }),
  currentTarget: Object.freeze({
    owner: constructionOwner,
    snapshotId,
    targetId: p720Authority.targetId,
    price: Object.freeze({ ...p720Authority.price }),
    priceComplete: true,
  }),
  currentEpoch: Object.freeze({
    snapshotId,
    snapshotProvenance: "normalized-from-captured-period",
    validityEpoch: resourceValidityEpoch,
    lineageId: "p38:B",
    period: 720,
    rootGeneration: p720Authority.rootGeneration,
    progressionGeneration: p720Authority.progressionGeneration,
    controlGeneration: p720Authority.controlGeneration,
    ownerWorkCycles: Object.freeze({
      [proposalOwner.ownerId]: proposalOwner.workCycleId,
      [constructionOwner.ownerId]: constructionOwner.workCycleId,
    }),
  }),
  stocks: Object.freeze({
    Lumber: Object.freeze({
      name: "Lumber",
      currentQuantity: p720StockAfterGather.Lumber,
      capacity:
        p720Authority.stock.Lumber + p720Authority.obtainableCapacity.Lumber,
      snapshotId,
      evidenceId: "p38-B-p720-gather-stock-and-obtainable-capacity",
    }),
    Stone: Object.freeze({
      name: "Stone",
      currentQuantity: p720StockAfterGather.Stone,
      capacity:
        p720Authority.stock.Stone + p720Authority.obtainableCapacity.Stone,
      snapshotId,
      evidenceId: "p38-B-p720-stone-stock-and-obtainable-capacity",
    }),
  }),
  nativeQueues: Object.freeze({
    complete: p720Authority.queuesEmpty === true,
    snapshotId,
    commitments: Object.freeze([]),
  }),
  competingAutomationClaims: Object.freeze({
    complete: p720Authority.competingClaims === false,
    snapshotId,
    claims: Object.freeze([]),
  }),
  nextPurchase: Object.freeze({
    owner: constructionOwner,
    snapshotId,
    targetId: "city-basic_housing",
    cost: Object.freeze({ Lumber: housingLumberDelta }),
    independentlyObserved: true,
    evidenceId: "p38-B-p720-housing-action-p728-stock-delta",
  }),
});

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
const fourResidentFood = Object.freeze({
  snapshotId: "p38:B:p688",
  period: 688,
  lineageId: "p38:B",
  validityEpoch: "p38-B-native-checkpoint-688",
  modifierFingerprint: foodFormula.modifierFingerprint,
  population: p688.state.population,
  populationCapacity: p688.state.populationCapacity,
  farmCount: p688.state.buildings.farm,
  farmers: p688.state.jobs.farmer,
  foodOutput: p688.production.foodOutput,
  foodConsumption: p688.production.foodConsumption,
});
const fiveResidentFood = Object.freeze({
  snapshotId: p10000GraphState.snapshotId,
  period: 10000,
  lineageId: "p38:B",
  validityEpoch: p10000GraphState.validityEpoch,
  modifierFingerprint: foodFormula.modifierFingerprint,
  population: p10000.state.population,
  populationCapacity: p10000.state.populationCapacity,
  farmCount: p10000.state.buildings.farm,
  farmers: p10000.state.jobs.farmer,
  foodOutput: p10000.production.foodOutput,
  foodConsumption: p10000.production.foodConsumption,
});

const capturedJobsInput = p688.jobsInput;
assert.deepEqual(capturedJobsInput, p38Jobs.capturedP688Input);
assert.deepEqual(
  planJobs(capturedJobsInput)?.assignments.map((assignment) => [
    assignment.jobToken,
    assignment.workers,
  ]),
  p38Jobs.capturedP688Planner.decision.assignments.map((assignment) => [
    assignment.jobToken,
    assignment.workers,
  ]),
);
assert.deepEqual(
  planJobs(p38Jobs.hypotheticalUnlockedInput)?.assignments.map((assignment) => [
    assignment.jobToken,
    assignment.workers,
  ]),
  p38Jobs.hypotheticalUnlockedPlanner.decision.assignments.map((assignment) => [
    assignment.jobToken,
    assignment.workers,
  ]),
);

const plannerEvidence = (input, observation, provenance) =>
  Object.freeze({
    snapshotId: observation.snapshotId,
    period: observation.period,
    lineageId: observation.lineageId,
    validityEpoch: observation.validityEpoch,
    ownerId: "native:ordinary-jobs",
    workCycleId: `${observation.snapshotId}:ordinary-jobs`,
    workCycleProvenance: "normalized-from-captured-period",
    evidenceId: provenance,
    input,
  });
const jobsInput = (plannerInput, observation, availabilityProvenance) =>
  Object.freeze({
    snapshotId: observation.snapshotId,
    period: observation.period,
    lineageId: observation.lineageId,
    validityEpoch: observation.validityEpoch,
    ownerWorkCycles: Object.freeze({
      "native:ordinary-jobs": `${observation.snapshotId}:ordinary-jobs`,
      "automation:worker-commitment-registry": `${observation.snapshotId}:worker-commitments-not-captured`,
    }),
    plannerInput,
    plannerEvidence: plannerEvidence(
      plannerInput,
      observation,
      `p38-jobs-input:${observation.period}`,
    ),
    foodObservation: observation,
    foodFormula,
    availabilityProvenance,
    productionJobId: "quarry_worker",
    workerCommitments: Object.freeze({
      evidenceStatus: "assumed-empty",
      snapshotId: observation.snapshotId,
      period: observation.period,
      validityEpoch: observation.validityEpoch,
      lineageId: observation.lineageId,
      ownerId: "automation:worker-commitment-registry",
      workCycleId: `${observation.snapshotId}:worker-commitments-not-captured`,
      workCycleProvenance: "normalized-from-captured-period",
      evidenceId: `p38-separate-worker-commitment-registry-not-captured:${observation.period}`,
      minimumByJobId: Object.freeze({}),
    }),
  });
const hypotheticalFourJobsInput = jobsInput(
  p38Jobs.hypotheticalUnlockedInput,
  fourResidentFood,
  "hypothetical",
);
const lockedJobs = compareSustainableJobsPlan(
  jobsInput(capturedJobsInput, fourResidentFood, "observed"),
);
const hypotheticalFourJobs = compareSustainableJobsPlan(
  hypotheticalFourJobsInput,
);
const fiveResidentHypotheticalInput = structuredClone(
  p38Jobs.hypotheticalUnlockedInput,
);
fiveResidentHypotheticalInput.population = 5;
const fiveResidentFarmer = fiveResidentHypotheticalInput.jobs.find(
  (job) => job.kind === "farmer",
);
fiveResidentFarmer.workers = 5;
fiveResidentFarmer.count = 5;
const hypotheticalFiveJobsInput = jobsInput(
  fiveResidentHypotheticalInput,
  fiveResidentFood,
  "hypothetical",
);
const hypotheticalFiveJobs = compareSustainableJobsPlan(
  hypotheticalFiveJobsInput,
);
assert.equal(lockedJobs.status, "sustainable");
assert.equal(hypotheticalFourJobs.status, "conflict");
assert.equal(hypotheticalFiveJobs.status, "conflict");
assert.equal(hypotheticalFourJobs.food.minimumFarmers, 3);
assert.equal(hypotheticalFiveJobs.food.minimumFarmers, 4);
assert.equal(
  hypotheticalFourJobs.constrainedAlternative?.status,
  "conditional",
);
assert.equal(
  hypotheticalFiveJobs.constrainedAlternative?.status,
  "conditional",
);

const resourceAssessment = assessEconomicResourceCoordination(resourceInput);
assert.equal(resourceAssessment.status, "conflict");
assert.equal(resourceAssessment.nextPurchaseConflict?.resourceId, "Lumber");
assert.equal(
  resourceAssessment.nextPurchaseConflict?.targetName,
  "Proposed goal reserve: city-rock_quarry",
);
const dependencyAssessment = assessEconomicCrossOwnerDependencies({
  lineageId: "p38:B",
  materialAcquisition: Object.freeze({
    status: "observed",
    evidenceId: p720Authority.authorizationId,
    snapshotId,
    validityEpoch: resourceValidityEpoch,
    testOnly: true,
    targetId: "city-rock_quarry",
    lineageId: "p38:B",
    period: 720,
  }),
  resourceCoordination: resourceInput,
  constructionOffer: Object.freeze({
    offerObserved: true,
    completePriceObserved: true,
    purchaseAuthorityObserved: false,
    evidenceId: "p38-B-native-quarry-current-target-p720",
    snapshotId,
    validityEpoch: resourceValidityEpoch,
    lineageId: "p38:B",
    period: 720,
    targetId: "city-rock_quarry",
  }),
  housingPopulation: Object.freeze({
    snapshotId: fourResidentFood.snapshotId,
    lineageId: "p38:B",
    period: fourResidentFood.period,
    validityEpoch: fourResidentFood.validityEpoch,
    evidenceId: "native-state-B-p688",
    population: fourResidentFood.population,
    capacity: fourResidentFood.populationCapacity,
    retainAllResidents: true,
  }),
  jobs: hypotheticalFourJobs,
  stoneProduction: Object.freeze({
    snapshotId: p10000GraphState.snapshotId,
    lineageId: "p38:B",
    period: 10000,
    validityEpoch: p10000GraphState.validityEpoch,
    provenance: "native-observation",
    evidenceId: "native-state-B-p10000",
    amountPerTick: p10000.production.stoneOutput,
  }),
  goalGraph: Object.freeze({
    snapshotId: p10000GraphState.snapshotId,
    lineageId: "p38:B",
    period: 10000,
    validityEpoch: p10000GraphState.validityEpoch,
    objectiveStatus: p10000Graph.objective.status,
    positiveStoneStatus: p10000Graph.goals.find(
      (goal) => goal.id === "economic:positive-stone-production",
    ).status,
    evidenceId: evidencePaths.p38Production,
  }),
});
assert.equal(
  dependencyAssessment.firstMissingCapability,
  "Construction coordination",
);
assert.equal(
  dependencyAssessment.requirements.sufficientHousingAndPopulation.status,
  "observed",
);
assert.equal(
  dependencyAssessment.requirements.sustainableJobsAssignment.status,
  "provisional",
);
assert.equal(
  dependencyAssessment.requirements.positiveStoneProductionObserved.status,
  "blocked",
);
assert.equal(dependencyAssessment.objectiveStatus, "unavailable");

const normalizedInput = Object.freeze({
  pinnedGame: p38Exact.pinnedGame,
  sourceFiles: evidencePaths,
  resourceInput,
  p688: Object.freeze({
    snapshotId: fourResidentFood.snapshotId,
    period: fourResidentFood.period,
    population: fourResidentFood.population,
    capacity: fourResidentFood.populationCapacity,
    farmers: fourResidentFood.farmers,
    farmCount: fourResidentFood.farmCount,
    foodOutput: fourResidentFood.foodOutput,
    foodConsumption: fourResidentFood.foodConsumption,
    capturedJobsInput,
  }),
  hypotheticalFourResidents: Object.freeze({
    plannerInput: p38Jobs.hypotheticalUnlockedInput,
    coordinatorInput: hypotheticalFourJobsInput,
    foodObservation: fourResidentFood,
    availability: "hypothetical unlocked Quarry Worker catalog row",
  }),
  hypotheticalFiveResidents: Object.freeze({
    plannerInput: fiveResidentHypotheticalInput,
    coordinatorInput: hypotheticalFiveJobsInput,
    foodObservation: fiveResidentFood,
    availability: "hypothetical unlocked Quarry Worker catalog row",
  }),
  p10000Observed: Object.freeze({
    snapshotId: p10000GraphState.snapshotId,
    period: p10000.period,
    population: p10000.state.population,
    capacity: p10000.state.populationCapacity,
    farmers: p10000.state.jobs.farmer,
    foodOutput: p10000.production.foodOutput,
    foodConsumption: p10000.production.foodConsumption,
    stoneOutput: p10000.production.stoneOutput,
    housing: p10000.state.buildings.basic_housing,
  }),
  p10000GoalGraph: Object.freeze({
    snapshotId: p10000GraphState.snapshotId,
    validityEpoch: p10000GraphState.validityEpoch,
    objectiveStatus: p10000Graph.objective.status,
    positiveStoneStatus: p10000Graph.goals.find(
      (goal) => goal.id === "economic:positive-stone-production",
    ).status,
    evidenceId: evidencePaths.p38Production,
  }),
  coordinatorEvidence: Object.freeze({
    lineageId: "p38:B",
    resourceSnapshotProvenance: "normalized-from-captured-period",
    resourceValidityEpoch,
    jobsSnapshotId: fourResidentFood.snapshotId,
    jobsPeriod: fourResidentFood.period,
    resourceSnapshotId: snapshotId,
    resourcePeriod: 720,
    stoneSnapshotId: p10000GraphState.snapshotId,
    stonePeriod: 10000,
    workerCommitments:
      "assumed-empty; separate cross-owner registry was not captured",
    jobsOwnerWorkCycles: hypotheticalFourJobsInput.ownerWorkCycles,
    workerCommitmentOwnerWorkCycle:
      hypotheticalFourJobsInput.workerCommitments.workCycleId,
  }),
  foodFormula,
});
const normalizedInputBytes = Buffer.byteLength(
  JSON.stringify(normalizedInput),
  "utf8",
);

function runDiagnosticPlanning() {
  const currentResource = assessEconomicResourceCoordination(resourceInput);
  const four = compareSustainableJobsPlan(hypotheticalFourJobsInput);
  const five = compareSustainableJobsPlan(hypotheticalFiveJobsInput);
  const dependencies = assessEconomicCrossOwnerDependencies({
    lineageId: "p38:B",
    materialAcquisition: {
      status: "observed",
      evidenceId: p720Authority.authorizationId,
      snapshotId,
      validityEpoch: resourceValidityEpoch,
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
      snapshotId,
      validityEpoch: resourceValidityEpoch,
      lineageId: "p38:B",
      period: 720,
      targetId: "city-rock_quarry",
    },
    housingPopulation: {
      snapshotId: fourResidentFood.snapshotId,
      lineageId: "p38:B",
      period: fourResidentFood.period,
      validityEpoch: fourResidentFood.validityEpoch,
      evidenceId: "native-state-B-p688",
      population: fourResidentFood.population,
      capacity: fourResidentFood.populationCapacity,
      retainAllResidents: true,
    },
    jobs: four,
    stoneProduction: {
      snapshotId: p10000GraphState.snapshotId,
      lineageId: "p38:B",
      period: 10000,
      validityEpoch: p10000GraphState.validityEpoch,
      provenance: "native-observation",
      evidenceId: "native-state-B-p10000",
      amountPerTick: p10000.production.stoneOutput,
    },
    goalGraph: {
      snapshotId: p10000GraphState.snapshotId,
      lineageId: "p38:B",
      period: 10000,
      validityEpoch: p10000GraphState.validityEpoch,
      objectiveStatus: p10000Graph.objective.status,
      positiveStoneStatus: p10000Graph.goals.find(
        (goal) => goal.id === "economic:positive-stone-production",
      ).status,
      evidenceId: evidencePaths.p38Production,
    },
  });
  return [
    currentResource.status,
    four.status,
    five.status,
    dependencies.objectiveStatus,
  ];
}

for (let index = 0; index < 500; index++) runDiagnosticPlanning();
const planningSamplesMs = [];
for (let index = 0; index < 2500; index++) {
  const started = monotonicPerformance.now();
  runDiagnosticPlanning();
  planningSamplesMs.push(monotonicPerformance.now() - started);
}
planningSamplesMs.sort((left, right) => left - right);
const percentile = (values, fraction) =>
  values[
    Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))
  ];
const performanceEvidence = Object.freeze({
  measurementAuthority: "node:perf_hooks performance.now()",
  clockType:
    "native monotonic high-resolution wall clock outside Chromium's virtual clock",
  warmupRuns: 500,
  measuredRuns: planningSamplesMs.length,
  p50Milliseconds: percentile(planningSamplesMs, 0.5),
  p95Milliseconds: percentile(planningSamplesMs, 0.95),
  inputBytes: normalizedInputBytes,
  scope:
    "pure resource, 4/5-resident Jobs, and dependency assessments; excludes file parsing and browser work",
  endToEndCpuPercentGate: "not measured; no 2% claim",
});

const result = Object.freeze({
  experiment: "P39 Cross-owner economic coordination",
  schemaVersion: 1,
  decision: "B",
  pinnedGame: p38Exact.pinnedGame,
  provenance: Object.freeze({
    p37GraphObjective: p37.graph.objective,
    p38GraphObjective: p10000Graph.objective,
    p38GraphStoneProduction: p10000Graph.goals.find(
      (goal) => goal.id === "economic:positive-stone-production",
    ),
    p38Checkpoint688: Object.freeze({
      period: p688.period,
      state: p688.state,
      production: p688.production,
      jobsInputMatchesSeparateP38Capture:
        JSON.stringify(p688.jobsInput) ===
        JSON.stringify(p38Jobs.capturedP688Input),
    }),
    constructionReplay: Object.freeze({
      authorityAt720: p720Authority,
      lastGatherStockTransitionAt720: p720GatherEvents.at(-1),
      housingActionCallsAt720: p720HousingActions,
      p728Stop: p728Stop,
      p688BasicHousingCount: p720HousingCount,
      p720HousingLumberDebitInferredFromObservedStockDelta: housingLumberDelta,
      housingWasAffordableAtP688:
        housingLumberDelta <= p688.state.resources.Lumber.amount,
      candidateImportanceAndBuildConflictGateCaptured: false,
    }),
  }),
  resourceAssessment,
  jobs: Object.freeze({
    formula: foodFormula,
    fourResidentsLockedObservedPlanner: Object.freeze({
      status: lockedJobs.status,
      assignments: lockedJobs.ordinaryProposal?.assignments,
      minimumFarmers: lockedJobs.food.minimumFarmers,
      food: lockedJobs.ordinaryFood,
      provenance:
        "actual captured p688 Jobs input; Quarry Worker row remains locked and absent",
    }),
    fourResidentsHypotheticalUnlock: Object.freeze({
      status: hypotheticalFourJobs.status,
      assignments: hypotheticalFourJobs.ordinaryProposal?.assignments,
      ordinaryFood: hypotheticalFourJobs.ordinaryFood,
      minimumFarmers: hypotheticalFourJobs.food.minimumFarmers,
      constrainedAlternative: hypotheticalFourJobs.constrainedAlternative,
      provenance:
        "P38 hypothetical unlocked Quarry Worker input run through actual planJobs()",
    }),
    fiveResidentsHypotheticalUnlock: Object.freeze({
      status: hypotheticalFiveJobs.status,
      assignments: hypotheticalFiveJobs.ordinaryProposal?.assignments,
      ordinaryFood: hypotheticalFiveJobs.ordinaryFood,
      minimumFarmers: hypotheticalFiveJobs.food.minimumFarmers,
      constrainedAlternative: hypotheticalFiveJobs.constrainedAlternative,
      provenance:
        "five-resident projection built from P38's hypothetical Quarry Worker row and p10000 observed Food state; not a captured Jobs cycle",
    }),
  }),
  dependencyAssessment,
  normalizedInput,
  performance: performanceEvidence,
  timerAudit: Object.freeze({
    p38Clock:
      "The P38 runner replaces window.performance.now() with state.now, which advances only with virtual game time. Synchronous native calls therefore recorded zero elapsed milliseconds.",
    correction:
      "P39 offline measurements use Node's imported node:perf_hooks performance.now(), independent of the virtual renderer clock.",
    productionClockChanged: false,
  }),
  runtimeObservationNeeds: Object.freeze([
    "a current Construction publication with the complete candidate list, weights, important flag, saving-reservation result, and next proposed purchase cost",
    "a generation-bound Construction owner contract that accepts and reports target-specific reservations alongside queue, saving, and other automation commitments",
    "a production-authorized Gather acquisition path bound to the player's selected objective and fresh material authority",
    "the native post-Quarry Construction action and Quarry Worker control/unlock observation",
    "same-work-cycle Food output, consumption, modifiers, native job minima/capacity, servant controls, and existing worker commitments after Quarry unlock",
    "a native positive Stone production sample after a sustainable assignment",
  ]),
});

writeFileSync(
  resolve(
    root,
    "experiments/p39-cross-owner-economic-coordination-evidence.json",
  ),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      output: "experiments/p39-cross-owner-economic-coordination-evidence.json",
      decision: result.decision,
      resourceStatus: resourceAssessment.status,
      fourResidentFarmerMinimum: hypotheticalFourJobs.food.minimumFarmers,
      fiveResidentFarmerMinimum: hypotheticalFiveJobs.food.minimumFarmers,
      fourResidentOrdinaryAssignments:
        p38Jobs.hypotheticalUnlockedPlanner.predictedAssignments,
      fiveResidentOrdinaryAssignments:
        hypotheticalFiveJobs.ordinaryProposal?.assignments,
      p50Milliseconds: performanceEvidence.p50Milliseconds,
      p95Milliseconds: performanceEvidence.p95Milliseconds,
      normalizedInputBytes,
    },
    null,
    2,
  ),
);
