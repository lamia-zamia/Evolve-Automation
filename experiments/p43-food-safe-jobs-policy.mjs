export const P43_PINNED_GAME =
  "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f";

const FARMER_IMPACT = 0.82;
const CURRENT_FOOD_TOLERANCE = 1e-6;
const FOOD_SOURCE_RECONCILIATION_TOLERANCE = 0.01;
const FOOD_SAFETY_MARGIN = 0.01;

function unavailable(reason, details = {}) {
  return Object.freeze({ status: "unavailable", reason, ...details });
}

function rate(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.endsWith("v")) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumLedger(section) {
  if (section === null || typeof section !== "object" || Array.isArray(section))
    return null;
  let total = 0;
  for (const value of Object.values(section)) {
    const parsed = rate(value);
    if (parsed !== null) total += parsed;
    else if (typeof value !== "string" || !value.endsWith("%")) return null;
  }
  return Number.isFinite(total) ? total : null;
}

function modifierFactor(section, suffix, required) {
  if (section === null || typeof section !== "object" || Array.isArray(section))
    return null;
  const matches = Object.entries(section).filter(([id]) => id.endsWith(suffix));
  if (matches.length === 0 && !required) return 1;
  if (matches.length !== 1) return null;
  const value = matches[0][1];
  if (typeof value !== "string" || !value.endsWith("%")) return null;
  const percent = Number.parseFloat(value);
  return Number.isFinite(percent) && percent > -100 ? 1 + percent / 100 : null;
}

function farmerBaseOutput(farmCount, farmers, fullFarmBonus) {
  const fullFarmWorkers = Math.min(farmCount, farmers);
  const farmHands = farmers - fullFarmWorkers;
  return (
    fullFarmWorkers * (FARMER_IMPACT + fullFarmBonus) +
    farmHands * FARMER_IMPACT
  );
}

function isUnsupportedRace(race) {
  return [
    "artifical",
    "forager",
    "warlord",
    "servants",
    "high_pop",
    "living_tool",
    "strong",
    "swift",
    "humongous",
    "iceage",
    "low_light",
    "photosynth",
    "ravenous",
    "carnivore",
  ].some((flag) => Boolean(race?.[flag]));
}

function currentFarmerModifierFacts(root) {
  const flagIds = [
    "living_tool",
    "iceage",
    "low_light",
    "high_pop",
    "strong",
    "swift",
    "humongous",
    "servants",
    "photosynth",
    "ravenous",
    "carnivore",
    "artifical",
  ];
  return Object.freeze({
    species: root?.race?.species ?? null,
    raceFlags: Object.fromEntries(
      flagIds.map((id) => [id, Boolean(root?.race?.[id])]),
    ),
    research: Object.freeze({
      agriculture: root?.tech?.agriculture ?? 0,
      hoe: root?.tech?.hoe ?? 0,
      science: root?.tech?.science ?? 0,
      military: root?.tech?.military ?? 0,
      hunting: root?.tech?.hunting ?? 0,
      foraging: root?.tech?.foraging ?? 0,
    }),
    biome: root?.city?.biome ?? null,
    calendar: root?.city?.calendar ?? null,
    planetTraits: root?.city?.ptrait ?? [],
    buildings: Object.freeze({
      farm: root?.city?.farm?.count ?? 0,
      mill: root?.city?.mill?.count ?? 0,
      millOn: root?.city?.mill?.on ?? 0,
    }),
  });
}

function assignmentMap(decision) {
  if (!Array.isArray(decision?.assignments)) return null;
  const assignments = new Map();
  for (const assignment of decision.assignments) {
    if (
      !Number.isSafeInteger(assignment?.jobToken) ||
      assignments.has(assignment.jobToken) ||
      !Number.isSafeInteger(assignment?.workers) ||
      assignment.workers < 0 ||
      !Number.isSafeInteger(assignment?.servants) ||
      assignment.servants < 0
    ) {
      return null;
    }
    assignments.set(assignment.jobToken, assignment);
  }
  return assignments;
}

/**
 * Projects a strict positive Food flow from the current native Food ledger and pinned Farmer
 * formula. The current measured Food flow calibrates the live modifier only when Farmer is the
 * sole active producer; no historical multiplier is reused.
 */
