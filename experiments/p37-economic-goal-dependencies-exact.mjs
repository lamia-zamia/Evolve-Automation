import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  analyzeEconomicGoalDependencies,
  evaluateEconomicGoalPathEvidence,
} from "../src/domain/progression/economic-goal-dependencies.ts";

const p19Path = "experiments/p19-civilization-bootstrap-evidence.json";
const p36Path = "experiments/p36-productive-resource-bootstrap-evidence.json";
const settingsPath = "experiments/p18-standard-human-settings.json";
const outputPath = "experiments/p37-economic-goal-dependencies.json";
const parseJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const p19 = parseJson(p19Path);
const p36 = parseJson(p36Path);
const settings = parseJson(settingsPath);
const pinnedGamePath = "test-artifacts/game/evolve-deadspace.js";
const pinnedGameSourceSha256 = createHash("sha256")
  .update(readFileSync(pinnedGamePath))
  .digest("hex");
const pinnedGameMatchesP36 = pinnedGameSourceSha256 === p36.gameSha256;
const settingsFileSha256 = createHash("sha256")
  .update(readFileSync(settingsPath))
  .digest("hex");
const settingsCanonicalSha256 = createHash("sha256")
  .update(JSON.stringify(settings))
  .digest("hex");
const p36SettingsMatched = settingsCanonicalSha256 === p36.settingsSha256;
const p36Treatment = p36.arms.find((arm) => arm.arm === "C");
if (!p36Treatment) throw new Error("P36 treatment arm C is missing");

const p19Samples = [1000, 5000, 10000].map((period) => {
  const checkpoint = p19.candidate.checkpoints.find(
    (entry) => entry.period === period,
  );
  if (!checkpoint) throw new Error(`P19 checkpoint ${period} is missing`);
  return checkpoint;
});
const p36StateAt1000 = p36Treatment.checkpoints.find(
  (entry) => entry.period === 1000,
);
const p36FoodSamples = p36.treatmentResults.foodTimeSeries;
const p36StopEvent = p36Treatment.p36.policyEvents.find(
  (event) => event.type === "stopped" && event.period === 688,
);
const p36FirstQuarry = p36.treatmentResults.quarryFirstEligible;
const p36PreFinalGather = p36Treatment.p36.eligibility.find(
  (entry) => entry.period === 680,
);
const p36StableQuarry = p36Treatment.p36.eligibility.find(
  (entry) => entry.period === 944,
);
const p36HousingAction = p36Treatment.nativeCalls.filter(
  (entry) =>
    entry.period === 672 &&
    entry.elementId === "city-basic_housing" &&
    entry.method === "action",
);
const p36ShedPurchase = p36Treatment.p36.policyEvents.find(
  (event) =>
    event.type === "native-purchase-verified" &&
    event.targetId === "city-shed" &&
    event.period === 584,
);
const quarryGatherEvents = p36Treatment.p36.policyEvents.filter(
  (event) =>
    event.type === "gather-click" &&
    event.stage === "quarry" &&
    event.period >= 584 &&
    event.period <= 688,
);
if (
  !p36StateAt1000 ||
  !p36StopEvent?.state ||
  !p36FirstQuarry ||
  !p36PreFinalGather ||
  !p36StableQuarry ||
  !p36ShedPurchase ||
  quarryGatherEvents.length !== 60
) {
  throw new Error("required retained P36 observations are incomplete");
}

const nativeAtStop = p36StopEvent.state;
const nativeAt1000 = p36StateAt1000.state;
const p19At10000 = p19Samples.find((entry) => entry.period === 10000);
const p19NativeAt10000 = p19At10000.native;
const p19FarmerOutput = Number.parseFloat(
  p19NativeAt10000.foodProduction.Farmer,
);
const p36FarmerOutput = p36StateAt1000.production.foodOutput;
const farmerImpact = 0.82;
const agricultureTwoFarmBonus = 1.15;
const fullFarmWorkerOutput = farmerImpact + agricultureTwoFarmBonus;
const capturedFarmerFormulaMultiplier =
  p36FarmerOutput / (fullFarmWorkerOutput + 3 * farmerImpact);
const formulaFoodWithThreeFarmers =
  capturedFarmerFormulaMultiplier * (fullFarmWorkerOutput + 2 * farmerImpact);
const formulaFoodWithTwoFarmers =
  capturedFarmerFormulaMultiplier * (fullFarmWorkerOutput + farmerImpact);
