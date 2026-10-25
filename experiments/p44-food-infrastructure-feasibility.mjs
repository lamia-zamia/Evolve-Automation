import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

export const P44_PINNED_GAME =
  "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f";
export const P44_SELECTED_PERIODS = Object.freeze([
  728, 2000, 4000, 5000, 10000,
]);

const FARMER_IMPACT = 0.82;
const FOOD_SAFETY_MARGIN = 0.01;
const STONE_CAPACITY = 600;
const RECONCILIATION_TOLERANCE = 0.02;
const FARM_SOURCE_FACTORS = ["Mill", "Virgo", "Weather", "Quarantine+0"];

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sumWorkers(assignments, field) {
  if (!assignments || typeof assignments !== "object") return null;
  const entries = Object.values(assignments);
  if (entries.some((entry) => !Number.isSafeInteger(entry?.[field])))
    return null;
  return entries.reduce((total, entry) => total + entry[field], 0);
}

function consumerTotal(rows) {
  if (!rows || typeof rows !== "object" || Array.isArray(rows)) return null;
  const values = Object.values(rows);
  if (values.some((value) => !finite(value))) return null;
  return values.reduce((total, value) => total + Math.abs(value), 0);
}

function parseBreakdownRate(value) {
  if (finite(value)) return value;
  if (
    typeof value === "string" &&
    (value.endsWith("v") || value.endsWith("%"))
  ) {
    const parsed = Number.parseFloat(value);
    return finite(parsed) ? parsed : null;
  }
  return null;
}

function farmBaseOutput(farms, farmers, fullFarmBonus) {
  const fullFarmWorkers = Math.min(farms, farmers);
  return (
    fullFarmWorkers * (FARMER_IMPACT + fullFarmBonus) +
    Math.max(0, farmers - farms) * FARMER_IMPACT
  );
}

function finitePhysicalMaximum(job, population) {
  if (job?.maximum === -1) return population;
  return Number.isSafeInteger(job?.maximum) && job.maximum >= 0
    ? Math.min(population, job.maximum)
    : null;
}

