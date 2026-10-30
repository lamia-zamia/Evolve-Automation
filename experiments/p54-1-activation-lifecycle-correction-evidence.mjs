import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { P53_QUARRY_REQUEST } from "./p53-construction-owned-target-authority-contract.mjs";

const at = (arm, period) =>
  arm?.checkpoints?.find((checkpoint) => checkpoint.period === period);
const owner = (checkpoint) => checkpoint?.native?.p51?.p53;
const metrics = (checkpoint) => checkpoint?.p54?.metrics ?? {};
export function nativeTraceCalls(trace) {
  assert.equal(trace.length % 2, 0, "native trace must contain call pairs");
  const calls = [];
  for (let index = 0; index < trace.length; index += 2) {
    const call = trace[index];
    const result = trace[index + 1];
    assert.ok(
      call.order === index &&
        result.order === index + 1 &&
        call.period === result.period &&
        call.elementId === result.elementId &&
        call.method === result.method,
      `native trace pair ${index / 2} must identify one native call`,
    );
    const { order: _order, ...normalized } = call;
    calls.push(normalized);
  }
  return calls;
}

export function countNativeTraceCalls(trace, matches = () => true) {
  const calls = nativeTraceCalls(trace);
  const rawTraceRows = trace.filter(matches).length;
  const nativeApiInvocations = calls.filter(matches).length;
  assert.equal(
    rawTraceRows,
    nativeApiInvocations * 2,
    "each counted native API invocation must have two matching trace rows",
  );
  return { rawTraceRows, nativeApiInvocations };
}

const nativeCalls = (checkpoint) =>
  nativeTraceCalls(checkpoint?.p54?.nativeInvocationSequence ?? []);
const relevantNativeCalls = (checkpoint) =>
  nativeCalls(checkpoint)
    .filter(
      (entry) =>
        /^civ-/.test(entry.elementId ?? "") ||
        (entry.method === "action" &&
          (/^(undefined-food|city-lumber|undefined-stone)$/.test(
            entry.elementId ?? "",
          ) ||
            /^(tech-|city-)/.test(entry.elementId ?? ""))),
    )
    .map(({ period, elementId, method }) => ({
      period,
      elementId,
      method,
    }));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const hashValue = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf16le");

function decisionOf(checkpoint) {
  const decision = owner(checkpoint)?.ownerDecision?.decision;
  const revision = decision?.revision;
  return {
    status: decision?.status ?? null,
    reason: decision?.reason ?? null,
    candidateKey: owner(checkpoint)?.ownerDecision?.candidateKey ?? null,
    requestId: revision?.requestId ?? null,
    requestGeneration: revision?.requestGeneration ?? null,
    displacedTarget: revision?.previous?.name ?? null,
    displacedCost: revision?.previous?.cost ?? null,
    target: revision?.replacement?.name ?? null,
    workCycleId: revision?.workCycleId ?? null,
    orderingGeneration: revision?.orderingGeneration ?? null,
    lifetime: revision?.lifetime ?? null,
  };
}

function purchaseOf(checkpoint) {
  const p51 = checkpoint?.native?.p51;
  const purchase = p51?.p40QuarryPurchase;
  const events = p51?.state?.events ?? [];
  const published = events.find((event) => event.kind === "receipt-published");
  const consumed = events.find((event) => event.kind === "receipt-consumed");
  const fullCalls = nativeCalls(checkpoint);
  return {
    decision: decisionOf(checkpoint),
    quarryCount: checkpoint?.state?.buildings?.rock_quarry ?? 0,
    quarryActionCalls: fullCalls.filter(
      (entry) =>
        entry.period === 720 &&
        entry.elementId === "city-rock_quarry" &&
        entry.method === "action",
    ).length,
    verifiedPostcondition: purchase?.output?.verifiedSuccess === true,
    resourceDebit: purchase?.output?.resourceDebit ?? null,
    receiptPublished: Boolean(published),
    receiptConsumed: Boolean(consumed),
    receipt: consumed
      ? {
          status: consumed.status,
          executionAuthority: consumed.executionAuthority ?? null,
          requestId: published?.receipt?.requestIdentity?.requestId ?? null,
          requestGeneration:
            published?.receipt?.requestIdentity?.generation ?? null,
          p52Classification: p51?.p52?.classification?.status ?? null,
        }
      : null,
  };
}