const foodReassignmentProjection = p36FoodSamples.map((sample) => {
  if (sample.jobs.farmer !== 4 || sample.population !== 4) {
    throw new Error(
      `unexpected P36 food sample assignment at period ${sample.period}`,
    );
  }
  const multiplier =
    sample.foodOutput / (fullFarmWorkerOutput + 3 * farmerImpact);
  const threeFarmerOutput =
    multiplier * (fullFarmWorkerOutput + 2 * farmerImpact);
  const twoFarmerOutput = multiplier * (fullFarmWorkerOutput + farmerImpact);
  return Object.freeze({
    period: sample.period,
    observedFourFarmerFood: sample.foodOutput,
    foodConsumption: sample.foodConsumption,
    projectedThreeFarmerFood: threeFarmerOutput,
    projectedThreeFarmerNet: threeFarmerOutput - sample.foodConsumption,
    projectedTwoFarmerFood: twoFarmerOutput,
    projectedTwoFarmerNet: twoFarmerOutput - sample.foodConsumption,
    actualStarved: sample.starved,
    actualDeaths: sample.deaths,
  });
});
const foodProjectionPositiveAtEverySample = foodReassignmentProjection.every(
  (sample) => sample.projectedThreeFarmerNet > 0,
);
const foodProjectionStableAcrossSamples = foodReassignmentProjection.every(
  (sample) =>
    Math.abs(
      sample.projectedThreeFarmerFood -
        foodReassignmentProjection[0].projectedThreeFarmerFood,
    ) < 1e-9,
);
if (Math.abs(formulaFoodWithThreeFarmers - p19FarmerOutput) > 1e-6) {
  throw new Error(
    "P19 three-Farmer output does not match the captured native formula inputs",
  );
}
const validityEpoch = "p36:C:post-stop-quarry-observation-window";
const settingsValidityEpoch = p36SettingsMatched
  ? validityEpoch
  : "p18:baseline-settings-not-matched-to-P36";
