import assert from "node:assert/strict";

import { P42_EXPECTED } from "./p42-construction-priority-counterfactual-policy.mjs";
import { P53_QUARRY_REQUEST } from "./p53-construction-owned-target-authority-contract.mjs";

const at = (run, period) =>
  run?.checkpoints?.find((checkpoint) => checkpoint.period === period);
const p51 = (checkpoint) => checkpoint?.native?.p51;
const p53 = (checkpoint) => p51(checkpoint)?.p53;
const eventsOf = (checkpoint) => p51(checkpoint)?.state?.events ?? [];
const receiptOf = (events, kind) =>
  events.find((event) => event.kind === kind)?.receipt ?? null;
const normalizeReceiptEvent = (event) => {
  if (event.kind !== "receipt-consumed") return event;
  return {
    ...event,
    identityEvidence: event.identityEvidence
      ? { ...event.identityEvidence }
      : null,
  };
};

function preIntervention(checkpoint) {
  return {
    period: checkpoint?.period,
    saveSha256: checkpoint?.saveSha256,
    state: checkpoint?.state,
    controlUsage: checkpoint?.controlUsage,
    nativeCallsSha256: checkpoint?.nativeCallsSha256,
    nativeCalls: checkpoint?.nativeCalls,
    randomCalls: checkpoint?.randomCalls,
    rngState: checkpoint?.rngState,
  };
}

function deterministicCheckpoint(checkpoint) {
  const owner = p53(checkpoint);
  const trace = p51(checkpoint);
  const constructionIdentitySample = trace?.p52?.constructionIdentitySample
    ? (({ identitySampleMs: _identitySampleMs, ...sample }) => sample)(
        trace.p52.constructionIdentitySample,
      )
    : null;
  const jobsIdentitySample = trace?.p52?.jobsIdentitySample
    ? (({ synchronousMs: _synchronousMs, ...sample }) => sample)(
        trace.p52.jobsIdentitySample,
      )
    : null;
  return {
    ...preIntervention(checkpoint),
    production: checkpoint?.production,
    jobsSnapshot: checkpoint?.jobsSnapshot,
    jobsInput: checkpoint?.jobsInput,
    p40Purchase: trace?.p40QuarryPurchase ?? null,
    p40ConstructionEvents: trace?.p40ConstructionEvents ?? [],
    p36GatherActions: trace?.p36GatherActions ?? null,
    p38GatherActions: trace?.p38GatherActions ?? null,
    p53DecisionEvents: owner?.ownerDecisionEvents ?? [],
    p53Decision: owner?.ownerDecision ?? null,
    p52: trace?.p52
      ? {
          classification: trace.p52.classification,
          constructionIdentitySample,
          jobsIdentitySample,
          dormantAdmissionCallbacks: trace.p52.dormantAdmissionCallbacks,
        }
      : null,
    receiptEvents: eventsOf(checkpoint).map(normalizeReceiptEvent),
  };
}

const equalNativeResult = (left, right) =>
  JSON.stringify({
    saveSha256: left?.saveSha256,
    state: left?.state,
    nativeCalls: left?.nativeCalls,
    randomCalls: left?.randomCalls,
    rngState: left?.rngState,
  }) ===
  JSON.stringify({
    saveSha256: right?.saveSha256,
    state: right?.state,
    nativeCalls: right?.nativeCalls,
    randomCalls: right?.randomCalls,
    rngState: right?.rngState,
  });

function nativeControlDelta(reference, treatment) {
  const before = reference?.controlUsage ?? {};
  const after = treatment?.controlUsage ?? {};
  const deltas = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const returned =
      Number(after[key]?.returned ?? 0) - Number(before[key]?.returned ?? 0);
    const threw =
      Number(after[key]?.threw ?? 0) - Number(before[key]?.threw ?? 0);
    if (returned !== 0 || threw !== 0)
      deltas[key] = Object.freeze({ returned, threw });
  }
  return Object.freeze(deltas);
}

function nativeDebit(checkpoint) {
  const debit = p51(checkpoint)?.p40QuarryPurchase?.output?.resourceDebit ?? {};
  return Object.fromEntries(
    ["Lumber", "Stone"].map((id) => [id, debit[id]?.debit ?? null]),
  );
}

