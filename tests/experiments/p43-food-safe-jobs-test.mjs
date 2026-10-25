import assert from "node:assert/strict";

import {
  calculateP43FoodFloor,
  evaluateP43FoodSafeJobsDecision,
  P43_PINNED_GAME,
  verifyP43NativeJobsPostcondition,
} from "../../experiments/p43-food-safe-jobs-policy.mjs";

function makeCase({
  population = 4,
  farmerWorkers = 4,
  quarryWorkers = 0,
  lumberjackWorkers = 0,
  farmCount = 1,
  physicalFarmerMaximum = -1,
  farmerMinimum = 2,
  farmerSmartMaximum = 4,
  foodOutput = 5.316,
  foodConsumption = 4,
  otherFoodProducer = null,
  farmerServants = 0,
  defaultJobId = "farmer",
  minimumDefault = 0,
  quarryUnlocked = true,
  quarryManaged = true,
} = {}) {
  const jobs = [
    {
      token: 1,
      id: "farmer",
      kind: "farmer",
      workers: farmerWorkers,
      servants: farmerServants,
      count: 0,
      maximum: physicalFarmerMaximum,
      managed: true,
      unlocked: true,
      smart: true,
      crafting: false,
      serves: false,
      split: true,
      isDefault: defaultJobId === "farmer",
      breakpoints: [-1, -1, -1],
      uncappedBreakpoints: [-1, -1, -1],
      smartMaximum: farmerSmartMaximum,
      farmerMinimum,
      storageBackedMinimum: null,
      demonicLumber: false,
      warlordMiner: false,
    },
    {
      token: 2,
      id: "quarry_worker",
      kind: "quarry-worker",
      workers: quarryWorkers,
      servants: 0,
      count: 0,
      maximum: -1,
      managed: quarryManaged,
      unlocked: quarryUnlocked,
      smart: true,
      crafting: false,
      serves: false,
      split: true,
      isDefault: defaultJobId === "quarry_worker",
      breakpoints: [4, 10, 0],
      uncappedBreakpoints: [4, 10, 0],
      smartMaximum: 4,
      farmerMinimum: null,
      storageBackedMinimum: null,
      demonicLumber: false,
      warlordMiner: false,
    },
    {
      token: 3,
      id: "lumberjack",
      kind: "lumberjack",
      workers: lumberjackWorkers,
      servants: 0,
      count: 0,
      maximum: -1,
      managed: true,
      unlocked: true,
      smart: true,
      crafting: false,
      serves: false,
      split: false,
      isDefault: defaultJobId === "lumberjack",
      breakpoints: [0, 0, 0],
      uncappedBreakpoints: [0, 0, 0],
      smartMaximum: null,
      farmerMinimum: null,
      storageBackedMinimum: null,
      demonicLumber: false,
      warlordMiner: false,
    },
  ];
  const input = {
    available: true,
    population,
    minimumDefault,
    defaultJobToken: jobs.find((job) => job.id === defaultJobId)?.token ?? null,
    jobs,
  };
  const ordinaryDecision = {
    kind: "assign-jobs",
    assignments: jobs.map((job) => ({
      jobToken: job.token,
      workers:
        job.id === "farmer"
          ? Math.min(farmerWorkers, population - 2)
          : job.id === "quarry_worker"
            ? Math.min(2, population - Math.min(farmerWorkers, population - 2))
            : lumberjackWorkers,
      servants: job.servants,
    })),
    selectedDefaultToken: input.defaultJobToken,
    lastFarmerCount: farmerWorkers,
  };
  // Keep the ordinary assignment complete even for population variants used by the tests.
  let assigned = ordinaryDecision.assignments.reduce(
    (total, assignment) => total + assignment.workers,
    0,
  );
  const farmerPlan = ordinaryDecision.assignments.find(
    (assignment) => assignment.jobToken === 1,
  );
  const quarryPlan = ordinaryDecision.assignments.find(
    (assignment) => assignment.jobToken === 2,
  );
  const lumberPlan = ordinaryDecision.assignments.find(
    (assignment) => assignment.jobToken === 3,
  );
  if (assigned !== population) {
    const delta = population - assigned;
    lumberPlan.workers += delta;
    assigned += delta;
  }
  assert.equal(assigned, population);

  const currentFarmerBase =
    Math.min(farmCount, farmerWorkers) * 1.97 +
    Math.max(0, farmerWorkers - farmCount) * 0.82;
  const production = {
    Farmer: `${currentFarmerBase}v`,
    ᄂMill: "0%",
    "ᄂVirgo+0": "0%",
    ᄂWeather: "0%",
    "ᄂQuarantine+0": "0%",
    Biodome:
      otherFoodProducer?.id === "Biodome" ? `${otherFoodProducer.rate}v` : "0v",
    Soldiers:
      otherFoodProducer?.id === "Soldiers"
        ? `${otherFoodProducer.rate}v`
        : "0v",
    "ᄂQuarantine+1": "0%",
  };
  const consumers = { Population: `${-foodConsumption}v` };
  const root = {
    race: { species: "human", servants: false },
    tech: { agriculture: 2, hoe: 0, science: 0 },
    city: {
      farm: { count: farmCount },
      mill: { count: 0, on: 0 },
      biome: "grassland",
      calendar: { weather: 1, temp: 1, season: 0 },
      ptrait: [],
    },
    resource: {
      human: { amount: population, max: population },
      Food: { amount: 50, max: 100, diff: foodOutput - foodConsumption },
      Stone: { amount: 0, max: 600, diff: 0 },
    },
    civic: {
      d_job: defaultJobId,
      farmer: { workers: farmerWorkers },
      quarry_worker: { workers: quarryWorkers },
      lumberjack: { workers: lumberjackWorkers },
      unemployed: { workers: 0 },
    },
    stats: { starved: 0, died: 0 },
  };
  const cycleIdentity = { sequence: 1, period: 720, root, input };
  const observation = {
    nativeRevision: P43_PINNED_GAME,
    jobsInput: input,
    rootMatches: true,
    root,
    jobsSnapshot: input,
    workCycleIdentity: cycleIdentity,
    measuredFoodOutput: foodOutput,
    measuredFoodConsumption: foodConsumption,
    population,
    populationCapacity: population,
    undergroundFarmCount: 0,
    surfaceFarmCount: 0,
    underTransmitterCount: 0,
    ledger: {
      production: { Food: production },
      consumption: { Food: consumers },
    },
    food: { amount: 50, max: 100, diff: foodOutput - foodConsumption },
    stone: { amount: 0, max: 600, diff: 0, production: 0, consumption: 0 },
    buildings: { city: { farm: farmCount } },
  };
  const context = {
    enabled: true,
    apply: true,
    commitmentMode: "test-only-assume-empty",
    period: 720,
    workCycleSequence: 1,
    workCycleIdentity: cycleIdentity,
    nativeRevision: P43_PINNED_GAME,
    rootMatches: true,
    root,
    rootGeneration: 5,
    progressionGeneration: "human|progression-5",
    farmerControlGeneration: 9,
    quarryControlGeneration: 10,
    farmerControlReady: true,
    quarryControlReady: true,
    nativeDefaultJobId: defaultJobId,
    rootDefaultJobId: defaultJobId,
    jobsInput: input,
    ordinaryDecision,
    observation,
  };
  return {
    context,
    input,
    root,
    observation,
    ordinaryDecision,
    farmerPlan,
    quarryPlan,
    lumberPlan,
  };
}