const currentConstruction = Object.freeze({
  id: "p36-quarry-current-post-stop",
  snapshotId: "p36-C:p944",
  period: p36StableQuarry.period,
  validityEpoch,
  targetId: p36StableQuarry.targetId,
  price: Object.freeze({ ...p36StableQuarry.price }),
  priceComplete: p36StableQuarry.priceAuthorityValid,
  stock: Object.freeze({ ...p36StableQuarry.stock }),
  authorityValid:
    p36StableQuarry.requestMatchesPublication &&
    p36StableQuarry.publicationCurrent &&
    p36StableQuarry.priceAuthorityValid,
  queuesEmpty: p36StableQuarry.queuesEmpty,
  competingClaimsAbsent: p36StableQuarry.competingClaims === false,
});
const economicState = Object.freeze({
  id: "p36-population-production-state",
  snapshotId: "p36-C:p1000",
  period: p36StateAt1000.period,
  validityEpoch,
  race: "standard-human",
  population: nativeAt1000.population,
  populationCapacity: nativeAt1000.populationCapacity,
  basicHousing: nativeAt1000.buildings.basic_housing,
  farmCount: nativeAt1000.buildings.farm,
  quarryCount: nativeAt1000.buildings.rock_quarry ?? 0,
  farmers: nativeAt1000.jobs.farmer,
  quarryWorkers: nativeAt1000.jobs.quarry_worker ?? 0,
  miningLevel: nativeAt1000.tech.mining,
  lumberCapacity: nativeAt1000.resources.Lumber.max,
  stoneCapacity: nativeAt1000.resources.Stone.max,
  foodOutput: p36StateAt1000.production.foodOutput,
  foodConsumption: p36StateAt1000.production.foodConsumption,
  lumberProduction: p36StateAt1000.production.lumberOutput,
  stoneProduction: p36StateAt1000.production.stoneOutput,
});
const labor = Object.freeze({
  id: "p19-p36-farmer-formula-counterfactual",
  snapshotId: "p36-C:p1000-p10000-and-P19-matched-farmer-captures",
  period: 1000,
  validityEpoch,
  minimumFarmers: 3,
  farmersAfterReassignment: 3,
  foodOutputAfterReassignment: formulaFoodWithThreeFarmers,
  foodOutputWithTwoFarmers: formulaFoodWithTwoFarmers,
  foodConsumptionAtPopulation: p36StateAt1000.production.foodConsumption,
  oneQuarryWorkerStoneOutputPositive: true,
  stableThroughPeriod: 10000,
  stableSampleCount: p36FoodSamples.length,
  foodProjectionPositiveAtEverySample,
  foodProjectionStableAcrossSamples,
  nativeAssignmentObserved: false,
});
const jobSettings = Object.freeze({
  id: p36SettingsMatched
    ? "p36-authenticated-native-job-settings"
    : "p18-standard-human-job-settings-baseline",
  snapshotId: settingsPath,
  period: 0,
  validityEpoch: settingsValidityEpoch,
  autoJobs: settings.autoJobs,
  jobSetDefault: settings.jobSetDefault,
  quarryWorkerEnabled: settings.job_quarry_worker,
  farmerEnabled: settings.job_farmer,
  quarryWorkerPriority: settings.job_p_quarry_worker,
  farmerPriority: settings.job_p_farmer,
  quarryWorkerBreakpoints: Object.freeze([
    settings.job_b1_quarry_worker,
    settings.job_b2_quarry_worker,
    settings.job_b3_quarry_worker,
  ]),
  farmerBreakpoints: Object.freeze([
    settings.job_b1_farmer,
    settings.job_b2_farmer,
    settings.job_b3_farmer,
  ]),
  priorityOrderEvidence: Object.freeze({
    id: "captured-managed-job-priority-order",
    snapshotId: "repository-source:captured-job-catalog.ts",
    period: 0,
    validityEpoch,
  }),
  breakpointEvidence: Object.freeze({
    id: "captured-job-breakpoint-normalization",
    snapshotId: "repository-source:captured-job-catalog.ts",
    period: 0,
    validityEpoch,
  }),
});
const stocks = Object.freeze(
  ["Lumber", "Stone"].map((resourceId) =>
    Object.freeze({
      resourceId,
      poolId: "city",
      amount: currentConstruction.stock[resourceId],
      capacity:
        economicState[
          resourceId === "Lumber" ? "lumberCapacity" : "stoneCapacity"
        ],
      netRate: 0,
      rateConfidence: "observed",
      validityEpoch,
    }),
  ),
);
const candidates = Object.freeze([
  Object.freeze({
    id: "gather-current-construction-target",
    goalId: "resource:quarry-material-price",
    preconditions: Object.freeze({
      satisfied: false,
      reasons: Object.freeze([
        "P36 consumed its 60-click Quarry-stage limit with an 18 Lumber shortage still present",
        "no further Gather spending authority is established",
      ]),
    }),
    acquisitionCosts: undefined,
    productionChanges: undefined,
    effectsComplete: false,
    effectAuthority: "provisional",
    validityEpoch,
    unavailableReasons: Object.freeze([
      "Gather is a bounded discrete action stream, not a captured passive marginal rate",
    ]),
  }),
  Object.freeze({
    id: "housing-population-capacity-first",
    goalId: "resource:quarry-material-price",
    preconditions: Object.freeze({
      satisfied: false,
      reasons: Object.freeze([
        "the observed fourth Basic Housing is already owned in this retained state",
        "its population and labor effects were a native side effect, not an isolated strategy arm",
      ]),
    }),
    acquisitionCosts: Object.freeze([
      Object.freeze({ resourceId: "Lumber", poolId: "city", amount: 19 }),
    ]),
    productionChanges: undefined,
    effectsComplete: false,
    effectAuthority: "provisional",
    validityEpoch,
    unavailableReasons: Object.freeze([
      "the exact housing cost is known, but its standalone marginal effect on the Quarry goal is not",
    ]),
  }),
  Object.freeze({
    id: "establish-productive-lumber-or-stone-job-first",
    goalId: "resource:quarry-material-price",
    preconditions: Object.freeze({
      satisfied: false,
      reasons: Object.freeze([
        "same-state job prerequisites and labor assignment have not been captured",
      ]),
    }),
    acquisitionCosts: undefined,
    productionChanges: undefined,
    effectsComplete: false,
    effectAuthority: "provisional",
    validityEpoch,
    unavailableReasons: Object.freeze([
      "native action costs and same-state marginal job production are unavailable",
    ]),
  }),
]);
const strategyEvidence = Object.freeze({
  validityEpoch,
  requirements: Object.freeze([
    Object.freeze({ resourceId: "Lumber", poolId: "city", amount: 50 }),
    Object.freeze({ resourceId: "Stone", poolId: "city", amount: 10 }),
  ]),
  stocks,
  commitments: Object.freeze([]),
  commitmentsKnown:
    currentConstruction.queuesEmpty === true &&
    currentConstruction.competingClaimsAbsent === true,
  candidates,
});
const planningInput = Object.freeze({
  analysisSnapshotId: "p36-C:post-stop-quarry-observation-window:944-10000",
  validityEpoch,
  pinnedGame: Object.freeze({
    revision: p36.pinnedGame,
    sha256: p36.gameSha256,
  }),
  construction: currentConstruction,
  state: economicState,
  labor,
  jobSettings,
  nativeMechanics: Object.freeze({
    requiredMiningLevel: 1,
    raceId: economicState.race,
    raceEligible: true,
    quarryUnlocksQuarryWorker: true,
    storageWithoutShed: Object.freeze({
      Lumber: p19NativeAt10000.resources.Lumber.max,
      Stone: p19NativeAt10000.resources.Stone.max,
    }),
    storageEvidence: Object.freeze({
      id: "p19-no-shed-storage-capacity",
      snapshotId: "p19:candidate:p10000",
      period: p19At10000.period,
      validityEpoch,
    }),
    mechanicsEvidence: Object.freeze({
      id: "pinned-quarry-and-housing-mechanics",
      snapshotId: p36.pinnedGame,
      pinnedGameRevision: p36.pinnedGame,
      sourceSha256: pinnedGameSourceSha256,
    }),
  }),
  strategyEvidence,
});

const p36PolicyEvents = p36Treatment.p36.policyEvents;
const quarryGatherLedger = quarryGatherEvents.map((event, index) => {
  const before =
    event.stageClicks === 60
      ? p36PreFinalGather.stock
      : index === 0
        ? { Lumber: 0, Stone: 0 }
        : quarryGatherEvents[index - 1].afterClickStocks;
  const resourceId = event.resourceId;
  return Object.freeze({
    period: event.period,
    stageClick: event.stageClicks,
    resourceId,
    addition: event.afterClickStocks[resourceId] - before[resourceId],
    stockAfter: Object.freeze({ ...event.afterClickStocks }),
  });
});
const eventAt = (period, type, targetId) =>
  p36PolicyEvents.find(
    (event) =>
      event.period === period &&
      event.type === type &&
      (targetId === undefined || event.targetId === targetId),
  );