export function calculateP43FoodFloor(observation) {
  const input = observation?.jobsInput;
  const root = observation?.root;
  const race = root?.race;
  const farmer = input?.jobs?.find((job) => job.id === "farmer");
  const city = root?.city;
  const farmCount = Number(city?.farm?.count);
  const population = Number(input?.population);
  const populationCapacity = Number(root?.resource?.[race?.species]?.max);
  const currentFarmers = Number(farmer?.workers);
  const currentServants = Number(farmer?.servants);
  const agriculture = Number(root?.tech?.agriculture ?? 0);
  const fullFarmBonus = agriculture >= 2 ? 1.15 : 0.65;
  const physicalMaximum =
    farmer?.maximum === -1 ? population : Number(farmer?.maximum);
  const nativeMinimum = Math.max(
    farmer?.farmerMinimum ?? 0,
    farmer?.storageBackedMinimum ?? 0,
  );

  if (
    observation?.nativeRevision !== P43_PINNED_GAME ||
    input?.available !== true ||
    !Array.isArray(input.jobs) ||
    farmer === undefined ||
    farmer.unlocked !== true ||
    farmer.managed !== true ||
    !Number.isSafeInteger(population) ||
    !Number.isSafeInteger(populationCapacity) ||
    !Number.isSafeInteger(currentFarmers) ||
    !Number.isSafeInteger(farmCount) ||
    !Number.isSafeInteger(agriculture) ||
    !Number.isSafeInteger(physicalMaximum) ||
    !Number.isSafeInteger(nativeMinimum) ||
    currentServants !== 0 ||
    population > populationCapacity ||
    currentFarmers > population ||
    Number(root?.civic?.farmer?.workers) !== currentFarmers ||
    isUnsupportedRace(race) ||
    city?.farm === undefined ||
    observation?.undergroundFarmCount !== 0 ||
    observation?.surfaceFarmCount !== 0 ||
    observation?.underTransmitterCount !== 0
  ) {
    return unavailable(
      "current Farmer formula inputs are incomplete or unsupported",
    );
  }

  const currentPopulation = Number(root?.resource?.[race?.species]?.amount);
  const currentCapacity = Number(root?.resource?.[race?.species]?.max);
  const assignedWorkers = input.jobs.reduce(
    (total, job) => total + Number(job.workers),
    0,
  );
  if (
    currentPopulation !== population ||
    currentCapacity !== populationCapacity ||
    assignedWorkers !== population ||
    input.jobs.some(
      (job) => Number(root?.civic?.[job.id]?.workers) !== job.workers,
    )
  ) {
    return unavailable(
      "captured Jobs snapshot does not match the current population and native workforce",
    );
  }

  const production = observation.ledger?.production?.Food;
  const consumption = observation.ledger?.consumption?.Food;
  const ledgerFoodProduction = sumLedger(production);
  const signedFoodConsumption = sumLedger(consumption);
  const foodConsumption =
    signedFoodConsumption === null ? null : Math.abs(signedFoodConsumption);
  const rawFoodDiff = root?.resource?.Food?.diff;
  const foodDiff = Number(rawFoodDiff);
  const farmerLedgerOutput = rate(production?.Farmer);
  const foodOutput = foodDiff + foodConsumption;
  if (
    ledgerFoodProduction === null ||
    foodConsumption === null ||
    typeof rawFoodDiff !== "number" ||
    !Number.isFinite(foodDiff) ||
    !Number.isFinite(foodOutput) ||
    farmerLedgerOutput === null
  ) {
    return unavailable(
      "native Food source or consumption ledger is unavailable",
    );
  }
  if (
    Math.abs(foodOutput - observation.measuredFoodOutput) >
    CURRENT_FOOD_TOLERANCE
  ) {
    return unavailable(
      "captured Food output does not match the current native Food net flow and consumers",
    );
  }
  if (
    Math.abs(foodConsumption - observation.measuredFoodConsumption) >
    CURRENT_FOOD_TOLERANCE
  ) {
    return unavailable(
      "captured Food consumption does not match the current native consumer ledger",
    );
  }

  const currentBase = farmerBaseOutput(
    farmCount,
    currentFarmers,
    fullFarmBonus,
  );
  if (currentBase <= 0) {
    return unavailable(
      "current Farmer output cannot establish a live modifier",
    );
  }

  // The pinned game's breakdown records Farmer and Soldier source output before the shared global
  // multiplier. Farmer-specific rows and the Soldier quarantine row expose the source multipliers;
  // the current measured total then calibrates only the shared global multiplier.
  const otherProducerRows = Object.entries(production)
    .filter(([id]) => id !== "Farmer" && id !== "Soldiers")
    .map(([id, value]) => ({ id, value: rate(value) }))
    .filter(
      (row) =>
        row.value !== null && Math.abs(row.value) > CURRENT_FOOD_TOLERANCE,
    );
  if (otherProducerRows.length > 0) {
    return unavailable(
      "active Food producer rows other than Farmer and pinned Soldier hunting lack an independently verified formula",
      {
        otherProducerRows,
        ledgerFoodProduction,
      },
    );
  }
  if (farmerLedgerOutput <= 0 || foodOutput <= 0) {
    return unavailable(
      "the native Farmer ledger row cannot verify positive current Farmer production",
    );
  }

  const farmerModifiers = [
    modifierFactor(production, "Mill", true),
    modifierFactor(production, "Virgo+0", true),
    modifierFactor(production, "Weather", true),
    modifierFactor(production, "Quarantine+0", true),
  ];
  if (farmerModifiers.some((factor) => factor === null)) {
    return unavailable(
      "current native Farmer modifier rows are incomplete or invalid",
    );
  }
  const farmerSourceFactor = farmerModifiers.reduce(
    (factor, item) => factor * item,
    1,
  );
  const soldierLedgerOutput = rate(production.Soldiers);
  if (soldierLedgerOutput === null) {
    return unavailable("the native Soldier hunting Food row is unavailable");
  }
  const soldierQuarantineFactor =
    soldierLedgerOutput > CURRENT_FOOD_TOLERANCE
      ? modifierFactor(production, "Quarantine+1", true)
      : 1;
  if (soldierQuarantineFactor === null) {
    return unavailable(
      "the native Soldier hunting quarantine modifier is unavailable",
    );
  }
  const farmerFormulaModifier = farmerLedgerOutput / currentBase;
  const preGlobalFoodOutput =
    farmerLedgerOutput * farmerSourceFactor +
    soldierLedgerOutput * soldierQuarantineFactor;
  const globalProductionModifier = foodOutput / preGlobalFoodOutput;
  const productionModifier =
    farmerFormulaModifier * farmerSourceFactor * globalProductionModifier;
  const otherFoodProduction =
    soldierLedgerOutput * soldierQuarantineFactor * globalProductionModifier;
  if (
    !Number.isFinite(productionModifier) ||
    productionModifier <= 0 ||
    !Number.isFinite(globalProductionModifier) ||
    globalProductionModifier <= 0 ||
    preGlobalFoodOutput <= 0
  ) {
    return unavailable(
      "current native Food source modifiers cannot be reconstructed",
    );
  }
  const projectedCurrentFarmerOutput = currentBase * productionModifier;
  if (
    Math.abs(projectedCurrentFarmerOutput + otherFoodProduction - foodOutput) >
    FOOD_SOURCE_RECONCILIATION_TOLERANCE
  ) {
    return unavailable(
      "the pinned Farmer and Soldier production sources do not match measured native Food output",
    );
  }

  const minimum = nativeMinimum;
  const maximum = Math.min(population, physicalMaximum);
  let minimumFarmers;
  for (let farmers = minimum; farmers <= maximum; farmers++) {
    const output =
      otherFoodProduction +
      farmerBaseOutput(farmCount, farmers, fullFarmBonus) * productionModifier;
    if (output - foodConsumption > FOOD_SAFETY_MARGIN) {
      minimumFarmers = farmers;
      break;
    }
  }

  const ordinaryFarmerNet = foodOutput - foodConsumption;
  const modifierFacts = Object.freeze({
    ...currentFarmerModifierFacts(root),
    farmerSourceModifierFactors: Object.freeze(farmerModifiers),
    soldierLedgerOutput,
    soldierQuarantineFactor,
    globalProductionModifier,
    effectiveOtherFoodProduction: otherFoodProduction,
  });
  const fingerprint = JSON.stringify({
    period: observation.period,
    rootGeneration: observation.rootGeneration,
    progressionGeneration: observation.progressionGeneration,
    population,
    populationCapacity,
    farmCount,
    modifierFacts,
    foodOutput,
    foodConsumption,
    farmerLedgerOutput,
    farmerSourceFactor,
    soldierLedgerOutput,
    soldierQuarantineFactor,
    globalProductionModifier,
    productionModifier,
  });
  return Object.freeze({
    status: minimumFarmers === undefined ? "infeasible" : "feasible",
    ...(minimumFarmers === undefined ? {} : { minimumFarmers }),
    currentFarmers,
    foodOutput,
    foodConsumption,
    foodNet: ordinaryFarmerNet,
    farmerObservedOutput: projectedCurrentFarmerOutput,
    farmerLedgerOutput,
    otherFoodProduction,
    productionModifier,
    farmCount,
    nativeFarmerMinimum: minimum,
    nativeStorageBackedMinimum: farmer.storageBackedMinimum,
    farmerSmartMaximum: farmer.smartMaximum,
    farmerPhysicalMaximum: physicalMaximum,
    fullFarmBonus,
    modifierFacts,
    formulaDerived: true,
    alternativeOutputIsProjected: true,
    strictPositiveFoodSafetyMargin: FOOD_SAFETY_MARGIN,
    modifierFingerprint: fingerprint,
    reasons: Object.freeze(
      minimumFarmers === undefined
        ? [
            "no physically assignable Farmer count produces a strictly positive Food margin",
          ]
        : [
            "minimum uses current native Food consumers, producer rows, and matched Farmer output",
          ],
    ),
  });
}