const baseline = makeCase();
const baselineFloor = calculateP43FoodFloor(baseline.observation);
assert.equal(baselineFloor.status, "feasible");
assert.equal(baselineFloor.minimumFarmers, 3);
assert.equal(baselineFloor.nativeFarmerMinimum, 2);
assert.equal(baselineFloor.farmerSmartMaximum, 4);
assert.equal(baselineFloor.farmerPhysicalMaximum, 4);
assert.equal(baselineFloor.foodConsumption, 4);
assert.ok(baselineFloor.foodNet > 0);

const baselineDecision = evaluateP43FoodSafeJobsDecision(baseline.context);
assert.equal(baselineDecision.applied, true);
assert.equal(baselineDecision.authoritative, false);
assert.equal(baselineDecision.workerCommitments, "unavailable");
assert.equal(baselineDecision.workerCommitmentsAssumedEmpty, true);
assert.equal(
  baselineDecision.decision.selectedDefaultToken,
  baseline.ordinaryDecision.selectedDefaultToken,
);
assert.equal(baselineDecision.workerCommitments, "unavailable");
assert.equal(baselineDecision.workerCommitmentsAssumedEmpty, true);
assert.ok(Math.abs(baselineDecision.ordinaryPlanFood.foodNet + 0.652) < 1e-9);
assert.equal(baselineDecision.alternative.farmers, 3);
assert.equal(baselineDecision.alternative.quarryWorkers, 1);
assert.equal(baselineDecision.alternative.populationConserved, true);
assert.ok(Math.abs(baselineDecision.alternative.foodNet - 0.332) < 1e-9);
assert.equal(baselineDecision.alternative.retainsQuarryWorker, true);