const housingFirstSnapshot = eventAt(
  584,
  "native-purchase-verified",
  "city-shed",
)?.state;
const housingStopState = p36StopEvent.state;
const policyStop = p36PolicyEvents.find(
  (event) => event.type === "stopped" && event.period === 688,
);
const allConstructionCalls = p36Treatment.nativeCalls.filter(
  (entry) =>
    entry.period >= 584 &&
    entry.period <= 688 &&
    entry.method === "action" &&
    entry.elementId.startsWith("city-") &&
    entry.elementId !== "city-lumber",
);
const housingActionCalls = p36HousingAction.length;
const stoneGatherCallsAt680 = p36Treatment.nativeCalls.filter(
  (entry) =>
    entry.period === 680 &&
    entry.elementId === "undefined-stone" &&
    entry.method === "action",
);
const finalShortage = policyStop?.shortage;
if (!housingFirstSnapshot || !finalShortage) {
  throw new Error("required P36 ledger states are missing");
}

const graph = analyzeEconomicGoalDependencies(planningInput);
const decisionAssessment = evaluateEconomicGoalPathEvidence(graph);
const decisionEvidenceGaps = [...decisionAssessment.evidenceGaps];
const decision = decisionAssessment.decision;
const warmupCount = 100;
const batchCount = 50;
const iterationsPerBatch = 100;
const measuredIterations = batchCount * iterationsPerBatch;
const measurePureAnalysis = () => {
  const measuredGraph = analyzeEconomicGoalDependencies(planningInput);
  evaluateEconomicGoalPathEvidence(measuredGraph);
};
for (let i = 0; i < warmupCount; i += 1) measurePureAnalysis();
const batchDurations = [];
for (let batch = 0; batch < batchCount; batch += 1) {
  const started = performance.now();
  for (let iteration = 0; iteration < iterationsPerBatch; iteration += 1) {
    measurePureAnalysis();
  }
  batchDurations.push(performance.now() - started);
}
const perCallBatchAverages = batchDurations.map(
  (duration) => duration / iterationsPerBatch,
);
const sortedDurations = [...perCallBatchAverages].sort((a, b) => a - b);
const percentile = (fraction) =>
  sortedDurations[
    Math.min(
      sortedDurations.length - 1,
      Math.floor(fraction * sortedDurations.length),
    )
  ];
const sourceSnapshots = [
  {
    id: "p19-candidate-retained-evidence",
    path: p19Path,
    bytes: statSync(p19Path).size,
    periods: p19Samples.map((sample) => sample.period),
  },
  {
    id: "p36-treatment-C-retained-evidence",
    path: p36Path,
    bytes: statSync(p36Path).size,
    periods: [584, 680, 688, 944, 1000, 10000],
  },
  {
    id: p36SettingsMatched
      ? "p36-authenticated-native-job-settings"
      : "p18-standard-human-job-settings-baseline",
    path: settingsPath,
    fileSha256: settingsFileSha256,
    canonicalSettingsSha256: settingsCanonicalSha256,
    p36RecordedSha256: p36.settingsSha256,
    hashingMethod: "SHA-256(JSON.stringify(settings))",
    matchesP36SettingsDigest: p36SettingsMatched,
    bytes: statSync(settingsPath).size,
    periods: [0],
  },
];
const pinnedGameSource = {
  path: pinnedGamePath,
  sha256: pinnedGameSourceSha256,
  p36RecordedSha256: p36.gameSha256,
  matchesP36PinnedGame: pinnedGameMatchesP36,
  bytes: statSync(pinnedGamePath).size,
};

