import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format as formatWithPrettier } from "prettier";

export const P45_PINNED_GAME =
  "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f";
export const P45_FOOD_TIME_MULTIPLIER = 0.25;
export const P45_FOOD_REPLAY_START = 728;
export const P45_FOOD_REPLAY_END = 5624;

const FARMER_IMPACT = 0.82;
const FULL_FARM_BONUS = Object.freeze({
  beforeAgricultureII: 0.65,
  agricultureII: 1.15,
});
const FLOW_TOLERANCE = 0.02;
const P45_SOURCE_PATHS = Object.freeze({
  fastLoop: "src/main.js:1737-1745",
  foodPool: "src/main.js:4111-4290",
  zoneTally: "src/functions.js:929-976",
  resourceClamp: "src/functions.js:854-898",
  supplyMode: "src/supply.js:12-20",
  externalFoodWriters:
    "src/actions.js:1202,4817,5225,9634-9648,10067; src/events.js:980-982; src/main.js:3939-3941,4071,4299,4390; src/races.js:9048; src/portal.js:8967; src/truepath.js:11331",
  finalCapacityClamp: "src/main.js:9447-9449",
  capacity:
    "src/main.js:11355-11361; src/supply.js:1030+; src/resources.js:933",
  starvation: "src/main.js:4290-4293,4350-4378; src/races.js:9409+",
  p43FoodObservation:
    "experiments/p43-food-safe-jobs-timeline.json (1161 B observations, eight-period spacing)",
});

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clampFoodStock(amount, capacity) {
  return Math.min(capacity, Math.max(0, amount));
}

function applyFoodOperation(amount, capacity, operation) {
  if (operation.type === "set") {
    return clampFoodStock(operation.value, capacity);
  }
  return clampFoodStock(amount + operation.value, capacity);
}

function validExternalOperation(operation) {
  return (
    operation &&
    ["before-food-pool", "after-food-pool"].includes(operation.phase) &&
    ["delta", "set"].includes(operation.type) &&
    finite(operation.value) &&
    typeof operation.source === "string" &&
    operation.source.length > 0
  );
}

function assessStarvation({
  paymentSucceeded,
  grossProduction,
  consumption,
  threshold,
  starvationCheck,
  population,
}) {
  if (paymentSucceeded) {
    return {
      status: "not-triggered",
      populationAfter: population,
      futureConsumptionMustBeReobserved: false,
    };
  }
  if (
    !finite(grossProduction) ||
    !finite(consumption) ||
    !finite(threshold) ||
    threshold <= 0 ||
    typeof starvationCheck !== "boolean"
  ) {
    return {
      status: "unavailable",
      populationAfter: population,
      futureConsumptionMustBeReobserved: true,
    };
  }
  const deathCondition = grossProduction < consumption / threshold;
  const starved = starvationCheck && deathCondition;
  return {
    status: starved ? "starvation-observed" : "payment-failed-no-death",
    deathCondition,
    starvationCheck,
    populationAfter:
      starved && Number.isSafeInteger(population)
        ? Math.max(0, population - 1)
        : population,
    futureConsumptionMustBeReobserved: starved,
  };
}

/** One authenticated native fastLoop Food transition; no time scale is fitted. */
export function transitionNativeFoodStock(input) {
  const stock = input?.stock;
  const capacity = input?.capacity;
  const production = input?.production;
  const consumption = input?.consumption;
  const fastLoops = input?.fastLoops ?? 1;
  const externalOperations = input?.externalOperations ?? [];
  const externalEventsComplete = input?.externalEventsComplete === true;
  const poolMode = input?.poolMode ?? null;
  const inputErrors = [];

  if (!finite(stock) || stock < 0)
    inputErrors.push("Food stock is missing or invalid");
  if (!finite(capacity) || capacity <= 0)
    inputErrors.push("Food storage capacity is missing or invalid");
  if (!finite(production) || production < 0)
    inputErrors.push("Food production is missing or invalid");
  if (!finite(consumption) || consumption < 0)
    inputErrors.push("Food consumption is missing or invalid");
  if (poolMode !== "global" && poolMode !== "regional")
    inputErrors.push("Food supply-pool mode is missing or invalid");
  if (poolMode === "regional")
    inputErrors.push(
      "Regional Food requires per-pool stock and capacity inputs",
    );
  if (!Number.isSafeInteger(fastLoops) || fastLoops < 1)
    inputErrors.push("Native fastLoop count is missing or invalid");
  if (
    !Array.isArray(externalOperations) ||
    externalOperations.some((entry) => !validExternalOperation(entry))
  )
    inputErrors.push(
      "An external Food stock operation lacks phase or source evidence",
    );

  if (inputErrors.length > 0) {
    return {
      status: "unavailable",
      reasons: inputErrors,
      stock: finite(stock) ? stock : null,
      capacity: finite(capacity) ? capacity : null,
      poolMode,
      confidence: input?.confidence ?? null,
      provenance: input?.provenance ?? null,
    };
  }

  const steps = [];
  let amount = clampFoodStock(stock, capacity);
  const capacityClampLoss = stock - amount;
  let totalOverflow = 0;
  let firstZeroStockFastLoop = amount === 0 ? 0 : null;
  let firstFailedPaymentFastLoop = null;
  let starvation = null;
  let stockTransitionComplete = externalEventsComplete;
  for (let index = 0; index < fastLoops; index += 1) {
    for (const operation of externalOperations.filter(
      (entry) => entry.phase === "before-food-pool",
    )) {
      amount = applyFoodOperation(amount, capacity, operation);
    }
    const requested =
      amount + P45_FOOD_TIME_MULTIPLIER * (production - consumption);
    const paymentSucceeded = requested >= 0;
    const beforeFlow = amount;
    amount = clampFoodStock(requested, capacity);
    const overflow = Math.max(0, requested - capacity);
    totalOverflow += overflow;
    if (amount === 0 && firstZeroStockFastLoop === null)
      firstZeroStockFastLoop = index + 1;
    if (!paymentSucceeded && firstFailedPaymentFastLoop === null)
      firstFailedPaymentFastLoop = index + 1;
    const starvationEvidence = input?.starvationChecks?.[index] ?? null;
    const nextStarvation = assessStarvation({
      paymentSucceeded,
      grossProduction: production,
      consumption,
      threshold: input?.starvationThreshold,
      starvationCheck: starvationEvidence,
      population: input?.population,
    });
    if (nextStarvation.status === "starvation-observed") {
      starvation = nextStarvation;
    } else if (
      nextStarvation.status === "payment-failed-no-death" &&
      starvation === null
    ) {
      starvation = nextStarvation;
    } else if (nextStarvation.status === "unavailable" && starvation === null) {
      starvation = nextStarvation;
    }
    for (const operation of externalOperations.filter(
      (entry) => entry.phase === "after-food-pool",
    )) {
      amount = applyFoodOperation(amount, capacity, operation);
    }
    steps.push({
      fastLoop: index + 1,
      beforeFoodPool: beforeFlow,
      requestedStock: requested,
      stock: amount,
      paymentSucceeded,
      overflow,
      starvation: nextStarvation.status,
    });
    if (
      nextStarvation.status === "starvation-observed" ||
      nextStarvation.status === "unavailable"
    ) {
      stockTransitionComplete = false;
      break;
    }
  }

  return {
    status: "available",
    stock: amount,
    capacity,
    poolMode,
    netRate: production - consumption,
    perFastLoopStockChange:
      P45_FOOD_TIME_MULTIPLIER * (production - consumption),
    firstZeroStockFastLoop,
    firstFailedPaymentFastLoop,
    capacityClampLoss,
    totalOverflow,
    starvation: starvation ?? {
      status: "not-triggered",
      populationAfter: input?.population ?? null,
      futureConsumptionMustBeReobserved: false,
    },
    externalEventsComplete,
    stockTransitionComplete,
    simulatedFastLoops: steps.length,
    steps,
    confidence: input?.confidence ?? null,
    provenance: input?.provenance ?? null,
  };
}

function validProvenance(provenance) {
  return (
    provenance &&
    typeof provenance.source === "string" &&
    provenance.source.length > 0 &&
    Number.isSafeInteger(provenance.period) &&
    Number.isSafeInteger(provenance.workCycleSequence) &&
    Number.isSafeInteger(provenance.rootGeneration) &&
    typeof provenance.progressionGeneration === "string" &&
    provenance.rootMatches === true &&
    provenance.current === true
  );
}

function unavailableStatus(input, reason) {
  return {
    status: "unavailable",
    reason,
    confidence: input?.confidence ?? null,
    provenance: input?.provenance ?? null,
  };
}

