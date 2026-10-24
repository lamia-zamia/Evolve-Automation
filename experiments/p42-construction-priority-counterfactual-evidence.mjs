import {
  assessEconomicCrossOwnerDependencies,
  compareSustainableJobsPlan,
} from "../src/domain/progression/economic-coordination.ts";
import { analyzeEconomicGoalDependencies } from "../src/domain/progression/economic-goal-dependencies.ts";
import { P42_EXPECTED } from "./p42-construction-priority-counterfactual-policy.mjs";

const canonical = (value) => JSON.stringify(value);
const withoutArm = (event) => {
  const { arm: _arm, ...rest } = event;
  return rest;
};
const getCandidateKey = (event) =>
  event?.input?.candidateKey ??
  event?.input?.candidate?.candidateKey ??
  event?.input?.candidate?.key ??
  null;
const exactParity = (comparisons) =>
  Array.isArray(comparisons) &&
  comparisons.length > 0 &&
  comparisons.every(
    (entry) =>
      entry.saveHashEqual &&
      entry.stateEqual &&
      entry.nativeCallsEqual &&
      entry.controlUsageEqual &&
      entry.rngEqual,
  );

function summarizeAssignments(jobsSnapshot, decision) {
  if (!jobsSnapshot?.input?.available || !decision?.assignments) return null;
  const ids = new Map(
    jobsSnapshot.input.jobs.map((job) => [job.token, job.id]),
  );
  return decision.assignments.map((assignment) => ({
    jobId: ids.get(assignment.jobToken) ?? null,
    jobToken: assignment.jobToken,
    workers: assignment.workers,
    servants: assignment.servants,
  }));
}

function graphForObservedArm({ arm, lineageId, hash }) {
  const selected = arm.checkpoints.find((entry) => entry.period === 10_000);
  const jobsSnapshot = selected?.jobsSnapshot;
  const jobsInput = jobsSnapshot?.input;
  if (!selected || !jobsInput?.available)
    return {
      available: false,
      reason: "native p10000 state or Jobs capture unavailable",
    };

  const controlIdentity = hash(
    canonical(jobsSnapshot.controlGenerations ?? []),
  );
  const validityEpoch = `${lineageId}:p10000:root=${jobsSnapshot.rootGeneration}:progression=${jobsSnapshot.progressionGeneration}:controls=${controlIdentity}`;
  const snapshotId = `${lineageId}:p10000:root=${jobsSnapshot.rootGeneration}:progression=${jobsSnapshot.progressionGeneration}`;
  const state = {
    id: `native-state-${lineageId}-p10000`,
    snapshotId,
    period: 10_000,
    validityEpoch,
    race: "standard-human",
    population: selected.state.population,
    populationCapacity: selected.state.populationCapacity,
    basicHousing: Number(selected.state.buildings.basic_housing ?? 0),
    farmCount: Number(selected.state.buildings.farm ?? 0),
    quarryCount: Number(selected.state.buildings.rock_quarry ?? 0),
    farmers: Number(selected.state.jobs.farmer ?? 0),
    quarryWorkers: Number(selected.state.jobs.quarry_worker ?? 0),
    miningLevel: Number(
      selected.state.tech?.mining?.level ?? selected.state.tech?.mining ?? 0,
    ),
    lumberCapacity: selected.state.resources.Lumber?.max ?? undefined,
    stoneCapacity: selected.state.resources.Stone?.max ?? undefined,
    foodOutput: selected.production.foodOutput,
    foodConsumption: selected.production.foodConsumption,
    lumberProduction: selected.production.lumberOutput,
    stoneProduction: selected.production.stoneOutput,
  };
  const postPurchaseSamples = arm.checkpoints.filter(
    (entry) =>
      entry.period >= 720 &&
      Number(entry.state.buildings.rock_quarry ?? 0) > 0 &&
      Number(entry.state.jobs.quarry_worker ?? 0) > 0,
  );
  const farmerJob = jobsInput.jobs.find((job) => job.id === "farmer");
  const first = postPurchaseSamples[0];
  const assignedStable =
    postPurchaseSamples.length >= 2 &&
    postPurchaseSamples.every(
      (entry) =>
        Number(entry.state.jobs.quarry_worker ?? 0) ===
          Number(postPurchaseSamples[0].state.jobs.quarry_worker ?? 0) &&
        entry.state.jobs.farmer === postPurchaseSamples[0].state.jobs.farmer &&
        entry.state.population === postPurchaseSamples[0].state.population &&
        entry.state.populationCapacity ===
          postPurchaseSamples[0].state.populationCapacity,
    );
  const foodSafe = (entry) =>
    Number(entry.production.foodOutput ?? 0) >
      Number(entry.production.foodConsumption ?? 0) &&
    Number(entry.state.resources.Food?.amount ?? 0) > 0 &&
    Number(entry.state.starved ?? 0) === 0 &&
    Number(entry.state.deaths ?? 0) === 0;
  const labor = {
    id: `native-food-labor-interval-${lineageId}`,
    snapshotId: first
      ? `${lineageId}:p${first.period}-p${postPurchaseSamples.at(-1)?.period}`
      : `${lineageId}:no-quarry-worker-sample`,
    period: first?.period ?? 10_000,
    validityEpoch,
    minimumFarmers: farmerJob?.farmerMinimum ?? undefined,
    farmersAfterReassignment: first?.state.jobs.farmer ?? state.farmers,
    foodOutputAfterReassignment: first?.production.foodOutput ?? undefined,
    foodConsumptionAtPopulation: first?.production.foodConsumption ?? undefined,
    oneQuarryWorkerStoneOutputPositive: postPurchaseSamples.some(
      (entry) =>
        Number(entry.state.jobs.quarry_worker ?? 0) === 1 &&
        Number(entry.production.stoneOutput ?? 0) > 0,
    ),
    stableThroughPeriod: postPurchaseSamples.at(-1)?.period ?? 10_000,
    stableSampleCount: postPurchaseSamples.length,
    ...(postPurchaseSamples.length >= 2
      ? {
          foodObservedPositiveAtEverySample:
            postPurchaseSamples.every(foodSafe),
          foodObservedStableAcrossSamples: assignedStable,
        }
      : {}),
    nativeAssignmentObserved: state.quarryWorkers > 0,
  };
  const settings = jobsSnapshot.settings ?? {};
  const jobSettings = {
    id: `native-job-settings-${lineageId}-p10000`,
    snapshotId,
    period: 10_000,
    validityEpoch,
    autoJobs: settings.autoJobs,
    jobSetDefault: settings.jobSetDefault,
    quarryWorkerEnabled: settings.quarryWorkerEnabled,
    farmerEnabled: settings.farmerEnabled,
    quarryWorkerPriority: Number(settings.quarryWorkerPriority),
    farmerPriority: Number(settings.farmerPriority),
    quarryWorkerBreakpoints: settings.quarryWorkerBreakpoints,
    farmerBreakpoints: settings.farmerBreakpoints,
    priorityOrderEvidence: {
      id: `native-managed-job-priority-order-${lineageId}`,
      snapshotId,
      period: 10_000,
      validityEpoch,
    },
    breakpointEvidence: {
      id: `native-job-breakpoints-${lineageId}`,
      snapshotId,
      period: 10_000,
      validityEpoch,
    },
  };
  const graphInput = {
    analysisSnapshotId: snapshotId,
    validityEpoch,
    pinnedGame: {
      revision: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      sha256:
        "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
    },
    state,
    labor,
    jobSettings,
    nativeMechanics: {
      requiredMiningLevel: 1,
      raceId: "standard-human",
      raceEligible: true,
      quarryUnlocksQuarryWorker: true,
      storageWithoutShed: {
        Lumber: state.lumberCapacity,
        Stone: state.stoneCapacity,
      },
      storageEvidence: {
        id: `native-storage-${lineageId}`,
        snapshotId,
        period: 10_000,
        validityEpoch,
      },
      mechanicsEvidence: {
        id: "pinned-quarry-and-housing-mechanics",
        snapshotId:
          "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
        pinnedGameRevision:
          "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
        sourceSha256:
          "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
      },
    },
  };
  return {
    available: true,
    source: {
      period: 10_000,
      rootGeneration: jobsSnapshot.rootGeneration,
      progressionGeneration: jobsSnapshot.progressionGeneration,
      controlGenerations: jobsSnapshot.controlGenerations,
      validityEpoch,
    },
    input: graphInput,
    state,
    graph: analyzeEconomicGoalDependencies(graphInput),
  };
}