function preIntervention(checkpoint) {
  return {
    period: checkpoint?.period,
    saveSha256: checkpoint?.saveSha256,
    state: checkpoint?.state,
    controlUsage: checkpoint?.controlUsage,
    gameplayActions: relevantNativeCalls(checkpoint),
    nativeTraceSha256: checkpoint?.p54?.nativeInvocationSequenceSha256,
    randomCalls: checkpoint?.randomCalls,
    rngState: checkpoint?.rngState,
  };
}

function activationSamples(checkpoint) {
  return metrics(checkpoint).activationModeSamples ?? [];
}

function sampleAt(checkpoint, boundary, workCycleId) {
  return activationSamples(checkpoint).find(
    (sample) =>
      sample.boundary === boundary && sample.workCycleId === workCycleId,
  );
}

function lifecycleCost(checkpoint, reference) {
  const m = metrics(checkpoint);
  const samples = activationSamples(checkpoint);
  const rootCount = checkpoint?.p54?.rootObservationCountAtCapture;
  const referenceRootCount = reference?.p54?.rootObservationCountAtCapture;
  const requestBytes = bytes(P53_QUARRY_REQUEST);
  const activationBytes = bytes(samples);
  const publicationSamples = m.publicationAuthoritySamples ?? [];
  const requestEvents = m.requestLifecycleSamples ?? [];
  return {
    localPendingRequestChecks: m.localPendingRequestChecks ?? 0,
    requestPresenceChecks: m.requestPresenceChecks ?? 0,
    p53PropertyReads: owner(checkpoint)?.metrics?.requestSourceReads ?? 0,
    requestDelivery: {
      installEvents: m.requestReplacementOrInstallEvents ?? 0,
      consumedEvents: m.requestConsumedEvents ?? 0,
      expiredEvents: m.requestExpiredEvents ?? 0,
      invalidatedEvents: m.requestInvalidatedEvents ?? 0,
      events: requestEvents,
      emissionTotalMs: m.eventFeedEmissionMs ?? 0,
      emissionMaximumMs: m.eventFeedEmissionMaximumMs ?? 0,
      retainedPendingRequestReferences: m.pendingRequestReferences ?? 0,
      maximumPendingRequestReferences: m.maximumPendingRequestReferences ?? 0,
    },
    publicationAuthorityCapture: {
      samples: publicationSamples,
      cycle89:
        publicationSamples.find(
          (sample) => sample.constructionWorkCycleId === 89,
        ) ?? null,
    },
    executionRevalidation: {
      adapterBoundarySamples: samples.filter(
        (sample) => sample.boundary === "execution-revalidation",
      ),
      nativeControlAuthorityReads: m.nativeControlAuthorityReads ?? 0,
      nativePriceProbes: m.nativePriceProbeCalls ?? 0,
    },
    actualAdditionalRootObservations: {
      context: m.contextRootObservations ?? 0,
      reservations: m.reservationRootObservations ?? 0,
      nativePriceAndControl: m.nativeControlAuthorityRootObservations ?? 0,
      runtimeTotalVsA:
        Number.isSafeInteger(rootCount) &&
        Number.isSafeInteger(referenceRootCount)
          ? rootCount - referenceRootCount
          : null,
      source:
        "GameRootStateSource.readRoot call counter plus per-operation deltas",
    },
    reservationEvidenceReads: m.reservationEvidenceSamples ?? 0,
    nativePriceProbeCalls: m.nativePriceProbeCalls ?? 0,
    buildQueueSetDataControlUsage:
      checkpoint?.controlUsage?.["buildQueue.setData"] ?? null,
    p53CurrentPriceCheckInvocations: m.nativePriceProbeCalls ?? 0,
    buildQueueSetDataAtP720: countNativeTraceCalls(
      checkpoint?.p54?.nativeInvocationSequence ?? [],
      (entry) =>
        entry.period === 720 &&
        entry.elementId === "buildQueue" &&
        entry.method === "setData",
    ),
    retainedBytes: {
      requestJsonUtf16: requestBytes,
      activationModeSamplesUtf16: activationBytes,
      publicationAuthoritySamplesUtf16: bytes(publicationSamples),
      requestLifecycleSamplesUtf16: bytes(requestEvents),
      p54MetricsEvidence: checkpoint?.p54?.metricsEvidenceBytes ?? null,
      p53OwnerEvents: checkpoint?.native?.p51?.p53?.eventBytes ?? 0,
    },
    clock: {
      cumulativeSynchronousMs: m.cumulativeSynchronousCostMs ?? null,
      maximumOperationMs: m.maximumMeasuredOperationMs ?? null,
      maximumEvidenceCallbackMs: m.maximumEvidenceCallbackMs ?? null,
      resolution: "0 ms readings are below observed performance.now resolution",
    },
  };
}