/** Pure status classifier. Negative flow alone never proves exhaustion. */
export function evaluateP45FoodStatus(input) {
  const provenance = input?.provenance;
  const confidence = input?.confidence;
  if (!validProvenance(provenance))
    return unavailableStatus(
      input,
      "Food observation provenance is stale or incomplete",
    );
  if (!["high", "medium", "low"].includes(confidence))
    return unavailableStatus(input, "Explicit confidence is required");
  const starveCount = input?.starvation?.count;
  const previousStarveCount = input?.starvation?.previousCount;
  if (
    Number.isSafeInteger(starveCount) &&
    Number.isSafeInteger(previousStarveCount) &&
    starveCount > previousStarveCount
  ) {
    return {
      status: "starvation-observed",
      confidence,
      provenance,
    };
  }
  if (
    input?.foodProductionKnown !== true ||
    input?.foodConsumptionKnown !== true ||
    input?.foodModifiersComplete !== true ||
    input?.foodStockOwnerKnown !== true ||
    input?.foodPoolModeKnown !== true ||
    !["global", "regional"].includes(input?.foodPoolMode) ||
    (input?.foodPoolMode === "regional" &&
      input?.regionalFoodPoolsComplete !== true) ||
    !finite(input?.production) ||
    input.production < 0 ||
    !finite(input?.consumption) ||
    input.consumption < 0 ||
    !finite(input?.stock) ||
    input.stock < 0 ||
    !finite(input?.capacity) ||
    input.capacity <= 0 ||
    input.stock > input.capacity
  ) {
    return unavailableStatus(
      input,
      "Food production, demand, modifiers, ownership, or storage evidence is incomplete",
    );
  }

  const net = input.production - input.consumption;
  const recovery = input?.recovery;
  if (
    recovery?.deficitObserved === true &&
    finite(recovery.previousStock) &&
    input.stock > recovery.previousStock &&
    validProvenance(recovery.provenance)
  ) {
    return {
      status: "recovering",
      net,
      stockIncrease: input.stock - recovery.previousStock,
      confidence,
      provenance,
      recoveryProvenance: recovery.provenance,
    };
  }

  if (net > 0) {
    return { status: "currently-positive", net, confidence, provenance };
  }
  if (net === 0) {
    return unavailableStatus(
      input,
      "Food flow is at break-even; no stock horizon was established",
    );
  }

  const horizon = input?.reserveHorizon;
  if (
    horizon?.known !== true ||
    !finite(horizon.maximumCumulativeDeficit) ||
    horizon.maximumCumulativeDeficit < 0 ||
    !Number.isSafeInteger(horizon.startPeriod) ||
    !Number.isSafeInteger(horizon.endPeriod) ||
    horizon.endPeriod <= horizon.startPeriod ||
    typeof horizon.source !== "string" ||
    horizon.source.length === 0 ||
    !validProvenance(horizon.provenance) ||
    !["high", "medium"].includes(horizon.confidence) ||
    input.stockTransitionComplete !== true
  ) {
    return unavailableStatus(
      input,
      "A complete, evidence-backed reserve horizon is required for negative flow",
    );
  }
  const requiredReserve = horizon.maximumCumulativeDeficit;
  const status =
    input.stock + Number.EPSILON >= requiredReserve
      ? "buffered-deficit"
      : "structural-deficit";
  return {
    status,
    net,
    requiredReserve,
    reserveHeadroom: input.stock - requiredReserve,
    reserveHorizon: {
      startPeriod: horizon.startPeriod,
      endPeriod: horizon.endPeriod,
      source: horizon.source,
    },
    confidence: horizon.confidence,
    provenance,
    horizonProvenance: horizon.provenance,
  };
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

function sumWorkers(assignments, field) {
  if (!assignments || typeof assignments !== "object") return null;
  const entries = Object.values(assignments);
  if (entries.some((entry) => !Number.isSafeInteger(entry?.[field])))
    return null;
  return entries.reduce((sum, entry) => sum + entry[field], 0);
}

function finitePhysicalMaximum(job, population) {
  if (job?.maximum === -1) return population;
  return Number.isSafeInteger(job?.maximum) && job.maximum >= 0
    ? Math.min(population, job.maximum)
    : null;
}

function weatherPercent(event) {
  const row = event?.foodProducerRows?.["ᄂWeather"];
  if (typeof row !== "string" || !row.endsWith("%")) return null;
  const parsed = Number.parseFloat(row);
  return finite(parsed) ? parsed : null;
}

function consumerTotal(rows) {
  if (!rows || typeof rows !== "object" || Array.isArray(rows)) return null;
  const values = Object.values(rows);
  if (values.some((value) => !finite(value))) return null;
  return values.reduce((sum, value) => sum + Math.abs(value), 0);
}

function sourceModifierTuple(inputs) {
  return {
    sourceFactors: inputs?.farmerSourceModifierFactors ?? null,
    globalProductionModifier: inputs?.globalProductionModifier ?? null,
    effectiveOtherFoodProduction: inputs?.effectiveOtherFoodProduction ?? null,
    formulaCoefficient: inputs?.foodFormulaModifier ?? null,
  };
}

function normalizeEvent(event, pinnedGameIsValid) {
  const reasons = [];
  const identity = event?.identity;
  const modifier = event?.foodModifierInputs;
  const farmerJob = event?.jobCatalog?.find((job) => job.id === "farmer");
  const quarryJob = event?.jobCatalog?.find(
    (job) => job.id === "quarry_worker",
  );
  const city = event?.buildings?.city;
  const garrisonWorkers = event?.occupiedJobs?.garrison?.workers ?? 0;
  const population = event?.population;
  const foodCapacity = event?.foodStockCapacity;
  const consumerRate = consumerTotal(event?.foodConsumerRows);
  const civilianWorkers = sumWorkers(event?.constrainedAssignments, "workers");
  const civilianServants = sumWorkers(
    event?.constrainedAssignments,
    "servants",
  );
  const agriculture = modifier?.research?.agriculture;
  const weather = weatherPercent(event);
  const farmerLedgerOutput = parseBreakdownRate(
    event?.foodProducerRows?.Farmer,
  );
  const soldierLedgerOutput = modifier?.soldierLedgerOutput;
  const soldierQuarantineFactor = modifier?.soldierQuarantineFactor;
  const farmerFactors = modifier?.farmerSourceModifierFactors;
  const unmodeledProducerRows = Object.entries(event?.foodProducerRows ?? {})
    .filter(
      ([id]) => id !== "Farmer" && id !== "Soldiers" && !id.startsWith("ᄂ"),
    )
    .filter(([, value]) => {
      const rate = parseBreakdownRate(value);
      return rate === null || Math.abs(rate) > FLOW_TOLERANCE;
    })
    .map(([id]) => id);
  const currentFarmers = event?.occupiedJobs?.farmer?.workers;

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
      "current root, Jobs input, or control generation is incomplete",
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
    !Array.isArray(farmerFactors) ||
    farmerFactors.length !== 4 ||
    farmerFactors.some((factor) => !finite(factor) || factor <= 0) ||
    !finite(modifier?.globalProductionModifier) ||
    modifier.globalProductionModifier <= 0 ||
    !finite(farmerLedgerOutput) ||
    !finite(soldierLedgerOutput) ||
    !finite(soldierQuarantineFactor) ||
    !finite(weather)
  ) {
    reasons.push(
      "Food formula or production-modifier provenance is incomplete",
    );
  }
  if (unmodeledProducerRows.length > 0)
    reasons.push("an active Food producer row lacks a retained source formula");
  if (
    !finite(event?.foodProduction) ||
    !finite(event?.foodConsumption) ||
    !finite(event?.foodNet) ||
    consumerRate === null ||
    Math.abs(consumerRate - event.foodConsumption) > FLOW_TOLERANCE ||
    Math.abs(event.foodProduction - event.foodConsumption - event.foodNet) >
      FLOW_TOLERANCE
  ) {
    reasons.push("native Food producer or consumer rows do not reconcile");
  }

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
    ) > FLOW_TOLERANCE
  ) {
    reasons.push(
      "pinned Farmer formula does not reconcile to current Food output",
    );
  }
  const sourceFactorProduct = Array.isArray(farmerFactors)
    ? farmerFactors.reduce((product, factor) => product * factor, 1)
    : NaN;
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
      FLOW_TOLERANCE ||
    !finite(reconstructedOtherFood) ||
    Math.abs(reconstructedOtherFood - modifier?.effectiveOtherFoodProduction) >
      FLOW_TOLERANCE
  ) {
    reasons.push(
      "Farmer or Soldier source modifiers do not reconcile to the retained formula",
    );
  }

  const farmerPhysicalMaximum = finitePhysicalMaximum(farmerJob, population);
  const quarryPhysicalMaximum = finitePhysicalMaximum(quarryJob, population);

  return {
    period: event?.period ?? null,
    workCycleSequence: event?.workCycle?.sequence ?? null,
    provenance: {
      source: "P43 B native Jobs-cycle observation",
      period: event?.period ?? null,
      workCycleSequence: event?.workCycle?.sequence ?? null,
      rootGeneration: identity?.rootGeneration ?? null,
      progressionGeneration: identity?.progressionGeneration ?? null,
      farmerControlGeneration: identity?.farmerControlGeneration ?? null,
      quarryControlGeneration: identity?.quarryControlGeneration ?? null,
      rootMatches: identity?.rootMatches === true,
      current:
        identity?.rootMatches === true &&
        identity?.inputIdentityAvailable === true,
    },
    availableForFlow: reasons.length === 0,
    reasons,
    foodProduction: event?.foodProduction ?? null,
    foodConsumption: event?.foodConsumption ?? null,
    foodNet: event?.foodNet ?? null,
    foodStock: event?.foodStock ?? null,
    foodCapacity,
    weatherPercent: weatherPercent(event),
    civilianPopulation: population ?? null,
    housingCapacity: event?.housingCapacity ?? null,
    garrisonWorkers,
    starvationCount: event?.starvationCount ?? null,
    deaths: event?.deaths ?? null,
    farmCount: event?.buildings?.city?.farm ?? null,
    observedFarmers: event?.occupiedJobs?.farmer?.workers ?? null,
    observedQuarryWorkers: event?.occupiedJobs?.quarry_worker?.workers ?? 0,
    farmerSmartMaximum: farmerJob?.smartMaximum ?? null,
    farmerPhysicalMaximum,
    quarrySmartMaximum: quarryJob?.smartMaximum ?? null,
    quarryPhysicalMaximum,
    quarryCount: city?.rock_quarry ?? null,
    agriculture: modifier?.research?.agriculture ?? null,
    research: modifier?.research ?? null,
    foodFormulaModifier: event?.foodFormulaModifier ?? null,
    effectiveOtherFoodProduction:
      modifier?.effectiveOtherFoodProduction ?? null,
    farmerSourceModifierFactors: modifier?.farmerSourceModifierFactors ?? null,
    globalProductionModifier: modifier?.globalProductionModifier ?? null,
    modifierTuple: sourceModifierTuple(modifier),
    foodProducerRows: event?.foodProducerRows ?? null,
    foodConsumerRows: event?.foodConsumerRows ?? null,
    unmodeledProducerRows,
    stoneStock: event?.stoneStock ?? null,
    stoneCapacity: 600,
    stoneHeadroom:
      finite(event?.stoneStock) && event.stoneStock <= 600
        ? 600 - event.stoneStock
        : null,
    stoneProduction: event?.stoneProduction ?? null,
    stoneConsumption: event?.stoneConsumption ?? null,
    stoneDemandComplete: false,
    workerCommitments: event?.workerCommitments ?? "unavailable",
    workerCommitmentsKnown: false,
    p43AssumedEmptyForDiagnostic: event?.workerCommitmentsAssumedEmpty === true,
    foodPoolModeKnown: false,
  };
}