function normalizeEvent(event, pinnedGameIsValid) {
  const reasons = [];
  const identity = event?.identity;
  const farmerJob = event?.jobCatalog?.find((job) => job.id === "farmer");
  const quarryJob = event?.jobCatalog?.find(
    (job) => job.id === "quarry_worker",
  );
  const modifier = event?.foodModifierInputs;
  const city = event?.buildings?.city;
  const population = event?.population;
  const civilianWorkers = sumWorkers(event?.constrainedAssignments, "workers");
  const civilianServants = sumWorkers(
    event?.constrainedAssignments,
    "servants",
  );
  const observedConsumption = consumerTotal(event?.foodConsumerRows);
  const agriculture = modifier?.research?.agriculture;
  const weather = event?.foodProducerRows?.["ᄂWeather"];
  const farmerLedgerOutput = parseBreakdownRate(
    event?.foodProducerRows?.Farmer,
  );
  const soldierLedgerOutput = modifier?.soldierLedgerOutput;
  const soldierQuarantineFactor = modifier?.soldierQuarantineFactor;
  const unmodeledProducerRows = Object.entries(event?.foodProducerRows ?? {})
    .filter(
      ([id]) => id !== "Farmer" && id !== "Soldiers" && !id.startsWith("ᄂ"),
    )
    .filter(([, value]) => {
      const rate = parseBreakdownRate(value);
      return rate === null || Math.abs(rate) > RECONCILIATION_TOLERANCE;
    })
    .map(([id]) => id);
  const weatherPercent =
    typeof weather === "string" && weather.endsWith("%")
      ? Number.parseFloat(weather)
      : null;

  if (!pinnedGameIsValid) reasons.push("pinned game identity mismatch");
  if (
    !Number.isSafeInteger(event?.period) ||
    event?.workCycle?.period !== event?.period ||
    !Number.isSafeInteger(event?.workCycle?.sequence)
  ) {
    reasons.push("work-cycle period identity is missing or mismatched");
  }
  if (
    identity?.rootMatches !== true ||
    identity?.inputIdentityAvailable !== true ||
    !Number.isSafeInteger(identity?.rootGeneration) ||
    typeof identity?.progressionGeneration !== "string" ||
    !Number.isSafeInteger(identity?.farmerControlGeneration) ||
    !Number.isSafeInteger(identity?.quarryControlGeneration) ||
    identity?.farmerControlReady !== true ||
    identity?.quarryControlReady !== true
  ) {
    reasons.push(
      "current root, Jobs input, or job-control generation is incomplete",
    );
  }
  if (
    !Number.isSafeInteger(population) ||
    !Number.isSafeInteger(event?.housingCapacity) ||
    population > event.housingCapacity ||
    civilianWorkers !== population ||
    civilianServants !== 0
  ) {
    reasons.push(
      "civilian population, housing, or Jobs conservation is incomplete",
    );
  }
  if (
    !farmerJob ||
    !quarryJob ||
    farmerJob.unlocked !== true ||
    farmerJob.managed !== true ||
    quarryJob.unlocked !== true ||
    quarryJob.managed !== true ||
    !Number.isSafeInteger(farmerJob.smartMaximum) ||
    !Number.isSafeInteger(quarryJob.smartMaximum)
  ) {
    reasons.push(
      "native Farmer or Quarry Worker capacity evidence is incomplete",
    );
  }
  if (
    !Number.isSafeInteger(city?.farm) ||
    !Number.isSafeInteger(city?.rock_quarry) ||
    city.rock_quarry < 1 ||
    !Number.isSafeInteger(agriculture) ||
    !finite(event?.foodFormulaModifier) ||
    event.foodFormulaModifier <= 0 ||
    !finite(modifier?.effectiveOtherFoodProduction) ||
    modifier.effectiveOtherFoodProduction < 0 ||
    !Array.isArray(modifier?.farmerSourceModifierFactors) ||
    modifier.farmerSourceModifierFactors.length !==
      FARM_SOURCE_FACTORS.length ||
    modifier.farmerSourceModifierFactors.some(
      (factor) => !finite(factor) || factor <= 0,
    ) ||
    !finite(modifier?.globalProductionModifier) ||
    modifier.globalProductionModifier <= 0 ||
    !finite(farmerLedgerOutput) ||
    !finite(soldierLedgerOutput) ||
    !finite(soldierQuarantineFactor) ||
    !finite(weatherPercent)
  ) {
    reasons.push(
      "Food formula or production-modifier provenance is incomplete",
    );
  }
  if (unmodeledProducerRows.length > 0) {
    reasons.push("an active Food producer row lacks a retained source formula");
  }
  if (
    !finite(event?.foodProduction) ||
    !finite(event?.foodConsumption) ||
    !finite(event?.foodNet) ||
    observedConsumption === null ||
    Math.abs(observedConsumption - event.foodConsumption) >
      RECONCILIATION_TOLERANCE ||
    Math.abs(event.foodProduction - event.foodConsumption - event.foodNet) >
      RECONCILIATION_TOLERANCE
  ) {
    reasons.push("native Food producer or consumer rows do not reconcile");
  }

  const currentFarmers = event?.occupiedJobs?.farmer?.workers;
  const fullFarmBonus = agriculture >= 2 ? 1.15 : 0.65;
  const currentBase =
    Number.isSafeInteger(city?.farm) && Number.isSafeInteger(currentFarmers)
      ? farmBaseOutput(city.farm, currentFarmers, fullFarmBonus)
      : null;
  if (
    currentBase === null ||
    !finite(event?.foodFormulaModifier) ||
    !finite(modifier?.effectiveOtherFoodProduction) ||
    Math.abs(
      currentBase * event.foodFormulaModifier +
        modifier.effectiveOtherFoodProduction -
        event.foodProduction,
    ) > RECONCILIATION_TOLERANCE
  ) {
    reasons.push(
      "pinned Farmer formula does not reconcile to current Food output",
    );
  }
  const sourceFactorProduct = FARM_SOURCE_FACTORS.reduce(
    (product, _name, index) =>
      product * (modifier?.farmerSourceModifierFactors?.[index] ?? NaN),
    1,
  );
  const reconstructedFarmerCoefficient =
    currentBase > 0
      ? (farmerLedgerOutput / currentBase) *
        sourceFactorProduct *
        modifier?.globalProductionModifier
      : NaN;
  const reconstructedOtherFood =
    soldierLedgerOutput *
    soldierQuarantineFactor *
    modifier?.globalProductionModifier;
  if (
    !finite(reconstructedFarmerCoefficient) ||
    Math.abs(reconstructedFarmerCoefficient - event?.foodFormulaModifier) >
      RECONCILIATION_TOLERANCE ||
    !finite(reconstructedOtherFood) ||
    Math.abs(reconstructedOtherFood - modifier?.effectiveOtherFoodProduction) >
      RECONCILIATION_TOLERANCE
  ) {
    reasons.push(
      "Farmer or Soldier source modifiers do not reconcile to the retained formula",
    );
  }

  const farmerMaximum = finitePhysicalMaximum(farmerJob, population);
  const quarryMaximum = finitePhysicalMaximum(quarryJob, population);
  const state = {
    period: event?.period ?? null,
    workCycleSequence: event?.workCycle?.sequence ?? null,
    rootGeneration: identity?.rootGeneration ?? null,
    progressionGeneration: identity?.progressionGeneration ?? null,
    farmerControlGeneration: identity?.farmerControlGeneration ?? null,
    quarryControlGeneration: identity?.quarryControlGeneration ?? null,
    available: reasons.length === 0,
    reasons,
    population: Number.isSafeInteger(population) ? population : null,
    housingCapacity: event?.housingCapacity ?? null,
    civilianWorkers,
    civilianServants,
    garrisonWorkers: event?.occupiedJobs?.garrison?.workers ?? 0,
    observedFarmers: currentFarmers ?? null,
    observedQuarryWorkers: event?.occupiedJobs?.quarry_worker?.workers ?? 0,
    currentFarmCount: city?.farm ?? null,
    quarryCount: city?.rock_quarry ?? null,
    agriculture: Number.isSafeInteger(agriculture) ? agriculture : null,
    fullFarmBonus,
    farmerPhysicalMaximum: farmerMaximum,
    farmerSmartMaximum: farmerJob?.smartMaximum ?? null,
    quarryPhysicalMaximum: quarryMaximum,
    quarrySmartMaximum: quarryJob?.smartMaximum ?? null,
    foodProduction: event?.foodProduction ?? null,
    foodConsumption: event?.foodConsumption ?? null,
    foodNet: event?.foodNet ?? null,
    foodConsumerRows: event?.foodConsumerRows ?? null,
    foodFormulaModifier: event?.foodFormulaModifier ?? null,
    effectiveOtherFoodProduction:
      modifier?.effectiveOtherFoodProduction ?? null,
    farmerSourceModifierFactors: Object.fromEntries(
      FARM_SOURCE_FACTORS.map((name, index) => [
        name,
        modifier?.farmerSourceModifierFactors?.[index] ?? null,
      ]),
    ),
    globalProductionModifier: modifier?.globalProductionModifier ?? null,
    weatherPercent,
    stoneStock: event?.stoneStock ?? null,
    stoneCapacity: STONE_CAPACITY,
    stoneHeadroom:
      finite(event?.stoneStock) && event.stoneStock <= STONE_CAPACITY
        ? STONE_CAPACITY - event.stoneStock
        : null,
    currentStoneProduction: event?.stoneProduction ?? null,
    foodProducerRows: event?.foodProducerRows ?? null,
    unmodeledProducerRows,
    workerCommitments: event?.workerCommitments ?? "unavailable",
    workerCommitmentsKnown: false,
    p43AssumedEmptyForDiagnostic: event?.workerCommitmentsAssumedEmpty === true,
  };
  return state;
}

