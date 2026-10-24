import assert from "node:assert/strict";

import {
  analyzeEconomicGoalDependencies,
  evaluateEconomicGoalPathEvidence,
} from "../../../src/domain/progression/economic-goal-dependencies.ts";

const epoch = "p36:retained-window";

const construction = (overrides = {}) => ({
  id: "quarry-current",
  snapshotId: "p36-C:p944",
  period: 944,
  validityEpoch: epoch,
  targetId: "city-rock_quarry",
  price: { Lumber: 50, Stone: 10 },
  priceComplete: true,
  stock: { Lumber: 32, Stone: 10 },
  authorityValid: true,
  queuesEmpty: true,
  competingClaimsAbsent: true,
  ...overrides,
});

const state = (overrides = {}) => ({
  id: "four-resident-state",
  snapshotId: "p36-C:p1000",
  period: 1000,
  validityEpoch: epoch,
  race: "standard-human",
  population: 4,
  populationCapacity: 4,
  basicHousing: 4,
  farmCount: 1,
  quarryCount: 0,
  farmers: 4,
  quarryWorkers: 0,
  miningLevel: 1,
  lumberCapacity: 500,
  stoneCapacity: 500,
  foodOutput: 5.316,
  foodConsumption: 4,
  lumberProduction: 0,
  stoneProduction: 0,
  ...overrides,
});

const labor = (overrides = {}) => ({
  id: "farmer-formula-counterfactual",
  snapshotId: "p19-p36-matched",
  period: 1000,
  validityEpoch: epoch,
  minimumFarmers: 3,
  farmersAfterReassignment: 3,
  foodOutputAfterReassignment: 4.332,
  foodOutputWithTwoFarmers: 3.348,
  foodConsumptionAtPopulation: 4,
  oneQuarryWorkerStoneOutputPositive: true,
  stableThroughPeriod: 10000,
  stableSampleCount: 10,
  foodProjectionPositiveAtEverySample: true,
  foodProjectionStableAcrossSamples: true,
  nativeAssignmentObserved: false,
  ...overrides,
});

const jobSettings = {
  id: "retained-job-settings",
  snapshotId: "p18-standard-human",
  period: 0,
  validityEpoch: epoch,
  autoJobs: true,
  jobSetDefault: true,
  quarryWorkerEnabled: true,
  farmerEnabled: true,
  quarryWorkerPriority: 8,
  farmerPriority: 5,
  quarryWorkerBreakpoints: [4, 10, 0],
  farmerBreakpoints: [-1, -1, -1],
  priorityOrderEvidence: {
    id: "captured-managed-job-priority-order",
    snapshotId: "repository-source:captured-job-catalog.ts",
    period: 0,
    validityEpoch: epoch,
  },
  breakpointEvidence: {
    id: "captured-job-breakpoint-normalization",
    snapshotId: "repository-source:captured-job-catalog.ts",
    period: 0,
    validityEpoch: epoch,
  },
};

const makeInput = (overrides = {}) => ({
  analysisSnapshotId: "p36-C:944-10000",
  validityEpoch: epoch,
  pinnedGame: {
    revision: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
    sha256: "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
  },
  construction: construction(),
  state: state(),
  labor: labor(),
  jobSettings,
  nativeMechanics: {
    requiredMiningLevel: 1,
    raceId: "standard-human",
    raceEligible: true,
    quarryUnlocksQuarryWorker: true,
    storageWithoutShed: { Lumber: 200, Stone: 200 },
    storageEvidence: {
      id: "p19-no-shed-storage-capacity",
      snapshotId: "p19:candidate:p10000",
      period: 10000,
      validityEpoch: epoch,
    },
    mechanicsEvidence: {
      id: "pinned-quarry-and-housing-mechanics",
      snapshotId: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      pinnedGameRevision:
        "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      sourceSha256:
        "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
    },
  },
  strategyEvidence: {
    validityEpoch: epoch,
    requirements: [
      { resourceId: "Lumber", poolId: "city", amount: 50 },
      { resourceId: "Stone", poolId: "city", amount: 10 },
    ],
    stocks: [
      {
        resourceId: "Lumber",
        poolId: "city",
        amount: 32,
        capacity: 500,
        netRate: 0,
        rateConfidence: "observed",
        validityEpoch: epoch,
      },
      {
        resourceId: "Stone",
        poolId: "city",
        amount: 10,
        capacity: 500,
        netRate: 0,
        rateConfidence: "observed",
        validityEpoch: epoch,
      },
    ],
    commitments: [],
    commitmentsKnown: true,
    candidates: [
      {
        id: "unmeasured-gather",
        goalId: "resource:quarry-material-price",
        preconditions: {
          satisfied: false,
          reasons: ["Gather budget exhausted"],
        },
        acquisitionCosts: undefined,
        productionChanges: undefined,
        effectsComplete: false,
        effectAuthority: "provisional",
        validityEpoch: epoch,
        unavailableReasons: ["No additional Gather authority was captured"],
      },
    ],
  },
  ...overrides,
});