export function createP541ActivationLifecycleEvidence({
  A,
  C,
  DEarly,
  DEarlyRepeat,
  DLate,
  gameSnapshotSha256,
  bundleSha256,
  replayHarnessSha256,
  sourceHashes,
  priorP42EvidenceSha256,
  baselineTunedFixturePresent,
}) {
  const arms = {
    A,
    C,
    "D-early": DEarly,
    "D-early-repeat": DEarlyRepeat,
    "D-late": DLate,
  };
  const checkpoints = Object.fromEntries(
    Object.entries(arms).map(([name, arm]) => [
      name,
      Object.fromEntries(
        [700, 719, 720].map((period) => [period, at(arm, period)]),
      ),
    ]),
  );
  for (const [name, periods] of Object.entries(checkpoints))
    for (const period of [719, 720])
      assert.ok(periods[period], `${name} is missing p${period}`);

  const preReference = preIntervention(checkpoints.A[719]);
  const preInterventionComparisons = Object.fromEntries(
    Object.entries(checkpoints).map(([name, periods]) => [
      name,
      {
        exact: same(preReference, preIntervention(periods[719])),
        gameplayActionsEqual: same(
          relevantNativeCalls(checkpoints.A[719]),
          relevantNativeCalls(periods[719]),
        ),
        nativeTraceEqual:
          checkpoints.A[719].p54?.nativeInvocationSequenceSha256 ===
          periods[719].p54?.nativeInvocationSequenceSha256,
      },
    ]),
  );
  const preInterventionExact = Object.values(preInterventionComparisons).every(
    (comparison) => comparison.exact,
  );
  assert.ok(preInterventionExact, "all arms must match exactly before p720");

  const A720 = checkpoints.A[720];
  const C720 = checkpoints.C[720];
  const DEarly720 = checkpoints["D-early"][720];
  const DEarlyRepeat720 = checkpoints["D-early-repeat"][720];
  const DLate720 = checkpoints["D-late"][720];
  const ACalls = nativeCalls(A720);
  const CCalls = nativeCalls(C720);
  const DEarlyCalls = nativeCalls(DEarly720);
  const DEarlyRepeatCalls = nativeCalls(DEarlyRepeat720);
  const DLateCalls = nativeCalls(DLate720);
  const gameplayActions = Object.fromEntries(
    Object.entries({
      A: ACalls,
      C: CCalls,
      "D-early": DEarlyCalls,
      "D-early-repeat": DEarlyRepeatCalls,
      "D-late": DLateCalls,
    }).map(([name, calls]) => [
      name,
      calls.filter((entry) => entry.method === "action"),
    ]),
  );
  const p720GameplayActions = Object.fromEntries(
    Object.entries({
      A: ACalls,
      C: CCalls,
      "D-early": DEarlyCalls,
      "D-early-repeat": DEarlyRepeatCalls,
      "D-late": DLateCalls,
    }).map(([name, calls]) => [
      name,
      calls.filter(
        (entry) => entry.period === 720 && entry.method === "action",
      ),
    ]),
  );
  const purchaseA = purchaseOf(A720);
  const purchaseC = purchaseOf(C720);
  const purchaseDEarly = purchaseOf(DEarly720);
  const purchaseDEarlyRepeat = purchaseOf(DEarlyRepeat720);
  const purchaseDLate = purchaseOf(DLate720);
  const p53DecisionEquivalent = same(
    purchaseC.decision,
    purchaseDEarly.decision,
  );
  const debitEquivalent = same(
    purchaseC.resourceDebit,
    purchaseDEarly.resourceDebit,
  );
  const earlyRepeatExact =
    same(DEarlyCalls, DEarlyRepeatCalls) &&
    same(gameplayActions["D-early"], gameplayActions["D-early-repeat"]) &&
    DEarly720.saveSha256 === DEarlyRepeat720.saveSha256 &&
    same(DEarly720.state, DEarlyRepeat720.state) &&
    same(DEarly720.controlUsage, DEarlyRepeat720.controlUsage) &&
    DEarly720.randomCalls === DEarlyRepeat720.randomCalls &&
    DEarly720.rngState === DEarlyRepeat720.rngState &&
    DEarly.finalExportSha256 === DEarlyRepeat.finalExportSha256 &&
    same(DEarly.finalRng, DEarlyRepeat.finalRng) &&
    same(purchaseDEarly, purchaseDEarlyRepeat);
  assert.ok(earlyRepeatExact, "D-early repeat must match exactly");

  const earlySamples = activationSamples(DEarly720);
  const lateSamples = activationSamples(DLate720);
  const earlyDelivery = metrics(DEarly720).requestLifecycleSamples?.[0] ?? null;
  const lateDelivery = metrics(DLate720).requestLifecycleSamples?.[0] ?? null;
  const earlyPublication = metrics(DEarly720).publicationAuthoritySamples?.find(
    (sample) => sample.constructionWorkCycleId === 89,
  );
  const latePublication = metrics(DLate720).publicationAuthoritySamples?.find(
    (sample) => sample.constructionWorkCycleId === 89,
  );
  const earlyModeAtPublication = sampleAt(DEarly720, "publication-finish", 89);
  const earlyModeAtCycle90 = sampleAt(DEarly720, "cycle-begin", 90);
  const earlyModeAtAdmission = sampleAt(DEarly720, "admission", 90);
  const lateModeAtPublication = sampleAt(DLate720, "publication-finish", 89);
  const lateModeAtCycle90 = sampleAt(DLate720, "cycle-begin", 90);
  const lateModeAtAdmission = sampleAt(DLate720, "admission", 90);
  const modeConfigured =
    earlySamples.find((sample) => sample.boundary === "runtime-configured")
      ?.eventFed === true &&
    earlySamples.find((sample) => sample.boundary === "adapter-created")
      ?.eventFed === false &&
    metrics(DEarly720).constructionAdapterEventFedAtInitialization === false;
  const earlyAuthorityCaptured =
    earlyDelivery?.period === 700 &&
    Number.isSafeInteger(earlyModeAtPublication?.period) &&
    earlyModeAtPublication.period > earlyDelivery.period &&
    earlyPublication?.capturedContextPeriod < P53_QUARRY_REQUEST.scope.period &&
    earlyPublication?.requestId === P53_QUARRY_REQUEST.requestId &&
    earlyPublication?.requestGeneration === P53_QUARRY_REQUEST.generation &&
    earlyPublication?.nextWorkCycleId === 90 &&
    Number.isSafeInteger(earlyPublication?.capturedRootGeneration) &&
    typeof earlyPublication?.capturedProgressionGeneration === "string" &&
    earlyModeAtPublication?.eventFed === true &&
    earlyModeAtPublication?.requestId === P53_QUARRY_REQUEST.requestId &&
    earlyModeAtPublication?.requestSourceIdentityMatches === true &&
    earlyModeAtCycle90?.eventFed === true &&
    earlyModeAtCycle90?.requestId === P53_QUARRY_REQUEST.requestId &&
    earlyModeAtCycle90?.requestSourceIdentityMatches === true &&
    earlyModeAtAdmission?.eventFed === true &&
    earlyModeAtAdmission?.requestId === P53_QUARRY_REQUEST.requestId &&
    earlyModeAtAdmission?.requestSourceIdentityMatches === true;
  const lateRejectedForPublicationTiming =
    lateDelivery?.period === 719 &&
    Number.isSafeInteger(lateModeAtPublication?.period) &&
    lateDelivery.period > lateModeAtPublication.period &&
    latePublication?.requestId === null &&
    latePublication?.capturedRootGeneration === null &&
    latePublication?.capturedProgressionGeneration === null &&
    lateModeAtPublication?.requestId === null &&
    lateModeAtCycle90?.eventFed === true &&
    lateModeAtCycle90?.requestId === P53_QUARRY_REQUEST.requestId &&
    lateModeAtCycle90?.requestSourceIdentityMatches === true &&
    lateModeAtAdmission?.requestSourceIdentityMatches === true &&
    purchaseDLate.decision.status === "stale" &&
    purchaseDLate.decision.reason ===
      "construction-publication-identity-mismatch";

  const jobsAssignmentCalls = (calls) =>
    calls.filter(
      (entry) =>
        /^civ-/.test(entry.elementId ?? "") &&
        (entry.method === "setDefault" || entry.method === "action"),
    );
  const jobsAssignmentsUnchanged =
    same(jobsAssignmentCalls(CCalls), jobsAssignmentCalls(DEarlyCalls)) &&
    same(
      jobsAssignmentCalls(DEarlyCalls),
      jobsAssignmentCalls(DEarlyRepeatCalls),
    ) &&
    same(jobsAssignmentCalls(DLateCalls), jobsAssignmentCalls(ACalls)) &&
    same(C720.state.jobs, DEarly720.state.jobs) &&
    same(DEarly720.state.jobs, DEarlyRepeat720.state.jobs) &&
    same(DLate720.state.jobs, A720.state.jobs);
  const p51JobsObservationOnly = [
    C720,
    DEarly720,
    DEarlyRepeat720,
    DLate720,
  ].every((checkpoint) =>
    (checkpoint.native.p51.jobsAdmissions ?? []).every(
      (entry) =>
        entry.admission?.executionAuthority === "none" &&
        entry.admission?.status === "admitted-for-observation",
    ),
  );
  const nativeJobControlCallsComparedWithA = jobsAssignmentCalls(CCalls).filter(
    (entry) => !jobsAssignmentCalls(ACalls).some((base) => same(base, entry)),
  );
  const noExtraGatherActions = [
    C720,
    DEarly720,
    DEarlyRepeat720,
    DLate720,
  ].every(
    (checkpoint) =>
      checkpoint.native.p51.p36GatherActions ===
        A720.native.p51.p36GatherActions &&
      checkpoint.native.p51.p38GatherActions ===
        A720.native.p51.p38GatherActions,
  );
  const p52Receipt = purchaseDEarly.receipt;
  const p52HistoricalCorrelation =
    p52Receipt?.status === "correlated-owner-event" &&
    p52Receipt.executionAuthority === "none" &&
    p52Receipt.requestId === P53_QUARRY_REQUEST.requestId &&
    p52Receipt.requestGeneration === P53_QUARRY_REQUEST.generation;
  const earlyCycle89SavingTarget =
    checkpoints["D-early"][719].native.p51.constructionPublicationTarget ??
    null;
  const controlCycle89SavingTarget =
    checkpoints.A[719].native.p51.constructionPublicationTarget ?? null;
  const controlPublication = metrics(
    checkpoints.A[719],
  ).publicationAuthoritySamples?.find(
    (sample) => sample.constructionWorkCycleId === 89,
  );
  const earlyCompletedIntentKeys =
    earlyPublication?.completedIntentCandidateKeys ?? [];
  const controlCompletedIntentKeys =
    controlPublication?.completedIntentCandidateKeys ?? [];
  const ordinaryFarmIntentPreserved =
    purchaseDEarly.decision.displacedTarget === "city-farm" &&
    same(purchaseDEarly.decision.displacedCost, {
      Lumber: 27,
      Stone: 14,
    }) &&
    purchaseC.decision.displacedTarget === "city-farm" &&
    earlyCompletedIntentKeys.includes("city-farm") &&
    same(earlyCompletedIntentKeys, controlCompletedIntentKeys) &&
    same(earlyCycle89SavingTarget, controlCycle89SavingTarget);
  const externalP42ReservationReads =
    DEarly720.native.p51.instrumentationMetrics?.p42AppliedReservationReads ??
    null;
  const externalP42ReservationUnused =
    DEarly720.native.p51.p42OwnerCycleApplied === false &&
    externalP42ReservationReads === 0;
  const setDataAtP720 = Object.fromEntries(
    Object.entries({
      A: A720,
      C: C720,
      "D-early": DEarly720,
      "D-early-repeat": DEarlyRepeat720,
      "D-late": DLate720,
    }).map(([name, checkpoint]) => [
      name,
      countNativeTraceCalls(
        checkpoint.p54?.nativeInvocationSequence ?? [],
        (entry) =>
          entry.period === 720 &&
          entry.elementId === "buildQueue" &&
          entry.method === "setData",
      ),
    ]),
  );
  const cAndEarlyPriceChecks = {
    C: metrics(C720).nativePriceProbeCalls ?? 0,
    "D-early": metrics(DEarly720).nativePriceProbeCalls ?? 0,
    buildQueueSetDataAtP720: {
      C: setDataAtP720.C,
      "D-early": setDataAtP720["D-early"],
    },
  };
  const quarryConflictPlan = (checkpoint) =>
    checkpoint.native.p51.p40ConstructionEvents?.find(
      (event) =>
        event.type === "build-conflict-plan" &&
        event.input?.candidateKey === "city-rock_quarry",
    ) ?? null;
  const cAndEarlyOwnerAndDebit =
    purchaseC.decision.status === "accepted-for-owner-decision" &&
    purchaseDEarly.decision.status === "accepted-for-owner-decision" &&
    p53DecisionEquivalent &&
    debitEquivalent &&
    purchaseDEarly.quarryCount === 1 &&
    purchaseDEarly.quarryActionCalls === 1 &&
    purchaseDEarly.verifiedPostcondition &&
    cAndEarlyPriceChecks.C === 2 &&
    cAndEarlyPriceChecks["D-early"] === 2 &&
    cAndEarlyPriceChecks.buildQueueSetDataAtP720.C.nativeApiInvocations ===
      cAndEarlyPriceChecks.buildQueueSetDataAtP720["D-early"]
        .nativeApiInvocations &&
    cAndEarlyPriceChecks.buildQueueSetDataAtP720.C.nativeApiInvocations ===
      52 &&
    (metrics(C720).reservationEvidenceSamples ?? 0) > 0 &&
    (metrics(DEarly720).reservationEvidenceSamples ?? 0) > 0 &&
    ordinaryFarmIntentPreserved &&
    externalP42ReservationUnused;
  const lateNativeStatePreserved =
    same(DLate720.state, A720.state) &&
    DLate720.saveSha256 === A720.saveSha256 &&
    same(gameplayActions["D-late"], gameplayActions.A) &&
    purchaseDLate.quarryActionCalls === 0 &&
    purchaseDLate.quarryCount === purchaseA.quarryCount;
  const acceptedEarly =
    modeConfigured &&
    earlyAuthorityCaptured &&
    cAndEarlyOwnerAndDebit &&
    earlyRepeatExact &&
    jobsAssignmentsUnchanged &&
    p51JobsObservationOnly &&
    noExtraGatherActions &&
    p52HistoricalCorrelation;
  const earlyEventSourceFailure =
    earlyDelivery?.requestId !== P53_QUARRY_REQUEST.requestId ||
    [earlyModeAtPublication, earlyModeAtCycle90, earlyModeAtAdmission].some(
      (sample) =>
        sample?.eventFed !== true ||
        sample.requestSource !== "runtime-event-latch" ||
        sample.requestSourceIdentityMatches !== true,
    );
  const decisionOutcome =
    acceptedEarly &&
    lateRejectedForPublicationTiming &&
    lateNativeStatePreserved
      ? "A — Timing defect confirmed and bounded prototype corrected"
      : earlyEventSourceFailure
        ? "C — Independent event-delivery defect"
        : "D — Invalid";
  const armCosts = {
    A: lifecycleCost(A720, A720),
    C: lifecycleCost(C720, A720),
    "D-early": lifecycleCost(DEarly720, A720),
    "D-early-repeat": lifecycleCost(DEarlyRepeat720, A720),
    "D-late": lifecycleCost(DLate720, A720),
  };

  return {
    schema: "p54-1-construction-activation-lifecycle-correction-v1",
    decision: {
      outcome: decisionOutcome,
      eventFedFailureCause: {
        modeGetterDefect:
          "The runtime supplied an eventFed getter inside an object spread; spreading evaluated it once before event configuration and left the adapter with a stale false boolean. The corrected readEventFedMode function and readRequest(eventFedMode) share the same runtime latch sample.",
        lateRequestCause:
          "finishCycle(89) captures publication authority only for an already-present request scoped to cycle 90. D-late is installed at p719 after that finish, so cycle 90 receives the exact request but no source-backed cycle-89 publication identity.",
        publicationAuthorityWasNotReconstructed: true,
      },
      independentRendererCpuGate: "not-passed-by-this-experiment",
    },
    pinnedInputs: {
      game: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      gameSnapshotSha256,
      fixture: "p18-standard-human-fixture.txt",
      fixtureSha256:
        "2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684",
      baselineTunedFixturePresent,
      seed: 44,
      epoch: "2026-09-21T00:00:00.000Z",
      bundleSha256,
      replayHarnessSha256,
      sourceHashes,
      priorP42EvidenceSha256,
      priorP42EvidenceRewritten: false,
    },
    arms: {
      A: "Historical no-request control.",
      C: "P53 direct request lookup through Construction-owned admission.",
      "D-early":
        "Event-fed request delivered at p700 before cycle 89 finishes.",
      "D-early-repeat": "Deterministic repeat of D-early.",
      "D-late":
        "Event-fed request delivered at p719 after cycle 89 finishes; expected fail-closed rejection.",
    },
    chronology: {
      request: P53_QUARRY_REQUEST,
      modeConfigured,
      D_early: {
        requestDelivery: earlyDelivery,
        adapterCreatedMode: earlySamples.find(
          (sample) => sample.boundary === "adapter-created",
        ),
        runtimeConfiguredMode: earlySamples.find(
          (sample) => sample.boundary === "runtime-configured",
        ),
        cycle89Beginning: sampleAt(DEarly720, "cycle-begin", 89) ?? null,
        cycle89FinishPeriod: earlyModeAtPublication?.period ?? null,
        contextPeriodReadDuringAuthorityCapture:
          earlyPublication?.capturedContextPeriod ?? null,
        cycle89FinishMode: earlyModeAtPublication ?? null,
        cycle89PublicationAuthority: earlyPublication ?? null,
        periodsBeforePublication:
          earlyModeAtPublication?.period === null ||
          earlyModeAtPublication?.period === undefined
            ? null
            : earlyModeAtPublication.period - earlyDelivery.period,
        cycle90Beginning: earlyModeAtCycle90 ?? null,
        requestRetrievalAtAdmission: earlyModeAtAdmission ?? null,
        ownerDecision: purchaseDEarly.decision,
        postConstructionSavingTargetProjection: earlyCycle89SavingTarget,
        baselinePostConstructionSavingTargetProjection:
          controlCycle89SavingTarget,
        cycle89CompletedIntentCandidateKeys: earlyCompletedIntentKeys,
        baselineCycle89CompletedIntentCandidateKeys: controlCompletedIntentKeys,
        ordinaryFarmIntentPreserved,
        externalP42ReservationUnused,
        externalP42ReservationReads,
        authorityCaptured: earlyAuthorityCaptured,
      },
      D_late: {
        requestDelivery: lateDelivery,
        cycle89FinishPeriod: lateModeAtPublication?.period ?? null,
        cycle89FinishMode: lateModeAtPublication ?? null,
        cycle89PublicationAuthority: latePublication ?? null,
        periodsAfterPublication:
          lateModeAtPublication?.period === null ||
          lateModeAtPublication?.period === undefined
            ? null
            : lateDelivery.period - lateModeAtPublication.period,
        cycle90Beginning: lateModeAtCycle90 ?? null,
        requestRetrievalAtAdmission: lateModeAtAdmission ?? null,
        ownerDecision: purchaseDLate.decision,
        nativeStatePreserved: lateNativeStatePreserved,
        rejectedForPublicationTiming: lateRejectedForPublicationTiming,
        requestLifecycleAtStop: {
          replayStopPeriod: DLate720.period,
          pendingRequestReferences:
            metrics(DLate720).pendingRequestReferences ?? 0,
          expiryEventsObserved: metrics(DLate720).requestExpiredEvents ?? 0,
          laterExpiryObserved: false,
        },
      },
      minimumLeadTime:
        "The P53 request must be installed before cycle 89's successful finish so that finish can capture the source-backed publication identity scoped to cycle 90. The contract specifies no fixed number of game periods: D-early arrived 12 periods before the finish at p712; D-late arrived 7 periods afterward and failed closed.",
    },
    preIntervention: {
      boundary: "p719, before the cycle-90 Quarry decision at p720",
      exact: preInterventionExact,
      reference: preReference,
      comparisons: preInterventionComparisons,
    },
    ownerParity: {
      C: purchaseC,
      "D-early": purchaseDEarly,
      sameConstructionOwnedDecision: p53DecisionEquivalent,
      sameNativeQuarryDebit: debitEquivalent,
      p53CurrentPriceCheckInvocations: cAndEarlyPriceChecks,
      buildQueueSetDataAtP720: setDataAtP720,
      bothRequiredPriceChecksRetained:
        cAndEarlyPriceChecks.C === 2 && cAndEarlyPriceChecks["D-early"] === 2,
      p41ReservationSamples: {
        C: metrics(C720).reservationEvidenceSamples ?? 0,
        "D-early": metrics(DEarly720).reservationEvidenceSamples ?? 0,
        D_EarlyExternalP42ReservationReads: externalP42ReservationReads,
        D_EarlyP42OwnerCycleApplied:
          DEarly720.native.p51.p42OwnerCycleApplied ?? null,
      },
      p41ReservationGate: {
        C: quarryConflictPlan(C720),
        "D-early": quarryConflictPlan(DEarly720),
        "D-late": quarryConflictPlan(DLate720),
      },
      ordinaryBuildPostcondition: purchaseDEarly.verifiedPostcondition,
      p52HistoricalJobsCorrelation: p52Receipt,
      p52ExecutionAuthorityIsNone: p52Receipt?.executionAuthority === "none",
      noAdditionalGatherActions: noExtraGatherActions,
      noAdditionalJobsAssignment: jobsAssignmentsUnchanged,
      p51JobsRequestExecutionAuthority: "none",
      p51JobsObservationOnly,
      nativeJobControlCallsVsNoRequestA: nativeJobControlCallsComparedWithA,
      workerAllocationVsNoRequestA: {
        A: A720.state.jobs,
        C: C720.state.jobs,
        "D-early": DEarly720.state.jobs,
        interpretation:
          "The ordinary native Quarry build initializes its native job controls identically in C and D-early. P52 only observes and correlates the resulting owner receipt; it has no Jobs execution authority.",
      },
      ordinaryCycle89FarmIntentPreserved: ordinaryFarmIntentPreserved,
      noExternalP42ReservationSubstitution: externalP42ReservationUnused,
    },
    repeat: {
      exact: earlyRepeatExact,
      stateAndSaveEqual:
        same(DEarly720.state, DEarlyRepeat720.state) &&
        DEarly720.saveSha256 === DEarlyRepeat720.saveSha256,
      nativeTraceEqual: same(DEarlyCalls, DEarlyRepeatCalls),
      gameplayActionsEqual: same(
        gameplayActions["D-early"],
        gameplayActions["D-early-repeat"],
      ),
      rngEqual:
        DEarly720.randomCalls === DEarlyRepeat720.randomCalls &&
        DEarly720.rngState === DEarlyRepeat720.rngState,
      finalExportEqual:
        DEarly.finalExportSha256 === DEarlyRepeat.finalExportSha256,
    },
    nativeTrace: {
      fullCallsAtP720: {
        A: ACalls,
        C: CCalls,
        "D-early": DEarlyCalls,
        "D-early-repeat": DEarlyRepeatCalls,
        "D-late": DLateCalls,
      },
      fullTraceHashesAtP720: {
        A: hashValue(ACalls),
        C: hashValue(CCalls),
        "D-early": hashValue(DEarlyCalls),
        "D-early-repeat": hashValue(DEarlyRepeatCalls),
        "D-late": hashValue(DLateCalls),
      },
      fullNativeTraceCEqualsDEarly: same(CCalls, DEarlyCalls),
      pairAccounting: {
        rowsPerNativeApiInvocation: 2,
        adjacentPairsAndOrderValidated: true,
        buildQueueSetDataAtP720: setDataAtP720,
      },
      gameplayActionsAtP720: gameplayActions,
      period720GameplayActions: p720GameplayActions,
      gameplayActionEquality: {
        CEqualsDEarly: same(gameplayActions.C, gameplayActions["D-early"]),
        DEarlyRepeatExact: same(
          gameplayActions["D-early"],
          gameplayActions["D-early-repeat"],
        ),
        DLateEqualsA: same(gameplayActions["D-late"], gameplayActions.A),
      },
    },
    cost: {
      measurementClock: "performance.now() monotonic browser clock",
      byArm: armCosts,
      measurementLimit:
        "P53 current-price checks are counted by the Construction authority metric. The p720 buildQueue.setData trace contains two raw rows per native API invocation: 104 rows are 52 calls, including ordinary UI/game updates. Trace pairs are validated before counting. Synchronous durations were below the observed clock resolution, so no CPU savings or percent overhead is inferred.",
    },
    isolation: {
      gatherActionsAdded: 0,
      jobsAssignmentExecutionAdded: false,
      externalP42ReservationUsedByDEarly: false,
      p50CompiledOutputIsolationRegressionRequired: true,
      ordinaryProductionByteIdentityRequired: true,
    },
    acceptance: {
      preInterventionExact,
      correctedEventFedLifecycle: earlyAuthorityCaptured,
      earlyEventSourceFailure,
      lateRequestFailClosed: lateRejectedForPublicationTiming,
      earlyRepeatExact,
      CAndEarlyOwnerParity: cAndEarlyOwnerAndDebit,
      p52HistoricalCorrelation: p52HistoricalCorrelation,
      noAdditionalGatherActions: noExtraGatherActions,
      noAdditionalJobsAssignment: jobsAssignmentsUnchanged,
      p51JobsObservationOnly,
      ordinaryCycle89FarmIntentPreserved: ordinaryFarmIntentPreserved,
      noExternalP42ReservationSubstitution: externalP42ReservationUnused,
      D_lateNativeStatePreserved: lateNativeStatePreserved,
      independentRendererCpuGate: {
        status: "not-passed",
        requirement: "<=2% renderer CPU overhead",
      },
    },
    limitations: {
      playerRequestLifecycleImplemented: false,
      productionAllocatorChanged: false,
      userInterfaceChanged: false,
      arbitraryLateRequestsSupported: false,
      D_latePendingReferenceRetainedAtStop:
        metrics(DLate720).pendingRequestReferences === 1,
      exactReplayStoppedBeforeLaterExpiry: DLate720.period === 720,
      nextFeatureOrAuthorityExperimentAuthorized: false,
    },
  };
}