function farmBaseOutput(farms, farmers, fullFarmBonus) {
  return (
    Math.min(farms, farmers) * (FARMER_IMPACT + fullFarmBonus) +
    Math.max(0, farmers - farms) * FARMER_IMPACT
  );
}

export function projectP45FoodFlow(
  observation,
  { farms, farmers, quarryWorkers = null } = {},
) {
  const population = observation?.civilianPopulation;
  const reasons = [];
  if (
    !observation?.availableForFlow ||
    !Number.isSafeInteger(farms) ||
    farms < 0 ||
    !Number.isSafeInteger(farmers) ||
    farmers < 0 ||
    !Number.isSafeInteger(population)
  ) {
    reasons.push("scenario or retained Food formula evidence is unavailable");
  }
  if (
    quarryWorkers !== null &&
    (!Number.isSafeInteger(quarryWorkers) || quarryWorkers < 0)
  ) {
    reasons.push("Quarry Worker configuration is invalid");
  }
  if (
    !finite(observation?.foodFormulaModifier) ||
    observation.foodFormulaModifier <= 0 ||
    !finite(observation?.effectiveOtherFoodProduction) ||
    !finite(observation?.foodConsumption)
  ) {
    reasons.push("Food production modifier or demand is incomplete");
  }
  if (reasons.length > 0) {
    return {
      status: "unavailable",
      farms: Number.isSafeInteger(farms) ? farms : null,
      farmers: Number.isSafeInteger(farmers) ? farmers : null,
      reasons,
      provenance: observation?.provenance ?? null,
    };
  }

  const fullFarmBonus =
    observation.agriculture >= 2
      ? FULL_FARM_BONUS.agricultureII
      : FULL_FARM_BONUS.beforeAgricultureII;
  const farmerBase = farmBaseOutput(farms, farmers, fullFarmBonus);
  const foodProduction =
    observation.effectiveOtherFoodProduction +
    farmerBase * observation.foodFormulaModifier;
  const foodNet = foodProduction - observation.foodConsumption;
  const farmerPhysicalEligible =
    Number.isSafeInteger(observation.farmerPhysicalMaximum) &&
    farmers <= observation.farmerPhysicalMaximum;
  const farmerSmartEligible =
    Number.isSafeInteger(observation.farmerSmartMaximum) &&
    farmers <= observation.farmerSmartMaximum;
  const quarryPhysicalEligible =
    quarryWorkers !== null &&
    Number.isSafeInteger(observation.quarryPhysicalMaximum) &&
    quarryWorkers <= observation.quarryPhysicalMaximum &&
    (quarryWorkers === 0 || observation.quarryCount > 0);
  const quarrySmartEligible =
    quarryWorkers !== null &&
    Number.isSafeInteger(observation.quarrySmartMaximum) &&
    quarryWorkers <= observation.quarrySmartMaximum;
  return {
    status: "available",
    period: observation.period,
    farms,
    farmers,
    quarryWorkers,
    laborConfigurationComplete: quarryWorkers !== null,
    laborPhysicallyFeasible:
      quarryWorkers === null || !Number.isSafeInteger(population)
        ? null
        : farmers + quarryWorkers <= population &&
          farmerPhysicalEligible &&
          quarryPhysicalEligible,
    farmerPhysicalMaximum: observation.farmerPhysicalMaximum,
    farmerPhysicalEligible,
    farmerSmartMaximum: observation.farmerSmartMaximum,
    farmerSmartEligible,
    quarryPhysicalMaximum: observation.quarryPhysicalMaximum,
    quarryPhysicalEligible,
    quarrySmartMaximum: observation.quarrySmartMaximum,
    quarrySmartEligible,
    fullFarmBonus,
    farmerBase,
    foodProduction,
    foodConsumption: observation.foodConsumption,
    foodNet,
    weatherPercent: observation.weatherPercent,
    sourceModifiers: observation.modifierTuple,
    provenance: observation.provenance,
    workerAssignmentAuthorized: false,
    workerCommitmentsKnown: observation.workerCommitmentsKnown,
  };
}

function contiguousRuns(rows, predicate, metric) {
  const runs = [];
  let run = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (predicate(row)) {
      if (run === null) {
        run = {
          startPeriod: row.period,
          endPeriod: row.period,
          observationCount: 0,
          minRate: null,
          sampleExposurePeriods: 0,
          heldFlowChange: 0,
        };
      }
      run.endPeriod = row.period;
      run.observationCount += 1;
      const rate = metric(row);
      if (finite(rate))
        run.minRate = run.minRate === null ? rate : Math.min(run.minRate, rate);
      const next = rows[index + 1];
      if (
        next &&
        Number.isSafeInteger(next.period) &&
        next.period > row.period
      ) {
        const duration = next.period - row.period;
        run.sampleExposurePeriods += duration;
        if (finite(rate))
          run.heldFlowChange += rate * P45_FOOD_TIME_MULTIPLIER * duration;
      }
      continue;
    }
    if (run !== null) {
      run.observedSpanPeriods = run.endPeriod - run.startPeriod;
      runs.push(run);
      run = null;
    }
  }
  if (run !== null) {
    run.observedSpanPeriods = run.endPeriod - run.startPeriod;
    runs.push(run);
  }
  return runs;
}

function summarizeWeather(rows) {
  const totals = new Map();
  const runs = [];
  let current = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const state = row.weatherPercent;
    const key = finite(state) ? `${state}%` : "unavailable";
    const duration =
      rows[index + 1] && rows[index + 1].period > row.period
        ? rows[index + 1].period - row.period
        : 0;
    const heldFoodFlowChange = finite(row.foodNet)
      ? row.foodNet * P45_FOOD_TIME_MULTIPLIER * duration
      : 0;
    const summary = totals.get(key) ?? {
      weatherPercent: state,
      observations: 0,
      observedBoundaryExposurePeriods: 0,
      heldBoundaryFoodFlowChange: 0,
    };
    summary.observations += 1;
    summary.observedBoundaryExposurePeriods += duration;
    summary.heldBoundaryFoodFlowChange += heldFoodFlowChange;
    totals.set(key, summary);

    if (current === null || current.key !== key) {
      if (current !== null) runs.push(current.value);
      current = {
        key,
        value: {
          weatherPercent: state,
          startPeriod: row.period,
          lastObservedPeriod: row.period,
          observations: 0,
          observedBoundaryExposurePeriods: 0,
          heldBoundaryFoodFlowChange: 0,
        },
      };
    }
    current.value.lastObservedPeriod = row.period;
    current.value.observations += 1;
    current.value.observedBoundaryExposurePeriods += duration;
    current.value.heldBoundaryFoodFlowChange += heldFoodFlowChange;
  }
  if (current !== null) runs.push(current.value);
  return {
    stateTotals: [...totals.values()].sort(
      (left, right) =>
        (left.weatherPercent ?? -Infinity) -
        (right.weatherPercent ?? -Infinity),
    ),
    contiguousRuns: runs,
    sampledStateExposureOnly: true,
    flowChangesAreSampledBoundaryHolds: true,
  };
}