function p39AssessmentForObservedArm({ arm, graph, purchase }) {
  const selected = arm.checkpoints.find(
    (entry) => entry.period === 720 && entry.jobsSnapshot?.input?.available,
  );
  const jobsSnapshot = selected?.jobsSnapshot;
  const plannerInput = jobsSnapshot?.input;
  if (!selected || !plannerInput?.available || !graph?.available)
    return {
      available: false,
      reason:
        "first post-purchase native Jobs input or P37 graph is unavailable",
      executionAuthority: "none",
    };

  const lineageId = `p42:${arm.arm}`;
  const controlIdentity = JSON.stringify(jobsSnapshot.controlGenerations ?? []);
  const snapshotId = `${lineageId}:p720:root=${jobsSnapshot.rootGeneration}:progression=${jobsSnapshot.progressionGeneration}`;
  const validityEpoch = `${snapshotId}:controls=${controlIdentity}`;
  const period = 720;
  const jobs = plannerInput.jobs ?? [];
  const farmer = jobs.find((job) => job.id === "farmer");
  const quarryWorker = jobs.find((job) => job.id === "quarry_worker");
  const settings = jobsSnapshot.settings ?? {};
  const availabilityProvenance = quarryWorker ? "observed" : "unavailable";
  const foodFormula = {
    farmerImpact: 0.82,
    fullFarmBonus: 1.15,
    productionMultiplier: 1.2,
    modifierFingerprint: "standard-human-farm-1-agriculture-2",
    sourceEvidenceIds: [
      "pinned-game:evolve-deadspace.js:105580",
      "pinned-game:evolve-deadspace.js:150654-150678",
      "p37:matched-native-farmer-formula",
    ],
  };
  const foodObservation = {
    snapshotId,
    period,
    lineageId,
    validityEpoch,
    modifierFingerprint: foodFormula.modifierFingerprint,
    population: selected.state.population,
    populationCapacity: selected.state.populationCapacity,
    farmCount: Number(selected.state.buildings.farm ?? 0),
    farmers: Number(selected.state.jobs.farmer ?? 0),
    foodOutput: selected.production.foodOutput,
    foodConsumption: selected.production.foodConsumption,
  };
  const jobsEvidence = {
    snapshotId,
    period,
    lineageId,
    validityEpoch,
    ownerWorkCycles: {
      "native:ordinary-jobs": `${snapshotId}:ordinary-jobs`,
      "automation:worker-commitment-registry": `${snapshotId}:worker-commitments-unavailable`,
    },
    plannerInput,
    plannerEvidence: {
      snapshotId,
      period,
      lineageId,
      validityEpoch,
      ownerId: "native:ordinary-jobs",
      workCycleId: `${snapshotId}:ordinary-jobs`,
      workCycleProvenance: "normalized-from-captured-period",
      evidenceId: `p42-native-jobs-input-p${period}`,
      input: plannerInput,
    },
    foodObservation,
    foodFormula,
    availabilityProvenance,
    productionJobId: "quarry_worker",
    workerCommitments: {
      evidenceStatus: "unavailable",
      snapshotId,
      period,
      validityEpoch,
      lineageId,
      ownerId: "automation:worker-commitment-registry",
      workCycleId: `${snapshotId}:worker-commitments-unavailable`,
      workCycleProvenance: "normalized-from-captured-period",
      evidenceId: "P42 did not capture a separate worker-commitment registry",
      minimumByJobId: {},
    },
  };
  const jobsAssessment = compareSustainableJobsPlan(jobsEvidence);
  const nativePurchaseEvidenceId =
    purchase?.input?.candidateKey === P42_EXPECTED.quarryTarget &&
    purchase?.output?.verifiedSuccess === true
      ? "p42-native-quarry-purchase-under-test-only-priority-substitution"
      : "p42-native-quarry-purchase-not-confirmed";
  const owner = (ownerId, workCycleId, evidenceId) => ({
    ownerId,
    workCycleId,
    workCycleProvenance: "normalized-from-captured-period",
    rootGeneration: jobsSnapshot.rootGeneration,
    progressionGeneration: jobsSnapshot.progressionGeneration,
    controlGeneration:
      jobsSnapshot.controlGenerations?.find(
        (entry) => entry.id === P42_EXPECTED.quarryTarget,
      )?.generation ?? 0,
    evidenceId,
  });
  const quarryPrice = { ...P42_EXPECTED.quarryCost };
  const resourceCoordination = {
    goal: {
      targetId: P42_EXPECTED.quarryTarget,
      price: quarryPrice,
      priceComplete: true,
      provenance: {
        source: "economic-goal-graph",
        goalId:
          graph.graph?.objective?.id ?? "economic:positive-stone-production",
        evidenceIds: [
          "experiments/p37-economic-goal-dependencies.json",
          "experiments/p42-construction-priority-counterfactual-evidence.json",
        ],
        playerSelected: false,
        executionAuthority: "none",
      },
    },
    currentTarget: {
      owner: owner(
        "native:construction",
        `${snapshotId}:construction-observation`,
        nativePurchaseEvidenceId,
      ),
      snapshotId,
      targetId: P42_EXPECTED.quarryTarget,
      price: quarryPrice,
      priceComplete: true,
    },
    currentEpoch: {
      snapshotId,
      snapshotProvenance: "normalized-from-captured-period",
      validityEpoch,
      lineageId,
      period,
      rootGeneration: jobsSnapshot.rootGeneration,
      progressionGeneration: jobsSnapshot.progressionGeneration,
      controlGeneration:
        jobsSnapshot.controlGenerations?.find(
          (entry) => entry.id === P42_EXPECTED.quarryTarget,
        )?.generation ?? 0,
      ownerWorkCycles: {
        "native:construction": `${snapshotId}:construction-observation`,
      },
    },
    stocks: Object.fromEntries(
      ["Lumber", "Stone"].map((id) => [
        id,
        {
          name: id,
          currentQuantity: selected.state.resources[id]?.amount ?? 0,
          capacity: selected.state.resources[id]?.max ?? 0,
          snapshotId,
          evidenceId: `p42-native-${id.toLowerCase()}-stock-p${period}`,
        },
      ]),
    ),
    nativeQueues: {
      complete: false,
      snapshotId,
      commitments: [],
    },
    competingAutomationClaims: {
      complete: false,
      snapshotId,
      claims: [],
    },
  };
  const positiveStoneGoal = graph.graph?.goals?.find(
    (goal) => goal.id === "economic:positive-stone-production",
  );
  const assessment = assessEconomicCrossOwnerDependencies({
    lineageId,
    materialAcquisition: {
      status: "observed",
      evidenceId:
        "P36/P38 test-authorized Gather material lineage carried to P42 p720",
      snapshotId,
      validityEpoch,
      testOnly: true,
      targetId: P42_EXPECTED.quarryTarget,
      lineageId,
      period,
    },
    resourceCoordination,
    constructionOffer: {
      offerObserved: true,
      completePriceObserved: true,
      purchaseAuthorityObserved: false,
      evidenceId: nativePurchaseEvidenceId,
      snapshotId,
      validityEpoch,
      lineageId,
      period,
      targetId: P42_EXPECTED.quarryTarget,
    },
    housingPopulation: {
      snapshotId,
      lineageId,
      period,
      validityEpoch,
      evidenceId: `p42-native-housing-population-p${period}`,
      population: selected.state.population,
      capacity: selected.state.populationCapacity,
      retainAllResidents:
        Number(selected.state.starved ?? 0) === 0 &&
        Number(selected.state.deaths ?? 0) === 0,
    },
    jobs: jobsAssessment,
    stoneProduction: {
      snapshotId: graph.state.snapshotId,
      lineageId,
      period: graph.state.period,
      validityEpoch: graph.state.validityEpoch,
      provenance:
        typeof graph.state.stoneProduction === "number"
          ? "native-observation"
          : "unavailable",
      evidenceId: `p42-native-stone-production-p${graph.state.period}`,
      amountPerTick: graph.state.stoneProduction ?? null,
    },
    goalGraph: {
      snapshotId: graph.state.snapshotId,
      lineageId,
      period: graph.state.period,
      validityEpoch: graph.state.validityEpoch,
      objectiveStatus: graph.graph?.objective?.status ?? "unavailable",
      positiveStoneStatus: positiveStoneGoal?.status ?? "unavailable",
      evidenceId: "p42-p37-native-post-intervention-graph",
    },
  });
  return {
    available: true,
    resourceCoordination: {
      status: "unreserved",
      executionAuthority: "none",
      rationale:
        "P42 does not create a production reservation; queue and competing-claim completeness was not established at p10000.",
    },
    jobsInput: plannerInput,
    productiveJob: {
      row: quarryWorker ?? null,
      unlocked: quarryWorker?.unlocked === true,
      managed: quarryWorker?.managed === true,
      settingEnabled: settings.quarryWorkerEnabled === true,
      autoJobs: settings.autoJobs === true,
      currentWorkers: Number(selected.state.jobs.quarry_worker ?? 0),
      farmerMinimum: farmer?.farmerMinimum ?? null,
      farmerMaximum: farmer?.maximum ?? null,
      farmerSmartMaximum: farmer?.smartMaximum ?? null,
      quarryWorkerMinimum: quarryWorker?.minimum ?? null,
      quarryWorkerMaximum: quarryWorker?.maximum ?? null,
      quarryWorkerSmartMaximum: quarryWorker?.smartMaximum ?? null,
      farmerBreakpoints: settings.farmerBreakpoints ?? null,
      quarryWorkerBreakpoints: settings.quarryWorkerBreakpoints ?? null,
    },
    workerCommitments: {
      available: false,
      evidenceStatus: "unavailable",
      reason:
        "P42's captured Jobs API exposes catalog and controls, not the separate worker-commitment registry.",
    },
    jobsAssessment,
    assessment,
    executionAuthority: "none",
  };
}