const housingCountBefore = housingFirstSnapshot.buildings.basic_housing;
const housingCountAfter = housingStopState.buildings.basic_housing;
const ledger = Object.freeze({
  periodWindow: { firstQuarryCurrent: 584, stop: 688 },
  quarryFirstCurrent: {
    period: p36FirstQuarry.period,
    targetId: p36FirstQuarry.targetId,
    completePrice: Object.freeze({ ...p36FirstQuarry.price }),
    stock: Object.freeze({ ...p36FirstQuarry.stock }),
    completePriceAuthority:
      p36FirstQuarry.requestMatchesPublication &&
      p36FirstQuarry.publicationCurrent &&
      p36FirstQuarry.priceAuthorityValid,
    queuesEmpty: p36FirstQuarry.queuesEmpty,
    competingClaims: p36FirstQuarry.competingClaims,
  },
  shedBoundaryPurchase: {
    period: 584,
    targetId: "city-shed",
    immediatelyBeforeQuarryCurrent: true,
    postPurchaseState: {
      resources: Object.fromEntries(
        ["Lumber", "Stone", "Money", "Food", "Knowledge"].map((id) => [
          id,
          housingFirstSnapshot.resources[id].amount,
        ]),
      ),
      buildings: housingFirstSnapshot.buildings,
      jobs: housingFirstSnapshot.jobs,
    },
    fullCostAtFirstP36Authorization: {
      Money: 75,
      Lumber: 55,
      Stone: 45,
    },
    evidenceIds: ["p36-shed-purchase-p584", "p36-shed-first-authority-p448"],
  },
  gatherActions: quarryGatherLedger,
  gatherTotals: {
    actionCount: quarryGatherLedger.length,
    byResource: quarryGatherLedger.reduce((totals, entry) => {
      totals[entry.resourceId] =
        (totals[entry.resourceId] ?? 0) + entry.addition;
      return totals;
    }, {}),
    clicksByResource: quarryGatherLedger.reduce((totals, entry) => {
      totals[entry.resourceId] = (totals[entry.resourceId] ?? 0) + 1;
      return totals;
    }, {}),
  },
  constructionDuringQuarryEpisode: {
    nativeConstructionActionInvocations: allConstructionCalls,
    observedPurchases: [
      {
        period: 672,
        targetId: "city-basic_housing",
        nativeActionInvocations: housingActionCalls,
        countBefore: housingCountBefore,
        countAfter: housingCountAfter,
        purchases: housingCountAfter - housingCountBefore,
        cost: { Money: 0, Lumber: 19, Stone: 0 },
        costSource: "pinned native formula at Basic Housing count 3",
        stockReconciliation: {
          lumberAfterGatherClick59At672: quarryGatherEvents.find(
            (event) => event.stageClicks === 59,
          ).afterClickStocks.Lumber,
          lumberAt680BeforeGatherClick60: p36PreFinalGather.stock.Lumber,
          lumberSpent: 19,
          stoneCost: 0,
          moneyCost: 0,
          immediateTransactionReceiptCaptured: false,
        },
        evidenceIds: [
          "p36-housing-action-p672",
          "p36-housing-count-3-to-4",
          "p36-quarry-eligibility-p680",
          "pinned-basic-housing-cost-formula",
        ],
      },
    ],
    noOtherPurchasesRecorded: allConstructionCalls.every(
      (entry) => entry.elementId === "city-basic_housing",
    ),
  },
  stop: {
    period: 688,
    currentTargetId: policyStop.targetId,
    required: { Lumber: 50, Stone: 10 },
    stock: {
      Lumber: housingStopState.resources.Lumber.amount,
      Stone: housingStopState.resources.Stone.amount,
    },
    shortage: finalShortage,
    stageClicks: policyStop.stageClicks,
    totalP36Clicks: policyStop.totalClicks,
    stageBudgetRemaining: 0,
    totalBudgetRemaining: 1,
    cause:
      "The 19-Lumber fourth Housing purchase reduced 50 Lumber to 31; final Gather click #60 added 1 Lumber, leaving 32 against Quarry's 50 requirement.",
  },
  unaccountedStockChange: {
    resourceId: "Stone",
    from: quarryGatherEvents.find((event) => event.stageClicks === 59)
      .afterClickStocks.Stone,
    to: p36PreFinalGather.stock.Stone,
    amount:
      p36PreFinalGather.stock.Stone -
      quarryGatherEvents.find((event) => event.stageClicks === 59)
        .afterClickStocks.Stone,
    interval: [672, 680],
    source: "unknown",
    stoneGatherInvocationsAt680: stoneGatherCallsAt680.length,
    surroundingStoneGatherInvocations: p36Treatment.nativeCalls.filter(
      (entry) =>
        entry.period >= 672 &&
        entry.period <= 680 &&
        entry.elementId === "undefined-stone" &&
        entry.method === "action",
    ).length,
    productionAtStop: housingStopState.stoneProduction,
    attributionNote:
      "The final Quarry policy click is logged as Lumber and there is no Stone Gather invocation at period 680; surrounding period 672 Stone Gather calls cannot be reconciled to the later +1 stock increment. No captured production, Housing cost, Quarry purchase, or other native build accounts for it.",
  },
  stockAndProductionChanges: {
    startAfterShedAt584: Object.fromEntries(
      ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
        id,
        housingFirstSnapshot.resources[id].amount,
      ]),
    ),
    stopAt688: Object.fromEntries(
      ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
        id,
        housingStopState.resources[id].amount,
      ]),
    ),
    netStockChanges: Object.fromEntries(
      ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
        id,
        housingStopState.resources[id].amount -
          housingFirstSnapshot.resources[id].amount,
      ]),
    ),
    nativeRatesAtStartAndStop: {
      p584: {
        food: {
          output: housingFirstSnapshot.foodProduction,
          consumption: housingFirstSnapshot.foodConsumption,
        },
        lumber: housingFirstSnapshot.lumberProduction,
        stone: housingFirstSnapshot.stoneProduction,
      },
      p688: {
        food: {
          output: housingStopState.foodProduction,
          consumption: housingStopState.foodConsumption,
        },
        lumber: housingStopState.lumberProduction,
        stone: housingStopState.stoneProduction,
      },
    },
    otherNativeAction: {
      period: 672,
      kind: "Research",
      technology: "Irrigation",
      evidence: "native tech-irrigation.action invocation",
      knowledgeNetChange: -29,
      exactResearchCostAndInterveningProductionSeparatelyCaptured: false,
    },
    queueAndReservationState: {
      atFirstQuarryCurrent: {
        queuesEmpty: p36FirstQuarry.queuesEmpty,
        competingClaims: p36FirstQuarry.competingClaims,
      },
      atPreFinalGather680: {
        queuesEmpty: p36PreFinalGather.queuesEmpty,
        competingClaims: p36PreFinalGather.competingClaims,
      },
      quarryMaterialsReserved: false,
      nativeConstructionMayConsumeUnreservedStock: true,
    },
  },
});