const node = (graph, id) => graph.goals.find((goal) => goal.id === id);

{
  const input = makeInput();
  const inputJson = JSON.stringify(input);
  const graph = analyzeEconomicGoalDependencies(input);
  const price = node(graph, "resource:quarry-material-price");
  const storage = node(graph, "resource:quarry-cost-fits-existing-storage");
  const food = node(graph, "food:positive-after-reassignment");
  const laborCapacity = node(
    graph,
    "labor:three-farmers-plus-one-quarry-worker",
  );

  assert.equal(graph.objective.provenance, "diagnostic-objective");
  assert.equal(graph.playerSelected, false);
  assert.equal(graph.executionAuthority, "none");
  assert.equal(graph.freshness.mechanics, "matched");
  const pathAssessment = evaluateEconomicGoalPathEvidence(graph);
  assert.equal(pathAssessment.decision, "A");
  assert.deepEqual(pathAssessment.evidenceGaps, []);
  assert.equal(Object.isFrozen(pathAssessment), true);
  assert.equal(Object.isFrozen(pathAssessment.evidenceGaps), true);
  assert.equal(graph.traversal.missing.length, 0);
  assert.equal(graph.traversal.cycles.length, 0);
  assert.ok(graph.traversal.visited.length <= graph.limits.maxGoals);
  assert.equal(price.status, "unsatisfied");
  assert.deepEqual(
    price.resourceRequirements.map(
      ({
        resourceId,
        required,
        observed,
        committed,
        unreserved,
        shortfall,
      }) => ({
        resourceId,
        required,
        observed,
        committed,
        unreserved,
        shortfall,
      }),
    ),
    [
      {
        resourceId: "Lumber",
        required: 50,
        observed: 32,
        committed: 0,
        unreserved: 32,
        shortfall: 18,
      },
      {
        resourceId: "Stone",
        required: 10,
        observed: 10,
        committed: 0,
        unreserved: 10,
        shortfall: 0,
      },
    ],
  );
  assert.equal(storage.status, "satisfied");
  assert.ok(storage.evidenceIds.includes("p19-no-shed-storage-capacity"));
  assert.ok(
    node(graph, "research:mining-level-1").evidenceIds.includes(
      "pinned-quarry-and-housing-mechanics",
    ),
  );
  assert.equal(laborCapacity.status, "satisfied");
  assert.equal(food.status, "satisfied");
  assert.equal(node(graph, "job:quarry-worker-assigned").status, "unsatisfied");
  assert.equal(
    node(graph, "economic:positive-stone-production").confidence,
    "provisional",
  );
  assert.equal(
    node(graph, "job:native-settings-permit-quarry-worker").diagnostic
      .configuredPriorityOrder,
    "farmer-before-quarry-worker",
  );
  assert.equal(
    node(graph, "job:native-settings-permit-quarry-worker").confidence,
    "provisional",
  );
  assert.ok(
    node(
      graph,
      "job:native-settings-permit-quarry-worker",
    ).evidenceIds.includes("captured-managed-job-priority-order"),
  );
  assert.ok(
    node(
      graph,
      "job:native-settings-permit-quarry-worker",
    ).evidenceIds.includes("captured-job-breakpoint-normalization"),
  );

  assert.equal(
    graph.edges.find(
      (edge) => edge.to === "construction-order:shed-before-quarry",
    ).kind,
    "native-owner-ordering",
  );
  assert.equal(
    graph.edges.find(
      (edge) => edge.to === "resource:quarry-cost-fits-existing-storage",
    ).kind,
    "resource-requirement",
  );
  assert.equal(
    graph.edges.find(
      (edge) => edge.to === "labor:three-farmers-plus-one-quarry-worker",
    ).kind,
    "labor-food-requirement",
  );
  assert.equal(graph.strategyComparison.winner, undefined);
  assert.equal(graph.strategyComparison.provisionalWinner, undefined);
  assert.equal(graph.strategyComparison.strategies[0].status, "uncertain");
  assert.equal(graph.strategyComparison.strategies[1].status, "unavailable");
  assert.equal(graph.strategyComparison.strategies[1].actionable, false);

  assert.equal(Object.isFrozen(graph), true);
  assert.equal(Object.isFrozen(graph.goals), true);
  assert.equal(Object.isFrozen(graph.objective.prerequisites.goalIds), true);
  assert.equal(Object.isFrozen(price.resourceRequirements[0]), true);
  assert.equal(Object.isFrozen(graph.traversal.visited), true);
  assert.equal(JSON.stringify(input), inputJson);
}

