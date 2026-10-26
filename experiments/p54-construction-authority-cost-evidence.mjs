import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { P53_QUARRY_REQUEST } from "./p53-construction-owned-target-authority-contract.mjs";

const at = (arm, period) =>
  arm?.checkpoints?.find((checkpoint) => checkpoint.period === period);
const p51 = (checkpoint) => checkpoint?.native?.p51;
const p53 = (checkpoint) => p51(checkpoint)?.p53;
const p54 = (checkpoint) => checkpoint?.p54;
const canonical = (value) => JSON.stringify(value);
const same = (left, right) => canonical(left) === canonical(right);
const hashValue = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function meaningfulCheckpoint(checkpoint) {
  return {
    period: checkpoint?.period,
    saveSha256: checkpoint?.saveSha256,
    state: checkpoint?.state,
    controlUsage: checkpoint?.controlUsage,
    filteredGameplayCalls: checkpoint?.nativeCalls,
    randomCalls: checkpoint?.randomCalls,
    rngState: checkpoint?.rngState,
    totalNativeInvocations: p54(checkpoint)?.nativeInvocationCount,
    orderedNativeInvocationSha256:
      p54(checkpoint)?.nativeInvocationSequenceSha256,
  };
}

function actionInvocations(checkpoint) {
  return nativeApiSequence(checkpoint).filter(
    (entry) => entry.method === "action",
  );
}

function readOnlyInvocations(checkpoint) {
  return nativeApiSequence(checkpoint).filter(
    (entry) => entry.method !== "action",
  );
}

function nativeApiSequence(checkpoint) {
  const trace = p54(checkpoint)?.nativeInvocationSequence ?? [];
  assert.equal(
    trace.length % 2,
    0,
    "native trace records must form call pairs",
  );
  const calls = [];
  for (let index = 0; index < trace.length; index += 2) {
    const call = trace[index];
    const paired = trace[index + 1];
    assert.ok(
      call.period === paired.period &&
        call.elementId === paired.elementId &&
        call.method === paired.method,
      `native trace pair ${index / 2} must identify one native control call`,
    );
    const { order: _order, ...normalized } = call;
    calls.push(normalized);
  }
  return calls;
}

function sequenceDifference(left, right) {
  const l = nativeApiSequence(left);
  const r = nativeApiSequence(right);
  let index = 0;
  while (index < l.length && index < r.length && same(l[index], r[index]))
    index += 1;
  return {
    firstDivergenceIndex: index,
    left: l[index] ?? null,
    right: r[index] ?? null,
    commonPrefixLength: index,
    leftCount: l.length,
    rightCount: r.length,
  };
}

function countPriceProbes(checkpoint) {
  const usage = checkpoint?.controlUsage?.["buildQueue.setData"];
  return Number(usage?.returned ?? 0) + Number(usage?.threw ?? 0);
}

function purchaseEvidence(checkpoint) {
  const owner = p53(checkpoint);
  const decision = owner?.ownerDecision?.decision;
  const revision = decision?.revision;
  const receiptEvents = p51(checkpoint)?.state?.events ?? [];
  const published = receiptEvents.find(
    (event) => event.kind === "receipt-published",
  );
  const consumed = receiptEvents.find(
    (event) => event.kind === "receipt-consumed",
  );
  const quarryActions = (p54(checkpoint)?.nativeInvocationPeriod ?? []).filter(
    (entry) =>
      entry.elementId === "city-rock_quarry" && entry.method === "action",
  );
  const request = P53_QUARRY_REQUEST;
  return {
    ownerDecision: {
      status: decision?.status ?? null,
      reason: decision?.reason ?? null,
      candidateKey: owner?.ownerDecision?.candidateKey ?? null,
      requestId: revision?.requestId ?? null,
      requestGeneration: revision?.requestGeneration ?? null,
      target: revision?.replacement?.name ?? null,
      displacedSavingTarget: revision?.previous?.name ?? null,
      lifetime: revision?.lifetime ?? null,
    },
    requestPermissions: {
      targetPermission: request.targetPermission,
      nativeExecutionPermission: request.nativeExecutionPermission,
      materialGatheringPermission: request.materialGatheringPermission,
      jobsAssignmentPermission: request.jobsAssignmentPermission,
      playerSelected: request.playerSelected,
      productionAuthorized: request.productionAuthorized,
      testAuthorization: request.testAuthorization,
    },
    quarryCount: checkpoint?.state?.buildings?.rock_quarry ?? 0,
    quarryActionCallsInPeriod: quarryActions.length,
    verifiedNativePostcondition:
      p51(checkpoint)?.p40QuarryPurchase?.output?.verifiedSuccess === true,
    receiptPublished: Boolean(published),
    receiptConsumed: Boolean(consumed),
    receiptCorrelation: {
      requestId: published?.receipt?.requestIdentity?.requestId ?? null,
      requestGeneration:
        published?.receipt?.requestIdentity?.generation ?? null,
      executionAuthority: consumed?.executionAuthority ?? null,
      p52Classification: p51(checkpoint)?.p52?.classification?.status ?? null,
    },
    nativeDebit:
      p51(checkpoint)?.p40QuarryPurchase?.output?.resourceDebit ?? null,
  };
}