const foodCounterfactual = Object.freeze({
  sourceFormula: {
    farmerImpact,
    agricultureTwoFarmBonus,
    fullFarmWorkerOutput,
    capturedFarmerFormulaMultiplier,
    calculatedOutput: {
      threeFarmers: formulaFoodWithThreeFarmers,
      twoFarmers: formulaFoodWithTwoFarmers,
    },
    fullFarmSlots: 1,
    formulaLines: [105580, 150654, 150660, 150677, 150678],
  },
  p19ObservedBaseline: {
    samples: p19Samples.map((sample) => ({
      period: sample.period,
      population: sample.population,
      farmers: sample.native.jobs.farmer,
      foodOutput: Number.parseFloat(sample.native.foodProduction.Farmer),
      foodConsumption: Math.abs(
        Number.parseFloat(Object.values(sample.native.foodConsumption)[0]),
      ),
      lumberProduction: sample.native.lumberProduction.Lumberjack,
      stoneStock: sample.native.resources.Stone.amount,
    })),
  },
  p36ObservedFourResidentState: {
    period: 1000,
    population: nativeAt1000.population,
    capacity: nativeAt1000.populationCapacity,
    farmers: nativeAt1000.jobs.farmer,
    foodOutput: p36FarmerOutput,
    foodConsumption: p36StateAt1000.production.foodConsumption,
    stableFoodSamplesThroughPeriod: p36FoodSamples.at(-1).period,
    stableFoodSampleCount: p36FoodSamples.length,
    starvationAndDeaths: { starved: 0, deaths: 0 },
  },
  p36ThreeFarmerCounterfactualAcrossCapturedInterval: {
    samples: foodReassignmentProjection,
    positiveFoodAtEverySample: foodReassignmentProjection.every(
      (sample) => sample.projectedThreeFarmerNet > 0,
    ),
    outputStableAcrossSamples: foodProjectionStableAcrossSamples,
    assignmentReplayed: false,
  },
  quarryWorkerStoneFormula: {
    expression:
      'workerScale(1, "quarry_worker") * racialTrait(workers, "miner") * geneBonus("stonecutter") * job_data.quarry_worker.impact()',
    impactForNativeQuarryWorker: 1,
    formulaLines: {
      workerScale: [105161, 105188],
      jobDescriptor: [104420, 104459],
      racialTrait: [131490, 131560],
      geneBonus: [132579, 132586],
      production: [152841, 152859],
    },
    oneWorkerOutputPositiveByNativeFormula: true,
    exactPostAssignmentAmountObserved: false,
  },
  diagnosticReassignment: {
    farmers: 3,
    quarryWorkers: 1,
    foodOutput: formulaFoodWithThreeFarmers,
    foodConsumption: p36StateAt1000.production.foodConsumption,
    netFood:
      formulaFoodWithThreeFarmers - p36StateAt1000.production.foodConsumption,
    foodOutputWithTwoFarmers: formulaFoodWithTwoFarmers,
    netFoodWithTwoFarmers:
      formulaFoodWithTwoFarmers - p36StateAt1000.production.foodConsumption,
    quarryWorkerStoneOutputPositiveByNativeFormula: true,
    nativeAssignmentObserved: false,
    assignmentControls: {
      autoJobs: settings.autoJobs,
      jobSetDefault: settings.jobSetDefault,
      quarryWorkerEnabled: settings.job_quarry_worker,
      farmerEnabled: settings.job_farmer,
      quarryWorkerPriority: settings.job_p_quarry_worker,
      farmerPriority: settings.job_p_farmer,
      quarryWorkerBreakpoints: [
        settings.job_b1_quarry_worker,
        settings.job_b2_quarry_worker,
        settings.job_b3_quarry_worker,
      ],
      farmerBreakpoints: [
        settings.job_b1_farmer,
        settings.job_b2_farmer,
        settings.job_b3_farmer,
      ],
    },
    interpretation:
      "Formula-backed counterfactual for the captured Standard/Human one-Farm Agriculture-II state; not a replayed job reassignment or new production authority.",
  },
});