function propertyTransitions(rows, read, keys) {
  const transitions = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = read(rows[index - 1]);
    const current = read(rows[index]);
    if (JSON.stringify(previous) === JSON.stringify(current)) continue;
    transitions.push({
      period: rows[index].period,
      fromPeriod: rows[index - 1].period,
      changes: Object.fromEntries(
        keys
          .filter(
            (key) =>
              JSON.stringify(previous?.[key]) !==
              JSON.stringify(current?.[key]),
          )
          .map((key) => [
            key,
            { from: previous?.[key] ?? null, to: current?.[key] ?? null },
          ]),
      ),
    });
  }
  return transitions;
}

function observedStockPoints(rows, checkpoints) {
  const points = new Map();
  for (const row of rows) {
    if (finite(row.foodStock))
      points.set(row.period, {
        period: row.period,
        foodStock: row.foodStock,
        foodCapacity: row.foodCapacity,
        source: "P43 B Jobs observation",
        starvationCount: row.starvationCount,
        civilianPopulation: row.civilianPopulation,
      });
  }
  for (const checkpoint of checkpoints ?? []) {
    const food = checkpoint?.state?.resources?.Food;
    if (Number.isSafeInteger(checkpoint?.period) && finite(food?.amount)) {
      points.set(checkpoint.period, {
        period: checkpoint.period,
        foodStock: food.amount,
        foodCapacity: food.max ?? null,
        source: "P43 B exact checkpoint",
        starvationCount: checkpoint.state.starved ?? null,
        civilianPopulation: checkpoint.state.population ?? null,
      });
    }
  }
  return [...points.values()].sort((left, right) => left.period - right.period);
}

function stockDrawdown(points) {
  let peak = null;
  let trough = null;
  let maxDrawdown = 0;
  let runningPeak = null;
  let runningPeakPeriod = null;
  for (const point of points) {
    if (runningPeak === null || point.foodStock > runningPeak) {
      runningPeak = point.foodStock;
      runningPeakPeriod = point.period;
    }
    const drawdown = runningPeak - point.foodStock;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      peak = { period: runningPeakPeriod, stock: runningPeak };
      trough = { period: point.period, stock: point.foodStock };
    }
  }
  return { maxObservedPeakToTroughDrawdown: maxDrawdown, peak, trough };
}

function integrateHeldBoundaryRates(rows, readRate) {
  let cumulativeChange = 0;
  const trajectory =
    rows.length > 0 ? [{ period: rows[0].period, foodStock: 0 }] : [];
  for (let index = 0; index < rows.length - 1; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];
    const rate = readRate(current);
    if (finite(rate) && next.period > current.period) {
      cumulativeChange +=
        rate * P45_FOOD_TIME_MULTIPLIER * (next.period - current.period);
    }
    trajectory.push({ period: next.period, foodStock: cumulativeChange });
  }
  const drawdown = stockDrawdown(trajectory);
  return {
    method: "sampled boundary rate held to next eight-period observation",
    cumulativeFoodFlowChange: cumulativeChange,
    maximumCumulativeDeficitBeforeRecovery:
      drawdown.maxObservedPeakToTroughDrawdown,
    peakBeforeDrawdown: drawdown.peak,
    trough: drawdown.trough,
    trajectory,
    calibratedStockProjection: false,
  };
}

function heldRateSummary(integration) {
  return {
    method: integration.method,
    cumulativeFoodFlowChange: integration.cumulativeFoodFlowChange,
    maximumCumulativeDeficitBeforeRecovery:
      integration.maximumCumulativeDeficitBeforeRecovery,
    peakBeforeDrawdown: integration.peakBeforeDrawdown,
    trough: integration.trough,
    calibratedStockProjection: false,
  };
}

function nativeCheckpointSummary(timeline, armName, periods) {
  const checkpoints = Array.isArray(timeline?.[`${armName}Checkpoints`])
    ? timeline[`${armName}Checkpoints`]
    : (timeline?.[armName]?.checkpoints ?? []);
  return periods.map((period) => {
    const checkpoint = checkpoints.find((entry) => entry.period === period);
    if (!checkpoint) return { period, status: "unavailable" };
    const observation = Array.isArray(timeline?.[armName])
      ? timeline[armName].find((entry) => entry.period === period)
      : null;
    const food = checkpoint.state?.resources?.Food;
    return {
      period,
      status: finite(food?.amount) ? "available" : "unavailable",
      foodStock: food?.amount ?? null,
      foodCapacity: food?.max ?? null,
      foodDiff: food?.diff ?? null,
      foodOutput: checkpoint.production?.foodOutput ?? null,
      foodConsumption: checkpoint.production?.foodConsumption ?? null,
      civilianPopulation: checkpoint.state?.population ?? null,
      garrisonWorkers:
        checkpoint.state?.jobs?.garrison ??
        observation?.garrisonWorkers ??
        null,
      starvationCount: checkpoint.state?.starved ?? null,
      deaths: checkpoint.state?.deaths ?? null,
    };
  });
}

function checkpointTransitionCheck(timeline, armName, fromPeriod, toPeriod) {
  const checkpoints = timeline?.[`${armName}Checkpoints`] ?? [];
  const from = checkpoints.find((entry) => entry.period === fromPeriod);
  const to = checkpoints.find((entry) => entry.period === toPeriod);
  const fromFood = from?.state?.resources?.Food;
  const toFood = to?.state?.resources?.Food;
  const production = from?.production?.foodOutput;
  const consumption = from?.production?.foodConsumption;
  if (
    !finite(fromFood?.amount) ||
    !finite(fromFood?.max) ||
    !finite(toFood?.amount) ||
    !finite(production) ||
    !finite(consumption) ||
    toPeriod <= fromPeriod
  ) {
    return { fromPeriod, toPeriod, status: "unavailable" };
  }
  const transition = transitionNativeFoodStock({
    stock: fromFood.amount,
    capacity: fromFood.max,
    poolMode: "global",
    production,
    consumption,
    fastLoops: toPeriod - fromPeriod,
    externalEventsComplete: false,
    confidence: "medium",
    provenance: {
      source: `P43 ${armName} native checkpoints`,
      period: fromPeriod,
      workCycleSequence: from?.workCycle?.sequence ?? fromPeriod,
      rootGeneration: from?.identity?.rootGeneration ?? 0,
      progressionGeneration:
        from?.identity?.progressionGeneration ?? "checkpoint-only",
      rootMatches: true,
      current: true,
    },
  });
  return {
    fromPeriod,
    toPeriod,
    status: "available",
    startingFoodStock: fromFood.amount,
    recordedFoodProduction: production,
    recordedFoodConsumption: consumption,
    predictedFoodStock: transition.stock,
    observedFoodStock: toFood.amount,
    residual: toFood.amount - transition.stock,
    firstZeroStockFastLoop: transition.firstZeroStockFastLoop,
    firstFailedPaymentFastLoop: transition.firstFailedPaymentFastLoop,
    starvation: transition.starvation.status,
    interpretation:
      "Local one-or-few-tick check using checkpoint rates; it does not establish the unobserved intervening trajectory.",
  };
}