{
  const bounded = analyzeEconomicGoalDependencies(
    makeInput({ graphLimits: { maxGoals: 1, maxDepth: 0 } }),
  );
  assert.equal(bounded.goals.length, 1);
  assert.equal(bounded.traversal.visited.length, 1);
  assert.ok(bounded.traversal.limits.length > 0);
  assert.deepEqual(bounded.traversal.missing, []);
  assert.deepEqual(bounded.edges, []);
}

{
  const observed = analyzeEconomicGoalDependencies(
    makeInput({
      analysisSnapshotId: "p38:C:p10000:root-44:progression-epoch-9",
      validityEpoch: "p38:C:p10000:root-44:progression-epoch-9",
      construction: construction({
        id: "p38-C-native-quarry-price",
        snapshotId: "p38:C:p10000:root-44:progression-epoch-9",
        period: 10000,
        validityEpoch: "p38:C:p10000:root-44:progression-epoch-9",
        stock: { Lumber: 0, Stone: 0 },
      }),
      state: state({
        id: "p38-C-native-state",
        snapshotId: "p38:C:p10000:root-44:progression-epoch-9",
        period: 10000,
        validityEpoch: "p38:C:p10000:root-44:progression-epoch-9",
        quarryCount: 1,
        farmers: 3,
        quarryWorkers: 1,
        stoneProduction: 0.62,
        foodOutput: 4.332,
        foodConsumption: 4,
      }),
      labor: labor({
        id: "p38-C-native-food-interval",
        snapshotId: "p38:C:worker-transfer:p1000-p10000",
        period: 1000,
        validityEpoch: "p38:C:p10000:root-44:progression-epoch-9",
        farmersAfterReassignment: 3,
        foodOutputAfterReassignment: 4.332,
        foodConsumptionAtPopulation: 4,
        stableThroughPeriod: 10000,
        stableSampleCount: 10,
        foodProjectionPositiveAtEverySample: undefined,
        foodProjectionStableAcrossSamples: undefined,
        foodObservedPositiveAtEverySample: true,
        foodObservedStableAcrossSamples: true,
        nativeAssignmentObserved: true,
      }),
    }),
  );
  assert.equal(node(observed, "building:rock-quarry").status, "satisfied");
  assert.equal(
    node(observed, "building:rock-quarry").confidence,
    "established",
  );
  assert.equal(
    node(observed, "job:quarry-worker-assigned").status,
    "satisfied",
  );
  assert.equal(
    node(observed, "job:quarry-worker-assigned").confidence,
    "established",
  );
  assert.equal(
    node(observed, "economic:positive-stone-production").status,
    "satisfied",
  );
  assert.equal(
    node(observed, "economic:positive-stone-production").confidence,
    "established",
  );
  assert.equal(
    node(observed, "food:positive-after-reassignment").status,
    "satisfied",
  );
  assert.equal(
    node(observed, "food:positive-after-reassignment").confidence,
    "established",
  );

  const unsafeFood = analyzeEconomicGoalDependencies(
    makeInput({
      labor: labor({
        foodProjectionPositiveAtEverySample: undefined,
        foodProjectionStableAcrossSamples: undefined,
        foodObservedPositiveAtEverySample: false,
        foodObservedStableAcrossSamples: false,
        nativeAssignmentObserved: true,
      }),
      state: state({
        quarryCount: 1,
        quarryWorkers: 1,
        farmers: 3,
        stoneProduction: 0.62,
      }),
    }),
  );
  assert.equal(
    node(unsafeFood, "food:positive-after-reassignment").status,
    "blocked",
  );
  assert.equal(
    node(unsafeFood, "food:positive-after-reassignment").confidence,
    "established",
  );
}