const sourceEvidence = [
  {
    id: "p36-quarry-first-current",
    path: p36Path,
    selector: "arm C p36.eligibility period 584",
    period: 584,
  },
  {
    id: "p36-quarry-pre-final-gather",
    path: p36Path,
    selector: "arm C p36.eligibility period 680",
    period: 680,
  },
  {
    id: "p36-stop-and-housing-state",
    path: p36Path,
    selector: "arm C policyEvents stopped period 688",
    period: 688,
  },
  {
    id: "p36-native-construction-and-gather-calls",
    path: p36Path,
    selector: "arm C nativeCalls/p36.policyEvents periods 584-688",
    period: 672,
  },
  {
    id: "p36-food-series",
    path: p36Path,
    selector: "treatmentResults.foodTimeSeries periods 1000-10000",
    period: 1000,
  },
  {
    id: "p19-matched-human-baseline",
    path: p19Path,
    selector: "candidate checkpoints periods 1000,5000,10000",
    period: 1000,
  },
  {
    id: "p19-no-shed-storage-capacity",
    path: p19Path,
    selector:
      "candidate checkpoint period 10000 native.resources Lumber/Stone max",
    period: p19At10000.period,
  },
  {
    id: "p36-job-settings-hypothesis",
    path: p36Path,
    selector:
      "feasibility.jobHypothesis; explicitly not a post-purchase assignment observation",
  },
  {
    id: p36SettingsMatched
      ? "p36-authenticated-native-job-settings"
      : "p18-job-settings-baseline-only",
    path: settingsPath,
    fileSha256: settingsFileSha256,
    canonicalSettingsSha256: settingsCanonicalSha256,
    p36RecordedSha256: p36.settingsSha256,
    hashingMethod: "SHA-256(JSON.stringify(settings))",
    matchesP36SettingsDigest: p36SettingsMatched,
    selector: p36SettingsMatched
      ? "autoJobs/job_farmer/job_quarry_worker/job priorities; canonical settings digest verified against P36"
      : "autoJobs/job_farmer/job_quarry_worker/job priorities; P18 baseline only because its canonical digest does not match P36",
    period: 0,
  },
  {
    id: "p36-settings-hash-method",
    path: "experiments/p36-productive-resource-bootstrap-exact.mjs",
    sourceLines: [1377],
    interpretation:
      "P36 hashes SHA-256 over JSON.stringify(settings), not raw file bytes.",
  },
  {
    id: "captured-managed-job-priority-order",
    path: "src/adapters/evolve/civic/captured-job-catalog.ts",
    sourceLines: [159, 182],
    interpretation:
      "Managed job priorities are sorted in ascending numeric order; the matched P36 values put Farmer priority 5 before Quarry Worker priority 8.",
  },
  {
    id: "captured-job-breakpoint-normalization",
    path: "src/adapters/evolve/civic/captured-job-catalog.ts",
    sourceLines: [1563, 1595],
    interpretation:
      "Configured -1 breakpoints normalize to Number.MAX_SAFE_INTEGER before per-job caps.",
  },
  {
    id: "pinned-quarry-and-housing-mechanics",
    path: pinnedGameSource.path,
    sha256: pinnedGameSource.sha256,
    p36RecordedSha256: pinnedGameSource.p36RecordedSha256,
    matchesP36PinnedGame: pinnedGameSource.matchesP36PinnedGame,
    bytes: pinnedGameSource.bytes,
    sourceLines: {
      housing: [112158, 112205],
      housingCostMultiplierAndRounding: [137103, 137173],
      quarryCostAndUnlock: [113780, 113867],
      workerScaleAndFarmerValue: [105161, 105607],
      farmerProduction: [150653, 150679],
      quarryWorkerProduction: [152841, 152859],
      quarryWorkerJobDescriptor: [104420, 104459],
      racialTrait: [131490, 131560],
      geneBonus: [132579, 132586],
    },
  },
  {
    id: "p33-live-authority-observations",
    path: "experiments/p33-p19-live-authority-evidence.json",
    selector: "decision and shadow authority observations",
  },
  {
    id: "p34-allocation-execution-cost-observations",
    path: "experiments/p34-allocation-execution-cost-evidence.json",
    selector:
      "625 shadow captures, zero extra native catalog/price probes, CPU gate unresolved",
  },
];

const warmupsAndMeasurements = {
  measuredOperation:
    "bounded goal graph, strategy comparison, and A/B evidence gate",
  clock: "node:perf_hooks performance.now() (monotonic high-resolution clock)",
  warmupCount,
  measuredIterations,
  batchCount,
  iterationsPerBatch,
  totalMs: batchDurations.reduce((sum, duration) => sum + duration, 0),
  p50Ms: percentile(0.5),
  p95Ms: percentile(0.95),
  maxBatchAverageMs: sortedDurations.at(-1),
  batchAverageMs: perCallBatchAverages,
  sourceFileBytes: sourceSnapshots.reduce(
    (sum, source) => sum + source.bytes,
    0,
  ),
  sourceSnapshots,
  pinnedGameSource,
  normalizedPlannerInputBytes: Buffer.byteLength(JSON.stringify(planningInput)),
  plannerGraphNodeCount: graph.goals.length,
  plannerGraphEdgeCount: graph.edges.length,
  plannerVisitedNodeCount: graph.traversal.visited.length,
  noNativeSampling: true,
  ordinaryRuntimeIntegrated: false,
};