function replayNativeStock(rows, timeline, armName, startPeriod, endPeriod) {
  const start = rows.find((row) => row.period === startPeriod);
  const end = rows.find((row) => row.period === endPeriod);
  if (
    !start ||
    !end ||
    !finite(start.foodStock) ||
    !finite(start.foodCapacity)
  ) {
    return {
      status: "unavailable",
      reason: "Authenticated start or end Food state is missing",
    };
  }
  const usable = rows.filter(
    (row) => row.period >= startPeriod && row.period <= endPeriod,
  );
  let stock = start.foodStock;
  let unboundedStock = start.foodStock;
  let maxAbsoluteResidual = 0;
  let maxPositiveResidual = 0;
  let firstResidualPeriod = null;
  let firstLargePositiveJump = null;
  const comparisons = [];
  for (let index = 1; index < usable.length; index += 1) {
    const previous = usable[index - 1];
    const observed = usable[index];
    const deltaPeriods = observed.period - previous.period;
    if (!Number.isSafeInteger(deltaPeriods) || deltaPeriods < 1) {
      return {
        status: "unavailable",
        reason: "P43 period spacing is incomplete or out of order",
      };
    }
    const nativeNetRate = observed.foodNet;
    if (!finite(nativeNetRate)) {
      return {
        status: "unavailable",
        reason: `Native Food rate is missing at p${observed.period}`,
      };
    }
    let firstExhaustionOffset = null;
    for (let step = 1; step <= deltaPeriods; step += 1) {
      const result = transitionNativeFoodStock({
        stock,
        capacity: observed.foodCapacity ?? previous.foodCapacity,
        poolMode: "global",
        production: Math.max(0, observed.foodProduction ?? 0),
        consumption: Math.max(
          0,
          (observed.foodProduction ?? 0) - nativeNetRate,
        ),
        externalEventsComplete: false,
        confidence: "low",
        provenance: observed.provenance,
      });
      const rawRequested = stock + P45_FOOD_TIME_MULTIPLIER * nativeNetRate;
      if (rawRequested < 0 && firstExhaustionOffset === null)
        firstExhaustionOffset = step;
      stock = result.stock;
      unboundedStock += P45_FOOD_TIME_MULTIPLIER * nativeNetRate;
    }
    const actualStock = observed.foodStock;
    const clippedResidual = actualStock - stock;
    const unboundedResidual = actualStock - unboundedStock;
    maxAbsoluteResidual = Math.max(
      maxAbsoluteResidual,
      Math.abs(unboundedResidual),
    );
    maxPositiveResidual = Math.max(maxPositiveResidual, unboundedResidual);
    if (firstResidualPeriod === null && Math.abs(unboundedResidual) > 0.01)
      firstResidualPeriod = observed.period;
    const actualDelta = actualStock - previous.foodStock;
    const expectedUnboundedDelta =
      P45_FOOD_TIME_MULTIPLIER * nativeNetRate * deltaPeriods;
    const unexplainedIncrease = actualDelta - expectedUnboundedDelta;
    if (
      firstLargePositiveJump === null &&
      actualDelta > 2 &&
      unexplainedIncrease > 2 &&
      observed.starvationCount === previous.starvationCount
    ) {
      firstLargePositiveJump = observed.period;
    }
    comparisons.push({
      fromPeriod: previous.period,
      period: observed.period,
      deltaPeriods,
      heldNativeNetRate: nativeNetRate,
      predictedUnboundedChange: expectedUnboundedDelta,
      observedStockChange: actualDelta,
      unexplainedResidual: actualDelta - expectedUnboundedDelta,
      predictedStockWithNativeClamp: stock,
      observedStock: actualStock,
      clippedStockResidual: clippedResidual,
      unboundedStockResidual: unboundedResidual,
      firstExhaustionOffset,
    });
  }
  const checkpoints = timeline?.[`${armName}Checkpoints`] ?? [];
  const actualPoints = observedStockPoints(rows, checkpoints);
  const synchronizedStart = rows.find((row) => row.period === 728);
  const firstSuccessor = rows.find((row) => row.period === 736);
  const p728BoundaryCheck =
    synchronizedStart && firstSuccessor
      ? {
          fromPeriod: 728,
          toPeriod: 736,
          startingFoodStock: synchronizedStart.foodStock,
          recordedFoodProduction: synchronizedStart.foodProduction,
          recordedFoodConsumption: synchronizedStart.foodConsumption,
          recordedFoodNet: synchronizedStart.foodNet,
          expectedChangeIfHeldForEightFastLoops:
            P45_FOOD_TIME_MULTIPLIER *
            synchronizedStart.foodNet *
            (firstSuccessor.period - synchronizedStart.period),
          observedFoodStockChange:
            firstSuccessor.foodStock - synchronizedStart.foodStock,
          residual:
            firstSuccessor.foodStock -
            synchronizedStart.foodStock -
            P45_FOOD_TIME_MULTIPLIER *
              synchronizedStart.foodNet *
              (firstSuccessor.period - synchronizedStart.period),
          interpretation:
            "Local boundary consistency only; a single eight-period interval does not calibrate intervening inputs.",
        }
      : { status: "unavailable" };
  const firstStockReset = comparisons.find(
    (comparison) =>
      comparison.observedStockChange > 2 && comparison.unexplainedResidual > 2,
  );
  const checkpointsOfInterest = nativeCheckpointSummary(
    timeline,
    armName,
    [728, 5624, 5625, 5626, 5629, 5630, 5632],
  );
  return {
    status: firstStockReset ? "invalid" : "conditional",
    modeledPoolMode: "global aggregate Food stock",
    p43PoolModeObserved: false,
    calibrationUsesSyntheticBoundaryHeldRates: true,
    sourceInterval: { startPeriod, endPeriod },
    sourceObservationCount: usable.length,
    p728StartFoodStock: start.foodStock,
    p728StartFoodCapacity: start.foodCapacity,
    p728To736BoundaryCheck: p728BoundaryCheck,
    checkpointBoundaryChecks: [
      checkpointTransitionCheck(timeline, armName, 5624, 5625),
      checkpointTransitionCheck(timeline, armName, 5625, 5626),
    ],
    predictedUnboundedEndStock: unboundedStock,
    predictedClampedEndStock: stock,
    observedEndFoodStock: end.foodStock,
    observedEndFoodCapacity: end.foodCapacity,
    firstCumulativeResidualOverOneHundredthPeriod: firstResidualPeriod,
    largestAbsoluteUnboundedResidual: maxAbsoluteResidual,
    largestPositiveUnboundedResidual: maxPositiveResidual,
    firstUnexplainedLargePositiveStockChange: firstLargePositiveJump,
    firstStockReset,
    p43NativeCheckpoints: checkpointsOfInterest,
    maximumObservedStockDrawdown: stockDrawdown(actualPoints),
    stockTimelinePointCount: actualPoints.length,
    failureReason: firstStockReset
      ? "P43 has upward Food stock changes outside the captured production/consumption rows; native transition phases and writer inputs are missing"
      : null,
    comparisons,
  };
}

function stockResetTransitions(rows) {
  const resets = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (
      finite(previous.foodStock) &&
      previous.foodStock < 40 &&
      current.foodStock === 50
    ) {
      resets.push({
        fromPeriod: previous.period,
        period: current.period,
        fromFoodStock: previous.foodStock,
        toFoodStock: current.foodStock,
        foodStockIncrease: current.foodStock - previous.foodStock,
        starvationCountChanged:
          current.starvationCount !== previous.starvationCount,
        civilianPopulationChanged:
          current.civilianPopulation !== previous.civilianPopulation,
        currentFoodNet: current.foodNet,
        currentWeatherPercent: current.weatherPercent,
      });
    }
  }
  return resets;
}

function modifierRanges(rows) {
  const keys = [
    "foodFormulaModifier",
    "globalProductionModifier",
    "effectiveOtherFoodProduction",
  ];
  return Object.fromEntries(
    keys.map((key) => {
      const values = rows.map((row) => row[key]).filter(finite);
      return [
        key,
        values.length > 0
          ? {
              minimum: Math.min(...values),
              maximum: Math.max(...values),
              distinctObservedValues: new Set(values).size,
            }
          : null,
      ];
    }),
  );
}

function summarizeScenarioFlow(
  rows,
  farms,
  farmers,
  {
    startPeriod = null,
    fixedQuarryWorkers = null,
    actualAllocations = false,
  } = {},
) {
  const allRows = rows.filter(
    (row) => startPeriod === null || row.period >= startPeriod,
  );
  const flowRows = allRows.map((row) => {
    const configuredFarmers = actualAllocations ? row.observedFarmers : farmers;
    const configuredQuarryWorkers = actualAllocations
      ? row.observedQuarryWorkers
      : fixedQuarryWorkers;
    const flow = actualAllocations
      ? {
          status:
            finite(row.foodProduction) &&
            finite(row.foodConsumption) &&
            finite(row.foodNet)
              ? "available"
              : "unavailable",
          period: row.period,
          farms: row.farmCount,
          farmers: configuredFarmers,
          quarryWorkers: configuredQuarryWorkers,
          foodProduction: row.foodProduction,
          foodConsumption: row.foodConsumption,
          foodNet: row.foodNet,
          weatherPercent: row.weatherPercent,
          provenance: row.provenance,
          laborPhysicallyFeasible: true,
          workerAssignmentAuthorized: false,
          workerCommitmentsKnown: row.workerCommitmentsKnown,
        }
      : projectP45FoodFlow(row, {
          farms,
          farmers: configuredFarmers,
          quarryWorkers: configuredQuarryWorkers,
        });
    const fixedConfigurationAvailable =
      flow.status === "available" && flow.laborPhysicallyFeasible === true;
    return {
      ...flow,
      fixedConfigurationAvailable,
    };
  });
  const formulaAvailable = flowRows.filter((row) => row.status === "available");
  const available = formulaAvailable.filter(
    (row) => row.laborPhysicallyFeasible === true,
  );
  const negative = available.filter((row) => row.foodNet < 0);
  const highDemand = available.filter((row) => row.foodConsumption >= 8);
  const highDemandNegative = highDemand.filter((row) => row.foodNet <= 0.01);
  const minimum = available.reduce(
    (best, row) => (!best || row.foodNet < best.foodNet ? row : best),
    null,
  );
  return {
    farms,
    farmers,
    stateCount: flowRows.length,
    formulaAvailableCount: formulaAvailable.length,
    flowAvailableCount: available.length,
    fixedConfigurationObservationCount: flowRows.filter(
      (row) => row.fixedConfigurationAvailable,
    ).length,
    negativeFlowObservationCount: negative.length,
    negativeFlowRuns: contiguousRuns(
      flowRows,
      (row) =>
        row.status === "available" &&
        row.laborPhysicallyFeasible === true &&
        row.foodNet < 0,
      (row) => row.foodNet,
    ),
    highDemandObservationCount: highDemand.length,
    highDemandAtOrBelowStrictMarginCount: highDemandNegative.length,
    minimumFoodNet: minimum?.foodNet ?? null,
    minimumFoodNetPeriod: minimum?.period ?? null,
    positiveFlowAtLastObservation:
      available.at(-1)?.foodNet > 0
        ? { period: available.at(-1).period, foodNet: available.at(-1).foodNet }
        : null,
    heldBoundaryRateIntegrationOnly: heldRateSummary(
      integrateHeldBoundaryRates(flowRows, (row) =>
        row.status === "available" ? row.foodNet : null,
      ),
    ),
    stockSimulation: {
      status: "unavailable",
      minimumFoodStock: null,
      peakFoodReserve: null,
      cumulativeFoodSurplusOrDeficit: null,
      maximumDrawdown: null,
      stockExhaustionIntervals: null,
      recoveryPeriods: null,
      firstProjectedStarvationCondition: null,
      minimumStartingReserveRequired: null,
      finalReserve: null,
      reason:
        "P43 native Food stock replay does not calibrate across the retained interval; hypothetical survival is not projected",
    },
    flowRows,
  };
}