function validCompleteAssignment(input, decision) {
  const proposed = assignmentMap(decision);
  if (
    proposed === null ||
    input.jobs.length !== proposed.size ||
    input.jobs.some((job) => !proposed.has(job.token))
  ) {
    return null;
  }
  const assignedWorkers = [...proposed.values()].reduce(
    (total, assignment) => total + assignment.workers,
    0,
  );
  const assignedServants = [...proposed.values()].reduce(
    (total, assignment) => total + assignment.servants,
    0,
  );
  const currentServants = input.jobs.reduce(
    (total, job) => total + job.servants,
    0,
  );
  if (
    assignedWorkers !== input.population ||
    assignedServants !== currentServants
  )
    return null;
  if (
    decision.selectedDefaultToken !== null &&
    !input.jobs.some(
      (job) =>
        job.token === decision.selectedDefaultToken &&
        job.unlocked &&
        job.managed,
    )
  ) {
    return null;
  }
  for (const job of input.jobs) {
    const assignment = proposed.get(job.token);
    const maximum = job.maximum === -1 ? input.population : job.maximum;
    const minimum = Math.max(
      job.storageBackedMinimum ?? 0,
      job.token === decision.selectedDefaultToken ? input.minimumDefault : 0,
    );
    if (
      assignment.workers > maximum ||
      assignment.workers < minimum ||
      (!job.unlocked && assignment.workers !== job.workers) ||
      (!job.managed && assignment.workers !== job.workers) ||
      assignment.servants !== job.servants
    ) {
      return null;
    }
  }
  return proposed;
}