function rootAndOwnerCosts(checkpoint) {
  const metrics = p54(checkpoint)?.metrics ?? {};
  return {
    eventFedActivation: metrics.eventFedActivation === true,
    runtimeEventFedActivation: metrics.runtimeEventFedActivation ?? null,
    constructionWorkCycles: metrics.constructionWorkCycles ?? 0,
    requestPresenceChecks: metrics.requestPresenceChecks ?? 0,
    localPendingRequestChecks: metrics.localPendingRequestChecks ?? 0,
    localPendingRequestCheckTotalMs:
      metrics.localPendingRequestCheckTotalMs ?? null,
    localPendingRequestCheckMaximumMs:
      metrics.localPendingRequestCheckMaximumMs ?? null,
    contextIdentitySamples: metrics.contextIdentitySamples ?? 0,
    contextRootObservations: metrics.contextRootObservations ?? 0,
    reservationEvidenceSamples: metrics.reservationEvidenceSamples ?? 0,
    reservationRootObservations: metrics.reservationRootObservations ?? 0,
    nativeControlAuthorityReads: metrics.nativeControlAuthorityReads ?? 0,
    nativeControlAuthorityRootObservations:
      metrics.nativeControlAuthorityRootObservations ?? 0,
    cumulativeSynchronousCostMs: metrics.cumulativeSynchronousCostMs ?? null,
    maximumMeasuredOperationMs: metrics.maximumMeasuredOperationMs ?? null,
    maximumEvidenceCallbackMs: metrics.maximumEvidenceCallbackMs ?? null,
    synchronousCostByOperation: metrics.synchronousCostByOperation ?? {},
    rootObservationCountAtCapture:
      p54(checkpoint)?.rootObservationCountAtCapture ?? null,
    retainedPendingRequestReferences: metrics.pendingRequestReferences ?? 0,
    maximumPendingRequestReferences:
      metrics.maximumPendingRequestReferences ?? 0,
    retainedOwnerCycleRequestReferences:
      metrics.ownerCycleRequestReferences ?? 0,
    maximumOwnerCycleRequestReferences:
      metrics.maximumOwnerCycleRequestReferences ?? 0,
    metricsEvidenceBytes: p54(checkpoint)?.metricsEvidenceBytes ?? null,
    requestLifecycle: {
      eventFeedEmissions: metrics.requestReplacementOrInstallEvents ?? 0,
      cancellations: metrics.requestCancellationEvents ?? 0,
      consumed: metrics.requestConsumedEvents ?? 0,
      expired: metrics.requestExpiredEvents ?? 0,
      invalidated: metrics.requestInvalidatedEvents ?? 0,
      feedSynchronousMs: metrics.eventFeedEmissionMs ?? null,
      feedMaximumMs: metrics.eventFeedEmissionMaximumMs ?? null,
    },
  };
}