function buildScenarioComparison(rows, timeline, calibration) {
  const starts = [728, 2000, 4000, 5000, 5768];
  const scenarioDefinitions = [
    {
      id: "A",
      label: "Historical P43 B",
      farms: 1,
      farmers: null,
      quarryWorkers: null,
      fixedQuarryWorkers: null,
      conditional: false,
      reason:
        "Replays the retained P43 B diagnostic Jobs allocations and observed stock; P43 worker commitments were test-only assumed empty",
    },
    {
      id: "B",
      label: "Three Farms / three Farmers / one Quarry Worker",
      farms: 3,
      farmers: 3,
      quarryWorkers: 1,
      fixedQuarryWorkers: 1,
      conditional: true,
      reason:
        "Farm availability and the 3F/1Q labor configuration are hypothetical; worker ownership and commitments are unavailable",
    },
    {
      id: "C",
      label: "Three Farms / storage-aware labor",
      farms: 3,
      farmers: 3,
      quarryWorkers: 1,
      fixedQuarryWorkers: 1,
      conditional: true,
      reason:
        "The 3F/1Q case can be assessed as a candidate; the 4F/0Q alternative is unavailable because fresh Stone capacity and demand evidence cannot establish that Stone production is not useful",
    },
    {
      id: "D",
      label: "Two Farms / strongest Food labor",
      farms: 2,
      farmers: 4,
      quarryWorkers: 0,
      fixedQuarryWorkers: 0,
      conditional: true,
      reason:
        "Two Farms and a 4F/0Q labor configuration are hypothetical; acquisition and worker ownership are unsupported",
    },
  ];

  return scenarioDefinitions.map((definition) => {
    const flowRuns = [];
    for (const startPeriod of starts) {
      const start = rows.find((row) => row.period === startPeriod);
      if (!start) continue;
      const farmers =
        definition.id === "A" ? start.observedFarmers : definition.farmers;
      const flows = summarizeScenarioFlow(rows, definition.farms, farmers, {
        startPeriod,
        actualAllocations: definition.id === "A",
        fixedQuarryWorkers: definition.fixedQuarryWorkers,
      });
      const historicalBoundary = rows.find((row) => row.period === startPeriod);
      const storageAwareFlow =
        definition.id === "C"
          ? summarizeScenarioFlow(rows, 3, 4, {
              startPeriod,
              fixedQuarryWorkers: 0,
            })
          : null;
      flowRuns.push({
        startPeriod,
        acquisitionTiming:
          startPeriod === 728
            ? "optimistic upper bound: Farms assumed available at first synchronized eligible snapshot"
            : "conditional availability at a retained native-observation boundary; no purchase period inferred",
        observedFoodStock: historicalBoundary.foodStock,
        observedFoodCapacity: historicalBoundary.foodCapacity,
        candidateStartingReserveRangeNotSimulated: {
          minimum: 0,
          maximum: historicalBoundary.foodStock,
          upperBoundSource: "authentic P43 B Food.amount at the boundary",
          status: "not tested because native stock calibration is invalid",
        },
        sourceFlowAssessment: {
          stateCount: flows.stateCount,
          flowAvailableCount: flows.flowAvailableCount,
          fixedConfigurationObservationCount:
            flows.fixedConfigurationObservationCount,
          negativeFlowObservationCount: flows.negativeFlowObservationCount,
          highDemandObservationCount: flows.highDemandObservationCount,
          highDemandAtOrBelowStrictMarginCount:
            flows.highDemandAtOrBelowStrictMarginCount,
          formulaAvailableObservationCount: flows.formulaAvailableCount,
          negativeFlowRuns: flows.negativeFlowRuns,
          minimumFoodNet: flows.minimumFoodNet,
          minimumFoodNetPeriod: flows.minimumFoodNetPeriod,
          positiveFlowAtLastObservation: flows.positiveFlowAtLastObservation,
          heldBoundaryRateIntegrationOnly: heldRateSummary(
            flows.heldBoundaryRateIntegrationOnly,
          ),
        },
        stockSimulation: {
          status: "unavailable",
          minimumFoodStock: null,
          peakFoodReserve: null,
          cumulativeFoodSurplusOrDeficit: null,
          maximumDrawdown: null,
          stockExhaustionIntervals: null,
          recoveryPeriods: null,
          firstProjectedStarvationCondition: null,
          minimumStartingReserveRequired: null,
          finalReserve: null,
          reason: calibration.failureReason ?? calibration.reason,
        },
        stone: {
          status: "conditional or unavailable",
          observedStockAtBoundary: historicalBoundary.stoneStock,
          observedCapacity: historicalBoundary.stoneCapacity,
          observedHeadroom: historicalBoundary.stoneHeadroom,
          observedQuarrySmartMaximum: historicalBoundary.quarrySmartMaximum,
          observedStoneProduction: historicalBoundary.stoneProduction,
          observedStoneConsumption: historicalBoundary.stoneConsumption,
          demandComplete: historicalBoundary.stoneDemandComplete,
          fullStorageAtBoundary: historicalBoundary.stoneHeadroom === 0,
          projectedStockAfterHypotheticalQuarryLabor: null,
          reason:
            definition.id === "C"
              ? "Counterfactual Quarry production changes Stone stock; demand and future stock changes are not complete, so the 4F/0Q suspension condition is unavailable"
              : "Only historical Stone stock is retained; no counterfactual Stone path is asserted",
        },
        conditional: definition.conditional,
        storageAwareAlternative:
          definition.id === "C"
            ? {
                farms: 3,
                farmers: 4,
                quarryWorkers: 0,
                status: "unavailable",
                reason:
                  "Fresh Stone capacity and demand evidence is incomplete",
                foodFlowSensitivityOnly: {
                  flowAvailableCount: storageAwareFlow.flowAvailableCount,
                  negativeFlowObservationCount:
                    storageAwareFlow.negativeFlowObservationCount,
                  negativeFlowRuns: storageAwareFlow.negativeFlowRuns,
                  minimumFoodNet: storageAwareFlow.minimumFoodNet,
                  minimumFoodNetPeriod: storageAwareFlow.minimumFoodNetPeriod,
                  positiveFlowAtLastObservation:
                    storageAwareFlow.positiveFlowAtLastObservation,
                  heldBoundaryRateIntegrationOnly: heldRateSummary(
                    storageAwareFlow.heldBoundaryRateIntegrationOnly,
                  ),
                  calibratedStockProjection: false,
                },
              }
            : null,
        reason: definition.reason,
      });
    }
    return {
      id: definition.id,
      label: definition.label,
      farms: definition.farms,
      farmers: definition.farmers,
      quarryWorkers: definition.quarryWorkers,
      fixedQuarryWorkers: definition.fixedQuarryWorkers,
      conditional: definition.conditional,
      reason: definition.reason,
      boundaryEvaluations: flowRuns,
    };
  });
}

function transitionRows(rows, read, keys) {
  return propertyTransitions(rows, read, keys);
}

export function normalizeP45Timeline(timeline) {
  const pinnedGameIsValid =
    timeline?.schema === "p43-food-safe-jobs-timeline-v1" &&
    timeline?.pinnedGame === P45_PINNED_GAME &&
    Array.isArray(timeline?.armA?.events) &&
    Array.isArray(timeline?.armB?.events);
  const B = Array.isArray(timeline?.armB?.events)
    ? timeline.armB.events.map((event) =>
        normalizeEvent(event, pinnedGameIsValid),
      )
    : [];
  const A = Array.isArray(timeline?.armA?.events)
    ? timeline.armA.events.map((event) =>
        normalizeEvent(event, pinnedGameIsValid),
      )
    : [];
  return {
    schema: "p45-food-stock-normalized-v1",
    pinnedGame: timeline?.pinnedGame ?? null,
    pinnedGameIsValid,
    armA: A,
    armB: B,
    armACheckpoints: timeline?.armA?.checkpoints ?? [],
    armBCheckpoints: timeline?.armB?.checkpoints ?? [],
    sourceTimeline: "experiments/p43-food-safe-jobs-timeline.json",
  };
}

function fullWeatherKey(value) {
  return finite(value) ? `${value}%` : "unavailable";
}