/** Checks the captured native Jobs state against a complete planned assignment. */
export function verifyP43NativeJobsPostcondition({ input, decision, root }) {
  const expected = assignmentMap(decision);
  if (
    input?.available !== true ||
    expected === null ||
    input.jobs.length !== expected.size ||
    input.jobs.some((job) => !expected.has(job.token))
  ) {
    return Object.freeze({
      matched: false,
      reason: "complete captured Jobs input or assignment is unavailable",
      mismatches: Object.freeze([]),
    });
  }
  const mismatches = [];
  let assignedWorkers = 0;
  let assignedServants = 0;
  let actualServants = 0;
  const nativeServants = root?.race?.servants?.jobs ?? {};
  for (const job of input.jobs) {
    const assignment = expected.get(job.token);
    const workers = Number(root?.civic?.[job.id]?.workers ?? 0);
    const servants = Number(nativeServants[job.id] ?? 0);
    assignedWorkers += assignment.workers;
    assignedServants += assignment.servants;
    actualServants += servants;
    if (workers !== assignment.workers || servants !== assignment.servants) {
      mismatches.push({
        jobId: job.id,
        expectedWorkers: assignment.workers,
        actualWorkers: workers,
        expectedServants: assignment.servants,
        actualServants: servants,
      });
    }
  }
  const selectedDefaultId =
    input.jobs.find((job) => job.token === decision.selectedDefaultToken)?.id ??
    null;
  const actualDefaultId = root?.civic?.d_job ?? null;
  const populationConserved = assignedWorkers === input.population;
  const servantsConserved = assignedServants === actualServants;
  const defaultPreserved = selectedDefaultId === actualDefaultId;
  return Object.freeze({
    matched:
      mismatches.length === 0 &&
      populationConserved &&
      servantsConserved &&
      defaultPreserved,
    populationConserved,
    servantsConserved,
    expectedPopulation: input.population,
    assignedWorkers,
    expectedServants: assignedServants,
    actualServants,
    defaultPreserved,
    expectedDefaultJobId: selectedDefaultId,
    actualDefaultJobId: actualDefaultId,
    mismatches: Object.freeze(mismatches),
  });
}