function scenarioFor(state, farms, farmers) {
  if (!state.available) {
    return {
      farms,
      farmers,
      status: "unavailable",
      reasons: state.reasons,
      actionable: false,
    };
  }

  const quarryWorkers = state.population - farmers;
  if (farmers < 0 || quarryWorkers < 0 || farmers > state.population) {
    return {
      farms,
      farmers,
      quarryWorkers,
      status: "unavailable",
      reasons: ["scenario does not conserve the observed civilian population"],
      actionable: false,
    };
  }
  const farmerBase = farmBaseOutput(farms, farmers, state.fullFarmBonus);
  const foodProduction =
    state.effectiveOtherFoodProduction + farmerBase * state.foodFormulaModifier;
  const foodNet = foodProduction - state.foodConsumption;
  const farmerPhysicalEligible = farmers <= state.farmerPhysicalMaximum;
  const farmerSmartEligible = farmers <= state.farmerSmartMaximum;
  const quarryPhysicalEligible = quarryWorkers <= state.quarryPhysicalMaximum;
  const quarrySmartEligible = quarryWorkers <= state.quarrySmartMaximum;
  const quarryHasHeadroom = state.stoneHeadroom > 0;
  const quarryProductive =
    quarryWorkers > 0 &&
    state.quarryCount > 0 &&
    quarryPhysicalEligible &&
    quarrySmartEligible &&
    quarryHasHeadroom;

  return {
    farms,
    farmers,
    quarryWorkers,
    civilianWorkersConserved: farmers + quarryWorkers === state.population,
    farmSlots: {
      fullFarmSlotsUsed: Math.min(farms, farmers),
      totalFarmSlots: farms,
      farmhands: Math.max(0, farmers - farms),
      unusedFarmSlots: Math.max(0, farms - farmers),
    },
    farmerBaseOutput: farmerBase,
    foodProduction,
    foodConsumption: state.foodConsumption,
    foodNet,
    foodSafetyMargin: FOOD_SAFETY_MARGIN,
    strictPositiveFood: foodNet > FOOD_SAFETY_MARGIN,
    foodDemandRows: state.foodConsumerRows,
    modifierEvidence: {
      agriculture: state.agriculture,
      fullFarmBonus: state.fullFarmBonus,
      farmerFormulaCoefficient: state.foodFormulaModifier,
      farmerSourceModifierFactors: state.farmerSourceModifierFactors,
      globalProductionModifier: state.globalProductionModifier,
      effectiveOtherFoodProduction: state.effectiveOtherFoodProduction,
      weatherPercent: state.weatherPercent,
      projectionHoldsTheseObservedModifiersFixed: true,
    },
    farmerPhysicalEligible,
    farmerSmartEligible,
    exceedsFarmerSmartMaximum: !farmerSmartEligible,
    quarryPhysicalEligible,
    quarrySmartEligible,
    quarryProductive,
    stoneStock: state.stoneStock,
    stoneCapacity: state.stoneCapacity,
    stoneHeadroom: state.stoneHeadroom,
    productionConfidence: "conditional source-backed projection",
    workerAuthority: {
      commitmentsKnown: state.workerCommitmentsKnown,
      capturedCommitmentStatus: state.workerCommitments,
      p43TestOnlyAssumedEmpty: state.p43AssumedEmptyForDiagnostic,
      assignmentAuthorized: false,
    },
    constructionAuthority: "unavailable; no Farm purchase authorization",
    actionable: false,
  };
}