function buildWeatherAndDemand(rows, checkpoints) {
  const stockPoints = observedStockPoints(rows, checkpoints);
  const populationTransitions = transitionRows(
    rows,
    (row) => ({
      civilians: row.civilianPopulation,
      garrison: row.garrisonWorkers,
      demand: row.foodConsumption,
      starvationCount: row.starvationCount,
    }),
    ["civilians", "garrison", "demand", "starvationCount"],
  );
  const researchKeys = [
    "agriculture",
    "hoe",
    "science",
    "military",
    "hunting",
    "foraging",
  ];
  const researchTransitions = transitionRows(
    rows,
    (row) => row.research,
    researchKeys,
  );
  const modifierKeys = [
    "farmerSourceModifierFactors",
    "globalProductionModifier",
    "effectiveOtherFoodProduction",
    "foodFormulaModifier",
  ];
  const productionModifierTransitions = transitionRows(
    rows,
    (row) => ({
      farmerSourceModifierFactors: row.farmerSourceModifierFactors,
      globalProductionModifier: row.globalProductionModifier,
      effectiveOtherFoodProduction: row.effectiveOtherFoodProduction,
      foodFormulaModifier: row.foodFormulaModifier,
    }),
    modifierKeys,
  );
  const actualNegativeRuns = contiguousRuns(
    rows,
    (row) => finite(row.foodNet) && row.foodNet < 0,
    (row) => row.foodNet,
  );
  const weather = summarizeWeather(rows);
  const resetTransitions = stockResetTransitions(rows);
  const p45Points = stockPoints;
  const runningDrawdown = stockDrawdown(p45Points);
  const starvationObservations = [
    ...rows
      .filter((row) => row.starvationCount > 0)
      .map((row) => ({ period: row.period, count: row.starvationCount })),
    ...(checkpoints ?? [])
      .filter((checkpoint) => checkpoint?.state?.starved > 0)
      .map((checkpoint) => ({
        period: checkpoint.period,
        count: checkpoint.state.starved,
      })),
  ].sort((left, right) => left.period - right.period);
  const sampleCount = rows.length;
  const negativeObservedRateCount = rows.filter(
    (row) => finite(row.foodNet) && row.foodNet < 0,
  ).length;
  const modifierSourceChangeCount = productionModifierTransitions.length;
  return {
    observationCount: sampleCount,
    periodRange: [rows[0]?.period ?? null, rows.at(-1)?.period ?? null],
    observedPeriodSpacing: [
      ...new Set(
        rows.slice(1).map((row, index) => row.period - rows[index].period),
      ),
    ],
    weather: {
      observedBoundaryStateCounts: Object.fromEntries(
        [...new Set(rows.map((row) => fullWeatherKey(row.weatherPercent)))].map(
          (key) => [
            key,
            rows.filter((row) => fullWeatherKey(row.weatherPercent) === key)
              .length,
          ],
        ),
      ),
      ...weather,
      transitionCount: weather.contiguousRuns.length - 1,
      durationsAreObservationBoundaryExposure:
        "Each captured Jobs sample is eight periods apart. Exposure holds the sampled state to the next boundary; sub-interval Weather changes are not observed.",
      timeline: rows.map((row) => ({
        period: row.period,
        weatherPercent: row.weatherPercent,
        nativeFoodProduction: row.foodProduction,
        nativeFoodConsumption: row.foodConsumption,
        nativeFoodNet: row.foodNet,
        civilianPopulation: row.civilianPopulation,
        garrisonWorkers: row.garrisonWorkers,
        starvationCount: row.starvationCount,
        agriculture: row.agriculture,
        foodFormulaModifier: row.foodFormulaModifier,
        globalProductionModifier: row.globalProductionModifier,
        effectiveOtherFoodProduction: row.effectiveOtherFoodProduction,
      })),
    },
    actualP43BFoodFlow: {
      negativeObservationCount: negativeObservedRateCount,
      negativeRuns: actualNegativeRuns,
      heldBoundaryRateTrajectorySummary: heldRateSummary(
        integrateHeldBoundaryRates(rows, (row) => row.foodNet),
      ),
      heldBoundaryRateIntegration: {
        sourceStateAppliedUntilNextObservation: rows
          .slice(0, -1)
          .reduce((sum, row, index) => {
            const next = rows[index + 1];
            return finite(row.foodNet)
              ? sum +
                  row.foodNet *
                    P45_FOOD_TIME_MULTIPLIER *
                    (next.period - row.period)
              : sum;
          }, 0),
        destinationStateAppliedToPriorObservation: rows
          .slice(1)
          .reduce((sum, row, index) => {
            const previous = rows[index];
            return finite(row.foodNet)
              ? sum +
                  row.foodNet *
                    P45_FOOD_TIME_MULTIPLIER *
                    (row.period - previous.period)
              : sum;
          }, 0),
        actualStockChangeFromFirstToLast:
          finite(rows[0]?.foodStock) && finite(rows.at(-1)?.foodStock)
            ? rows.at(-1).foodStock - rows[0].foodStock
            : null,
        interpretation:
          "Rate integrals are eight-period held-state approximations. The authenticated stock changes include unobserved phases and must not be equated with these totals.",
      },
    },
    nativePopulationAndMilitaryTransitions: populationTransitions,
    starvationBoundaryEvidence: {
      firstObservedStarvationPeriod: starvationObservations[0]?.period ?? null,
      firstObservedStarvationCount: starvationObservations[0]?.count ?? null,
      postStarvationDataIsCounterfactualSensitive: true,
      reason:
        "Additional Farms or changed Jobs could avert starvation and change later population, Food demand, Construction, storage, and progression.",
    },
    researchTransitions,
    productionModifierTransitions,
    productionModifierRanges: modifierRanges(rows),
    observedStock: {
      minimum: stockPoints.reduce(
        (best, point) => Math.min(best, point.foodStock),
        Infinity,
      ),
      maximum: stockPoints.reduce(
        (best, point) => Math.max(best, point.foodStock),
        -Infinity,
      ),
      final: stockPoints.at(-1)?.foodStock ?? null,
      peakToTroughDrawdown: runningDrawdown,
      belowFortyThenExactlyFiftyTransitions: resetTransitions.length,
      resetTransitions,
      stockTimeline: stockPoints,
    },
    missingSubPeriodEvidence: [
      "Food.amount and Food.max after every native fastLoop",
      "the native fastLoop multiplier and supplyMode at every interval; per-pool Food.amount, Food.max, and shortage pools if regional supply is active",
      "unrounded Food producer and consumption breakdowns with Weather and global modifiers at every fastLoop",
      "all Food modRes calls, notrack calls, direct amount writes, and their phases",
      "Food action IDs/counts, event identities/effects, trade/import changes, and RNG outcomes",
    ],
  };
}

function scenarioFormulaRows(rows, scenario) {
  return rows.map((observation) => {
    if (scenario.id === "A") {
      const complete =
        finite(observation.foodProduction) &&
        finite(observation.foodConsumption) &&
        finite(observation.foodNet);
      const scenarioFlow = {
        status: complete ? "available" : "unavailable",
        period: observation.period,
        farms: observation.farmCount,
        farmers: observation.observedFarmers,
        quarryWorkers: observation.observedQuarryWorkers,
        foodProduction: observation.foodProduction,
        foodConsumption: observation.foodConsumption,
        foodNet: observation.foodNet,
        weatherPercent: observation.weatherPercent,
        provenance: observation.provenance,
        source: "retained native Food observation",
        laborPhysicallyFeasible: true,
      };
      return { ...observation, scenarioFlow };
    }
    const farmers = scenario.farmers;
    const farms = scenario.farms;
    const quarryWorkers = scenario.quarryWorkers;
    const projected = projectP45FoodFlow(observation, {
      farms,
      farmers,
      quarryWorkers,
    });
    return {
      ...observation,
      scenarioFlow: projected,
    };
  });
}

