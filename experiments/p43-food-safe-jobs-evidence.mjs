import { verifyP43NativeJobsPostcondition } from "./p43-food-safe-jobs-policy.mjs";

const EXACT_PERIOD = 10_000;

function eventAssignments(event) {
  return event?.assignments ?? null;
}

function hasChangedAssignments(event) {
  return (
    event?.applied === true &&
    JSON.stringify(eventAssignments(event)) !==
      JSON.stringify(event?.ordinaryAssignments ?? null)
  );
}

function checkpointAt(arm, period) {
  return arm?.checkpoints?.find((entry) => entry.period === period) ?? null;
}

function completeParity(left, right) {
  if (!left || !right) return [];
  const rightByPeriod = new Map(
    right.checkpoints.map((entry) => [entry.period, entry]),
  );
  return left.checkpoints.map((entry) => {
    const other = rightByPeriod.get(entry.period);
    return {
      period: entry.period,
      present: other !== undefined,
      saveHashEqual:
        other !== undefined && entry.saveSha256 === other.saveSha256,
      stateEqual:
        other !== undefined &&
        JSON.stringify(entry.state) === JSON.stringify(other.state),
      nativeCallsEqual:
        other !== undefined &&
        (entry.nativeCallsSha256 !== undefined ||
        other.nativeCallsSha256 !== undefined
          ? entry.nativeCallsSha256 === other.nativeCallsSha256 &&
            entry.nativeCallsCount === other.nativeCallsCount
          : JSON.stringify(entry.nativeCalls) ===
            JSON.stringify(other.nativeCalls)),
      controlUsageEqual:
        other !== undefined &&
        JSON.stringify(entry.controlUsage) ===
          JSON.stringify(other.controlUsage),
      rngEqual:
        other !== undefined &&
        entry.randomCalls === other.randomCalls &&
        entry.rngState === other.rngState,
    };
  });
}

function eventTimelineRow(event) {
  const ledger = event.foodLedger ?? {};
  return {
    period: event.period,
    workCycle: event.workCycle,
    identity: event.identity,
    status: event.status,
    reason: event.reason,
    interventionApplied: event.applied,
    defaultJobId: event.defaultJobId,
    population: event.population,
    housingCapacity: event.populationCapacity,
    occupiedJobs: event.occupiedJobs,
    unassignedWorkers: event.unassignedWorkers,
    servants: event.servants,
    jobCatalog: event.jobs,
    ordinaryAssignments: event.ordinaryAssignments,
    constrainedAssignments: event.assignments,
    nativeFarmerMinimum:
      event.jobs?.find((job) => job.id === "farmer")?.minimum ?? null,
    farmerSmartMaximum:
      event.jobs?.find((job) => job.id === "farmer")?.smartMaximum ?? null,
    farmerPhysicalMaximum:
      event.jobs?.find((job) => job.id === "farmer")?.maximum ?? null,
    quarrySmartMaximum:
      event.jobs?.find((job) => job.id === "quarry_worker")?.smartMaximum ??
      null,
    floorStatus: event.floorStatus,
    foodFloorFarmers: event.minimumFarmers,
    foodFormulaModifier: event.modifier,
    foodModifierInputs: event.modifierInputs,
    foodProduction: event.foodOutput,
    foodConsumption: event.foodConsumption,
    foodNet: event.foodNet,
    foodStock: event.foodStock,
    foodStockCapacity: event.foodStockMaximum,
    foodProducerRows: ledger.production?.Food ?? null,
    foodConsumerRows: ledger.consumption?.Food ?? null,
    stoneProduction: event.stoneProduction,
    stoneConsumption: event.stoneConsumption,
    stoneNet: event.stoneNet,
    stoneStock: event.stoneStock,
    starvationCount: event.starved,
    deaths: event.deaths,
    buildings: event.buildings,
    ordinaryPlanFood: event.ordinaryPlanFood,
    alternative: event.alternative,
    workerCommitments: event.workerCommitments,
    workerCommitmentsAssumedEmpty: event.workerCommitmentsAssumedEmpty === true,
  };
}