const zeroQuarryNeeded = makeCase({
  farmerWorkers: 2,
  quarryWorkers: 2,
  foodOutput: 3.348,
  foodConsumption: 5,
});
const zeroQuarryNeededDecision = evaluateP43FoodSafeJobsDecision(
  zeroQuarryNeeded.context,
);
assert.equal(zeroQuarryNeededDecision.floor.minimumFarmers, 4);
assert.equal(zeroQuarryNeededDecision.applied, true);
assert.equal(zeroQuarryNeededDecision.alternative.farmers, 4);
assert.equal(zeroQuarryNeededDecision.alternative.quarryWorkers, 0);
assert.equal(zeroQuarryNeededDecision.alternative.foodPositive, true);
assert.equal(zeroQuarryNeededDecision.alternative.zeroQuarryFallback, true);

const changedModifiers = makeCase({
  foodOutput: 6.372,
  foodConsumption: 4,
});
changedModifiers.observation.ledger.consumption.Food.Soldiers = "-2v";
changedModifiers.root.resource.Food.diff = 0.372;
changedModifiers.observation.food.diff = 0.372;
changedModifiers.observation.measuredFoodConsumption = 6;
const changedFloor = calculateP43FoodFloor(changedModifiers.observation);
assert.equal(changedFloor.status, "feasible");
assert.equal(changedFloor.minimumFarmers, 4);
assert.notEqual(
  changedFloor.productionModifier,
  baselineFloor.productionModifier,
);
assert.equal(changedFloor.foodConsumption, 6);

const equality = makeCase({ foodOutput: 5.316, foodConsumption: 4.332 });
const equalityFloor = calculateP43FoodFloor(equality.observation);
assert.equal(equalityFloor.status, "feasible");
assert.equal(equalityFloor.minimumFarmers, 4);

const unsupportedProducer = makeCase({
  otherFoodProducer: { id: "Biodome", rate: 0.25 },
});
assert.equal(
  calculateP43FoodFloor(unsupportedProducer.observation).status,
  "unavailable",
);

const soldierProducer = makeCase({
  otherFoodProducer: { id: "Soldiers", rate: 0.6666666666666666 },
});
const soldierFloor = calculateP43FoodFloor(soldierProducer.observation);
assert.equal(soldierFloor.status, "feasible");
assert.ok(soldierFloor.otherFoodProduction > 0);
assert.ok(
  Math.abs(
    soldierFloor.otherFoodProduction +
      4.43 * soldierFloor.productionModifier -
      soldierFloor.foodOutput,
  ) < 1e-9,
);

const missingModifierEvidence = makeCase();
delete missingModifierEvidence.observation.ledger.production.Food["ᄂWeather"];
assert.equal(
  calculateP43FoodFloor(missingModifierEvidence.observation).status,
  "unavailable",
);

const staleRoot = makeCase();
staleRoot.context.rootMatches = false;
assert.equal(
  evaluateP43FoodSafeJobsDecision(staleRoot.context).status,
  "qualification-unavailable",
);

const staleCycle = makeCase();
staleCycle.context.workCycleSequence = 2;
assert.equal(
  evaluateP43FoodSafeJobsDecision(staleCycle.context).status,
  "qualification-unavailable",
);