{
  const unavailable = analyzeEconomicGoalDependencies(
    makeInput({
      construction: construction({
        priceComplete: false,
        price: { Lumber: 50 },
        stock: undefined,
      }),
      strategyEvidence: undefined,
    }),
  );
  const price = node(unavailable, "resource:quarry-material-price");
  assert.equal(unavailable.freshness.construction, "matched");
  assert.equal(price.status, "unavailable");
  assert.equal(price.confidence, "unavailable");
  assert.equal(price.quantity, undefined);
  assert.equal(price.resourceRequirements, undefined);
  assert.equal(unavailable.strategyComparison, undefined);
  assert.deepEqual(unavailable.traversal.missing, []);
}

{
  const stale = analyzeEconomicGoalDependencies(
    makeInput({
      construction: construction({ validityEpoch: "p36:old-window" }),
      state: state({ validityEpoch: "p36:old-window" }),
      strategyEvidence: {
        ...makeInput().strategyEvidence,
        stocks: makeInput().strategyEvidence.stocks.map((entry) => ({
          ...entry,
          validityEpoch: "p36:old-window",
        })),
      },
    }),
  );
  assert.equal(stale.freshness.construction, "stale");
  assert.equal(stale.freshness.state, "stale");
  assert.equal(stale.freshness.labor, "matched");
  assert.equal(stale.freshness.jobSettings, "matched");
  assert.equal(stale.freshness.strategyStocks, "stale");
  assert.equal(node(stale, "population:retained").status, "unavailable");
  assert.equal(node(stale, "quarry:race-eligible").status, "unavailable");
  assert.equal(
    node(stale, "resource:quarry-material-price").status,
    "unavailable",
  );
  assert.equal(stale.strategyComparison, undefined);
}

{
  const currentEvidence = makeInput().strategyEvidence;
  const staleRequirementEpoch = analyzeEconomicGoalDependencies(
    makeInput({
      strategyEvidence: {
        ...currentEvidence,
        validityEpoch: "p36:old-window",
      },
    }),
  );
  assert.equal(staleRequirementEpoch.freshness.strategyStocks, "stale");
  assert.equal(staleRequirementEpoch.strategyComparison, undefined);

  const allStaleStrategyEvidence = analyzeEconomicGoalDependencies(
    makeInput({
      strategyEvidence: {
        ...currentEvidence,
        validityEpoch: "p36:old-window",
        stocks: currentEvidence.stocks.map((stock) => ({
          ...stock,
          validityEpoch: "p36:old-window",
        })),
        candidates: currentEvidence.candidates.map((candidate) => ({
          ...candidate,
          validityEpoch: "p36:old-window",
        })),
      },
    }),
  );
  assert.equal(allStaleStrategyEvidence.freshness.strategyStocks, "stale");
  assert.equal(allStaleStrategyEvidence.strategyComparison, undefined);
}

{
  const currentMechanics = makeInput().nativeMechanics;
  const staleStorage = analyzeEconomicGoalDependencies(
    makeInput({
      nativeMechanics: {
        ...currentMechanics,
        storageEvidence: {
          ...currentMechanics.storageEvidence,
          validityEpoch: "p19:stale-storage",
        },
      },
    }),
  );
  assert.equal(staleStorage.freshness.storage, "stale");
  assert.equal(
    node(staleStorage, "resource:quarry-cost-fits-existing-storage").status,
    "unavailable",
  );
}