export function createP42ConstructionPriorityEvidence({
  A,
  B,
  BRepeat,
  retainedP38Evidence,
  retainedP38EvidenceSha256,
  p39Evidence,
  checkpointParity,
  hash,
  canonicalJson = canonical,
  runtimeBundleSha256,
  policyBundleSha256,
  p38PolicyBundleSha256,
  replayHarnessSha256,
  p42PluginSha256,
  p42PolicySha256,
}) {
  const arms = [A, B, BRepeat];
  const baseline = retainedP38Evidence?.arms?.find((arm) => arm.arm === "B");
  const checkpoint = (arm, period) =>
    arm?.checkpoints?.find((entry) => entry.period === period) ?? null;
  const p719Parity = arms.slice(1).map((arm) => ({
    arm: arm.arm,
    comparisons: checkpointParity(
      {
        ...A,
        checkpoints: A.checkpoints.filter((entry) => entry.period === 719),
      },
      {
        ...arm,
        checkpoints: arm.checkpoints.filter((entry) => entry.period === 719),
      },
    ),
  }));
  const boundary = (arm) => arm.p42?.preSubstitutionBoundary ?? null;
  const boundarySummary = (arm) => {
    const value = boundary(arm);
    const traceEvent = (arm.p42?.events ?? []).find(
      (event) => event.type === "pre-substitution-boundary",
    );
    return value?.captured === true
      ? {
          captured: true,
          saveSha256: hash(value.save),
          nativeInvocationCount: value.nativeInvocations.length,
          nativeInvocationsSha256: hash(canonical(value.nativeInvocations)),
          controlUsageEntryCount: Object.keys(value.controlUsage).length,
          controlUsageSha256: hash(canonical(value.controlUsage)),
          randomCalls: value.randomCalls,
          rngState: value.rngState,
          boundaryBytes: traceEvent?.boundaryBytes ?? null,
        }
      : {
          captured: false,
          reason: value?.reason ?? "pre-boundary capture missing",
        };
  };
  const p40PrefixBeforeQuarryRead = (arm) => {
    const events = arm.p40?.events ?? [];
    const firstConflict = events.findIndex(
      (event) =>
        event.type === "cost-conflict" &&
        getCandidateKey(event) === P42_EXPECTED.quarryTarget,
    );
    return firstConflict < 0 ? null : events.slice(0, firstConflict);
  };
  const preBoundaryComparisons = {
    p719: p719Parity,
    boundary: {
      A: boundarySummary(A),
      B: boundarySummary(B),
      BRepeat: boundarySummary(BRepeat),
      exact:
        boundary(A)?.captured === true &&
        boundary(B)?.captured === true &&
        boundary(BRepeat)?.captured === true &&
        canonicalJson(boundary(A)) === canonicalJson(boundary(B)) &&
        canonicalJson(boundary(B)) === canonicalJson(boundary(BRepeat)),
    },
    constructionTracePrefix: {
      A: p40PrefixBeforeQuarryRead(A),
      B: p40PrefixBeforeQuarryRead(B),
      exact:
        p40PrefixBeforeQuarryRead(A) !== null &&
        canonicalJson(p40PrefixBeforeQuarryRead(A)) ===
          canonicalJson(p40PrefixBeforeQuarryRead(B)),
    },
  };
  const p36Expected =
    baseline?.p36?.policyEvents
      ?.filter((event) => Number(event.period) <= 688)
      .map(withoutArm) ?? [];
  const p38Expected =
    baseline?.p38?.policyEvents
      ?.filter((event) => Number(event.period) <= 720)
      .map(withoutArm) ?? [];
  const gatherCount = (arm, stage) =>
    (arm[stage]?.policyEvents ?? []).filter(
      (event) => event.type === "gather-click",
    ).length;
  const history = Object.fromEntries(
    arms.map((arm) => {
      const p36 = arm.p36.policyEvents
        .filter((event) => Number(event.period) <= 688)
        .map(withoutArm);
      const p38 = arm.p38.policyEvents
        .filter((event) => Number(event.period) <= 720)
        .map(withoutArm);
      return [
        arm.arm,
        {
          p36GatherActions: gatherCount(arm, "p36"),
          p36MatchesRetained: canonicalJson(p36) === canonicalJson(p36Expected),
          p38GatherActions: gatherCount(arm, "p38"),
          p38WithinAuthorization:
            gatherCount(arm, "p38") <= P42_EXPECTED.p38GatherLimit,
          p38MatchesRetainedThroughP720:
            canonicalJson(p38) === canonicalJson(p38Expected),
        },
      ];
    }),
  );
  const bP42 = B.p42 ?? {};
  const repeatP42 = BRepeat.p42 ?? {};
  const reservationReads = (bP42.events ?? []).filter(
    (event) => event.type === "reservation-read",
  );
  const appliedReads = reservationReads.filter((event) => event.applied);
  const firstApplied = appliedReads[0] ?? null;
  const bRepeatParity = checkpointParity(B, BRepeat);
  const deterministicRepeat =
    exactParity(bRepeatParity) &&
    canonicalJson(B.p36.policyEvents) ===
      canonicalJson(BRepeat.p36.policyEvents) &&
    canonicalJson(B.p38.policyEvents.map(withoutArm)) ===
      canonicalJson(BRepeat.p38.policyEvents.map(withoutArm)) &&
    canonicalJson(B.p38.jobTrace) === canonicalJson(BRepeat.p38.jobTrace) &&
    canonicalJson(B.p40?.events ?? []) ===
      canonicalJson(BRepeat.p40?.events ?? []) &&
    canonicalJson(bP42.events ?? []) ===
      canonicalJson(repeatP42.events ?? []) &&
    B.finalExportSha256 === BRepeat.finalExportSha256;
  const applicationEventsOutsideWindow = (bP42.events ?? []).filter(
    (event) =>
      event.type === "reservation-read" &&
      event.applied === true &&
      (event.period !== 720 ||
        event.workCycleId !== 90 ||
        event.orderingGeneration !== 90),
  );
  const isolationFailures = [];
  if (!p719Parity.every((entry) => exactParity(entry.comparisons)))
    isolationFailures.push("A and B differ at p719 before the owner boundary");
  if (!preBoundaryComparisons.boundary.exact)
    isolationFailures.push(
      "the full pre-substitution save/actions/controls/RNG snapshot is unavailable or differs",
    );
  if (!preBoundaryComparisons.constructionTracePrefix.exact)
    isolationFailures.push(
      "Construction trace differs before the first Quarry reservation read",
    );
  if (!deterministicRepeat)
    isolationFailures.push("B and B-repeat do not match exactly");
  if (bP42.traceOverflow > 0 || repeatP42.traceOverflow > 0)
    isolationFailures.push("P42 bounded trace overflowed");
  if (bP42.traceClockUnavailable || repeatP42.traceClockUnavailable)
    isolationFailures.push("native monotonic diagnostic clock was unavailable");
  if (bP42.enabled !== true || repeatP42.enabled !== true)
    isolationFailures.push("B arm did not enable the one-cycle intervention");
  if ((A.p42?.appliedReservationReads ?? 0) !== 0)
    isolationFailures.push(
      "historical control A applied a reservation substitution",
    );
  if (appliedReads.length === 0)
    isolationFailures.push(
      "no qualified Quarry reservation read was substituted",
    );
  if (
    firstApplied?.authorizationHistoryMatched !== true ||
    firstApplied?.sameTargetExcluded !== true ||
    firstApplied?.reason !== "exact-p720-construction-owner-cycle"
  )
    isolationFailures.push(
      "the first substituted reservation read lacked exact authorization or same-target evidence",
    );
  if (applicationEventsOutsideWindow.length > 0)
    isolationFailures.push(
      "a reservation substitution was applied outside the authorized p720 owner cycle",
    );
  if (bP42.released !== true && appliedReads.length > 0)
    isolationFailures.push(
      "the P42 substitution was not recorded as released after its owner cycle",
    );
  if (
    arms.some(
      (arm) =>
        history[arm.arm].p36GatherActions !== 139 ||
        !history[arm.arm].p36MatchesRetained ||
        !history[arm.arm].p38WithinAuthorization,
    )
  )
    isolationFailures.push(
      "P36 history or P38 authorized Gather bounds changed",
    );
  if (!history.A.p38MatchesRetainedThroughP720)
    isolationFailures.push(
      "historical control A did not match retained P38 B authorization history through p720",
    );
  if (
    !history.B.p38MatchesRetainedThroughP720 &&
    !firstApplied?.authorizationHistoryMatched
  )
    isolationFailures.push(
      "B P38 authorization history differed before the substituted read",
    );

  const p40Events = B.p40?.events ?? [];
  const findEvent = (type, candidateKey) =>
    p40Events.find(
      (event) =>
        event.period === 720 &&
        event.type === type &&
        (candidateKey === undefined || getCandidateKey(event) === candidateKey),
    ) ?? null;
  const quarryCandidate = P42_EXPECTED.quarryTarget;
  const housingCandidate = "city-basic_housing";
  const quarryCostConflict = findEvent("cost-conflict", quarryCandidate);
  const quarryGate = findEvent("build-conflict-plan", quarryCandidate);
  const competition = findEvent("build-competition-plan", quarryCandidate);
  const affordability = findEvent("candidate-affordability", quarryCandidate);
  const quarryPurchase = findEvent("purchase-postcondition", quarryCandidate);
  const nativeQuarryAction =
    B.nativeCalls.find(
      (call) =>
        call.period === 720 &&
        call.elementId === quarryCandidate &&
        call.method === "action",
    ) ?? null;
  const debit = quarryPurchase?.output?.resourceDebit ?? null;
  const purchaseConfirmed =
    quarryPurchase?.output?.nativeActionResult?.ok === true &&
    quarryPurchase?.output?.built === true &&
    quarryPurchase?.output?.verifiedSuccess === true &&
    quarryPurchase.input?.beforeCount !== undefined &&
    quarryPurchase.output?.afterCount ===
      quarryPurchase.input.beforeCount + 1 &&
    nativeQuarryAction !== null &&
    debit?.Lumber?.debit === P42_EXPECTED.quarryCost.Lumber &&
    debit?.Stone?.debit === P42_EXPECTED.quarryCost.Stone;
  const housingEvents = p40Events.filter(
    (event) =>
      event.period === 720 && getCandidateKey(event) === housingCandidate,
  );
  const housingQuarryConflict =
    housingEvents.find(
      (event) =>
        event.type === "cost-conflict" &&
        event.input?.reservationSources?.scriptReservations?.targets?.some(
          (target) => target.name === quarryCandidate,
        ),
    ) ?? null;
  const quarryPurchaseSequence = quarryPurchase?.sequence ?? null;
  const housingPurchase =
    housingEvents.find((event) => event.type === "purchase-postcondition") ??
    null;
  const completedSavingPublication =
    checkpoint(B, 720)?.native?.savingTargetObservation ?? null;
  const nextBlocker = !purchaseConfirmed
    ? !firstApplied
      ? (reservationReads[0]?.reason ??
        "No qualified substitution read was recorded")
      : quarryCostConflict?.output?.status === "conflict"
        ? {
            gate: "native cost conflict remains",
            conflict: quarryCostConflict.output.conflict ?? null,
          }
        : quarryGate?.output?.kind === "skip"
          ? {
              gate: quarryGate.output.branch ?? "Build conflict gate",
              annotation: quarryGate.output.annotation ?? null,
            }
          : competition?.output?.decision?.key !== quarryCandidate
            ? {
                gate: "Construction competition did not select Quarry",
                decision: competition?.output?.decision ?? null,
              }
            : quarryPurchase === null
              ? "Construction did not invoke the native Quarry action after the competition decision"
              : {
                  gate: "native Quarry purchase postcondition failed",
                  input: quarryPurchase.input,
                  output: quarryPurchase.output,
                }
    : null;
  const constructionOutcome =
    isolationFailures.length > 0 ? "C" : purchaseConfirmed ? "A" : "B";

  let economy = null;
  if (purchaseConfirmed) {
    const series = B.checkpoints
      .filter(
        (entry) =>
          entry.period >= 720 &&
          entry.period <= 10_000 &&
          Number(entry.state.buildings.rock_quarry ?? 0) > 0,
      )
      .map((entry) => ({
        period: entry.period,
        population: entry.state.population,
        housingCapacity: entry.state.populationCapacity,
        housing: Number(entry.state.buildings.basic_housing ?? 0),
        foodStock: entry.state.resources.Food?.amount ?? null,
        starved: entry.state.starved ?? null,
        deaths: entry.state.deaths ?? null,
        farmers: Number(entry.state.jobs.farmer ?? 0),
        quarryWorkers: Number(entry.state.jobs.quarry_worker ?? 0),
        stoneStock: entry.state.resources.Stone?.amount ?? null,
        foodOutput: entry.production.foodOutput,
        foodConsumption: entry.production.foodConsumption,
        foodNet:
          Number(entry.production.foodOutput ?? 0) -
          Number(entry.production.foodConsumption ?? 0),
        stoneOutput: entry.production.stoneOutput,
      }));
    const negativeFlow = series.filter((entry) => entry.foodNet < 0);
    const firstNegativeFlow = negativeFlow[0] ?? null;
    const negativeStock =
      series.find(
        (entry) => typeof entry.foodStock === "number" && entry.foodStock < 0,
      ) ?? null;
    const firstStarvationOrDeath =
      series.find(
        (entry) =>
          Number(entry.starved ?? 0) > 0 || Number(entry.deaths ?? 0) > 0,
      ) ?? null;
    const fromFirstDeficit = firstNegativeFlow
      ? series.filter((entry) => entry.period >= firstNegativeFlow.period)
      : [];
    const persistentFoodDeficit =
      fromFirstDeficit.length >= 2 &&
      fromFirstDeficit.at(-1)?.period === series.at(-1)?.period &&
      fromFirstDeficit.every((entry) => entry.foodNet < 0);
    const laterPositive = firstNegativeFlow
      ? series.filter(
          (entry) =>
            entry.period > firstNegativeFlow.period && entry.foodNet > 0,
        )
      : [];
    const foodCorrectedAfterDeficit =
      laterPositive.length >= 2 &&
      laterPositive.at(-1)?.period === series.at(-1)?.period;
    const assigned = series.filter((entry) => entry.quarryWorkers > 0);
    const productiveAssigned = assigned.filter(
      (entry) => Number(entry.stoneOutput ?? 0) > 0,
    );
    const stableAssignment =
      productiveAssigned.length >= 2 &&
      productiveAssigned.every(
        (entry) =>
          entry.quarryWorkers === productiveAssigned[0].quarryWorkers &&
          entry.farmers === productiveAssigned[0].farmers &&
          entry.population === productiveAssigned[0].population &&
          entry.housingCapacity === productiveAssigned[0].housingCapacity,
      );
    const terminalFoodSafe =
      series.length >= 2 &&
      series
        .slice(-2)
        .every(
          (entry) =>
            entry.foodNet > 0 &&
            Number(entry.foodStock ?? 0) > 0 &&
            Number(entry.starved ?? 0) === 0 &&
            Number(entry.deaths ?? 0) === 0,
        );
    const foodFailure =
      persistentFoodDeficit ||
      negativeStock !== null ||
      firstStarvationOrDeath !== null;
    const evidenceSufficient =
      series.length >= 3 &&
      B.checkpoints.some(
        (entry) => entry.period >= 720 && entry.jobsSnapshot?.input?.available,
      ) &&
      series.every(
        (entry) =>
          Number.isFinite(entry.foodNet) &&
          Number.isFinite(Number(entry.stoneOutput)),
      );
    const eligibilitySnapshots = B.checkpoints
      .filter(
        (entry) => entry.period >= 720 && entry.jobsSnapshot?.input?.available,
      )
      .map((entry) => ({
        period: entry.period,
        population: entry.jobsSnapshot.input.population,
        settings: entry.jobsSnapshot.settings,
        controlGenerations: entry.jobsSnapshot.controlGenerations,
        jobs: (entry.jobsSnapshot.input.jobs ?? []).filter((job) =>
          ["farmer", "quarry_worker"].includes(job.id),
        ),
      }));
    const firstJobsSnapshot = eligibilitySnapshots[0] ?? null;
    const terminalJobsSnapshot = eligibilitySnapshots.at(-1) ?? null;
    const relevantJobTrace = (B.p38.jobTrace ?? []).filter((event) => {
      if (Number(event.period) < 720) return false;
      const text = canonical(event);
      return /quarry_worker|farmer/.test(text) || event.phase === "autoJobs";
    });
    const postPurchaseNativeJobControls = B.nativeCalls.filter(
      (call) => call.period >= 720 && /^civ-/.test(call.elementId ?? ""),
    );
    const graph = graphForObservedArm({ arm: B, lineageId: "p42:B", hash });
    const p39 = p39AssessmentForObservedArm({
      arm: B,
      graph,
      purchase: quarryPurchase,
    });
    const p39Hypothesis = {
      sourceEvidence:
        "experiments/p39-cross-owner-economic-coordination-evidence.json",
      sourceSha256: p39Evidence?.sha256 ?? null,
      predictedAssignments: [
        { jobId: "farmer", workers: 2 },
        { jobId: "quarry_worker", workers: 2 },
      ],
      p39ObservedFormulaPrediction:
        p39Evidence?.jobs?.fourResidentsHypotheticalUnlock ?? null,
    };
    const p39HypothesisComparison = {
      hypothesis: p39Hypothesis,
      firstPostPurchaseObservedAssignments: {
        period: series[0]?.period ?? null,
        farmers: series[0]?.farmers ?? null,
        quarryWorkers: series[0]?.quarryWorkers ?? null,
      },
      matchedTwoFarmersTwoQuarryWorkersAtFirstPlan:
        series[0]?.farmers === 2 && series[0]?.quarryWorkers === 2,
      observedTerminalAssignments: {
        farmers: series.at(-1)?.farmers ?? null,
        quarryWorkers: series.at(-1)?.quarryWorkers ?? null,
      },
      matchedTwoFarmersTwoQuarryWorkers:
        series.at(-1)?.farmers === 2 && series.at(-1)?.quarryWorkers === 2,
      actualDecisionAuthority:
        "native Jobs traces and state are authoritative; the P39 2/2 prediction remains hypothetical only",
    };
    const economicOutcome = !evidenceSufficient
      ? "3"
      : assigned.length === 0 || productiveAssigned.length === 0 || foodFailure
        ? "2"
        : stableAssignment && terminalFoodSafe
          ? "1"
          : "3";
    economy = {
      outcome: economicOutcome,
      outcomeName: {
        1: "Autonomous production sustainable",
        2: "Jobs sustainability blocked",
        3: "Evidence insufficient",
      }[economicOutcome],
      jobsCatalogAndPlan: {
        earliestPostPurchaseSnapshot: firstJobsSnapshot,
        terminalSnapshot: terminalJobsSnapshot,
        workerCommitments: p39.workerCommitments ?? {
          available: false,
          evidenceStatus: "unavailable",
        },
        actualOrdinaryJobsTrace: relevantJobTrace,
        executedNativeJobControls: postPurchaseNativeJobControls,
        executedJobControlEvents: relevantJobTrace.filter(
          (event) =>
            event.kind === "success" ||
            event.kind === "failure" ||
            event.kind === "deferred",
        ),
      },
      observations: {
        purchasePeriod: 720,
        sampleCount: series.length,
        samples: series,
        quarryWorkerAssignmentObserved: assigned.length > 0,
        positiveStoneWithWorkerObserved: productiveAssigned.length > 0,
        stablePositiveStoneWithWorker: stableAssignment,
        firstNegativeFoodMarginPeriod: firstNegativeFlow?.period ?? null,
        negativeFoodMarginPeriods: negativeFlow.map((entry) => entry.period),
        firstNegativeFoodStockPeriod: negativeStock?.period ?? null,
        firstStarvationOrDeathPeriod: firstStarvationOrDeath?.period ?? null,
        foodDeficitPersistsToLastCheckpoint: persistentFoodDeficit,
        ordinaryJobsCorrectsFoodDeficit:
          firstNegativeFlow !== null && foodCorrectedAfterDeficit,
        terminalFoodSafe,
        populationHousingStable:
          series.length >= 2 &&
          series.every(
            (entry) =>
              entry.population === series[0].population &&
              entry.housingCapacity === series[0].housingCapacity &&
              Number(entry.housingCapacity ?? 0) >=
                Number(entry.population ?? 0),
          ),
        evidenceSufficient,
      },
      p39HypothesisComparison,
      p37NativeDependencyGraph: graph,
      p39NativeDependencyAssessment: p39,
      spendingAuthority: "none",
    };
  }

  const p42BoundaryPayloadBytes = Math.max(
    0,
    ...arms.map((arm) =>
      Number(
        arm.p42?.events?.find(
          (event) => event.type === "pre-substitution-boundary",
        )?.boundaryBytes ?? 0,
      ),
    ),
  );
  const p42EventTraceBytes = Math.max(
    0,
    ...arms.map((arm) => Number(arm.p42?.traceBytes ?? 0)),
  );
  const p42TraceBounded =
    arms.every(
      (arm) =>
        (arm.p42?.events?.length ?? 0) <= 64 &&
        (arm.p42?.traceOverflow ?? 0) === 0 &&
        (arm.p42?.traceBytes ?? 0) <= 524_288,
    ) && p42BoundaryPayloadBytes <= 2_097_152;
  if (!p42TraceBounded)
    isolationFailures.push(
      "P42 trace or pre-boundary payload exceeded its explicit bound",
    );
  const finalConstructionOutcome =
    isolationFailures.length > 0 ? "C" : purchaseConfirmed ? "A" : "B";
  return {
    experiment: "P42 Construction-owned Quarry priority counterfactual",
    schemaVersion: 1,
    outcome: {
      construction: finalConstructionOutcome,
      constructionName: {
        A: "Native Quarry purchase confirmed",
        B: "Still blocked",
        C: "Intervention invalid",
      }[finalConstructionOutcome],
      economic:
        finalConstructionOutcome === "A" ? (economy?.outcome ?? "3") : null,
      economicName:
        finalConstructionOutcome === "A"
          ? (economy?.outcomeName ?? "Evidence insufficient")
          : null,
      isolationFailures,
      nextExactBlocker: finalConstructionOutcome === "B" ? nextBlocker : null,
    },
    authority: {
      purpose:
        "test-only one-cycle causal intervention; this is not a production Construction-owner decision",
      p36GatherActionsRetained: 139,
      p38SeparateGatherAuthorization: {
        id: P42_EXPECTED.p38AuthorizationId,
        maximumAdditionalGatherActions: P42_EXPECTED.p38GatherLimit,
      },
      gatherClicksAddedByP42: 0,
      deliberatePrioritySuspension:
        "The experiment deliberately suspends Farm's previously established saving priority for the qualified Construction owner cycle. This is not a player-approved preference.",
      noProductionPolicyChange: true,
      noBuildWeightsOrFlagsChanged: true,
      noNativeQueueMechOrOtherScriptCommitmentChanged: true,
      noGatherOrResearchScope: true,
      noExecutionSpendingAuthority: true,
      qualificationFailures: reservationReads
        .filter((event) => !event.applied)
        .map((event) => ({
          candidateKey: event.candidateKey,
          reason: event.reason,
        })),
      interventionReleasedAfterCycle: bP42.released === true,
      authorizationHistory: history,
    },
    replay: {
      arms: [
        {
          arm: "A",
          meaning: "retained P38 B historical control; no P42 substitution",
        },
        {
          arm: "B",
          meaning: "one-cycle experimental Quarry reservation substitution",
        },
        { arm: "B-repeat", meaning: "identical experimental replay" },
      ],
      expectedFirstDivergence:
        "p720 at the first substituted Construction reservation read",
      preBoundaryComparisons,
      firstAppliedReservationRead: firstApplied,
      BRepeat: {
        exact: deterministicRepeat,
        checkpointComparisons: bRepeatParity,
        p40TraceExact:
          canonicalJson(B.p40?.events ?? []) ===
          canonicalJson(BRepeat.p40?.events ?? []),
        p42TraceExact:
          canonicalJson(bP42.events ?? []) ===
          canonicalJson(repeatP42.events ?? []),
      },
      baselineHistoryMatches: history,
      authorizationCaps: {
        p36GatherActions: arms.map((arm) => ({
          arm: arm.arm,
          count: gatherCount(arm, "p36"),
        })),
        p38GatherActions: arms.map((arm) => ({
          arm: arm.arm,
          count: gatherCount(arm, "p38"),
        })),
        p38Maximum: P42_EXPECTED.p38GatherLimit,
      },
      retainedP38EvidenceSha256,
      p39EvidenceSha256: p39Evidence?.sha256 ?? null,
      runtimeBundleSha256,
      policyBundleSha256,
      p38PolicyBundleSha256,
      replayHarnessSha256,
      p42PluginSha256,
      p42PolicySha256,
    },
    construction: {
      classification: finalConstructionOutcome,
      p720: {
        ownerCycle: { period: 720, workCycleId: 90, orderingGeneration: 90 },
        previousCompletedPublication: 89,
        historicalReservation: {
          target: "city-farm",
          cost: { Lumber: 27, Stone: 14 },
        },
        currentQuarryOrder: B.p42?.quarryOrder ?? null,
        reservationValuesBeforeAndAfter: reservationReads,
        quarryCandidateAffordability: affordability,
        quarryCostConflict: quarryCostConflict,
        sameTargetExclusion: {
          result: firstApplied?.sameTargetExcluded === true,
          nativeConflictSample: quarryCostConflict,
        },
        buildConflictGate: quarryGate,
        competitionDecision: competition,
        nativeQuarryActionInvocation: nativeQuarryAction,
        nativePurchasePostcondition: quarryPurchase,
        purchaseConfirmed,
        completedSavingPublicationAfterCycle: completedSavingPublication,
        housing: {
          evaluated: housingEvents.length > 0,
          evaluations: housingEvents,
          QuarryReservationConflict: housingQuarryConflict,
          purchaseEvent: housingPurchase,
          evaluatedAfterQuarryPurchase:
            quarryPurchaseSequence === null
              ? null
              : housingEvents.some(
                  (event) => event.sequence > quarryPurchaseSequence,
                ),
          purchasedAfterQuarry:
            quarryPurchaseSequence !== null &&
            housingPurchase?.sequence > quarryPurchaseSequence,
        },
      },
      measuredInstrumentation: {
        instrumentationNativeCallsAdded: 0,
        p42ExtraPriceReads: 0,
        p42RootResourceAmountReads: bP42.resourceAmountReads ?? 0,
        p42OwnerAuthorityReads: bP42.ownerAuthorityReads ?? 0,
        p42AdditionalReservationSourceReads: 0,
        p42DiagnosticClockReads: bP42.diagnosticClockReads ?? 0,
        p42SynchronousDiagnosticMilliseconds: bP42.synchronousMs ?? 0,
        p42TraceElapsedMilliseconds: bP42.traceElapsedMs ?? 0,
        p42TraceEventCount: bP42.events?.length ?? 0,
        p42TraceEventBytes: bP42.traceBytes ?? 0,
        preBoundaryPayloadBytes: boundarySummary(B).boundaryBytes,
        p40TraceEventCount: B.p40?.events?.length ?? 0,
        p40TraceOverflow: B.p40?.overflow ?? 0,
        nativeCallsAtP720: B.nativeCalls.filter((call) => call.period === 720)
          .length,
        p38NativePriceProbeCount: B.p36.metrics?.freshPriceProbes ?? null,
        p38NativeJobOperations: B.p38.metrics?.nativeJobOperations ?? null,
        p38OrdinaryJobsExecutions:
          B.p38.metrics?.ordinaryJobsExecutions ?? null,
        timingClock:
          "window.eaDiagnosticsNow / the Chromium runner's native monotonic diagnostic clock; virtual performance.now is not used for P42 execution timing",
        p42TraceBounded,
      },
    },
    economy,
    provenance: {
      pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      fixtureSha256:
        "2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684",
      seed: 44,
      epoch: "2026-09-21T00:00:00.000Z",
      retainedStartingCommit: "d4e1765d",
      P41CorrectnessFix: "6960536f",
      P41RegressionCommit: "f2189de5",
      productionSourcesModified: false,
    },
  };
}