function sameWorkSample(left, right) {
  return (
    left &&
    right &&
    Number.isSafeInteger(left.period) &&
    Number.isSafeInteger(left.workCycleSequence) &&
    Number.isSafeInteger(left.rootGeneration) &&
    typeof left.progressionGeneration === "string" &&
    left.period === right.period &&
    left.workCycleSequence === right.workCycleSequence &&
    left.rootGeneration === right.rootGeneration &&
    left.progressionGeneration === right.progressionGeneration
  );
}

export function evaluateP44CapacityAwareStoneObjective(input) {
  const food = input?.food;
  const population = input?.population;
  const stone = input?.stone;
  const jobs = input?.jobs;
  const identity = food?.provenance;
  const jobsIdentity = jobs?.provenance;
  const stoneIdentity = stone?.provenance;
  const fresh =
    sameWorkSample(identity, stoneIdentity) &&
    sameWorkSample(identity, jobsIdentity) &&
    Number.isSafeInteger(jobsIdentity?.jobsOwnerGeneration) &&
    Number.isSafeInteger(jobsIdentity?.farmerControlGeneration) &&
    Number.isSafeInteger(jobsIdentity?.quarryControlGeneration);
  if (!fresh) {
    return {
      status: "unavailable",
      reason:
        "Food, Stone, and Jobs evidence do not share a current owner/work-cycle generation",
      quarryRequired: null,
    };
  }
  if (
    food?.sourceComplete !== true ||
    !finite(food?.production) ||
    !finite(food?.consumption) ||
    !Number.isSafeInteger(population?.current) ||
    !Number.isSafeInteger(population?.housingCapacity) ||
    !Number.isSafeInteger(population?.starvationDelta) ||
    !Number.isSafeInteger(population?.deathsDelta)
  ) {
    return {
      status: "unavailable",
      reason: "Food source or population transition evidence is incomplete",
      quarryRequired: null,
    };
  }
  if (
    food.production - food.consumption <= FOOD_SAFETY_MARGIN ||
    population.current > population.housingCapacity ||
    population.starvationDelta > 0 ||
    population.deathsDelta > 0
  ) {
    return {
      status: "fail",
      reason: "Food is not strictly positive or population safety regressed",
      quarryRequired: null,
    };
  }
  if (
    !finite(stone?.stock) ||
    !finite(stone?.capacity) ||
    stone.stock < 0 ||
    stone.stock > stone.capacity
  ) {
    return {
      status: "unavailable",
      reason: "Current Stone stock or storage capacity is incomplete",
      quarryRequired: null,
    };
  }
  const headroom = stone.capacity - stone.stock;
  if (headroom <= 0 && stone?.uncoveredDemandKnown !== true) {
    return {
      status: "unavailable",
      reason:
        "Full Stone storage requires a fresh, complete useful-demand observation",
      quarryRequired: null,
    };
  }
  if (
    stone?.uncoveredDemandKnown === true &&
    (!finite(stone?.uncoveredDemand) || stone.uncoveredDemand < 0)
  ) {
    return {
      status: "unavailable",
      reason: "Stone demand is marked known without a finite uncovered amount",
      quarryRequired: null,
    };
  }
  const quarryRequired =
    headroom > 0 || (stone.uncoveredDemandKnown && stone.uncoveredDemand > 0);
  if (!quarryRequired) {
    return {
      status: "pass",
      reason:
        "Food and population are safe; full Stone storage has no uncovered demand",
      quarryRequired: false,
      stoneHeadroom: headroom,
    };
  }
  if (
    jobs?.commitmentsKnown !== true ||
    jobs?.assignmentCurrent !== true ||
    jobs?.assignmentAuthorized !== true ||
    !Number.isSafeInteger(jobs?.quarryWorkers) ||
    jobs.quarryWorkers < 1 ||
    !Number.isSafeInteger(jobs?.quarryPhysicalCapacity) ||
    jobs.quarryPhysicalCapacity < 1 ||
    !Number.isSafeInteger(jobs?.quarrySmartCapacity) ||
    jobs.quarrySmartCapacity < 1 ||
    stone?.quarryOwned !== true ||
    stone?.quarryOutputFormulaKnown !== true ||
    !finite(stone?.quarryOutputPerWorker) ||
    stone.quarryOutputPerWorker <= 0
  ) {
    return {
      status: "unavailable",
      reason:
        "Useful Stone replenishment lacks current authorized Quarry assignment and positive native output evidence",
      quarryRequired: true,
      stoneHeadroom: headroom,
    };
  }
  return {
    status: "pass",
    reason:
      "Food and population are safe and current Jobs can replenish useful Stone",
    quarryRequired: true,
    stoneHeadroom: headroom,
  };
}