function stockTransitions(arm) {
  return (arm?.targetTransitions ?? []).map((entry) => ({
    period: entry.period,
    target: entry.target,
    authority: entry.authority,
  }));
}

function checkpointTimelineRow(entry) {
  return {
    period: entry.period,
    saveSha256: entry.saveSha256,
    state: entry.state,
    production: entry.production,
    controlUsage: entry.controlUsage,
    nativeCallsCount:
      entry.nativeCallsCount ?? entry.nativeCalls?.length ?? null,
    nativeCallsSha256: entry.nativeCallsSha256 ?? null,
    randomCalls: entry.randomCalls,
    rngState: entry.rngState,
    native: {
      foodLedger: entry.native?.foodLedger ?? null,
      unassignedWorkers: entry.native?.unassignedWorkers ?? null,
      servantJobs: entry.native?.servantJobs ?? null,
      savingTargetObservation: entry.native?.savingTargetObservation ?? null,
    },
  };
}

function boundarySummary(boundary, hash) {
  if (!boundary) return null;
  return {
    captured: boundary.captured === true,
    jobsInput: boundary.input ?? null,
    ordinaryDecision: boundary.ordinaryDecision ?? null,
    foodLedger: boundary.foodLedger ?? null,
    state: boundary.state ?? null,
    identity: boundary.identity ?? null,
    nativeInvocationCount: boundary.nativeInvocationCount ?? null,
    controlUsage: boundary.controlUsage ?? null,
    randomCalls: boundary.randomCalls ?? null,
    rngState: boundary.rngState ?? null,
    saveSha256: typeof boundary.save === "string" ? hash(boundary.save) : null,
  };
}

function safeIntervalSummary(arm, startPeriod = 720) {
  const checkpoints = (arm?.checkpoints ?? []).filter(
    (entry) => entry.period >= startPeriod && entry.period <= EXACT_PERIOD,
  );
  const nativeJobs = (arm?.p43?.events ?? []).filter(
    (event) => event.period >= startPeriod && event.period <= EXACT_PERIOD,
  );
  const foodSafe = checkpoints.every(
    (entry) =>
      Number(entry.production?.foodOutput ?? -Infinity) >
      Number(entry.production?.foodConsumption ?? Infinity),
  );
  const noNewStarvation =
    checkpoints.length > 0 &&
    Number(checkpoints.at(-1)?.state?.starved ?? 0) ===
      Number(checkpoints[0]?.state?.starved ?? 0);
  const noNewDeaths =
    checkpoints.length > 0 &&
    Number(checkpoints.at(-1)?.state?.deaths ?? 0) ===
      Number(checkpoints[0]?.state?.deaths ?? 0);
  const stonePositive = checkpoints.some(
    (entry) => Number(entry.production?.stoneOutput ?? 0) > 0,
  );
  const quarryRetainedAtEnd =
    Number(checkpoints.at(-1)?.state?.jobs?.quarry_worker ?? 0) > 0;
  return {
    startPeriod,
    endPeriod: checkpoints.at(-1)?.period ?? null,
    checkpointCount: checkpoints.length,
    jobsObservationCount: nativeJobs.length,
    allSampledFoodFlowsPositive: foodSafe,
    noNewStarvationAtSampledCheckpoints: noNewStarvation,
    noNewDeathsAtSampledCheckpoints: noNewDeaths,
    anySampledPositiveStoneProduction: stonePositive,
    quarryWorkerAtEnd: quarryRetainedAtEnd,
    finalPopulation: checkpoints.at(-1)?.state?.population ?? null,
    finalStarvationCount: checkpoints.at(-1)?.state?.starved ?? null,
    finalDeaths: checkpoints.at(-1)?.state?.deaths ?? null,
    finalFoodStock: checkpoints.at(-1)?.state?.resources?.Food?.amount ?? null,
    finalStoneStock:
      checkpoints.at(-1)?.state?.resources?.Stone?.amount ?? null,
  };
}