{
  const input = makeInput();
  const staleMechanics = analyzeEconomicGoalDependencies(
    makeInput({
      nativeMechanics: {
        ...input.nativeMechanics,
        mechanicsEvidence: {
          ...input.nativeMechanics.mechanicsEvidence,
          pinnedGameRevision: "pmotschmann/Evolve@different-revision",
        },
      },
    }),
  );
  assert.equal(staleMechanics.freshness.mechanics, "stale");
  assert.equal(
    node(staleMechanics, "research:mining-level-1").status,
    "unavailable",
  );
  assert.equal(
    node(staleMechanics, "research:mining-level-1").confidence,
    "unavailable",
  );
  assert.equal(
    node(staleMechanics, "quarry:race-eligible").status,
    "unavailable",
  );
  assert.equal(
    node(staleMechanics, "quarry:race-eligible").confidence,
    "unavailable",
  );
  assert.equal(
    node(staleMechanics, "quarry:job-unlock-on-purchase").status,
    "unavailable",
  );
  assert.equal(
    node(staleMechanics, "quarry:job-unlock-on-purchase").confidence,
    "unavailable",
  );

  const missingMechanics = analyzeEconomicGoalDependencies(
    makeInput({
      nativeMechanics: {
        ...input.nativeMechanics,
        mechanicsEvidence: undefined,
      },
    }),
  );
  assert.equal(missingMechanics.freshness.mechanics, "unavailable");
  assert.equal(
    node(missingMechanics, "research:mining-level-1").status,
    "unavailable",
  );

  const missingPinnedGame = analyzeEconomicGoalDependencies(
    makeInput({ pinnedGame: undefined }),
  );
  assert.equal(missingPinnedGame.freshness.mechanics, "unavailable");
  assert.equal(
    node(missingPinnedGame, "quarry:race-eligible").status,
    "unavailable",
  );

  const wrongSourceHash = analyzeEconomicGoalDependencies(
    makeInput({
      nativeMechanics: {
        ...input.nativeMechanics,
        mechanicsEvidence: {
          ...input.nativeMechanics.mechanicsEvidence,
          sourceSha256: "wrong-source-hash",
        },
      },
    }),
  );
  assert.equal(wrongSourceHash.freshness.mechanics, "stale");
  assert.equal(
    node(wrongSourceHash, "research:mining-level-1").status,
    "unavailable",
  );

  const mismatchedRace = analyzeEconomicGoalDependencies(
    makeInput({ state: state({ race: "other-race" }) }),
  );
  assert.equal(
    node(mismatchedRace, "quarry:race-eligible").status,
    "unavailable",
  );

  const staleJobRules = analyzeEconomicGoalDependencies(
    makeInput({
      jobSettings: {
        ...input.jobSettings,
        priorityOrderEvidence: {
          ...input.jobSettings.priorityOrderEvidence,
          validityEpoch: "repository-source:stale-rule",
        },
      },
    }),
  );
  assert.equal(
    node(staleJobRules, "job:native-settings-permit-quarry-worker").status,
    "unavailable",
  );
  assert.equal(
    node(staleJobRules, "job:native-settings-permit-quarry-worker").diagnostic
      .configuredPriorityOrder,
    "unavailable",
  );

  const staleSettings = analyzeEconomicGoalDependencies(
    makeInput({
      jobSettings: {
        ...input.jobSettings,
        validityEpoch: "p18:settings-not-matched-to-P36",
      },
    }),
  );
  assert.equal(staleSettings.freshness.jobSettings, "stale");
  assert.equal(
    node(staleSettings, "job:native-settings-permit-quarry-worker").status,
    "unavailable",
  );
  assert.equal(
    node(staleSettings, "job:native-settings-permit-quarry-worker").confidence,
    "unavailable",
  );
  assert.equal(evaluateEconomicGoalPathEvidence(staleSettings).decision, "B");
}