export function createP53ConstructionTargetAuthorityEvidence({
  A,
  B,
  C,
  CRepeat,
  gameSnapshotSha256,
  bundleSha256,
  replayHarnessSha256,
  sourceHashes,
  staticContract,
}) {
  const a719 = at(A, 719);
  const b719 = at(B, 719);
  const c719 = at(C, 719);
  const repeat719 = at(CRepeat, 719);
  const a720 = at(A, 720);
  const b720 = at(B, 720);
  const c720 = at(C, 720);
  const repeat720 = at(CRepeat, 720);
  for (const [name, checkpoint] of Object.entries({
    a719,
    b719,
    c719,
    repeat719,
    a720,
    b720,
    c720,
    repeat720,
  }))
    assert.ok(checkpoint, `P53 exact replay missed ${name}`);

  const preInterventionEquality = [b719, c719, repeat719].every(
    (checkpoint) =>
      JSON.stringify(preIntervention(a719)) ===
      JSON.stringify(preIntervention(checkpoint)),
  );
  const cRepeatExact = [
    JSON.stringify(deterministicCheckpoint(c719)) ===
      JSON.stringify(deterministicCheckpoint(repeat719)),
    JSON.stringify(deterministicCheckpoint(c720)) ===
      JSON.stringify(deterministicCheckpoint(repeat720)),
  ].every(Boolean);
  const bAndCNativeEquality = equalNativeResult(b720, c720);
  const nativeReadDelta = nativeControlDelta(b720, c720);
  const additionalNativeReadsBounded =
    JSON.stringify(nativeReadDelta) ===
    JSON.stringify({ "buildQueue.setData": { returned: 2, threw: 0 } });
  const p53Owner = p53(c720);
  const decision = p53Owner?.ownerDecision?.decision;
  const revision = decision?.revision;
  const ownerDecisionAccepted =
    p53Owner?.ownerDecision?.candidateKey ===
      P53_QUARRY_REQUEST.targetBuildingId &&
    decision?.status === "accepted-for-owner-decision" &&
    decision?.reason ===
      "bounded-test-only-request-and-current-evidence-match" &&
    revision?.requestId === P53_QUARRY_REQUEST.requestId &&
    revision?.requestGeneration === P53_QUARRY_REQUEST.generation &&
    revision?.previous?.name === P42_EXPECTED.previousTarget &&
    revision?.previous?.cost?.Lumber === P42_EXPECTED.previousCost.Lumber &&
    revision?.previous?.cost?.Stone === P42_EXPECTED.previousCost.Stone &&
    revision?.replacement?.name === P42_EXPECTED.quarryTarget &&
    revision?.replacement?.cost?.Lumber === P42_EXPECTED.quarryCost.Lumber &&
    revision?.replacement?.cost?.Stone === P42_EXPECTED.quarryCost.Stone &&
    revision?.workCycleId === P42_EXPECTED.workCycleId &&
    revision?.orderingGeneration === P42_EXPECTED.orderingGeneration &&
    revision?.reason === "explicit-test-only-priority-replacement" &&
    revision?.lifetime === "this-construction-cycle";
  const aEvents = eventsOf(a720);
  const bEvents = eventsOf(b720);
  const cEvents = eventsOf(c720);
  const repeatEvents = eventsOf(repeat720);
  const cPublished = receiptOf(cEvents, "receipt-published");
  const cConsumed = cEvents.find((event) => event.kind === "receipt-consumed");
  const repeatPublished = receiptOf(repeatEvents, "receipt-published");
  const repeatConsumed = repeatEvents.find(
    (event) => event.kind === "receipt-consumed",
  );
  const cJobsIdentity = p51(c720)?.p52?.jobsIdentitySample;
  const cConstructionIdentity = p51(c720)?.p52?.constructionIdentitySample;
  const p52Correlation =
    p51(c720)?.p52?.classification?.status === "correlated-owner-event" &&
    p51(c720)?.p52?.classification?.executionAuthority === "none" &&
    cPublished?.requestIdentity?.requestId === P53_QUARRY_REQUEST.requestId &&
    cPublished?.requestIdentity?.generation === P53_QUARRY_REQUEST.generation &&
    cPublished?.origin?.rootGeneration ===
      cJobsIdentity?.jobsIdentity?.rootGeneration &&
    cPublished?.origin?.progressionGeneration ===
      cJobsIdentity?.jobsIdentity?.progressionFingerprint &&
    cConstructionIdentity?.identityNativeRootReads === 1 &&
    cJobsIdentity?.sampleCount === 1 &&
    cJobsIdentity?.nativeRootReads === 1 &&
    cConsumed?.executionAuthority === "none" &&
    repeatPublished?.requestIdentity?.requestId ===
      P53_QUARRY_REQUEST.requestId &&
    repeatConsumed?.executionAuthority === "none";
  const debit = nativeDebit(c720);
  const referenceDebit = nativeDebit(b720);
  const repeatDebit = nativeDebit(repeat720);
  const legitimatePurchase =
    (a720.state.buildings.rock_quarry ?? 0) === 0 &&
    b720.state.buildings.rock_quarry === 1 &&
    c720.state.buildings.rock_quarry === 1 &&
    repeat720.state.buildings.rock_quarry === 1 &&
    p51(c720)?.p40QuarryPurchase?.input?.beforeCount === 0 &&
    p51(c720)?.p40QuarryPurchase?.output?.afterCount === 1 &&
    p51(c720)?.p40QuarryPurchase?.output?.verifiedSuccess === true &&
    p51(c720)?.p40QuarryPurchase?.output?.resourceDebit?.Lumber?.debit ===
      P42_EXPECTED.quarryCost.Lumber &&
    p51(c720)?.p40QuarryPurchase?.output?.resourceDebit?.Stone?.debit ===
      P42_EXPECTED.quarryCost.Stone &&
    debit.Lumber === P42_EXPECTED.quarryCost.Lumber &&
    debit.Stone === P42_EXPECTED.quarryCost.Stone &&
    JSON.stringify(referenceDebit) === JSON.stringify(debit) &&
    JSON.stringify(repeatDebit) === JSON.stringify(debit) &&
    Number(c720.controlUsage?.["city-rock_quarry.action"]?.returned ?? 0) ===
      1 &&
    Number(
      repeat720.controlUsage?.["city-rock_quarry.action"]?.returned ?? 0,
    ) === 1 &&
    p51(c720)?.p40ConstructionEvents?.filter(
      (event) =>
        event.type === "purchase-postcondition" &&
        event.input?.candidateKey === P42_EXPECTED.quarryTarget,
    ).length === 1;
  const noExtraGather =
    p51(a720)?.p36GatherActions === p51(b720)?.p36GatherActions &&
    p51(a720)?.p36GatherActions === p51(c720)?.p36GatherActions &&
    p51(a720)?.p36GatherActions === p51(repeat720)?.p36GatherActions &&
    p51(a720)?.p38GatherActions === p51(b720)?.p38GatherActions &&
    p51(a720)?.p38GatherActions === p51(c720)?.p38GatherActions &&
    p51(a720)?.p38GatherActions === p51(repeat720)?.p38GatherActions;
  const unrelatedConstruction = (checkpoint) =>
    (p51(checkpoint)?.p40ConstructionEvents ?? [])
      .filter(
        (event) => event.input?.candidateKey !== P42_EXPECTED.quarryTarget,
      )
      .map((event) => {
        const { sequence: _sequence, ...semantic } = event;
        return semantic;
      });
  const researchUnchangedAcrossArms =
    JSON.stringify(a720.state.tech) === JSON.stringify(b720.state.tech) &&
    JSON.stringify(a720.state.tech) === JSON.stringify(c720.state.tech) &&
    JSON.stringify(a720.state.tech) === JSON.stringify(repeat720.state.tech);
  const ordinaryJobsSameBetweenTreatments =
    JSON.stringify(b720.state.jobs) === JSON.stringify(c720.state.jobs) &&
    JSON.stringify(c720.state.jobs) === JSON.stringify(repeat720.state.jobs);
  const unrelatedConstructionSameBetweenTreatments =
    JSON.stringify(unrelatedConstruction(b720)) ===
      JSON.stringify(unrelatedConstruction(c720)) &&
    JSON.stringify(unrelatedConstruction(c720)) ===
      JSON.stringify(unrelatedConstruction(repeat720));
  const noOtherActionChanges =
    bAndCNativeEquality &&
    researchUnchangedAcrossArms &&
    ordinaryJobsSameBetweenTreatments &&
    unrelatedConstructionSameBetweenTreatments;
  const legacyAndOwnerMechanismsDiffer =
    p51(b720)?.p42OwnerCycleApplied === true &&
    p51(c720)?.p42OwnerCycleApplied !== true &&
    ownerDecisionAccepted &&
    revision?.previous?.name !== revision?.replacement?.name;
  const eventMetrics = {
    retainedEventCount: p53Owner?.ownerDecisionEvents?.length ?? 0,
    retainedBytes: p53Owner?.eventBytes ?? 0,
    eventOverflow: p53Owner?.eventOverflow ?? 0,
  };
  const p53Metrics = p53Owner?.metrics ?? {};
  const measurements = {
    ownerDecisionEvaluation: {
      count: p53Metrics.ownerDecisionEvaluations ?? 0,
      totalMilliseconds: p53Metrics.totalOwnerDecisionEvaluationMs ?? null,
      maximumMilliseconds: p53Metrics.maximumOwnerDecisionEvaluationMs ?? null,
    },
    savingRevisionConstructionCount:
      p53Metrics.savingRevisionConstructions ?? 0,
    requestSourceReadsThroughDecision: p53Metrics.requestSourceReads ?? 0,
    additionalIdentitySampling: {
      contextSamples: p53Metrics.contextIdentitySamples ?? 0,
      attributedNativeRootReads: p53Metrics.contextRootReads ?? 0,
      rootReadsPerContextSample: 2,
      reason:
        "The existing progression reader reads the native root once for root generation and once for the progression fingerprint.",
    },
    additionalNativeEvidenceReads: {
      nativeQueueAndScriptReservationSamples:
        p53Metrics.reservationEvidenceReads ?? 0,
      nativeActionAuthorityReads: p53Metrics.nativeControlAuthorityReads ?? 0,
      currentNativePriceReads: p53Metrics.nativePriceReads ?? 0,
      addedResourceOrCatalogReads:
        p53Metrics.additionalResourceOrCatalogReads ?? 0,
      resourceSampling: "No additional holdings/resource sample.",
      priceSampling:
        "One current-price verification at admission and one before native execution; the 2 buildQueue.setData calls are recorded separately.",
    },
    eventMetrics,
    maximumSynchronousCallbackMilliseconds:
      p53Metrics.maximumSynchronousCallbackMs ?? null,
    existingConflictReaderTiming: {
      P42: {
        calls:
          p51(b720)?.instrumentationMetrics?.p41ConflictReaderCalls ?? null,
        elapsedMilliseconds:
          p51(b720)?.instrumentationMetrics?.p41ConflictReaderElapsedMs ?? null,
      },
      C: {
        calls:
          p51(c720)?.instrumentationMetrics?.p41ConflictReaderCalls ?? null,
        elapsedMilliseconds:
          p51(c720)?.instrumentationMetrics?.p41ConflictReaderElapsedMs ?? null,
      },
      note: "Existing reader timing is synchronous diagnostic time, not renderer CPU share.",
    },
    dormantPath: {
      ownerDecisionEvaluations:
        p53(a720)?.metrics?.ownerDecisionEvaluations ?? 0,
      ownerDecisionEvents: p53(a720)?.ownerDecisionEvents?.length ?? 0,
      requestSourceReadsAtPeriod719:
        p53(at(A, 719))?.metrics?.requestSourceReads ?? 0,
      requestSourceReadsThroughCDecision:
        p53(c720)?.metrics?.requestSourceReads ?? 0,
      contextIdentitySamples:
        p53(at(A, 719))?.metrics?.contextIdentitySamples ?? 0,
      reservationEvidenceReads:
        p53(at(A, 719))?.metrics?.reservationEvidenceReads ?? 0,
      nativeControlAuthorityReads:
        p53(at(A, 719))?.metrics?.nativeControlAuthorityReads ?? 0,
      nativePriceReads: p53(at(A, 719))?.metrics?.nativePriceReads ?? 0,
      theseAreBoundedLocalRequestLookups:
        "No resource, price, queue, catalog, or target-wide native scan is triggered by these lookups.",
      constructionRequest: p53(a720)?.request ?? null,
      nativeActionsAdded: 0,
      recurringGlobalScans: 0,
    },
  };

  const valid =
    preInterventionEquality &&
    cRepeatExact &&
    bAndCNativeEquality &&
    ownerDecisionAccepted &&
    p52Correlation &&
    legitimatePurchase &&
    noExtraGather &&
    noOtherActionChanges &&
    additionalNativeReadsBounded &&
    legacyAndOwnerMechanismsDiffer &&
    staticContract?.historicalPublicationPreserved === true &&
    staticContract?.p53CompileDefinePresent === true &&
    eventMetrics.eventOverflow === 0;
  const unavailableAuthority =
    !ownerDecisionAccepted &&
    (decision?.status === "rejected-incomplete-authority" ||
      decision?.status === "rejected-priority-conflict");
  const outcome = valid
    ? "A — Owner-side authority established"
    : unavailableAuthority
      ? "C — Authority unavailable"
      : "D — Invalid";
  const reason = valid
    ? "Construction accepted the exact test-only Quarry request, owned a one-cycle Farm-to-Quarry saving revision, and reused the native purchase and P52 receipt path with deterministic A/B/C/C-repeat results."
    : unavailableAuthority
      ? `Construction could not establish complete current authority: ${decision?.reason ?? decision?.status}.`
      : "One or more exact parity, freshness, native execution, isolation, or receipt-correlation requirements failed.";

  return {
    schema: "p53-construction-owned-target-authority-v1",
    decision: {
      outcome,
      reason,
      executionAuthority:
        "test-only-native-execution-permission; no player permission",
      productionAuthorized: false,
      autonomousAllocatorIntroduced: false,
      autonomousGatherAuthorized: false,
      jobsAssignmentAuthorized: false,
    },
    game: {
      pinned: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      snapshotSha256: gameSnapshotSha256,
      fixture:
        "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
      seed: 44,
      epoch: "2026-09-21T00:00:00.000Z",
      periods: [719, 720],
      workCycles: [89, 90],
    },
    request: P53_QUARRY_REQUEST,
    ownerDecision: {
      status: decision?.status ?? null,
      reason: decision?.reason ?? null,
      candidateKey: p53Owner?.ownerDecision?.candidateKey ?? null,
      revision: revision ?? null,
      accepted: ownerDecisionAccepted,
      historicalFarmPublicationPreserved:
        staticContract?.historicalPublicationPreserved === true,
    },
    comparison: {
      arms: {
        A: "Historical control; Farm priority remains published.",
        B: "P42 external test reservation substitution, retained as native-result reference.",
        C: "Construction owner admission and one-cycle saving revision.",
        "C-repeat": "Exact repeat of the Construction owner request.",
      },
      preInterventionEqual: preInterventionEquality,
      legacyP42AndConstructionOwnerNativeEquality: bAndCNativeEquality,
      expectedOwnerSpecificNativeReadDelta: nativeReadDelta,
      ownerSpecificReadDeltaBounded: additionalNativeReadsBounded,
      constructionOwnerRepeatExact: cRepeatExact,
      legacyAndOwnerMechanismsDiffer,
      quarryPurchaseAndNativeDebit: {
        verified: legitimatePurchase,
        amountByResource: debit,
        P42Reference: referenceDebit,
        Crepeat: repeatDebit,
      },
      noAdditionalGather: noExtraGather,
      noResearchChangesAcrossArms: researchUnchangedAcrossArms,
      unrelatedConstructionDecisionsMatchP42BetweenTreatments:
        unrelatedConstructionSameBetweenTreatments,
      ordinaryJobsPolicyAndResultsMatchBetweenTreatments:
        ordinaryJobsSameBetweenTreatments,
      ordinaryJobsByArm: {
        A: a720.state.jobs,
        B: b720.state.jobs,
        C: c720.state.jobs,
        "C-repeat": repeat720.state.jobs,
      },
      treatmentResultHasNoOtherActionChanges: noOtherActionChanges,
      mechanismDifference: {
        B: {
          constructionOwnerDecision: false,
          externalP42ReservationSubstitution:
            p51(b720)?.p42OwnerCycleApplied === true,
        },
        C: {
          constructionOwnerDecision: ownerDecisionAccepted,
          externalP42ReservationSubstitution:
            p51(c720)?.p42OwnerCycleApplied === true,
          revisionInterface:
            "Construction observations.readSavingTargetForConflict",
        },
        nativeActionDifference: "none",
        expectedAdditionalCostAuthorityReads:
          "Two bounded current-price checks at admission and before execution.",
      },
    },
    receipt: {
      published: cPublished,
      consumed: cConsumed ?? null,
      repeatPublished: repeatPublished,
      repeatConsumed: repeatConsumed ?? null,
      correlatedThroughP52: p52Correlation,
      classification: p51(c720)?.p52?.classification?.status ?? "unavailable",
      executionAuthority: cConsumed?.executionAuthority ?? null,
      oneTimeConsumption:
        p51(c720)?.state?.pendingReceipt === null &&
        p51(repeat720)?.state?.pendingReceipt === null,
    },
    measurements,
    staticContract,
    artifacts: {
      bundleSha256,
      replayHarnessSha256,
      sourceHashes,
      missingBaselineTunedFixture: {
        path: "test-artifacts/benchmark/settings/baseline-tuned.json",
        status: "absent",
        note: "The existing native-parity fixture is absent. P53 uses the controlled exact Chromium replay and makes no native-parity benchmark claim.",
      },
      rendererCpuClaim: "not made; the ≤2% requirement remains unresolved",
    },
    limitations: [
      "Matching P42's Quarry purchase does not establish economic improvement; P43/P44 left Food sustainability unresolved.",
      "The test request grants no production authority, material gathering, or Jobs assignment permission.",
      "Owner callback timings do not establish renderer CPU share.",
    ],
  };
}