function summarizeScenario(states, farms, farmers) {
  const rows = states.map((state) => scenarioFor(state, farms, farmers));
  const available = rows.filter((row) => row.status !== "unavailable");
  if (available.length === 0) {
    return {
      farms,
      farmers,
      stateCount: states.length,
      availableStateCount: 0,
      unavailableStateCount: states.length,
      robustPositiveFood: false,
      robustProductiveQuarry: false,
    };
  }
  const minimum = available.reduce((best, row) =>
    row.foodNet < best.foodNet ? row : best,
  );
  const minimumState = states[rows.indexOf(minimum)];
  return {
    farms,
    farmers,
    stateCount: states.length,
    availableStateCount: available.length,
    unavailableStateCount: rows.length - available.length,
    strictPositiveFoodStateCount: available.filter(
      (row) => row.strictPositiveFood,
    ).length,
    productiveQuarryStateCount: available.filter((row) => row.quarryProductive)
      .length,
    positiveFoodAndProductiveQuarryStateCount: available.filter(
      (row) => row.strictPositiveFood && row.quarryProductive,
    ).length,
    minimumFoodNet: minimum.foodNet,
    minimumFoodNetPeriod: minimumState?.period ?? null,
    minimumFoodDemand: minimumState?.foodConsumption ?? null,
    minimumStoneStock: minimumState?.stoneStock ?? null,
    minimumWeatherPercent: minimum.modifierEvidence.weatherPercent,
    robustPositiveFood:
      available.length === states.length &&
      available.every((row) => row.strictPositiveFood),
    robustProductiveQuarry:
      available.length === states.length &&
      available.every((row) => row.quarryProductive),
    robustPositiveFoodAndProductiveQuarry:
      available.length === states.length &&
      available.every((row) => row.strictPositiveFood && row.quarryProductive),
  };
}