function jobControlCalls(arm) {
  return (arm?.nativeCalls ?? []).filter((entry) =>
    /^civ-(farmer|quarry_worker)$/.test(entry.elementId ?? ""),
  );
}

export function createP43FoodSafeJobsEvidence({
  A,
  B,
  BRepeat,
  hash,
  canonicalJson,
  runtimeBundleSha256,
  policyBundleSha256,
  p38PolicyBundleSha256,
  replayHarnessSha256,
  p43PolicySha256,
  p43TraceSha256,
  pinnedGame,
  pinnedGameSha256,
  p42BaseCommit,
  p42HarnessCommit,
  p42TestsCommit,
}) {
  const firstChangeEvent = B?.p43?.events?.find(hasChangedAssignments) ?? null;
  const firstDivergencePeriod = firstChangeEvent?.period ?? null;
  const aBoundary = A?.p43?.boundary ?? null;
  const bBoundary = B?.p43?.boundary ?? null;
  const repeatBoundary = BRepeat?.p43?.boundary ?? null;
  const preDecisionBoundaryEqual =
    aBoundary?.captured === true &&
    bBoundary?.captured === true &&
    JSON.stringify(aBoundary) === JSON.stringify(bBoundary) &&
    checkpointAt(A, 719)?.saveSha256 === checkpointAt(B, 719)?.saveSha256;
  const repeatBoundaryEqual =
    bBoundary?.captured === true &&
    repeatBoundary?.captured === true &&
    JSON.stringify(bBoundary) === JSON.stringify(repeatBoundary) &&
    checkpointAt(B, 719)?.saveSha256 === checkpointAt(BRepeat, 719)?.saveSha256;
  const beforeDecisionParity =
    firstDivergencePeriod === null
      ? completeParity(A, B)
      : completeParity(A, B).filter(
          (entry) => entry.period < firstDivergencePeriod,
        );
  const firstDecisionCheckpoint =
    firstDivergencePeriod === null
      ? null
      : checkpointAt(B, firstDivergencePeriod);
  const firstPostDecisionEvent =
    firstChangeEvent === null
      ? null
      : (B?.p43?.events?.find(
          (event) =>
            event.workCycle?.sequence ===
              firstChangeEvent.workCycle?.sequence + 1 &&
            event.period >= firstChangeEvent.period,
        ) ?? null);
  const postconditionInput = bBoundary?.input ?? null;
  const ordinarySelectedDefaultToken =
    bBoundary?.ordinaryDecision?.selectedDefaultToken ??
    postconditionInput?.defaultJobToken ??
    null;
  const ordinarySelectedDefaultId =
    postconditionInput?.jobs?.find(
      (job) => job.token === ordinarySelectedDefaultToken,
    )?.id ?? null;
  const postconditionDecision =
    firstChangeEvent?.assignments && postconditionInput?.jobs
      ? {
          assignments: Object.entries(firstChangeEvent.assignments).flatMap(
            ([id, assignment]) => {
              const job = postconditionInput.jobs.find(
                (entry) => entry.id === id,
              );
              return job
                ? [
                    {
                      jobToken: job.token,
                      workers: assignment.workers,
                      servants: assignment.servants,
                    },
                  ]
                : [];
            },
          ),
          selectedDefaultToken: ordinarySelectedDefaultToken,
        }
      : null;
  const postconditionRoot =
    firstDecisionCheckpoint && postconditionInput
      ? {
          civic: {
            d_job: firstPostDecisionEvent?.defaultJobId ?? null,
            ...Object.fromEntries(
              postconditionInput.jobs.map((job) => [
                job.id,
                {
                  workers: Number(
                    firstDecisionCheckpoint.state.jobs?.[job.id] ?? 0,
                  ),
                },
              ]),
            ),
          },
          race: {
            servants: {
              jobs: firstDecisionCheckpoint.native?.servantJobs ?? {},
            },
          },
        }
      : null;
  const nativePostcondition =
    firstChangeEvent !== null
      ? verifyP43NativeJobsPostcondition({
          input: postconditionInput,
          decision: postconditionDecision,
          root: postconditionRoot,
        })
      : null;
  const postconditionMatchesCheckpoint = nativePostcondition?.matched === true;
  const bRepeatCheckpoints = completeParity(B, BRepeat);
  const bRepeatExact =
    bRepeatCheckpoints.length > 0 &&
    bRepeatCheckpoints.every(
      (entry) =>
        entry.present &&
        entry.saveHashEqual &&
        entry.stateEqual &&
        entry.nativeCallsEqual &&
        entry.controlUsageEqual &&
        entry.rngEqual,
    ) &&
    B?.finalExportSha256 === BRepeat?.finalExportSha256 &&
    JSON.stringify(B?.finalRng) === JSON.stringify(BRepeat?.finalRng) &&
    JSON.stringify(B?.nativeCalls) === JSON.stringify(BRepeat?.nativeCalls) &&
    JSON.stringify(B?.controlUsage) === JSON.stringify(BRepeat?.controlUsage) &&
    JSON.stringify(B?.p43?.events) === JSON.stringify(BRepeat?.p43?.events) &&
    JSON.stringify(
      (B?.p42?.events ?? []).map(({ arm: _arm, ...event }) => event),
    ) ===
      JSON.stringify(
        (BRepeat?.p42?.events ?? []).map(({ arm: _arm, ...event }) => event),
      );
  const p42NativeCallsParity =
    JSON.stringify(A?.nativeCalls) === JSON.stringify(B?.nativeCalls) ||
    (firstDivergencePeriod !== null &&
      JSON.stringify(
        A?.nativeCalls?.filter((entry) => entry.period < firstDivergencePeriod),
      ) ===
        JSON.stringify(
          B?.nativeCalls?.filter(
            (entry) => entry.period < firstDivergencePeriod,
          ),
        ));
  const traceOverflows = {
    A: A?.p43?.eventOverflow ?? null,
    B: B?.p43?.eventOverflow ?? null,
    BRepeat: BRepeat?.p43?.eventOverflow ?? null,
  };
  const p43TraceComplete = Object.values(traceOverflows).every(
    (value) => value === 0,
  );
  const AInterval = safeIntervalSummary(A);
  const BInterval = safeIntervalSummary(B, firstDivergencePeriod ?? 720);
  const commitmentEvidenceAvailable = false;
  const formulaQualifiedAtFirstChange =
    firstChangeEvent?.floorStatus === "feasible" &&
    firstChangeEvent?.identity?.farmerControlReady === true &&
    firstChangeEvent?.identity?.quarryControlReady === true;
  const resultInvalid =
    !preDecisionBoundaryEqual ||
    !repeatBoundaryEqual ||
    !bRepeatExact ||
    !p43TraceComplete ||
    (firstChangeEvent !== null && !postconditionMatchesCheckpoint);
  let diagnosticOutcome = "D";
  if (resultInvalid) diagnosticOutcome = "E";
  else if (
    BInterval.allSampledFoodFlowsPositive &&
    BInterval.noNewStarvationAtSampledCheckpoints &&
    BInterval.noNewDeathsAtSampledCheckpoints &&
    BInterval.anySampledPositiveStoneProduction &&
    BInterval.quarryWorkerAtEnd
  )
    diagnosticOutcome = "A";
  else if (
    BInterval.allSampledFoodFlowsPositive &&
    BInterval.noNewStarvationAtSampledCheckpoints &&
    BInterval.noNewDeathsAtSampledCheckpoints &&
    !BInterval.quarryWorkerAtEnd
  )
    diagnosticOutcome = "B";
  else if (formulaQualifiedAtFirstChange || firstChangeEvent === null)
    diagnosticOutcome = "C";
  const outcome = resultInvalid
    ? "E"
    : !commitmentEvidenceAvailable || !formulaQualifiedAtFirstChange
      ? "D"
      : diagnosticOutcome;
  const interventionEvents = (B?.p43?.events ?? []).filter(
    (event) => event.applied === true,
  );
  const conflictEvents = (B?.p43?.events ?? []).filter(
    (event) => event.ordinaryPlanFood?.sustainable === false,
  );
  const AJobCalls = jobControlCalls(A);
  const BJobCalls = jobControlCalls(B);
  const foodObservationCount = B?.p43?.metrics?.foodLedgerReads ?? 0;
  const foodObservationCost = B?.p43?.metrics?.foodObservationMs ?? 0;
  const purePolicyCost = B?.p43?.metrics?.purePolicyMs ?? 0;
  const executionTimeA = Number(
    A?.p38?.metrics?.ordinaryJobsExecutionElapsedMs ?? 0,
  );
  const executionTimeB = Number(
    B?.p38?.metrics?.ordinaryJobsExecutionElapsedMs ?? 0,
  );
  const timeline = {
    schema: "p43-food-safe-jobs-timeline-v1",
    pinnedGame,
    armA: {
      id: "P42 baseline: P42 Construction intervention, ordinary Jobs",
      events: (A?.p43?.events ?? []).map(eventTimelineRow),
      checkpoints: (A?.checkpoints ?? []).map(checkpointTimelineRow),
      constructionSavingTargets: stockTransitions(A),
    },
    armB: {
      id: "P42 plus explicit test-only Food-safe Jobs diagnostic",
      commitmentMode: B?.p43?.commitmentMode ?? null,
      events: (B?.p43?.events ?? []).map(eventTimelineRow),
      checkpoints: (B?.checkpoints ?? []).map(checkpointTimelineRow),
      constructionSavingTargets: stockTransitions(B),
    },
    armBRepeat: {
      id: "deterministic repeat of arm B",
      eventCount: BRepeat?.p43?.events?.length ?? 0,
      eventsSha256: hash(JSON.stringify(BRepeat?.p43?.events ?? [])),
      finalExportSha256: BRepeat?.finalExportSha256 ?? null,
    },
    replayHash: hash(
      canonicalJson({
        A: A?.finalExportSha256,
        B: B?.finalExportSha256,
        BRepeat: BRepeat?.finalExportSha256,
        AEvents: A?.p43?.events,
        BEvents: B?.p43?.events,
      }),
    ),
  };
  const evidence = {
    schema: "p43-food-safe-jobs-evidence-v1",
    experiment:
      "P43 — Food-safe Jobs allocation and population-growth attribution",
    outcome,
    diagnosticOutcome,
    interpretation:
      outcome === "D"
        ? "Diagnostic replay is recorded, but missing authoritative worker-commitment evidence or formula/control qualification prevents an authority claim."
        : outcome === "E"
          ? "Exact replay isolation, native postconditions, trace completeness, or B-repeat determinism failed."
          : "See the diagnostic allocation criteria and retained timeline; this remains a test-only replay.",
    identity: {
      pinnedGame,
      pinnedGameSha256: pinnedGameSha256 ?? null,
      p42BaseCommit: p42BaseCommit ?? null,
      p42HarnessCommit: p42HarnessCommit ?? null,
      p42TestsCommit: p42TestsCommit ?? null,
      arms: ["A", "B", "B-repeat"],
      finalPeriod: EXACT_PERIOD,
    },
    intervention: {
      scope:
        "captured full Jobs planner decision before the existing Jobs executor",
      changedJobs: ["farmer", "quarry_worker"],
      constructionAndGatherParity: p42NativeCallsParity,
      commitmentMode: "test-only-assume-empty",
      workerCommitmentsEvidence:
        "unavailable from the pinned captured Jobs catalog",
      authoritative: false,
      directGameStateMutation: false,
      persistedJobSettingsChanged: false,
    },
    comparison: {
      firstDivergencePeriod,
      firstChangedJobsDecision: firstChangeEvent,
      firstDecisionNativePostconditionMatchesCheckpoint:
        postconditionMatchesCheckpoint,
      firstDecisionNativePostcondition: nativePostcondition,
      firstDecisionDefaultEvidence: {
        ordinarySelectedDefaultToken: ordinarySelectedDefaultToken,
        ordinarySelectedDefaultId,
        capturedDefaultBeforeDecision:
          bBoundary?.identity?.nativeDefaultJobId ?? null,
        capturedDefaultAfterDecision:
          firstPostDecisionEvent?.defaultJobId ?? null,
        nextJobsObservationPeriod: firstPostDecisionEvent?.period ?? null,
        p43KeepsOrdinarySelectedDefault:
          ordinarySelectedDefaultId !== null &&
          ordinarySelectedDefaultId === firstPostDecisionEvent?.defaultJobId,
        ordinarySelectedDefaultMatchesPriorNativeDefault:
          ordinarySelectedDefaultToken === postconditionInput?.defaultJobToken,
      },
      AtoBBoundaryEqualBeforeJobsDecision: preDecisionBoundaryEqual,
      AtoBBoundaryCapture: {
        A: aBoundary?.captured ?? false,
        B: bBoundary?.captured ?? false,
        BRepeat: repeatBoundary?.captured ?? false,
      },
      p720JobsBoundary: {
        A: boundarySummary(aBoundary, hash),
        B: boundarySummary(bBoundary, hash),
        BRepeat: boundarySummary(repeatBoundary, hash),
      },
      AtoBParityBeforeFirstChangedDecision: beforeDecisionParity,
      BtoBRepeatExact: bRepeatExact,
      BtoBRepeatCheckpointParity: bRepeatCheckpoints,
      BtoBRepeatFinalExportEqual:
        B?.finalExportSha256 === BRepeat?.finalExportSha256,
      BtoBRepeatNativeActionSequenceEqual:
        JSON.stringify(B?.nativeCalls) === JSON.stringify(BRepeat?.nativeCalls),
      BtoBRepeatControlsEqual:
        JSON.stringify(B?.controlUsage) ===
        JSON.stringify(BRepeat?.controlUsage),
      BtoBRepeatRngEqual:
        JSON.stringify(B?.finalRng) === JSON.stringify(BRepeat?.finalRng),
      P42AtoBNativeCallsEqualBeforeDivergence: p42NativeCallsParity,
    },
    outcomes: {
      A: AInterval,
      B: BInterval,
      ordinaryPlanConflicts: conflictEvents.length,
      interventionCount: interventionEvents.length,
      firstStarvationSample: {
        A:
          (A?.p43?.events ?? []).find(
            (event) => Number(event.starved ?? 0) > 0,
          ) ?? null,
        B:
          (B?.p43?.events ?? []).find(
            (event) => Number(event.starved ?? 0) > 0,
          ) ?? null,
      },
      starvationStockCanBePositiveDespiteDeficit: (B?.p43?.events ?? []).some(
        (event) =>
          Number(event.foodNet ?? 0) < 0 && Number(event.foodStock ?? 0) > 0,
      ),
    },
    performance: {
      foodFloorPureComputationMs: purePolicyCost,
      nativeFoodObservationMs: foodObservationCost,
      nativeFoodObservationCount: foodObservationCount,
      nativeControlGenerationReads:
        B?.p43?.metrics?.controlGenerationReads ?? 0,
      fullJobsPlanCalls: B?.p43?.metrics?.planCalls ?? 0,
      baselineFarmerQuarryControlOperations: AJobCalls.length,
      treatmentFarmerQuarryControlOperations: BJobCalls.length,
      additionalFarmerQuarryControlOperations:
        BJobCalls.length - AJobCalls.length,
      ordinaryJobsExecutionDurationMs: {
        A: executionTimeA,
        B: executionTimeB,
        delta: executionTimeB - executionTimeA,
        clock: "window.eaDiagnosticsNow native monotonic clock",
      },
      wholeRunRelevantSynchronousJobsWorkMs: {
        A: executionTimeA,
        B: executionTimeB,
        note: "Accumulated captured full Jobs callback time, including native observation, pure planning, and existing executor work; excludes virtual game-time performance.now().",
      },
      extraConstructionCalls: 0,
      extraGatherCalls: 0,
      extraCatalogReads: 0,
      addedFoodBreakdownReadsPerJobsCycle: 1,
      baselineJobsExecutionCount: A?.p38?.metrics?.ordinaryJobsExecutions ?? 0,
      treatmentJobsExecutionCount: B?.p38?.metrics?.ordinaryJobsExecutions ?? 0,
      traceOverflows,
      independentRendererCpuGate: "unresolved",
    },
    formulaEvidence: {
      pinnedFarmerImpact: 0.82,
      farmCapacityFormula:
        "min(Farm count, Farmer count) receives native full-Farm bonus; remaining Farmers are farmhands and retain Farmer impact.",
      fullFarmBonusByAgriculture:
        "0.65 below Agriculture II; 1.15 from Agriculture II, pinned upstream source.",
      liveMultiplier:
        "Measured Food output = current Food.diff + absolute sum of all native Food consumers; current observed Farmer assignment and Farm formula derive the current effective per-Farmer multiplier.",
      otherSources:
        "All current Food consumer rows are included. An active non-Farmer producer without an independently verified effective-output formula makes the floor unavailable; no source is silently treated as Farmer output.",
      strictPositiveMargin: true,
      equalityIsSustainable: false,
      pinnedSourcePaths: {
        farmerValueAndImpact:
          "test-artifacts/game/evolve-deadspace.js:104296-104340",
        foodFarmerAndFarmhand:
          "test-artifacts/game/evolve-deadspace.js:150653-150678",
        foodConsumption:
          "test-artifacts/game/evolve-deadspace.js:150783-150895",
        jobsMinimumAndMaximum:
          "src/adapters/evolve/civic/captured-job-catalog.ts",
      },
      p39Source:
        "experiments/p39-cross-owner-economic-coordination.md; P37's 1.2 multiplier is not reused.",
      commitmentsAndFormulaLimit:
        "Current commitments are not exposed by the catalog. The explicit empty-commitment test branch is diagnostic only.",
    },
    replay: {
      runtimeBundleSha256,
      policyBundleSha256,
      p38PolicyBundleSha256,
      replayHarnessSha256,
      p43PolicySha256,
      p43TraceSha256,
      traceOverflows,
      finalExports: {
        A: A?.finalExportSha256 ?? null,
        B: B?.finalExportSha256 ?? null,
        BRepeat: BRepeat?.finalExportSha256 ?? null,
      },
      finalRng: {
        A: A?.finalRng ?? null,
        B: B?.finalRng ?? null,
        BRepeat: BRepeat?.finalRng ?? null,
      },
      timelineSha256: hash(JSON.stringify(timeline)),
    },
    caveats: [
      "This is a controlled test-only Jobs intervention paired with P42's test-only Construction substitution.",
      "It does not authorize ordinary Jobs overrides, Construction changes, Gather actions, or autonomous success.",
      "A P43 result requiring the unapproved P42 Construction substitution and this Jobs experiment is not an autonomous production success.",
      "Native breakpoints, smartMaximum, and physical maximum remain separate fields in the timeline.",
    ],
  };
  return { evidence, timeline };
}