export function analyzeP45FoodStockResilience(
  normalized,
  { sourceSha256 = null } = {},
) {
  const simulationStarted = process.hrtime.bigint();
  const rows = normalized?.armB ?? [];
  const weatherAndDemand = buildWeatherAndDemand(
    rows,
    normalized?.armBCheckpoints,
  );
  const calibration = replayNativeStock(
    rows,
    normalized,
    "armB",
    P45_FOOD_REPLAY_START,
    P45_FOOD_REPLAY_END,
  );
  const p43AComparison = {
    calibrationCheckpoints: nativeCheckpointSummary(
      normalized,
      "armA",
      [720, 728, 1588, 1589, 1592],
    ),
    interpretation:
      "P43 A/P42 baseline confirms p1589 Food exhaustion and starvation; p1592 stock is 50 and is not reproduced by the production/consumption-only transition.",
  };
  const definitions = [
    { id: "A", farms: 1, farmers: 4 },
    { id: "B", farms: 3, farmers: 3, quarryWorkers: 1 },
    { id: "C", farms: 3, farmers: 3, quarryWorkers: 1 },
    { id: "D", farms: 2, farmers: 4, quarryWorkers: 0 },
  ];
  const flowAssessments = definitions.map((definition) => {
    const formulaRows = scenarioFormulaRows(rows, definition);
    const formulaAvailable = formulaRows
      .map((row) => row.scenarioFlow)
      .filter((flow) => flow.status === "available");
    const available = formulaAvailable.filter(
      (flow) => flow.laborPhysicallyFeasible === true,
    );
    const highDemand = available.filter((flow) => flow.foodConsumption >= 8);
    const negativeFlows = available.filter((flow) => flow.foodNet < 0);
    const min = available.reduce(
      (best, flow) => (!best || flow.foodNet < best.foodNet ? flow : best),
      null,
    );
    return {
      id: definition.id,
      farms: definition.farms,
      farmers:
        definition.id === "A"
          ? "actual retained Jobs allocations"
          : definition.farmers,
      quarryWorkers:
        definition.id === "A"
          ? "actual retained Jobs allocations"
          : definition.quarryWorkers,
      formulaAvailableObservationCount: formulaAvailable.length,
      flowAvailableCount: available.length,
      negativeFlowObservationCount: negativeFlows.length,
      negativeFlowRuns: contiguousRuns(
        formulaRows.map((row) => ({
          period: row.period,
          status: row.scenarioFlow.status,
          laborPhysicallyFeasible:
            row.scenarioFlow.laborPhysicallyFeasible === true,
          foodNet: row.scenarioFlow.foodNet,
        })),
        (row) =>
          row.status === "available" &&
          row.laborPhysicallyFeasible &&
          row.foodNet < 0,
        (row) => row.foodNet,
      ),
      highDemandObservationCount: highDemand.length,
      highDemandAtOrBelowStrictMarginCount: highDemand.filter(
        (flow) => flow.foodNet <= 0.01,
      ).length,
      minimumFlow: min ? { period: min.period, foodNet: min.foodNet } : null,
      selectedSampleFlows: formulaRows
        .filter((row) => [728, 2000, 4000, 5768, 10000].includes(row.period))
        .map((row) => ({
          period: row.period,
          status: row.scenarioFlow.status,
          farms: row.scenarioFlow.farms ?? null,
          farmers: row.scenarioFlow.farmers ?? null,
          quarryWorkers: row.scenarioFlow.quarryWorkers ?? null,
          foodProduction: row.scenarioFlow.foodProduction ?? null,
          foodConsumption: row.scenarioFlow.foodConsumption ?? null,
          foodNet: row.scenarioFlow.foodNet ?? null,
          farmerPhysicalEligible:
            row.scenarioFlow.farmerPhysicalEligible ?? null,
          farmerSmartEligible: row.scenarioFlow.farmerSmartEligible ?? null,
          laborPhysicallyFeasible:
            row.scenarioFlow.laborPhysicallyFeasible ?? null,
          weatherPercent: row.scenarioFlow.weatherPercent ?? null,
        })),
      lastObservedFlow: available.at(-1)
        ? {
            period: available.at(-1).period,
            foodNet: available.at(-1).foodNet,
            weatherPercent: available.at(-1).weatherPercent,
          }
        : null,
      heldBoundaryRateIntegrationOnly: heldRateSummary(
        integrateHeldBoundaryRates(formulaRows, (row) =>
          row.scenarioFlow.status === "available"
            ? row.scenarioFlow.foodNet
            : null,
        ),
      ),
      stockSimulationInterpretation:
        "Held-rate integration is a flow diagnostic using the exogenous historical demand path, including counterfactual-sensitive post-starvation rows; it does not simulate reserve, capacity, unobserved stock writers, or starvation.",
    };
  });
  const scenarioComparison = buildScenarioComparison(
    rows,
    normalized,
    calibration,
  );
  const elapsedNanoseconds = process.hrtime.bigint() - simulationStarted;
  const simulationMs = Number(elapsedNanoseconds) / 1_000_000;
  return {
    schema: "p45-food-stock-resilience-v1",
    pinnedGame: normalized?.pinnedGame ?? null,
    decision: "D — Calibration invalid",
    source: {
      timeline: "experiments/p43-food-safe-jobs-timeline.json",
      timelineSha256: sourceSha256,
      arm: "P43 B diagnostic branch; worker commitments were assumed empty by that test-only replay",
      normalizedObservationCount: rows.length,
    },
    nativeMechanics: {
      transition:
        "Food amount after an ordinary fastLoop = clamp(0, actual Food capacity, prior amount + 0.25 × (Food production − Food consumption))",
      timeMultiplier: P45_FOOD_TIME_MULTIPLIER,
      offlineTimeScaling:
        "When webWorker.offline is true, the base 0.25 multiplier is multiplied by longRatio × offlineScale; P43 does not retain per-loop multiplier evidence.",
      foodPoolApplication:
        "One zoneTally.apply call builds the Food balance. Global supply mode applies one aggregate modRes; regional mode applies one net amount per shared pool, so local balances and starvation require per-pool stock inputs.",
      aggregateModelPoolMode: "global",
      p43PoolModeRetained: false,
      regionalPoolsIncludedInModel: false,
      storageOverflow:
        "excess above the actual Food capacity is discarded after the pool update",
      baseFoodStorage: 250,
      observedFoodStorageCapacity: 1000,
      capacityClamp:
        "Food amount is capped at the dynamically computed current maximum; the model receives actual observed capacity rather than assuming the base value.",
      negativeStock: "clamped to zero; native Food has no debt stock",
      starvation:
        "separate from negative flow and exhaustion: a failed Food payment enters a 1-in-11 randomized check, then a death requires gross Food production below consumption / threshold (1.25 plus/minus race effects); the Food stock was already clamped at zero, and future production/consumption must be reobserved after population changes",
      starvationChangesFoodStock:
        "Death itself does not replenish Food; native p5626 stock is 0 before the first recorded death at p5630. Later stock resets to 50 are not explained by starvation alone.",
      modelIncludesNativeStarvation: true,
      modelDrawsRandomness: false,
      nonFlowFoodWritersObservedInSource: true,
      sourcePaths: P45_SOURCE_PATHS,
      productionBehaviorChanged: false,
    },
    calibration,
    p43AComparison,
    weatherAndDemand,
    scenarioFlowAssessments: flowAssessments,
    scenarioComparison,
    decisionEvidence: {
      outcome: "D",
      reason:
        "The authenticated ordinary Food transition matches local boundaries but cannot replay P43 B through the pre-starvation interval: the retained snapshots show unexplained positive stock changes and omit per-fastLoop modifier/event phase evidence. Hypothetical stock survival and reserve thresholds are withheld.",
      farmPurchaseAuthorized: false,
      jobsAssignmentAuthorized: false,
      p42ConstructionPriorityWasTestOnly: true,
      p43WorkerAssignmentIsNotAuthoritative: true,
      p44StonePredicateChanged: false,
    },
    performance: {
      scope:
        "normalized-input pure weather, flow, calibration, and scenario diagnostic loops only",
      simulationMs,
      normalizedObservationCount: rows.length,
    },
  };
}

async function runCli() {
  const inputPath = resolve("experiments/p43-food-safe-jobs-timeline.json");
  const outputPath = resolve("experiments/p45-food-stock-resilience.json");
  const stockTimelinePath = resolve("experiments/p45-food-stock-timeline.json");
  const weatherTimelinePath = resolve("experiments/p45-weather-timeline.json");
  const loadStarted = process.hrtime.bigint();
  const sourceBytes = readFileSync(inputPath);
  const loadMs = Number(process.hrtime.bigint() - loadStarted) / 1_000_000;
  const parseStarted = process.hrtime.bigint();
  const timeline = JSON.parse(sourceBytes.toString("utf8"));
  const parseMs = Number(process.hrtime.bigint() - parseStarted) / 1_000_000;
  const normalizeStarted = process.hrtime.bigint();
  const normalized = normalizeP45Timeline(timeline);
  const normalizationMs =
    Number(process.hrtime.bigint() - normalizeStarted) / 1_000_000;
  const evidence = analyzeP45FoodStockResilience(normalized, {
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
  });
  evidence.performance = {
    ...evidence.performance,
    inputBytes: sourceBytes.byteLength,
    fileReadMs: loadMs,
    jsonParseMs: parseMs,
    normalizationMs,
    simulationMs: evidence.performance.simulationMs,
  };
  const writeJson = async (path, value) => {
    const json = await formatWithPrettier(JSON.stringify(value, null, 2), {
      parser: "json",
    });
    writeFileSync(path, json);
  };
  await writeJson(outputPath, evidence);
  await writeJson(stockTimelinePath, {
    schema: "p45-food-stock-timeline-v1",
    sourceTimeline: evidence.source.timeline,
    sourceSha256: evidence.source.timelineSha256,
    arm: "P43 B",
    points: evidence.weatherAndDemand.observedStock.stockTimeline,
  });
  await writeJson(weatherTimelinePath, {
    schema: "p45-weather-timeline-v1",
    sourceTimeline: evidence.source.timeline,
    sourceSha256: evidence.source.timelineSha256,
    arm: "P43 B",
    observationSpacing: evidence.weatherAndDemand.observedPeriodSpacing,
    sampledBoundaryStatesOnly: true,
    points: evidence.weatherAndDemand.weather.timeline,
  });
  process.stdout.write(
    `${JSON.stringify({
      output: outputPath,
      stockTimeline: stockTimelinePath,
      weatherTimeline: weatherTimelinePath,
      decision: evidence.decision,
      calibration: evidence.calibration.status,
      observationCount: evidence.performance.normalizedObservationCount,
      performance: evidence.performance,
    })}\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await runCli();
}