const staleObservation = makeCase();
staleObservation.observation.workCycleIdentity = Object.freeze({
  ...staleObservation.context.workCycleIdentity,
  period: 712,
});
assert.equal(
  evaluateP43FoodSafeJobsDecision(staleObservation.context).status,
  "qualification-unavailable",
);

const staleControlGeneration = makeCase();
staleControlGeneration.context.farmerControlGeneration = null;
assert.equal(
  evaluateP43FoodSafeJobsDecision(staleControlGeneration.context).status,
  "qualification-unavailable",
);

const missingCommitmentMode = makeCase();
missingCommitmentMode.context.commitmentMode = null;
assert.equal(
  evaluateP43FoodSafeJobsDecision(missingCommitmentMode.context).status,
  "qualification-unavailable",
);

const populationGrowth = makeCase({
  population: 5,
  farmerWorkers: 2,
  quarryWorkers: 1,
  lumberjackWorkers: 2,
  foodOutput: 3.348,
  foodConsumption: 5,
});
populationGrowth.input.jobs.find((job) => job.id === "lumberjack").workers = 2;
populationGrowth.root.resource.human.amount = 5;
populationGrowth.root.resource.human.max = 5;
populationGrowth.root.civic.lumberjack.workers = 2;
populationGrowth.root.resource.Food.diff = -1.652;
populationGrowth.observation.population = 5;
populationGrowth.observation.populationCapacity = 5;
populationGrowth.observation.measuredFoodOutput = 3.348;
populationGrowth.observation.measuredFoodConsumption = 5;
populationGrowth.observation.food.diff = -1.652;
populationGrowth.context.workCycleIdentity.input = populationGrowth.input;
populationGrowth.observation.jobsSnapshot = populationGrowth.input;
populationGrowth.context.jobsInput = populationGrowth.input;
populationGrowth.context.root = populationGrowth.root;
populationGrowth.observation.root = populationGrowth.root;
populationGrowth.context.workCycleIdentity.root = populationGrowth.root;
populationGrowth.context.observation = populationGrowth.observation;
populationGrowth.context.ordinaryDecision.assignments = [
  { jobToken: 1, workers: 2, servants: 0 },
  { jobToken: 2, workers: 1, servants: 0 },
  { jobToken: 3, workers: 2, servants: 0 },
];
const growthDecision = evaluateP43FoodSafeJobsDecision(
  populationGrowth.context,
);
assert.equal(growthDecision.status, "other-job-transfer-required");
assert.equal(growthDecision.applied, true);
assert.equal(growthDecision.alternative.zeroQuarryFallback, true);
assert.equal(growthDecision.alternative.foodPositive, false);
assert.equal(growthDecision.alternative.requiresOtherJobTransfer, true);
assert.equal(growthDecision.alternative.additionalWorkersRequired, 1);
assert.equal(growthDecision.alternative.movableOtherWorkers, 2);
assert.equal(
  growthDecision.alternative.otherJobTransferPossibleByNativeCaps,
  true,
);

const impossibleFloor = makeCase({
  farmerWorkers: 2,
  quarryWorkers: 2,
  farmerMinimum: 2,
  foodOutput: 3.348,
  foodConsumption: 8,
});
const fallbackDecision = evaluateP43FoodSafeJobsDecision(
  impossibleFloor.context,
);
assert.equal(fallbackDecision.floor.status, "infeasible");
assert.equal(fallbackDecision.applied, true);
assert.equal(fallbackDecision.alternative.farmers, 4);
assert.equal(fallbackDecision.alternative.quarryWorkers, 0);
assert.equal(fallbackDecision.alternative.foodPositive, false);
assert.equal(fallbackDecision.alternative.zeroQuarryFallback, true);
assert.equal(fallbackDecision.alternative.zeroQuarryFallbackImprovesFood, true);
assert.equal(
  fallbackDecision.alternative.reason,
  "zero-quarry-fallback-maximizes-food-but-still-negative",
);

const physicalCap = makeCase({
  farmerWorkers: 2,
  quarryWorkers: 2,
  physicalFarmerMaximum: 3,
  foodOutput: 3.348,
  foodConsumption: 8,
});
assert.equal(
  evaluateP43FoodSafeJobsDecision(physicalCap.context).status,
  "fallback-or-transfer-infeasible",
);