/** Applies only a transfer between the live Farmer and Quarry Worker rows. */
export function evaluateP43FoodSafeJobsDecision(context) {
  const {
    jobsInput: input,
    ordinaryDecision,
    observation,
    enabled,
  } = context ?? {};
  const base = {
    decision: ordinaryDecision,
    applied: false,
    authoritative: false,
    workerCommitments: "unavailable",
  };
  if (
    enabled !== true ||
    !Number.isSafeInteger(context?.period) ||
    context.period < 720 ||
    context.period > 10_000
  ) {
    return Object.freeze({ ...base, status: "outside-qualified-window" });
  }
  if (
    context.nativeRevision !== P43_PINNED_GAME ||
    context.rootMatches !== true ||
    !Number.isSafeInteger(context.rootGeneration) ||
    typeof context.progressionGeneration !== "string" ||
    context.progressionGeneration.length === 0 ||
    !Number.isSafeInteger(context.workCycleSequence) ||
    context.workCycleIdentity?.sequence !== context.workCycleSequence ||
    context.workCycleIdentity?.period !== context.period ||
    context.workCycleIdentity?.root !== context.root ||
    context.workCycleIdentity?.input !== input ||
    observation?.workCycleIdentity !== context.workCycleIdentity ||
    observation?.jobsSnapshot !== input ||
    !Number.isSafeInteger(context.farmerControlGeneration) ||
    !Number.isSafeInteger(context.quarryControlGeneration) ||
    context.farmerControlReady !== true ||
    context.quarryControlReady !== true ||
    input?.available !== true ||
    typeof context.nativeDefaultJobId !== "string" ||
    input.jobs?.find((job) => job.id === context.nativeDefaultJobId)
      ?.isDefault !== true ||
    context.nativeDefaultJobId !== context.rootDefaultJobId ||
    context.commitmentMode !== "test-only-assume-empty"
  ) {
    return Object.freeze({
      ...base,
      status: "qualification-unavailable",
      reason:
        "current Jobs, owner generations, native controls, or explicit commitment assumption is missing",
    });
  }

  const floor = calculateP43FoodFloor({
    ...observation,
    jobsInput: input,
    period: context.period,
    rootGeneration: context.rootGeneration,
    progressionGeneration: context.progressionGeneration,
    nativeRevision: context.nativeRevision,
  });
  if (floor.status === "unavailable") {
    return Object.freeze({
      ...base,
      status: "food-evidence-unavailable",
      floor,
    });
  }
  const farmer = input.jobs.find((job) => job.id === "farmer");
  const quarry = input.jobs.find((job) => job.id === "quarry_worker");
  const proposed = validCompleteAssignment(input, ordinaryDecision);
  if (farmer === undefined || quarry === undefined || proposed === null) {
    return Object.freeze({
      ...base,
      status: "invalid-ordinary-proposal",
      floor,
    });
  }
  if (
    farmer.unlocked !== true ||
    farmer.managed !== true ||
    quarry.unlocked !== true ||
    quarry.managed !== true ||
    Number(context.root?.civic?.farmer?.workers) !== farmer.workers ||
    Number(context.root?.civic?.quarry_worker?.workers) !== quarry.workers
  ) {
    return Object.freeze({ ...base, status: "jobs-not-managed", floor });
  }

  const farmerAssignment = proposed.get(farmer.token);
  const quarryAssignment = proposed.get(quarry.token);
  const otherWorkers = [...proposed.entries()].reduce(
    (total, [token, item]) =>
      token === farmer.token || token === quarry.token
        ? total
        : total + item.workers,
    0,
  );
  const jobPool = input.population - otherWorkers;
  const nativeMinimum = Math.max(
    farmer.farmerMinimum ?? 0,
    farmer.storageBackedMinimum ?? 0,
  );
  const targetFarmers =
    floor.status === "feasible"
      ? Math.max(farmerAssignment.workers, floor.minimumFarmers)
      : jobPool;
  const minimumQuarry = Math.max(
    quarry.storageBackedMinimum ?? 0,
    quarry.token === ordinaryDecision.selectedDefaultToken
      ? input.minimumDefault
      : 0,
  );
  const availableTransfer = Math.max(
    0,
    quarryAssignment.workers - minimumQuarry,
  );
  const requiredFarmerTransfer = Math.max(
    0,
    targetFarmers - farmerAssignment.workers,
  );
  const canRetainOneQuarryWorker =
    quarryAssignment.workers >= Math.max(1, minimumQuarry) &&
    floor.status === "feasible" &&
    floor.minimumFarmers <= jobPool - Math.max(1, minimumQuarry);
  const quarryMustBeReleased =
    floor.status === "infeasible" ||
    (floor.status === "feasible" && !canRetainOneQuarryWorker);
  const additionalWorkersRequired = Math.max(
    0,
    requiredFarmerTransfer - availableTransfer,
  );
  const movableOtherWorkers = input.jobs.reduce((total, job) => {
    if (job.token === farmer.token || job.token === quarry.token) return total;
    const assignment = proposed.get(job.token);
    if (assignment === undefined || !job.unlocked || !job.managed) return total;
    const minimum = Math.max(
      job.storageBackedMinimum ?? 0,
      job.token === ordinaryDecision.selectedDefaultToken
        ? input.minimumDefault
        : 0,
    );
    return total + Math.max(0, assignment.workers - minimum);
  }, 0);
  const transfer = Math.min(requiredFarmerTransfer, availableTransfer);
  const nextFarmers = farmerAssignment.workers + transfer;
  const nextQuarry = quarryAssignment.workers - transfer;
  const fallback = quarryMustBeReleased;
  const desiredQuarry = fallback ? 0 : undefined;
  const actualFarmers =
    desiredQuarry === 0
      ? farmerAssignment.workers + quarryAssignment.workers
      : nextFarmers;
  const actualQuarry = desiredQuarry === 0 ? 0 : nextQuarry;
  if (
    actualFarmers < nativeMinimum ||
    actualFarmers >
      Math.min(
        input.population,
        farmer.maximum === -1 ? input.population : farmer.maximum,
      ) ||
    actualQuarry < minimumQuarry ||
    actualFarmers + actualQuarry + otherWorkers !== input.population
  ) {
    return Object.freeze({
      ...base,
      status: "fallback-or-transfer-infeasible",
      floor,
      requiresOtherJobTransfer:
        targetFarmers > farmerAssignment.workers + availableTransfer,
      workerCommitmentsAssumedEmpty: true,
    });
  }

  const assignments = ordinaryDecision.assignments.map((assignment) =>
    assignment.jobToken === farmer.token
      ? Object.freeze({ ...assignment, workers: actualFarmers })
      : assignment.jobToken === quarry.token
        ? Object.freeze({ ...assignment, workers: actualQuarry })
        : assignment,
  );
  const changed = assignments.some((assignment) => {
    const before = proposed.get(assignment.jobToken);
    return before?.workers !== assignment.workers;
  });
  const nextDecision = changed
    ? Object.freeze({
        ...ordinaryDecision,
        assignments: Object.freeze(assignments),
        lastFarmerCount: actualFarmers,
      })
    : ordinaryDecision;
  const projectedOutput =
    floor.otherFoodProduction +
    farmerBaseOutput(floor.farmCount, actualFarmers, floor.fullFarmBonus) *
      floor.productionModifier;
  const projectedNet = projectedOutput - floor.foodConsumption;
  const ordinaryFarmerCount = farmerAssignment.workers;
  const ordinaryFoodOutput =
    floor.otherFoodProduction +
    farmerBaseOutput(
      floor.farmCount,
      ordinaryFarmerCount,
      floor.fullFarmBonus,
    ) *
      floor.productionModifier;
  const ordinaryPlanFood = Object.freeze({
    farmers: ordinaryFarmerCount,
    foodOutput: ordinaryFoodOutput,
    foodConsumption: floor.foodConsumption,
    foodNet: ordinaryFoodOutput - floor.foodConsumption,
    sustainable:
      ordinaryFoodOutput - floor.foodConsumption > FOOD_SAFETY_MARGIN,
  });
  const zeroQuarryFallbackImprovesFood =
    fallback && projectedOutput - ordinaryFoodOutput > CURRENT_FOOD_TOLERANCE;
  const canApply =
    context.apply === true &&
    changed &&
    (projectedNet > FOOD_SAFETY_MARGIN || zeroQuarryFallbackImprovesFood);
  const alternativeStatus =
    floor.status === "infeasible" && zeroQuarryFallbackImprovesFood
      ? "food-floor-infeasible-zero-quarry-fallback"
      : projectedNet <= 0
        ? "other-job-transfer-required"
        : "diagnostic-assumption";
  const reason =
    projectedNet > 0
      ? fallback
        ? "zero-quarry-fallback-required-for-positive-food-flow"
        : "formula-supported-positive-food-margin"
      : floor.status === "infeasible"
        ? zeroQuarryFallbackImprovesFood
          ? "zero-quarry-fallback-maximizes-food-but-still-negative"
          : "zero-quarry-fallback-still-food-negative"
        : movableOtherWorkers >= additionalWorkersRequired
          ? "other-managed-job-must-surrender-worker"
          : "available-native-worker-caps-cannot-reach-food-floor";
  return Object.freeze({
    ...base,
    status: alternativeStatus,
    decision: canApply ? nextDecision : ordinaryDecision,
    applied: canApply,
    authoritative: false,
    workerCommitmentsAssumedEmpty: true,
    floor,
    ordinaryPlanFood,
    alternative: Object.freeze({
      farmers: actualFarmers,
      quarryWorkers: actualQuarry,
      otherWorkers,
      population: input.population,
      populationConserved:
        actualFarmers + actualQuarry + otherWorkers === input.population,
      retainsQuarryWorker: actualQuarry > 0,
      foodOutput: projectedOutput,
      foodConsumption: floor.foodConsumption,
      foodNet: projectedNet,
      foodPositive: projectedNet > 0,
      projected: true,
      reason,
      requiresOtherJobTransfer:
        floor.status === "feasible" &&
        floor.minimumFarmers > farmerAssignment.workers + availableTransfer,
      additionalWorkersRequired,
      movableOtherWorkers,
      otherJobTransferPossibleByNativeCaps:
        movableOtherWorkers >= additionalWorkersRequired,
      canRetainOneQuarryWorker,
      zeroQuarryFallback: fallback,
      zeroQuarryFallbackImprovesFood,
      exceedsFarmerSmartMaximum:
        farmer.smartMaximum !== null && actualFarmers > farmer.smartMaximum,
      nativeDefaultPreserved:
        ordinaryDecision.selectedDefaultToken === input.defaultJobToken,
    }),
  });
}