{
  const missingLaborCapacity = analyzeEconomicGoalDependencies(
    makeInput({
      labor: labor({ minimumFarmers: undefined }),
    }),
  );
  const missingLaborAssessment =
    evaluateEconomicGoalPathEvidence(missingLaborCapacity);
  assert.equal(missingLaborAssessment.decision, "B");
  assert.ok(
    missingLaborAssessment.evidenceGaps.includes(
      "labor:three-farmers-plus-one-quarry-worker",
    ),
  );

  const nonpositiveStoneFormula = analyzeEconomicGoalDependencies(
    makeInput({
      labor: labor({ oneQuarryWorkerStoneOutputPositive: false }),
    }),
  );
  const nonpositiveStoneAssessment = evaluateEconomicGoalPathEvidence(
    nonpositiveStoneFormula,
  );
  assert.equal(nonpositiveStoneAssessment.decision, "B");
  assert.ok(
    nonpositiveStoneAssessment.evidenceGaps.includes(
      "economic:positive-stone-production:positive-one-worker-formula",
    ),
  );
  assert.equal(
    node(nonpositiveStoneFormula, "economic:positive-stone-production")
      .confidence,
    "established",
  );
}

{
  const invalidAuthority = analyzeEconomicGoalDependencies(
    makeInput({
      construction: construction({ authorityValid: false }),
    }),
  );
  assert.equal(invalidAuthority.freshness.construction, "matched");
  assert.equal(
    node(invalidAuthority, "resource:quarry-material-price").status,
    "unavailable",
  );
  assert.equal(
    node(invalidAuthority, "construction-order:quarry-is-current").status,
    "unavailable",
  );
  assert.equal(
    node(invalidAuthority, "construction-order:shed-before-quarry").status,
    "unavailable",
  );
  assert.equal(
    node(invalidAuthority, "resource:quarry-material-price")
      .resourceRequirements,
    undefined,
  );
}

{
  const unsafeFood = analyzeEconomicGoalDependencies(
    makeInput({
      labor: labor({ foodOutputAfterReassignment: 3.348 }),
    }),
  );
  assert.equal(
    node(unsafeFood, "food:positive-after-reassignment").status,
    "blocked",
  );
  assert.equal(
    node(
      unsafeFood,
      "economic:positive-stone-without-food-or-population-sacrifice",
    ).status,
    "blocked",
  );
}

{
  const foodUsesNativeConsumption = analyzeEconomicGoalDependencies(
    makeInput({
      labor: labor({ foodConsumptionAtPopulation: 5 }),
    }),
  );
  assert.equal(
    node(foodUsesNativeConsumption, "food:positive-after-reassignment").status,
    "blocked",
  );

  const incompleteFoodInterval = analyzeEconomicGoalDependencies(
    makeInput({
      labor: labor({ foodProjectionStableAcrossSamples: undefined }),
    }),
  );
  assert.equal(
    node(incompleteFoodInterval, "food:positive-after-reassignment").status,
    "unavailable",
  );
}

{
  const assignedButNoStone = analyzeEconomicGoalDependencies(
    makeInput({
      state: state({ quarryCount: 1, quarryWorkers: 1, stoneProduction: 0 }),
      labor: labor({ nativeAssignmentObserved: true }),
    }),
  );
  assert.equal(
    node(assignedButNoStone, "job:quarry-worker-assigned").status,
    "satisfied",
  );
  assert.equal(
    node(assignedButNoStone, "economic:positive-stone-production").status,
    "unsatisfied",
  );

  const positiveStoneObserved = analyzeEconomicGoalDependencies(
    makeInput({
      state: state({ quarryCount: 1, quarryWorkers: 1, stoneProduction: 0.1 }),
      labor: labor({ nativeAssignmentObserved: true }),
    }),
  );
  assert.equal(
    node(positiveStoneObserved, "economic:positive-stone-production").status,
    "satisfied",
  );
}

{
  const unavailableControls = analyzeEconomicGoalDependencies(
    makeInput({
      state: state({ quarryCount: undefined }),
      jobSettings: { ...jobSettings, farmerBreakpoints: undefined },
    }),
  );
  assert.equal(
    node(unavailableControls, "quarry:job-unlock-on-purchase").status,
    "unavailable",
  );
  assert.equal(
    node(unavailableControls, "job:native-settings-permit-quarry-worker")
      .status,
    "unavailable",
  );
}