const lockedQuarry = makeCase({ quarryUnlocked: false });
assert.equal(
  evaluateP43FoodSafeJobsDecision(lockedQuarry.context).status,
  "invalid-ordinary-proposal",
);

const defaultQuarry = makeCase({
  farmerWorkers: 2,
  quarryWorkers: 2,
  foodOutput: 3.348,
  foodConsumption: 8,
  defaultJobId: "quarry_worker",
  minimumDefault: 1,
});
assert.equal(
  evaluateP43FoodSafeJobsDecision(defaultQuarry.context).status,
  "fallback-or-transfer-infeasible",
);

const preservedQuarryDefault = makeCase({
  farmerWorkers: 2,
  quarryWorkers: 2,
  foodOutput: 3.348,
  foodConsumption: 4,
  defaultJobId: "quarry_worker",
});
const preservedDefaultDecision = evaluateP43FoodSafeJobsDecision(
  preservedQuarryDefault.context,
);
assert.equal(preservedDefaultDecision.applied, true);
assert.equal(
  preservedDefaultDecision.decision.selectedDefaultToken,
  preservedQuarryDefault.ordinaryDecision.selectedDefaultToken,
);
assert.equal(preservedDefaultDecision.alternative.nativeDefaultPreserved, true);

const ordinaryPlannerSelectsQuarry = makeCase({
  farmerWorkers: 2,
  quarryWorkers: 2,
  foodOutput: 3.348,
  foodConsumption: 4,
});
ordinaryPlannerSelectsQuarry.ordinaryDecision.selectedDefaultToken = 2;
ordinaryPlannerSelectsQuarry.context.ordinaryDecision =
  ordinaryPlannerSelectsQuarry.ordinaryDecision;
const quarryDefaultDecision = evaluateP43FoodSafeJobsDecision(
  ordinaryPlannerSelectsQuarry.context,
);
assert.equal(quarryDefaultDecision.applied, true);
assert.equal(quarryDefaultDecision.decision.selectedDefaultToken, 2);
assert.equal(
  quarryDefaultDecision.decision.selectedDefaultToken,
  ordinaryPlannerSelectsQuarry.ordinaryDecision.selectedDefaultToken,
);
const quarryDefaultPostcondition = verifyP43NativeJobsPostcondition({
  input: ordinaryPlannerSelectsQuarry.input,
  decision: quarryDefaultDecision.decision,
  root: {
    civic: {
      d_job: "quarry_worker",
      farmer: { workers: 3 },
      quarry_worker: { workers: 1 },
      lumberjack: { workers: 0 },
    },
    race: { servants: { jobs: {} } },
  },
});
assert.equal(quarryDefaultPostcondition.matched, true);
assert.equal(quarryDefaultPostcondition.expectedDefaultJobId, "quarry_worker");
assert.equal(quarryDefaultPostcondition.actualDefaultJobId, "quarry_worker");

const invalidPopulation = makeCase();
invalidPopulation.ordinaryDecision.assignments[2].workers = 1;
assert.equal(
  evaluateP43FoodSafeJobsDecision(invalidPopulation.context).status,
  "invalid-ordinary-proposal",
);

const postconditionCase = makeCase();
const matchingPostcondition = verifyP43NativeJobsPostcondition({
  input: postconditionCase.input,
  decision: baselineDecision.decision,
  root: {
    civic: {
      d_job: "farmer",
      farmer: { workers: 3 },
      quarry_worker: { workers: 1 },
      lumberjack: { workers: 0 },
    },
    race: { servants: { jobs: {} } },
  },
});
assert.equal(matchingPostcondition.matched, true);
const failedPostcondition = verifyP43NativeJobsPostcondition({
  input: postconditionCase.input,
  decision: baselineDecision.decision,
  root: {
    civic: {
      d_job: "farmer",
      farmer: { workers: 2 },
      quarry_worker: { workers: 2 },
      lumberjack: { workers: 0 },
    },
    race: { servants: { jobs: {} } },
  },
});
assert.equal(failedPostcondition.matched, false);

console.log("P43 Food-safe Jobs policy regressions passed");