const output = {
  experiment: "P37 autonomous economic goal and dependency authority",
  schemaVersion: 1,
  decision,
  objective: {
    text: "Sustainable positive Stone production without sacrificing population or Food sustainability",
    provenance: "diagnostic-objective",
    playerSelected: false,
    executionAuthority: "none",
  },
  jobSettingsEvidence: {
    settingsPath,
    fileSha256: settingsFileSha256,
    canonicalSettingsSha256: settingsCanonicalSha256,
    p36RecordedSettingsSha256: p36.settingsSha256,
    hashingMethod: "SHA-256(JSON.stringify(settings))",
    matchesP36SettingsDigest: p36SettingsMatched,
    p36JobSettingsStatus: p36SettingsMatched ? "matched" : "unavailable",
    values: {
      autoJobs: settings.autoJobs,
      jobSetDefault: settings.jobSetDefault,
      quarryWorkerEnabled: settings.job_quarry_worker,
      farmerEnabled: settings.job_farmer,
      quarryWorkerPriority: settings.job_p_quarry_worker,
      farmerPriority: settings.job_p_farmer,
      quarryWorkerBreakpoints: [
        settings.job_b1_quarry_worker,
        settings.job_b2_quarry_worker,
        settings.job_b3_quarry_worker,
      ],
      farmerBreakpoints: [
        settings.job_b1_farmer,
        settings.job_b2_farmer,
        settings.job_b3_farmer,
      ],
    },
    interpretation: p36SettingsMatched
      ? "The canonical settings digest matches P36, so these values are authenticated for the P36 replay; post-Quarry auto-assignment remains unobserved."
      : "The canonical settings digest does not match P36, so the P18 values are diagnostic baseline only.",
  },
  pinnedGame: p36.pinnedGame,
  pinnedGameSha256: p36.gameSha256,
  decisionEvidenceGaps,
  decisionRationale:
    decision === "A"
      ? "P36's current Quarry, complete price, physical storage fit, owner order, authenticated job settings, four-resident state, and formula-backed sustainable labor split form a plausible diagnostic path. Post-purchase Quarry Worker assignment/output remains unobserved; no policy is executable."
      : `One or more required path facts are unavailable or unsatisfied (${decisionEvidenceGaps.join(", ")}); the bounded graph cannot identify a defensible path under the evaluated evidence.`,
  graph,
  resourceContentionLedger: ledger,
  laborCounterfactual: foodCounterfactual,
  sourceEvidence,
  performance: warmupsAndMeasurements,
  missingCaptures: [
    ...(p36SettingsMatched
      ? []
      : [
          {
            fact: "P36-matched native job-settings snapshot",
            whyMissing: `The current canonical settings digest ${settingsCanonicalSha256} differs from P36's recorded digest ${p36.settingsSha256}.`,
            estimatedCaptureCost:
              "Low if the exact P36 settings blob can be recovered from its replay inputs; otherwise one isolated settings capture is needed, with no catalog or price probes.",
            requiredForDiagnosticPath: false,
            requiredBeforeClaimingAutomaticReassignment: true,
          },
        ]),
    {
      fact: "Native autoJobs assignment after Quarry purchase with four residents and three Farmers",
      whyMissing:
        "P36 stopped before Quarry ownership; no Quarry Worker control was exposed or invoked.",
      estimatedCaptureCost:
        "One isolated pinned Chromium replay must spend the outstanding 18 Lumber plus any future native-order diversion, then retain before/after job and Food snapshots; P36's production budget was 139 Gather actions, 688 validation fences, and 899 fresh price probes for the full 10,000-period run.",
      requiredForDiagnosticPath: false,
      requiredBeforeExecutionAuthority: true,
    },
    {
      fact: "Observed Quarry Worker Stone output after native assignment",
      whyMissing:
        "The Quarry was not purchased in P36, and native source formulas are not a substitute for an observed output sample.",
      estimatedCaptureCost:
        "Same isolated replay; capture at least one post-assignment production sample, plus repeated samples if claiming interval stability. No production callback or price-probing loop is needed for the read-only diagnostic.",
      requiredForDiagnosticPath: false,
      requiredBeforeExecutionAuthority: true,
    },
  ],
  exclusions: {
    runtimeBehaviorChanged: false,
    ordinaryConstructionSuppressed: false,
    productionSelectorAdded: false,
    backgroundPlannerAdded: false,
    spendingExecutorAdded: false,
    p20GenericAllocatorRestored: false,
  },
};

writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      graphNodes: graph.goals.length,
      graphEdges: graph.edges.length,
      traversal: graph.traversal,
      strategyComparison: graph.strategyComparison,
      performance: warmupsAndMeasurements,
      ledgerGatherTotals: ledger.gatherTotals,
      finalShortage: ledger.stop.shortage,
    },
    null,
    2,
  ),
);
