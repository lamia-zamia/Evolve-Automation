function canonical(value) {
  return JSON.stringify(value);
}

function identityOf(event) {
  const input = event?.input ?? {};
  const candidate = input.candidate ?? {};
  const values = [
    input.candidateKey,
    input.targetId,
    input.actionId,
    candidate.candidateKey,
    candidate.targetId,
    candidate.actionId,
    candidate.key,
    event?.targetId,
    event?.actionId,
  ];
  return values
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function isHousing(event) {
  return identityOf(event).includes("basic_housing");
}

function isQuarry(value) {
  return JSON.stringify(value ?? {})
    .toLowerCase()
    .includes("rock_quarry");
}

function stopEvent(arm, period) {
  return (
    arm?.p38?.policyEvents?.find((event) => event.period === period) ?? null
  );
}

function checkpointParity(control, treatment) {
  const controlByPeriod = new Map(
    (control?.checkpoints ?? []).map((checkpoint) => [
      checkpoint.period,
      checkpoint,
    ]),
  );
  return (treatment?.checkpoints ?? []).map((checkpoint) => {
    const baseline = controlByPeriod.get(checkpoint.period);
    return {
      period: checkpoint.period,
      presentInControl: baseline !== undefined,
      saveHashEqual: baseline?.saveSha256 === checkpoint.saveSha256,
      stateEqual:
        baseline !== undefined &&
        canonical(baseline.state) === canonical(checkpoint.state),
      nativeCallsEqual:
        baseline !== undefined &&
        canonical(baseline.nativeCalls) === canonical(checkpoint.nativeCalls),
      controlUsageEqual:
        baseline !== undefined &&
        canonical(baseline.controlUsage) === canonical(checkpoint.controlUsage),
      rngEqual:
        baseline?.randomCalls === checkpoint.randomCalls &&
        baseline?.rngState === checkpoint.rngState,
      researchEqual:
        baseline !== undefined &&
        canonical(baseline.state?.tech) === canonical(checkpoint.state?.tech),
      jobsEqual:
        baseline !== undefined &&
        canonical(baseline.state?.jobs) === canonical(checkpoint.state?.jobs),
    };
  });
}

function materialDeficit(target, conflictEvent) {
  const cost = target?.cost ?? {};
  const actionCost = conflictEvent?.input?.candidateCost ?? {};
  const holdings = Object.fromEntries(
    Object.entries(conflictEvent?.input?.holdings ?? {}).map(
      ([id, resource]) => [id, resource?.currentQuantity],
    ),
  );
  return Object.entries(cost).flatMap(([resourceId, reserved]) => {
    const held = holdings[resourceId];
    const spent = actionCost[resourceId];
    if (
      typeof held !== "number" ||
      typeof reserved !== "number" ||
      typeof spent !== "number" ||
      spent <= 0
    )
      return [];
    const afterCandidate = held - spent;
    if (reserved <= afterCandidate) return [];
    return [
      {
        resourceId,
        held,
        reserved,
        candidateCost: spent,
        afterCandidate,
        shortfallAfterCandidate: reserved - afterCandidate,
      },
    ];
  });
}

function classifyHousingDecision(events, currentPolicyTargetAt720) {
  const housingEvents = events.filter(
    (event) => event.period === 720 && isHousing(event),
  );
  const savingReservation =
    housingEvents.find((event) => event.type === "saving-reservation") ?? null;
  const rawConflict =
    housingEvents.find((event) => event.type === "cost-conflict") ?? null;
  const adapterConflict =
    housingEvents.find((event) => event.type === "conflict-adapter") ?? null;
  const buildGate =
    housingEvents.find((event) => event.type === "build-conflict-plan") ?? null;
  const competition =
    housingEvents.find((event) => event.type === "build-competition-plan") ??
    null;
  const purchases = housingEvents.filter(
    (event) => event.type === "purchase-postcondition",
  );
  const affordability =
    housingEvents.find((event) => event.type === "candidate-affordability") ??
    null;
  const target = savingReservation?.output?.target ?? null;
  const targetSourceEntry =
    rawConflict?.input?.reservationDecisions?.find(
      (entry) =>
        entry.target?.name === target?.name &&
        entry.target?.cause === target?.cause,
    ) ?? null;
  const missingMaterial = materialDeficit(target, rawConflict);
  const sources = rawConflict?.input?.reservationSources ?? null;
  const sourceUnavailable =
    sources?.nativeQueue?.unavailable === true ||
    sources?.scriptReservations?.unavailable === true;
  const completeSavingRead =
    savingReservation?.input?.hasCompletedOrdering === true &&
    savingReservation?.output?.reservationSupplied === true;
  const raw = rawConflict?.output ?? null;
  const branch = buildGate?.output?.branch ?? null;
  const verifiedPurchase = purchases.some(
    (event) => event.output?.verifiedSuccess === true,
  );
  const ownerDecision =
    events.find((event) => event.type === "owner-decision") ?? null;
  const housingPathObserved =
    rawConflict !== null &&
    adapterConflict !== null &&
    buildGate !== null &&
    competition !== null &&
    verifiedPurchase;
  let code = "E";
  let name = "trace-insufficient-or-inconsistent";
  let explanation =
    "The captured events do not establish a documented gate branch for the Housing purchase.";
  if (
    housingPathObserved &&
    isQuarry(currentPolicyTargetAt720) &&
    !isQuarry(target)
  ) {
    code = "B";
    name = "current-quarry-target-not-supplied-to-housing-gate";
    explanation = `P38 still authorized Quarry at p720, but this Housing conflict read used ${target?.name ?? "no Construction saving target"} from completed Construction publication ${ownerDecision?.input?.publishedWorkCycleId ?? "unknown"} while ordering generation ${savingReservation?.orderingGeneration ?? "unknown"} was being evaluated. The supplied target was complete and available; Quarry was absent from that owner-boundary reservation.`;
  } else if (
    housingPathObserved &&
    raw?.status === "conflict" &&
    branch === "important-bypass" &&
    buildGate?.input?.conflictSample?.important === true
  ) {
    code = "A";
    name = "intentional-important-bypass";
    explanation =
      "A supplied Quarry reservation conflicted with the Housing cost; the Construction candidate was marked important and planBuildConflict proceeded through that bypass.";
  } else if (
    housingPathObserved &&
    branch === "knowledge-gated-exception" &&
    buildGate?.output?.knowledgeGateException === true
  ) {
    code = "D";
    name = "knowledge-gated-exception";
    explanation =
      "The Construction Build gate proceeded through its documented Knowledge-cap exception.";
  } else if (
    housingPathObserved &&
    (sourceUnavailable ||
      !completeSavingRead ||
      target === null ||
      targetSourceEntry === null)
  ) {
    code = "B";
    name = "reservation-unavailable-or-absent";
    explanation =
      "The Quarry saving reservation was not available as a complete target at the Housing conflict decision.";
  } else if (
    housingPathObserved &&
    targetSourceEntry?.included === false &&
    targetSourceEntry?.exclusionReason === "different-resource-pool"
  ) {
    code = "D";
    name = "different-resource-pool";
    explanation =
      "The current Quarry commitment was excluded because the candidate and reservation were in distinct resource pools.";
  } else if (
    housingPathObserved &&
    raw?.status === "none" &&
    targetSourceEntry?.included === true &&
    missingMaterial.length > 0
  ) {
    code = "C";
    name = "conflict-evaluation-failed-to-protect-target";
    explanation =
      "The Quarry saving reservation was supplied, but the conflict reader returned no conflict while the same-cycle captured root holdings showed a material deficit.";
  } else if (
    housingPathObserved &&
    raw?.status === "none" &&
    targetSourceEntry?.included === true &&
    missingMaterial.length === 0
  ) {
    code = "D";
    name = "no-material-conflict";
    explanation =
      "The reservation was current, but the actual Housing cost did not take a reserved resource below the Quarry commitment.";
  }
  return {
    classification: { code, name, explanation },
    ownerDecision,
    currentPolicyTargetAt720,
    savingReservation,
    rawConflict,
    adapterConflict,
    buildGate,
    competition,
    purchases,
    affordability,
    targetSourceEntry,
    missingMaterial,
    sourceUnavailable,
    completeSavingRead,
  };
}

function eventCounts(events) {
  const counts = {};
  for (const event of events)
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  return counts;
}

export function createP40ConstructionEvidence({
  retainedP38Evidence,
  retainedP38EvidenceText,
  tracedB,
  tracedBRepeat,
  metadata,
}) {
  const control = retainedP38Evidence?.arms?.find((arm) => arm.arm === "B");
  const events = tracedB?.p40?.events ?? [];
  const repeatEvents = tracedBRepeat?.p40?.events ?? [];
  const p38TargetAt720 =
    (tracedB?.p38?.policyEvents ?? [])
      .filter(
        (event) => event.period === 720 && typeof event.targetId === "string",
      )
      .at(-1)?.targetId ?? null;
  const housing = classifyHousingDecision(events, p38TargetAt720);
  const comparisons = checkpointParity(control, tracedB);
  const holds =
    comparisons.length > 0 &&
    comparisons.every(
      (entry) =>
        entry.presentInControl &&
        entry.saveHashEqual &&
        entry.stateEqual &&
        entry.nativeCallsEqual &&
        entry.controlUsageEqual &&
        entry.rngEqual,
    );
  const controlActions = (control?.nativeCalls ?? []).filter(
    (entry) => entry.method === "action",
  );
  const tracedActions = (tracedB?.nativeCalls ?? []).filter(
    (entry) => entry.method === "action",
  );
  const controlHousingActions = controlActions.filter(
    (entry) => entry.period === 720 && entry.elementId === "city-basic_housing",
  );
  const tracedHousingActions = tracedActions.filter(
    (entry) => entry.period === 720 && entry.elementId === "city-basic_housing",
  );
  const controlGather = (control?.p38?.policyEvents ?? []).filter(
    (event) => event.type === "gather-click",
  );
  const tracedGather = (tracedB?.p38?.policyEvents ?? []).filter(
    (event) => event.type === "gather-click",
  );
  const controlStop688 =
    (control?.p36?.policyEvents ?? []).find(
      (event) => event.type === "stopped" && event.period === 688,
    ) ?? null;
  const tracedStop688 =
    (tracedB?.p36?.policyEvents ?? []).find(
      (event) => event.type === "stopped" && event.period === 688,
    ) ?? null;
  const controlStop728 = stopEvent(control, 728);
  const tracedStop728 = stopEvent(tracedB, 728);
  const traceRepeatEqual = canonical(events) === canonical(repeatEvents);
  const noOverflow =
    tracedB?.p40?.overflow === 0 && tracedBRepeat?.p40?.overflow === 0;
  const clockAvailable =
    tracedB?.p40?.clockUnavailable !== true &&
    tracedBRepeat?.p40?.clockUnavailable !== true;
  const purchaseVerified =
    housing.purchases.length > 0 &&
    housing.purchases.every((event) => event.output?.verifiedSuccess === true);
  const controlPeriods = (control?.checkpoints ?? []).map(
    (entry) => entry.period,
  );
  const tracedPeriods = (tracedB?.checkpoints ?? []).map(
    (entry) => entry.period,
  );
  const checkpointsExact =
    controlPeriods.includes(688) &&
    controlPeriods.includes(10000) &&
    canonical(controlPeriods) === canonical(tracedPeriods);
  const replayNeutral =
    holds &&
    canonical(controlActions) === canonical(tracedActions) &&
    canonical(controlGather) === canonical(tracedGather) &&
    canonical(controlStop688) === canonical(tracedStop688) &&
    canonical(controlStop728) === canonical(tracedStop728) &&
    control?.finalExportSha256 === tracedB?.finalExportSha256 &&
    canonical(control?.finalRng) === canonical(tracedB?.finalRng) &&
    canonical(controlHousingActions) === canonical(tracedHousingActions) &&
    traceRepeatEqual &&
    noOverflow &&
    clockAvailable &&
    checkpointsExact;
  const traceComplete =
    housing.savingReservation !== null &&
    housing.completeSavingRead &&
    housing.rawConflict !== null &&
    housing.adapterConflict !== null &&
    housing.buildGate !== null &&
    housing.competition !== null &&
    purchaseVerified &&
    p38TargetAt720 !== null &&
    tracedStop688 !== null &&
    tracedStop728 !== null &&
    tracedB?.periods === 10000 &&
    events.length > 0;
  const decisionCode = !replayNeutral
    ? "C"
    : traceComplete && housing.classification.code !== "E"
      ? "A"
      : "B";
  const inputBytes = Buffer.byteLength(
    JSON.stringify(events.map((event) => event.input ?? null)),
  );
  const outputBytes = Buffer.byteLength(
    JSON.stringify(events.map((event) => event.output ?? null)),
  );
  const serializedTraceBytes = Buffer.byteLength(JSON.stringify(events));
  const pluginBytes = metadata.pluginBytes ?? null;
  const ownerDecisions = tracedB?.p40?.ownerDecisionCount ?? 0;
  return {
    experiment: "P40 Construction reservation gate authority",
    schemaVersion: 1,
    decision: {
      code: decisionCode,
      meaning:
        decisionCode === "A"
          ? "Gate cause established"
          : decisionCode === "B"
            ? "Authority remains unresolved"
            : "Trace invalid",
      replayNeutral,
      traceComplete,
    },
    pinnedGame: metadata.pinnedGame,
    fixtureSha256: metadata.fixtureSha256,
    seed: metadata.seed,
    epoch: metadata.epoch,
    provenance: {
      retainedP38EvidenceSha256: metadata.retainedP38EvidenceSha256,
      retainedP38HarnessSha256:
        control?.replayHarnessSha256 ??
        retainedP38Evidence?.replayHarnessSha256 ??
        null,
      p40HarnessSha256: metadata.p40HarnessSha256,
      p40RunnerSha256: metadata.p40RunnerSha256,
      p40PluginSha256: metadata.p40PluginSha256,
      p40PluginBytes: pluginBytes,
      tracedRuntimeBundleSha256: metadata.runtimeBundleSha256,
      traceScopePeriods: [720, 720],
      traceEventLimit: 4096,
      sourceReadsAdded: {
        nativeCalls: 0,
        priceReads: 0,
        catalogReads: 0,
        resourceSourceReads: 0,
        resourceAmountPropertyReads: tracedB?.p40?.resourceReadCount ?? 0,
        reservationSourceReads: 0,
        rootGenerationGetters: 0,
        progressionGenerationGetters: 0,
      },
      productionSourcesModified: false,
      directResourceMutation: false,
      forcedPurchase: false,
      extraGatherClicksPerReplay: 0,
    },
    purchasePath: {
      classification: housing.classification,
      p720: {
        p38PolicyTargetAt720: p38TargetAt720,
        ownerDecision: housing.ownerDecision,
        candidateOrder: events.filter(
          (event) =>
            event.period === 720 &&
            event.type === "candidate-order" &&
            (isHousing(event) || identityOf(event).includes("rock_quarry")),
        ),
        affordability: housing.affordability,
        savingReservation: housing.savingReservation,
        reservationSourceAndConflictEvaluation: housing.rawConflict,
        adapterMapping: housing.adapterConflict,
        buildGate: housing.buildGate,
        competition: housing.competition,
        purchasePostconditions: housing.purchases,
        targetReservationEntry: housing.targetSourceEntry,
        materialDeficitFromSameCycleRoot: housing.missingMaterial,
      },
      p36StopAt688: { control: controlStop688, traced: tracedStop688 },
      p38GatherActions: {
        authorization: "p38-test-only-quarry-lumber-gather-18",
        controlCount: controlGather.length,
        tracedCount: tracedGather.length,
        exact: canonical(controlGather) === canonical(tracedGather),
        events: tracedGather,
      },
      p728Stop: { control: controlStop728, traced: tracedStop728 },
      p10000: {
        control:
          control?.checkpoints?.find((entry) => entry.period === 10000) ?? null,
        traced:
          tracedB?.checkpoints?.find((entry) => entry.period === 10000) ?? null,
        finalExportSha256Equal:
          control?.finalExportSha256 === tracedB?.finalExportSha256,
      },
    },
    replayNeutrality: {
      ordinaryP38BComparedToTracedP38B: replayNeutral,
      nativeActionSequenceEqual:
        canonical(controlActions) === canonical(tracedActions),
      nativeActionCounts: {
        control: controlActions.length,
        traced: tracedActions.length,
      },
      candidatePurchasesEqual:
        canonical(controlHousingActions) === canonical(tracedHousingActions),
      housingActionCountAt720: {
        control: controlHousingActions.length,
        traced: tracedHousingActions.length,
      },
      buildingCountsAndResourcesEqualAtEveryRetainedCheckpoint:
        comparisons.every((entry) => entry.stateEqual),
      researchGrantsEqualAtEveryRetainedCheckpoint: comparisons.every(
        (entry) => entry.researchEqual,
      ),
      jobsAllocationsEqualAtEveryRetainedCheckpoint: comparisons.every(
        (entry) => entry.jobsEqual,
      ),
      rngEqualAtEveryRetainedCheckpoint: comparisons.every(
        (entry) => entry.rngEqual,
      ),
      controlUsageEqualAtEveryRetainedCheckpoint: comparisons.every(
        (entry) => entry.controlUsageEqual,
      ),
      exportedSaveHashesEqualAtEveryRetainedCheckpoint: comparisons.every(
        (entry) => entry.saveHashEqual,
      ),
      p688StopEqual: canonical(controlStop688) === canonical(tracedStop688),
      p728StopEqual: canonical(controlStop728) === canonical(tracedStop728),
      p10000FinalExportHashEqual:
        control?.finalExportSha256 === tracedB?.finalExportSha256,
      p10000FinalRngEqual:
        canonical(control?.finalRng) === canonical(tracedB?.finalRng),
      BRepeatTraceEqual: traceRepeatEqual,
      checkpointParity: comparisons,
    },
    performance: {
      diagnosticClock:
        "window.eaDiagnosticsNow, the original monotonic Chromium Performance clock retained by the exact runner bridge",
      measuredSynchronousDiagnosticCostMs: Number(
        (
          Number(tracedB?.p40?.synchronousMs ?? 0) +
          Number(tracedB?.p40?.contextSynchronousMs ?? 0) +
          Number(tracedB?.p40?.guardSynchronousMs ?? 0) +
          Number(tracedB?.p40?.resourceReadMs ?? 0)
        ).toFixed(4),
      ),
      eventCaptureAndAppendMs: Number(
        Number(tracedB?.p40?.synchronousMs ?? 0).toFixed(4),
      ),
      ownerContextCaptureMs: Number(
        Number(tracedB?.p40?.contextSynchronousMs ?? 0).toFixed(4),
      ),
      activeWindowCandidateGuardMs: Number(
        Number(tracedB?.p40?.guardSynchronousMs ?? 0).toFixed(4),
      ),
      activeWindowCandidateGuardCalls: tracedB?.p40?.guardCalls ?? 0,
      nativeMonotonicClockReads: tracedB?.p40?.diagnosticClockReads ?? 0,
      purchaseResourceSnapshotReadMs: Number(
        Number(tracedB?.p40?.resourceReadMs ?? 0).toFixed(4),
      ),
      purchaseResourceAmountReadsAdded: tracedB?.p40?.resourceReadCount ?? 0,
      instrumentedOwnerDecisionCount: ownerDecisions,
      traceEventCount: events.length,
      traceEventCountByType: eventCounts(events),
      traceOverflow: tracedB?.p40?.overflow ?? null,
      traceStorageBounded:
        (tracedB?.p40?.overflow ?? 0) === 0 && events.length <= 4096,
      nativeCallsAdded: 0,
      priceCatalogResourceReservationReadsAdded: 0,
      note: "Diagnostic time covers event assembly/append, Construction ordering context, candidate relevance guards and the pre-action resource snapshot inside p696-p728. Two root resource amount reads surround the verified Housing action; no resource source API read was added.",
      cpuClaim: "The independent 2% production CPU gate remains unresolved.",
    },
    traceSizes: {
      inputBytes: inputBytes,
      outputBytes: outputBytes,
      serializedEventBytes: serializedTraceBytes,
      formattedEvidenceBytes: null,
    },
    traceEvents: events,
    traceRepeatSha256: metadata.traceRepeatSha256,
    instrumentation: {
      testSurfaceOnly: true,
      p20GenericAllocator: "retired",
      p37ToP39: "diagnostic-only",
      noProductionReservationBehaviorChanged: true,
    },
  };
}

export function createP40ParitySummary(evidence) {
  return {
    decision: evidence.decision,
    replayNeutrality:
      evidence.replayNeutrality.ordinaryP38BComparedToTracedP38B,
    classification: evidence.purchasePath.classification,
    instrumentedOwnerDecisions:
      evidence.performance.instrumentedOwnerDecisionCount,
    traceEvents: evidence.performance.traceEventCount,
    synchronousDiagnosticMs:
      evidence.performance.measuredSynchronousDiagnosticCostMs,
    traceSizes: evidence.traceSizes,
  };
}