export function analyzeP44FoodScenarios(
  timeline,
  { sourceSha256 = null } = {},
) {
  const pinnedGameIsValid =
    timeline?.schema === "p43-food-safe-jobs-timeline-v1" &&
    timeline?.pinnedGame === P44_PINNED_GAME &&
    Array.isArray(timeline?.armB?.events);
  const events = Array.isArray(timeline?.armB?.events)
    ? timeline.armB.events
    : [];
  const states = events.map((event) =>
    normalizeEvent(event, pinnedGameIsValid),
  );
  const normalizedInputBytes = Buffer.byteLength(JSON.stringify(states));

  const started = process.hrtime.bigint();
  const selected = P44_SELECTED_PERIODS.map((period) => {
    const state = states.find((candidate) => candidate.period === period);
    return {
      period,
      status: state?.available ? "available" : "unavailable",
      ...(state
        ? { observed: state }
        : { reason: "exact retained period is missing" }),
      scenarios: state
        ? [1, 2, 3].flatMap((farms) =>
            [2, 3, 4].map((farmers) => scenarioFor(state, farms, farmers)),
          )
        : [],
    };
  });
  const allRetained = [1, 2, 3].flatMap((farms) =>
    [2, 3, 4].map((farmers) => summarizeScenario(states, farms, farmers)),
  );
  const highDemandStates = states.filter(
    (state) => state.available && state.foodConsumption >= 8,
  );
  const highDemandScenarios = [1, 2, 3].flatMap((farms) =>
    [2, 3, 4].map((farmers) =>
      summarizeScenario(highDemandStates, farms, farmers),
    ),
  );
  const foodWeather = states
    .filter((state) => state.available)
    .map((state) => state.weatherPercent);
  const elapsedNanoseconds = process.hrtime.bigint() - started;
  const analysisMs = Number(elapsedNanoseconds) / 1_000_000;

  return {
    schema: "p44-food-infrastructure-feasibility-v1",
    pinnedGame: timeline?.pinnedGame ?? null,
    source: {
      timeline: "experiments/p43-food-safe-jobs-timeline.json",
      timelineSha256: sourceSha256,
      arm: "P43 B diagnostic arm; projections do not authorize its assumed-empty worker set",
      normalizedInputBytes,
      normalizedObservationCount: states.length,
    },
    formula: {
      farmerImpact: FARMER_IMPACT,
      fullFarmBonusByAgriculture: { beforeII: 0.65, fromII: 1.15 },
      expression:
        "food = effectiveOtherFoodProduction + (min(farms,farmers)*(0.82+fullFarmBonus) + max(0,farmers-farms)*0.82) * observedFarmerFormulaCoefficient",
      strictPositiveMargin: FOOD_SAFETY_MARGIN,
      stoneCapacity: STONE_CAPACITY,
      constructionProjection:
        "Farm-slot count changes only in the formula; observed same-period modifiers are held fixed",
    },
    authority: {
      workerCommitments: "unavailable",
      workerCommitmentsAreNotTreatedAsEmpty: true,
      farmPurchase: "not authorized",
      jobsAssignment: "not authorized",
      productionBehaviorChanged: false,
    },
    selectedPeriods: selected,
    allRetainedP43BStates: {
      observedWeatherRangePercent:
        foodWeather.length > 0
          ? [Math.min(...foodWeather), Math.max(...foodWeather)]
          : null,
      unavailableObservations: states
        .filter((state) => !state.available)
        .map(({ period, reasons }) => ({ period, reasons })),
      highDemandObservationCount: highDemandStates.length,
      highDemandScenarios,
      scenarios: allRetained,
    },
    performance: {
      clock: "process.hrtime.bigint (native monotonic)",
      scope:
        "pure projection and aggregate loops; excludes file I/O, JSON parsing, and normalization",
      analysisMs,
      normalizedInputBytes,
      scenarioEvaluations: states.length * 9 + selected.length * 9,
    },
  };
}

async function runCli() {
  const inputUrl = new URL(
    "./p43-food-safe-jobs-timeline.json",
    import.meta.url,
  );
  const outputUrl = new URL(
    "./p44-food-infrastructure-feasibility-matrix.json",
    import.meta.url,
  );
  const raw = readFileSync(inputUrl);
  const timeline = JSON.parse(raw.toString("utf8"));
  const sourceSha256 = createHash("sha256").update(raw).digest("hex");
  const result = analyzeP44FoodScenarios(timeline, { sourceSha256 });
  const formatted = await format(JSON.stringify(result), { parser: "json" });
  writeFileSync(outputUrl, formatted, "utf8");
  process.stdout.write(
    `Wrote ${fileURLToPath(outputUrl)} (${result.performance.analysisMs.toFixed(3)} ms; ${result.performance.normalizedInputBytes} normalized bytes)\n`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await runCli();
}