export function createP54ConstructionAuthorityCostEvidence({
  A,
  B,
  C,
  D,
  DRepeat,
  gameSnapshotSha256,
  bundleSha256,
  replayHarnessSha256,
  sourceHashes,
  priorP42EvidenceSha256,
  baselineTunedFixturePresent,
}) {
  const arms = { A, B, C, D, "D-repeat": DRepeat };
  const checkpoints = Object.fromEntries(
    Object.entries(arms).map(([label, arm]) => [
      label,
      { p719: at(arm, 719), p720: at(arm, 720) },
    ]),
  );
  for (const [label, pair] of Object.entries(checkpoints)) {
    assert.ok(pair.p719, `${label} is missing p719`);
    assert.ok(pair.p720, `${label} is missing p720`);
  }

  const preInterventionReference = meaningfulCheckpoint(checkpoints.A.p719);
  const preInterventionComparisons = Object.fromEntries(
    Object.entries(checkpoints).map(([label, pair]) => [
      label,
      {
        exact: same(preInterventionReference, meaningfulCheckpoint(pair.p719)),
        stateEqual:
          same(checkpoints.A.p719.state, pair.p719.state) &&
          checkpoints.A.p719.saveSha256 === pair.p719.saveSha256,
        controlUseEqual: same(
          checkpoints.A.p719.controlUsage,
          pair.p719.controlUsage,
        ),
        orderedNativeInvocationHashEqual:
          p54(checkpoints.A.p719)?.nativeInvocationSequenceSha256 ===
          p54(pair.p719)?.nativeInvocationSequenceSha256,
        randomAndRngEqual:
          checkpoints.A.p719.randomCalls === pair.p719.randomCalls &&
          checkpoints.A.p719.rngState === pair.p719.rngState,
      },
    ]),
  );
  const preInterventionExact = Object.values(preInterventionComparisons).every(
    (comparison) => comparison.exact,
  );
  assert.ok(preInterventionExact, "all arms must exactly match at p719");

  const B720 = checkpoints.B.p720;
  const C720 = checkpoints.C.p720;
  const D720 = checkpoints.D.p720;
  const DRepeat720 = checkpoints["D-repeat"].p720;
  const BTraceSequence = p54(B720)?.nativeInvocationSequence ?? [];
  const CTraceSequence = p54(C720)?.nativeInvocationSequence ?? [];
  const BSequence = nativeApiSequence(B720);
  const CSequence = nativeApiSequence(C720);
  const DSequence = nativeApiSequence(D720);
  const DRepeatSequence = nativeApiSequence(DRepeat720);
  const BActions = actionInvocations(B720);
  const CActions = actionInvocations(C720);
  const DActions = actionInvocations(D720);
  const DRepeatActions = actionInvocations(DRepeat720);
  const BReadOnly = readOnlyInvocations(B720);
  const CReadOnly = readOnlyInvocations(C720);
  const priceProbeDelta = countPriceProbes(C720) - countPriceProbes(B720);
  const BCGameplayActionEquality = same(BActions, CActions);
  const BCNativeInvocationEquality = same(BSequence, CSequence);
  const BCFirstDifferentCall = sequenceDifference(B720, C720);
  const firstDivergenceIndex = BCFirstDifferentCall.firstDivergenceIndex;
  const CExtraPriceProbeIndices = [
    firstDivergenceIndex,
    firstDivergenceIndex + 1,
  ];
  const CMinusExtraCurrentPriceProbes = CSequence.filter(
    (_, index) => !CExtraPriceProbeIndices.includes(index),
  );
  const BCEqualAfterRemovingCurrentPriceProbes =
    priceProbeDelta === 2 &&
    CExtraPriceProbeIndices.length === 2 &&
    CExtraPriceProbeIndices.every(
      (index) => CSequence[index]?.period === 720,
    ) &&
    CSequence[firstDivergenceIndex]?.elementId === "buildQueue" &&
    CSequence[firstDivergenceIndex]?.method === "setData" &&
    CSequence[firstDivergenceIndex + 1]?.elementId === "buildQueue" &&
    CSequence[firstDivergenceIndex + 1]?.method === "setData" &&
    same(BSequence, CMinusExtraCurrentPriceProbes);
  const CSetData720 =
    (p54(C720)?.nativeInvocationPeriod ?? []).filter(
      (entry) => entry.elementId === "buildQueue" && entry.method === "setData",
    ).length / 2;
  const BSetData720 =
    (p54(B720)?.nativeInvocationPeriod ?? []).filter(
      (entry) => entry.elementId === "buildQueue" && entry.method === "setData",
    ).length / 2;

  const purchaseA = purchaseEvidence(checkpoints.A.p720);
  const purchaseB = purchaseEvidence(B720);
  const purchaseC = purchaseEvidence(C720);
  const purchaseD = purchaseEvidence(D720);
  const purchaseDRepeat = purchaseEvidence(DRepeat720);
  const DRepeatExact =
    same(DSequence, DRepeatSequence) &&
    same(DActions, DRepeatActions) &&
    checkpoints.D.p720.saveSha256 === checkpoints["D-repeat"].p720.saveSha256 &&
    same(checkpoints.D.p720.state, checkpoints["D-repeat"].p720.state) &&
    same(
      checkpoints.D.p720.controlUsage,
      checkpoints["D-repeat"].p720.controlUsage,
    ) &&
    checkpoints.D.p720.randomCalls ===
      checkpoints["D-repeat"].p720.randomCalls &&
    checkpoints.D.p720.rngState === checkpoints["D-repeat"].p720.rngState &&
    D.finalExportSha256 === DRepeat.finalExportSha256 &&
    same(D.finalRng, DRepeat.finalRng) &&
    same(purchaseD, purchaseDRepeat);
  assert.ok(DRepeatExact, "D and D-repeat must be deterministic");

  const P54DValid =
    purchaseD.ownerDecision.status === "accepted-for-owner-decision" &&
    purchaseD.ownerDecision.candidateKey ===
      P53_QUARRY_REQUEST.targetBuildingId &&
    purchaseD.ownerDecision.requestId === P53_QUARRY_REQUEST.requestId &&
    purchaseD.ownerDecision.requestGeneration ===
      P53_QUARRY_REQUEST.generation &&
    purchaseD.ownerDecision.lifetime === "this-construction-cycle" &&
    purchaseD.quarryCount === 1 &&
    purchaseD.quarryActionCallsInPeriod === 1 &&
    purchaseD.verifiedNativePostcondition &&
    purchaseD.receiptPublished &&
    purchaseD.receiptConsumed &&
    purchaseD.receiptCorrelation.requestId === P53_QUARRY_REQUEST.requestId &&
    purchaseD.receiptCorrelation.requestGeneration ===
      P53_QUARRY_REQUEST.generation &&
    purchaseD.requestPermissions.jobsAssignmentPermission === false &&
    purchaseD.requestPermissions.materialGatheringPermission === false;
  const rootCountDelta = (left, right) => {
    const l = p54(left)?.rootObservationCountAtCapture;
    const r = p54(right)?.rootObservationCountAtCapture;
    return Number.isSafeInteger(l) && Number.isSafeInteger(r) ? r - l : null;
  };
  const operationCosts = {
    dormant: rootAndOwnerCosts(checkpoints.A.p720),
    pending: rootAndOwnerCosts(checkpoints.C.p719),
    active: rootAndOwnerCosts(C720),
  };
  const p53Reported = {
    requestSourceLookupsThroughDecision:
      p53(C720)?.metrics?.requestSourceReads ?? null,
    requestSourceLookupsAtP719:
      p53(checkpoints.C.p719)?.metrics?.requestSourceReads ?? null,
    extraContextIdentitySamples:
      p53(C720)?.metrics?.contextIdentitySamples ?? null,
    p53ClaimedAttributedExtraRootObservations: 6,
    actualContextRootObservations:
      p54(C720)?.metrics?.contextRootObservations ?? null,
    actualReservationRootObservations:
      p54(C720)?.metrics?.reservationRootObservations ?? null,
    actualNativeControlAuthorityRootObservations:
      p54(C720)?.metrics?.nativeControlAuthorityRootObservations ?? null,
    requestScopedActualRootObservations:
      (p54(C720)?.metrics?.contextRootObservations ?? 0) +
      (p54(C720)?.metrics?.reservationRootObservations ?? 0) +
      (p54(C720)?.metrics?.nativeControlAuthorityRootObservations ?? 0),
    actualWholeRunRootObservationDeltaBtoC: rootCountDelta(B720, C720),
    reservationEvidenceSamples:
      p54(C720)?.metrics?.reservationEvidenceSamples ?? null,
    nativeControlAuthorityReads:
      p54(C720)?.metrics?.nativeControlAuthorityReads ?? null,
    currentNativePriceChecks:
      p54(C720)?.metrics?.nativeControlAuthorityReads ?? null,
    extraBuildQueueSetDataCallsBtoC: priceProbeDelta,
    rootClaimInstrumentationNote:
      "P53 exact runner added 2 per context sample without calling readRoot; P54 counts actual GameRootStateSource.readRoot invocations at the source callsite.",
  };

  const dormantMetrics = p54(checkpoints.A.p720)?.metrics ?? {};
  const pendingMetrics = p54(checkpoints.C.p719)?.metrics ?? {};
  const activeMetrics = p54(C720)?.metrics ?? {};
  const dormantNoRequestNativeObservations =
    (dormantMetrics.contextRootObservations ?? 0) === 0 &&
    (dormantMetrics.reservationRootObservations ?? 0) === 0 &&
    (dormantMetrics.nativeControlAuthorityRootObservations ?? 0) === 0 &&
    (dormantMetrics.reservationEvidenceSamples ?? 0) === 0 &&
    (dormantMetrics.nativeControlAuthorityReads ?? 0) === 0;
  const eventFedPrototypeActivated =
    (pendingMetrics.requestReplacementOrInstallEvents ?? 0) === 1 &&
    (pendingMetrics.maximumPendingRequestReferences ?? 0) === 1;
  const eventFedPrototypeConsumedAndReleased =
    (activeMetrics.requestConsumedEvents ?? 0) === 1 &&
    (activeMetrics.pendingRequestReferences ?? 0) === 0 &&
    (activeMetrics.ownerCycleRequestReferences ?? 0) === 1;

  const trace = {
    counts: {
      nativeApiCalls: { B: BSequence.length, C: CSequence.length },
      rawBridgeTraceRecords: {
        B: BTraceSequence.length,
        C: CTraceSequence.length,
      },
      nativeApiCallsAtP720: {
        B: (p54(B720)?.nativeInvocationPeriod ?? []).length / 2,
        C: (p54(C720)?.nativeInvocationPeriod ?? []).length / 2,
      },
      rawBridgeTraceRecordsAtP720: {
        B: (p54(B720)?.nativeInvocationPeriod ?? []).length,
        C: (p54(C720)?.nativeInvocationPeriod ?? []).length,
      },
    },
    totalNativeInvocationCounts: {
      B: BSequence.length,
      C: CSequence.length,
      deltaBtoC: CSequence.length - BSequence.length,
      rawBridgeTraceRecordsB: BTraceSequence.length,
      rawBridgeTraceRecordsC: CTraceSequence.length,
      rawBridgeRecordDelta: CTraceSequence.length - BTraceSequence.length,
    },
    completeOrderedSequenceSha256: {
      B: hashValue(BSequence),
      C: hashValue(CSequence),
      D: hashValue(DSequence),
      DRepeat: hashValue(DRepeatSequence),
    },
    completeOrderedNativeApiSequenceB: BSequence,
    completeOrderedNativeApiSequenceC: CSequence,
    rawOrderedBridgeTraceRecordsB: BTraceSequence,
    rawOrderedBridgeTraceRecordsC: CTraceSequence,
    BC: {
      equal: BCNativeInvocationEquality,
      gameplayMutatingNativeActionsEqual: BCGameplayActionEquality,
      readOnlyNativeProbeCounts: {
        B: BReadOnly.length,
        C: CReadOnly.length,
        delta: CReadOnly.length - BReadOnly.length,
      },
      orderedSequenceFirstDivergence: BCFirstDifferentCall,
      buildQueueSetData: {
        totalB: countPriceProbes(B720),
        totalC: countPriceProbes(C720),
        period720B: BSetData720,
        period720C: CSetData720,
        extraCalls: priceProbeDelta,
        extraCallEntries: CExtraPriceProbeIndices.map(
          (index) => CSequence[index],
        ),
        equalAfterRemovingTwoCurrentPriceProbes:
          BCEqualAfterRemovingCurrentPriceProbes,
        attribution:
          "The first divergence is two period-720 buildQueue.setData API calls immediately before city-rock_quarry.action; removing those two calls from the normalized C API sequence makes the remaining order equal to B.",
      },
      nativeExecutionOrder: {
        BGameplayActions: BActions,
        CGameplayActions: CActions,
        gameplayActionOrderEqual: BCGameplayActionEquality,
        p720BApiCalls: nativeApiSequence(B720).filter(
          (entry) => entry.period === 720,
        ),
        p720CApiCalls: nativeApiSequence(C720).filter(
          (entry) => entry.period === 720,
        ),
      },
      reservationAndPriceObservations: {
        constructionCompleteReservationSamplesB:
          p54(B720)?.metrics?.reservationEvidenceSamples ?? 0,
        constructionCompleteReservationSamplesC:
          p54(C720)?.metrics?.reservationEvidenceSamples ?? 0,
        currentPriceChecksB:
          p54(B720)?.metrics?.nativeControlAuthorityReads ?? 0,
        currentPriceChecksC:
          p54(C720)?.metrics?.nativeControlAuthorityReads ?? 0,
        extraBuildQueueSetDataApiCalls: priceProbeDelta,
        bothPriceChecksRemainInC:
          p54(C720)?.metrics?.nativeControlAuthorityReads === 2,
      },
      gameplayOutcome: {
        p720StateEqual: same(B720.state, C720.state),
        p720SaveEqual: B720.saveSha256 === C720.saveSha256,
        resourceStocksEqual: same(B720.state.resources, C720.state.resources),
        quarryCountB: purchaseB.quarryCount,
        quarryCountC: purchaseC.quarryCount,
        nativeDebitB: purchaseB.nativeDebit,
        nativeDebitC: purchaseC.nativeDebit,
        verifiedNativePostconditionB: purchaseB.verifiedNativePostcondition,
        verifiedNativePostconditionC: purchaseC.verifiedNativePostcondition,
        finalExportEqual: B.finalExportSha256 === C.finalExportSha256,
        finalExportSha256B: B.finalExportSha256,
        finalExportSha256C: C.finalExportSha256,
        finalRngEqual: same(B.finalRng, C.finalRng),
        finalRngB: B.finalRng,
        finalRngC: C.finalRng,
      },
    },
    eventFedPrototypeDiagnostic: {
      valid: P54DValid,
      repeatExact: DRepeatExact,
      ownerDecision: purchaseD.ownerDecision,
      adapterObservedEventFed:
        p54(D720)?.metrics?.constructionAdapterEventFedAtInitialization ?? null,
      runtimeLatchEventFed:
        p54(D720)?.metrics?.runtimeEventFedActivation ?? null,
      localPendingRequestChecks:
        p54(D720)?.metrics?.localPendingRequestChecks ?? null,
      nativeActionCalls: purchaseD.quarryActionCallsInPeriod,
      reason: purchaseD.ownerDecision.reason,
      statement:
        "D/D-repeat are rejected diagnostic attempts, not accepted treatment arms. The live Construction adapter did not observe event-fed mode and its owner decision failed closed on missing prior-publication identity.",
      fullSequenceD: DSequence,
      fullSequenceDRepeat: DRepeatSequence,
    },
    DRepeat: {
      exact: DRepeatExact,
      stateEqual:
        same(D720.state, DRepeat720.state) &&
        D720.saveSha256 === DRepeat720.saveSha256,
      controlUseEqual: same(D720.controlUsage, DRepeat720.controlUsage),
      invocationSequenceEqual: same(DSequence, DRepeatSequence),
      finalExportEqual: D.finalExportSha256 === DRepeat.finalExportSha256,
      rngEqual: same(D.finalRng, DRepeat.finalRng),
    },
    byArm: {
      A: {
        p719: meaningfulCheckpoint(checkpoints.A.p719),
        p720: meaningfulCheckpoint(checkpoints.A.p720),
      },
      B: {
        p719: meaningfulCheckpoint(checkpoints.B.p719),
        p720: meaningfulCheckpoint(B720),
      },
      C: {
        p719: meaningfulCheckpoint(checkpoints.C.p719),
        p720: meaningfulCheckpoint(C720),
      },
      D: {
        p719: meaningfulCheckpoint(checkpoints.D.p719),
        p720: meaningfulCheckpoint(D720),
      },
      DRepeat: {
        p719: meaningfulCheckpoint(checkpoints["D-repeat"].p719),
        p720: meaningfulCheckpoint(DRepeat720),
      },
    },
  };

  const decisionOutcome =
    P54DValid &&
    DRepeatExact &&
    BCGameplayActionEquality &&
    priceProbeDelta === 2 &&
    BCEqualAfterRemovingCurrentPriceProbes
      ? "A — Event-scoped activation improved"
      : "D — Invalid";

  return {
    schema: "p54-construction-authority-incremental-cost-v1",
    decision: {
      outcome: decisionOutcome,
      explanation: decisionOutcome.startsWith("A")
        ? "The test-only event-fed latch removes repeated test-hook property lookups while keeping Construction as the decision owner and keeping both current-price checks. Dormant request handling adds a measured local check but no request-specific native observation."
        : "The exact P53 control and purchase replay passed, but the event-fed D diagnostic did not reach the same owner authority: the active Construction adapter observed event-fed mode as false and rejected D as stale because it lacked the prior-publication identity. D/D-repeat reproduced that fail-closed result, so no activation improvement is claimed.",
      independentRendererCpuGate: "not-passed-by-this-experiment",
    },
    pinnedInputs: {
      game: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      gameSnapshotSha256,
      fixture: "p18-standard-human-fixture.txt",
      fixtureSha256:
        "2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684",
      baselineTunedFixturePresent,
      missingFixtureNote: baselineTunedFixturePresent
        ? null
        : "test-artifacts/benchmark/settings/baseline-tuned.json remains absent; no benchmark claim uses it.",
      seed: 44,
      epoch: "2026-09-21T00:00:00.000Z",
      bundleSha256,
      replayHarnessSha256,
      sourceHashes,
      preservedP42Evidence: {
        path: "experiments/p42-construction-priority-counterfactual-evidence.json",
        sha256: priorP42EvidenceSha256,
        rewritten: false,
      },
    },
    arms: {
      A: "Historical Farm-saving control, no request.",
      B: "Existing P42 external substitution reference.",
      C: "Existing P53 Construction-owned request lookup admission.",
      DDiagnostic:
        "Rejected exploratory event-fed attempt. It is not a controlled treatment because the Construction adapter did not observe event-fed mode and failed closed.",
      DRepeatDiagnostic:
        "Deterministic repeat of the rejected D diagnostic; no purchase occurred.",
    },
    preIntervention: {
      boundary:
        "p719, before the p719 request publication and p720 owner decision",
      exact: preInterventionExact,
      reference: preInterventionReference,
      comparisons: preInterventionComparisons,
    },
    P53MeasurementReconciliation: p53Reported,
    nativeTrace: trace,
    operationCost: {
      measurementClock: "performance.now() monotonic browser clock",
      timeResolutionPolicy:
        "Raw monotonic duration values are reported; a 0 ms reading is treated as below the observed clock resolution, not as zero work.",
      cases: {
        dormant: {
          arm: "A",
          metrics: operationCosts.dormant,
          requestPresenceLookups:
            p53(checkpoints.A.p720)?.metrics?.requestSourceReads ?? null,
          additionalNativeObservations: {
            requestSpecificRootReads: 0,
            reservationSamples: 0,
            nativeControlAuthorityReads: 0,
            nativePriceChecks: 0,
          },
          additionalNativeApiCalls: {
            readOnly: {},
            gameplayMutating: {},
          },
        },
        pending: {
          arm: "C at p719: exact request exists but its p720 scope has not been reached",
          metrics: {
            ...operationCosts.pending,
          },
          requestPresenceLookups:
            p53(checkpoints.C.p719)?.metrics?.requestSourceReads ?? null,
          cumulativeWorkCycles: pendingMetrics.constructionWorkCycles ?? null,
          additionalNativeApiCalls: {
            readOnly: {},
            gameplayMutating: {},
          },
        },
        active: {
          arm: "C at p720: accepted Construction decision through native action/postcondition",
          metrics: {
            ...operationCosts.active,
          },
          requestPresenceLookups:
            p53(C720)?.metrics?.requestSourceReads ?? null,
          constructionWorkCycles: activeMetrics.constructionWorkCycles ?? null,
          incrementalAuthorityPriceChecks: 2,
          additionalNativeApiCalls: {
            readOnly: { "buildQueue.setData": 2 },
            gameplayMutating: { "city-rock_quarry.action": 1 },
            comparison:
              "The Quarry action is also present once in B; only the two read-only price calls increase the B-to-C native trace.",
          },
          nativeQuarryActionAndDebit: purchaseC.nativeDebit,
        },
        rejectedEventFedDiagnostic: {
          arm: "D and D-repeat",
          adapterObservedEventFed:
            p54(D720)?.metrics?.constructionAdapterEventFedAtInitialization ??
            null,
          runtimeLatchEventFed:
            p54(D720)?.metrics?.runtimeEventFedActivation ?? null,
          localPendingRequestChecks:
            p54(D720)?.metrics?.localPendingRequestChecks ?? null,
          ownerDecision: purchaseD.ownerDecision,
          purchaseOccurred: purchaseD.quarryCount === 1,
          repeatExact: DRepeatExact,
        },
      },
      conservativePerRequestEstimate: {
        status: "not-supported-by-clock-resolution",
        observedCumulativeSynchronousCostMs:
          activeMetrics.cumulativeSynchronousCostMs ?? null,
        observedMaximumOperationMs:
          activeMetrics.maximumMeasuredOperationMs ?? null,
        observedMaximumCallbackMs:
          activeMetrics.maximumEvidenceCallbackMs ?? null,
        basis:
          "The measured operation counts are reported, but this replay's synchronous duration readings are below the observed performance.now resolution. No CPU-cost estimate is extrapolated from the 0 ms readings.",
      },
      lifecycle: {
        existingProductionEventSource:
          "none suitable for explicit opt-in Construction request delivery was found",
        exactEventIdentity:
          "P53 test hook keeps exact request identity; D did not successfully deliver it to the active Construction adapter",
        cancellationReplacementAndExpiry:
          "P53 test-hook behavior remains; no production event feed was added",
        rootInvalidation:
          "P53 owner still fails closed on captured root/progression identity changes",
        retainedMutableGameRoot: false,
        newTimer: false,
        allocatorListener: false,
        additionalDomObservation: false,
        repeatedCatalogOrPriceScan: false,
        postConsumptionChecks:
          "No P54 event-fed activation was accepted. Current P53 test-hook lookup still runs at each existing Construction boundary after cancellation or purchase, including when no request is present; these are local property reads, with no request polling timer or extra native observation.",
      },
    },
    staticCallsiteAttribution: [
      {
        operation: "request-presence lookup / local pending check",
        owner: "Construction",
        sourceCallsites: [
          "src/adapters/evolve/progression/construction/captured-construction.ts:readTargetAdmissionRequest (cycle start, decision re-read, next-cycle publication, execution revalidation)",
          "src/bootstrap/captured-runtime-control.ts:constructionTargetAdmissionForTest.readRequest",
        ],
        ordinaryConstructionRequired: false,
        P53NativeObservation: false,
        P53ValueAccess: "test-hook object/property lookup; no root or DOM read",
        canTriggerNativeCatalogOrPriceWork: false,
        freshnessPurpose:
          "cancellation/replacement and exact identity at decision/execution",
        equivalentAuthorityGenerationAvailable: false,
        P54ValueAccess:
          "D did not reach this path; the measured source lookups remain P53 test-hook property reads",
      },
      {
        operation: "context identity sample",
        owner: "Construction request authority",
        sourceCallsites: [
          "src/adapters/evolve/progression/construction/captured-construction.ts:cycle-start, next-cycle finish, execution revalidation",
          "src/bootstrap/captured-runtime-control.ts:constructionTargetAdmissionForTest.readContext",
          "src/adapters/evolve/progression-epoch.ts:readProgressionEpoch",
        ],
        ordinaryConstructionRequired: false,
        nativeObservation:
          "one actual rootState.readRoot per context sample; readRootGeneration is a local generation-counter read",
        canTriggerNativeCatalogOrPriceWork: false,
        freshnessPurpose:
          "current root and progression identity for admission/execution",
        equivalentAuthorityGenerationAvailable: false,
      },
      {
        operation: "complete reservation evidence",
        owner: "Construction owner admission through P41 conflict reader",
        sourceCallsites: [
          "src/adapters/evolve/progression/construction/captured-construction.ts:decideTargetAdmission",
          "src/adapters/evolve/captured-cost-conflict.ts:readReservationEvidence",
          "src/adapters/evolve/captured-queue-reservations.ts:readReservations",
        ],
        ordinaryConstructionRequired: false,
        nativeObservation:
          "current queue/root reservation read plus script saving reservation",
        canTriggerNativeCatalogOrPriceWork:
          "yes if queued items require current prices; offered-tech catalog only when queued research needs it",
        freshnessPurpose: "P41 fail-closed conflict/reservation authority",
        equivalentAuthorityGenerationAvailable: false,
      },
      {
        operation: "current native price and control authority",
        owner:
          "Construction owner admission, then Construction execution revalidation",
        sourceCallsites: [
          "src/adapters/evolve/progression/construction/captured-construction.ts:decideTargetAdmission and executeClick",
          "src/adapters/evolve/progression/build/captured-build.ts:readActionAuthority",
          "src/adapters/evolve/captured-action-costs.ts:readCost / probePrice",
        ],
        ordinaryConstructionRequired: false,
        nativeObservation:
          "fresh buildQueue.setData call that computes the native action price, with local control generation resolution",
        canTriggerNativeCatalogOrPriceWork: true,
        freshnessPurpose:
          "verify the admitted cost and then revalidate the current price immediately before native execution",
        equivalentAuthorityGenerationAvailable: false,
        minimumObservedCallsPerPurchase: 2,
        retained: true,
      },
      {
        operation: "native Quarry action and postcondition",
        owner: "Construction executor and captured Build postcondition",
        sourceCallsites: [
          "src/adapters/evolve/progression/build/captured-build.ts:execute",
          "src/adapters/evolve/progression/construction/captured-construction.ts:executeClick",
        ],
        ordinaryConstructionRequired: true,
        nativeObservation:
          "native action followed by fresh root/count/queue postcondition reads",
        canTriggerNativeCatalogOrPriceWork: false,
        freshnessPurpose:
          "same native executor and verified purchase/debit authority as P53",
        equivalentAuthorityGenerationAvailable: false,
      },
    ],
    acceptance: {
      noRequestAdditionalNativeObservations: dormantNoRequestNativeObservations,
      minimumUnavoidableLocalActivationCheck: {
        hypothesizedChecksAtExistingBoundary: 1,
        measuredChecks: p54(D720)?.metrics?.localPendingRequestChecks ?? null,
        measuredTotalMs:
          p54(D720)?.metrics?.localPendingRequestCheckTotalMs ?? null,
        measuredMaximumMs:
          p54(D720)?.metrics?.localPendingRequestCheckMaximumMs ?? null,
        status:
          "not-measured: D's live adapter did not select the event-fed local-check path",
      },
      requiredNativeObservationsWhenExecuting: {
        reservationEvidenceSamples:
          p54(C720)?.metrics?.reservationEvidenceSamples ?? null,
        nativeControlAuthorityReads:
          p54(C720)?.metrics?.nativeControlAuthorityReads ?? null,
        actualBuildQueueSetDataCallsForAuthority:
          p54(C720)?.metrics?.nativeControlAuthorityReads ?? null,
        totalBuildQueueSetDataCallsAtP720: CSetData720,
        actualRootReadsByOperation: {
          context: p54(C720)?.metrics?.contextRootObservations ?? null,
          reservations: p54(C720)?.metrics?.reservationRootObservations ?? null,
          controlAndPrice:
            p54(C720)?.metrics?.nativeControlAuthorityRootObservations ?? null,
        },
      },
      bothBuildQueueSetDataCallsNecessary:
        "Yes. P53's admission and execution independently verify the current native price; both were retained and C still produced the verified Quarry purchase. The two calls are the two extra buildQueue.setData API calls visible against B.",
      requestInvalidationWithoutNativeScan: true,
      compilesOutWhenFeatureDisabled: true,
      independentRendererCpuAcceptance: {
        status: "blocked",
        requirement: "<=2% renderer CPU overhead",
        evidence:
          "P46's paired renderer comparison could not reliably resolve 2%; this replay does not rerun or reinterpret it.",
        productionAdmission: "not approved by P54",
      },
      futureMeasurementNeeded:
        "A reproducible renderer-level CPU acceptance method with enough precision to resolve the ≤2% bound, measured against a representative workload and a defined opt-in state.",
    },
    limitations: {
      testHookIsPlayerAuthorization: false,
      productionSettingsUiAdded: false,
      existingProductionLifecycleForPlayerOptIn:
        "No existing user-facing request lifecycle was found. D's test-only event sink did not reach the active Construction adapter, so a future event-fed opt-in requires a concrete product event source and owner-scoped delivery before production admission.",
      retainedMissingBaselineFixture: !baselineTunedFixturePresent,
      campaignBoundary: 720,
      gatherActionsAdded: 0,
      workforceAssignmentsChanged: false,
      jobsAssignmentExecutionAdded: false,
      jobsFoodStockCalibrationBlocker:
        "P45 Food-stock calibration failure remains a separate safety blocker.",
    },
  };
}
