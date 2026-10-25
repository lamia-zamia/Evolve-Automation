import assert from "node:assert/strict";

import {
  P42_EXPECTED,
  P42_INTERVENTION_IDENTITY,
} from "./p42-construction-priority-counterfactual-policy.mjs";

const at = (run, period) =>
  run.checkpoints.find((checkpoint) => checkpoint.period === period);

function repeatSemanticTrace(run, period) {
  const checkpoint = at(run, period);
  const trace = checkpoint?.native?.p51;
  const admissions = (trace?.jobsAdmissions ?? []).map((event) => {
    const {
      requestPresenceCheckMs: _requestPresenceCheckMs,
      inputProjectionMs: _inputProjectionMs,
      envelopeConstructionMs: _envelopeConstructionMs,
      admissionPredicateMs: _admissionPredicateMs,
      additionalSynchronousCallbackMs: _additionalSynchronousCallbackMs,
      ...semantic
    } = event;
    return semantic;
  });
  return {
    checkpoint: checkpoint && {
      saveSha256: checkpoint.saveSha256,
      state: checkpoint.state,
      controlUsage: checkpoint.controlUsage,
      nativeCallsSha256: checkpoint.nativeCallsSha256,
      nativeCalls: checkpoint.nativeCalls,
      randomCalls: checkpoint.randomCalls,
      rngState: checkpoint.rngState,
    },
    p40Purchase: trace?.p40QuarryPurchase ?? null,
    p42Events: trace?.p42Events ?? [],
    p51Events: trace?.state?.events ?? [],
    jobsAdmissions: admissions,
  };
}

function receiptEvents(trace) {
  return (trace?.state?.events ?? []).filter(
    (event) => event.kind === "receipt-published",
  );
}

function p51CheckpointsForEvidence(A, B, BRepeat) {
  return Object.fromEntries(
    [
      ["A", A],
      ["B", B],
      ["B-repeat", BRepeat],
    ].map(([arm, run]) => [
      arm,
      run.checkpoints.map((checkpoint) => ({
        period: checkpoint.period,
        saveSha256: checkpoint.saveSha256,
        state: checkpoint.state,
        nativeCallsSha256: checkpoint.nativeCallsSha256,
        controlUsage: checkpoint.controlUsage,
        randomCalls: checkpoint.randomCalls,
        rngState: checkpoint.rngState,
      })),
    ]),
  );
}

export function createP51ConstructionJobsHandoffEvidence({
  A,
  B,
  BRepeat,
  gameSnapshotSha256,
  bundleSha256,
  replayHarnessSha256,
  sourceHashes,
  nativePortAudit,
}) {
  const a719 = at(A, 719);
  const b719 = at(B, 719);
  const repeat719 = at(BRepeat, 719);
  const a720 = at(A, 720);
  const b720 = at(B, 720);
  const repeat720 = at(BRepeat, 720);
  for (const [name, checkpoint] of Object.entries({
    a719,
    b719,
    repeat719,
    a720,
    b720,
    repeat720,
  }))
    assert.ok(checkpoint, "P51 missed " + name);

  assert.deepEqual(
    repeatSemanticTrace(A, 719),
    repeatSemanticTrace(B, 719),
    "A and B must match before the p719 request is installed",
  );
  assert.deepEqual(
    repeatSemanticTrace(B, 719),
    repeatSemanticTrace(BRepeat, 719),
    "B and B-repeat must match before the request",
  );
  assert.deepEqual(
    repeatSemanticTrace(B, 720),
    repeatSemanticTrace(BRepeat, 720),
    "B and B-repeat must match exactly through the Jobs handoff",
  );

  const aTrace = a720.native.p51;
  const bTrace = b720.native.p51;
  const repeatTrace = repeat720.native.p51;
  assert.equal(receiptEvents(aTrace).length, 0);
  assert.equal(receiptEvents(bTrace).length, 1);
  assert.equal(receiptEvents(repeatTrace).length, 1);
  assert.equal(a720.state.buildings.rock_quarry ?? 0, 0);
  assert.equal(b720.state.buildings.rock_quarry, 1);
  assert.equal(repeat720.state.buildings.rock_quarry, 1);

  const receipt = receiptEvents(bTrace)[0].receipt;
  const repeatReceipt = receiptEvents(repeatTrace)[0].receipt;
  assert.deepEqual(receipt, repeatReceipt);
  assert.equal(receipt.targetBuildingId, P42_EXPECTED.quarryTarget);
  assert.equal(receipt.result, "verified-purchase");
  assert.equal(receipt.nativePostcondition.constructionCycleCompleted, true);
  assert.equal(receipt.executionAuthority, "none");
  assert.equal(receipt.origin.owner, "Construction");
  assert.equal(receipt.origin.workCycleId, P42_EXPECTED.workCycleId);
  assert.equal(
    receipt.origin.orderingGeneration,
    P42_EXPECTED.orderingGeneration,
  );
  assert.deepEqual(receipt.cost, P42_EXPECTED.quarryCost);
  assert.equal(
    receipt.requestIdentity.requestId,
    "p51-test-only-quarry-priority-request-v1",
  );
  assert.equal(
    bTrace.requestQualification?.qualified,
    true,
    "B must use the bounded test-only request",
  );
  assert.equal(bTrace.request?.origin, "test-only");
  assert.equal(bTrace.request?.targetBuildingId, P42_EXPECTED.quarryTarget);
  assert.equal(
    bTrace.request?.suspendSavingPriorityForBuildingId,
    P42_EXPECTED.previousTarget,
  );
  assert.equal(bTrace.request?.suspendSavingPriorityAcknowledged, true);
  assert.equal(bTrace.request?.playerSelected, false);
  assert.equal(bTrace.request?.productionAuthorized, false);
  assert.equal(bTrace.p42OwnerCycleApplied, true);
  assert.deepEqual(bTrace.quarryOrder.cost, P42_EXPECTED.quarryCost);

  const nativePurchase = bTrace.p40QuarryPurchase;
  const quarryConstructionEvents = bTrace.p40ConstructionEvents.filter(
    (event) => event.input?.candidateKey === P42_EXPECTED.quarryTarget,
  );
  const conflictPlan = quarryConstructionEvents.find(
    (event) => event.type === "build-conflict-plan",
  );
  const competitionPlan = quarryConstructionEvents.find(
    (event) => event.type === "build-competition-plan",
  );
  const affordability = quarryConstructionEvents.find(
    (event) => event.type === "candidate-affordability",
  );
  assert.equal(affordability?.output?.affordable, true);
  assert.equal(conflictPlan?.output?.kind, "proceed");
  assert.equal(competitionPlan?.output?.kind, "build");
  assert.equal(
    competitionPlan?.output?.decision?.key,
    P42_EXPECTED.quarryTarget,
  );
  assert.ok(
    nativePurchase,
    "P40 did not record the native purchase postcondition",
  );
  assert.equal(nativePurchase.output.nativeActionResult.ok, true);
  assert.equal(nativePurchase.output.built, true);
  assert.equal(nativePurchase.output.verifiedSuccess, true);
  assert.equal(
    nativePurchase.output.afterCount,
    nativePurchase.input.beforeCount + 1,
  );
  assert.equal(
    nativePurchase.output.resourceDebit.Lumber.debit,
    P42_EXPECTED.quarryCost.Lumber,
  );
  assert.equal(
    nativePurchase.output.resourceDebit.Stone.debit,
    P42_EXPECTED.quarryCost.Stone,
  );
  assert.ok(
    b720.nativeCalls.some(
      (call) =>
        call.period === P42_EXPECTED.period &&
        call.elementId === P42_EXPECTED.quarryTarget &&
        call.method === "action",
    ),
    "the Chromium trace has no native Quarry action",
  );

  const jobsAdmissions = bTrace.jobsAdmissions;
  assert.equal(jobsAdmissions.length, 1);
  const jobsObservation = jobsAdmissions[0];
  assert.equal(jobsObservation.admission.status, "admitted-for-observation");
  assert.equal(jobsObservation.admission.executionAuthority, "none");
  assert.ok(
    ["ordinary-jobs-only", "full-jobs-and-foundry"].includes(
      jobsObservation.ownerScope,
    ),
  );
  assert.equal(
    jobsObservation.evidence.ownerSessionFreshness,
    "verified-current",
  );
  assert.equal(
    jobsObservation.evidence.workCycleIdentity,
    receipt.origin.workCycleId,
  );
  assert.equal(
    jobsObservation.evidence.capturedRootIdentity.referenceMatchedAtExecution,
    true,
  );
  assert.equal(
    jobsObservation.evidence.jobsPreparationGeneration,
    jobsObservation.evidence.capturedRootIdentity.preparationGeneration,
  );
  assert.equal(
    jobsObservation.evidence.jobsFoundryFreshness,
    jobsObservation.ownerScope === "ordinary-jobs-only"
      ? "unavailable"
      : "verified-current",
  );
  assert.equal(
    jobsObservation.evidence.plannedDecisionIdentity.length > 0,
    true,
  );
  assert.equal(
    jobsObservation.evidence.ordinaryJobs.find(
      (job) => job.id === "quarry_worker",
    )?.unlocked,
    true,
    "Jobs must record the authentic Quarry Worker unlock",
  );

  const lifecycle = bTrace.state.events;
  const consumed = lifecycle.find((event) => event.kind === "receipt-consumed");
  const released = lifecycle.find((event) => event.kind === "receipt-released");
  assert.ok(consumed);
  assert.ok(released);
  assert.equal(consumed.status, "handoff-authority-incomplete");
  assert.equal(consumed.receiptAgePeriods, 0);
  assert.equal(consumed.receiptAgeWorkCycles, 0);
  assert.equal(consumed.ownerScope, jobsObservation.ownerScope);
  assert.deepEqual(consumed.crossOwnerIdentity, {
    workCycle: "matched-current",
    rootGeneration: "missing-from-p49-jobs-evidence",
    progressionEpoch: "missing-from-p49-jobs-evidence",
    jobsPreparationGeneration:
      jobsObservation.evidence.jobsPreparationGeneration,
    constructionRootGeneration: receipt.origin.rootGeneration,
    constructionProgressionGeneration: receipt.origin.progressionGeneration,
  });
  assert.equal(released.receiptId, receipt.receiptId);
  assert.equal(bTrace.state.pendingReceipt, null);
  assert.equal(nativePortAudit.readCallsites, 0);
  assert.equal(nativePortAudit.controlCallsites, 0);
  assert.equal(bTrace.state.metrics.receiptCreations, 1);
  assert.equal(bTrace.state.metrics.invalidations, 0);
  assert.equal(bTrace.state.metrics.maxCallbackIncrement, 1);
  assert.equal(bTrace.state.metrics.eventOverflow, 0);
  assert.equal(bTrace.state.events.length <= 16, true);
  assert.equal(bTrace.state.eventBytes <= 16_384, true);

  assert.equal(jobsObservation.controlResolutionReadsDuringObservation, 0);
  assert.equal(jobsObservation.settingsReadsDuringObservation, 0);
  assert.equal(jobsObservation.catalogReadsDuringObservation, 0);
  assert.equal(jobsObservation.demandReadsDuringObservation, 0);
  assert.equal(jobsObservation.nativeRootReadsDuringObservation, 0);

  assert.equal(bTrace.p36GatherActions, P42_EXPECTED.p36GatherActions);
  assert.equal(bTrace.p38GatherActions, 17);
  assert.equal(bTrace.p38Authorization?.id, P42_EXPECTED.p38AuthorizationId);
  assert.equal(
    bTrace.p38Authorization?.additionalGatherLimit,
    P42_EXPECTED.p38GatherLimit,
  );

  return {
    schema: "p51-construction-jobs-handoff-v1",
    decision: {
      outcome: "B — Event delivered, authority incomplete",
      reason:
        "Construction is natively verified and the same-cycle Jobs owner observes Quarry Worker unlocked, while P49 explicitly lacks cross-owner root and progression generations.",
      autonomousSpendingAuthorized: false,
      jobsAllocationAuthorized: false,
    },
    game: {
      pinned: P42_INTERVENTION_IDENTITY.pinnedGame,
      snapshotSha256: gameSnapshotSha256,
      fixtureName: P42_INTERVENTION_IDENTITY.fixtureName,
      fixtureSha256: P42_INTERVENTION_IDENTITY.fixtureSha256,
      seed: P42_INTERVENTION_IDENTITY.seed,
      epoch: P42_INTERVENTION_IDENTITY.epoch,
    },
    comparison: {
      arms: {
        A: "Historical P42 control; Farm saving priority remains and Quarry is not purchased.",
        B: "P42 qualification and exact substitution gated by a bounded P51 test-only Quarry request.",
        BRepeat: "Same request and intervention as B.",
      },
      interventionInstalledAfterPeriod: 719,
      constructionAndJobsPeriod: P42_EXPECTED.period,
      constructionWorkCycleId: receipt.origin.workCycleId,
      constructionInput: {
        candidate: {
          buildingId: bTrace.quarryOrder.key,
          orderingIndex: bTrace.quarryOrder.orderingIndex,
          orderingGeneration: bTrace.quarryOrder.orderingGeneration,
          weighting: bTrace.quarryOrder.weighting,
          cost: bTrace.quarryOrder.cost,
        },
        candidateAffordable: affordability.output.affordable,
        conflictPlan: {
          result: conflictPlan.output.kind,
          conflict: conflictPlan.input.conflictSample.conflict,
        },
        competitionPlan: {
          result: competitionPlan.output.kind,
          selectedTarget: competitionPlan.output.decision.key,
        },
        reservationSubstitution: (() => {
          const event = bTrace.p42Events.find(
            (candidate) => candidate.type === "reservation-read",
          );
          assert.ok(
            event,
            "P42 did not record the qualified reservation substitution",
          );
          return {
            applied: event.applied,
            reason: event.reason,
            previousCompletedPublication: event.previousCompletedPublication,
            before: event.reservationBefore,
            after: event.reservationAfter,
          };
        })(),
      },
      beforeInterventionAEqualsB: true,
      beforeInterventionBEqualsBRepeat: true,
      afterInterventionBEqualsBRepeat: true,
      verifiedPurchase: {
        controlId: P42_EXPECTED.quarryTarget,
        beforeCount: nativePurchase.input.beforeCount,
        afterCount: nativePurchase.output.afterCount,
        resourceDebit: {
          Lumber: nativePurchase.output.resourceDebit.Lumber.debit,
          Stone: nativePurchase.output.resourceDebit.Stone.debit,
        },
        nativeActionObserved: true,
      },
      P36GatherActionsRetained: bTrace.p36GatherActions,
      P38GatherActionsRetained: bTrace.p38GatherActions,
      gatherActionsAddedByP51: 0,
    },
    receipt: {
      contract: receipt,
      exactSizeBytes: bTrace.state.metrics.maxReceiptBytes,
      creationFrequency: {
        A: receiptEvents(aTrace).length,
        B: bTrace.state.metrics.receiptCreations,
        BRepeat: repeatTrace.state.metrics.receiptCreations,
      },
      publicationPoint:
        "Build application stages the candidate immediately after the verified-success disposition guard; the immutable receipt is published after runBuildAutomation calls finishCycle(true). Its native proof reuses captured-build's existing before/after count check.",
      jobsConsumption: {
        status: consumed.status,
        reason: consumed.reason,
        period: consumed.period,
        agePeriods: consumed.receiptAgePeriods,
        ageWorkCycles: consumed.receiptAgeWorkCycles,
        ownerScope: consumed.ownerScope,
        ownerSessionFreshness: consumed.ownerSessionFreshness,
        workCycleIdentity: consumed.workCycleIdentity,
        jobsPreparationGeneration: consumed.jobsPreparationGeneration,
        quarryWorker: consumed.quarryWorker,
        jobCatalog: jobsObservation.evidence.ordinaryJobs,
        postOrdinaryJobsState: b720.state.jobs,
        plannedDecisionIdentity:
          jobsObservation.evidence.plannedDecisionIdentity,
        crossOwnerIdentity: consumed.crossOwnerIdentity,
        release: released.reason,
      },
      request: bTrace.request,
    },
    instrumentation: {
      testOnly: true,
      receiptNativeReads: nativePortAudit.readCallsites,
      receiptNativeControls: nativePortAudit.controlCallsites,
      receiptNativePortAudit: nativePortAudit,
      p49ObservationReads: {
        controlResolution:
          jobsObservation.controlResolutionReadsDuringObservation,
        settings: jobsObservation.settingsReadsDuringObservation,
        catalog: jobsObservation.catalogReadsDuringObservation,
        demand: jobsObservation.demandReadsDuringObservation,
        nativeRoot: jobsObservation.nativeRootReadsDuringObservation,
      },
      publicationMilliseconds: bTrace.state.metrics.publishMs,
      consumptionMilliseconds: bTrace.state.metrics.consumeMs,
      maximumCallbackIncrement: bTrace.state.metrics.maxCallbackIncrement,
      retainedEventCount: bTrace.state.events.length,
      retainedEventBytes: bTrace.state.eventBytes,
      invalidations: bTrace.state.metrics.invalidations,
      p42AndP40ExistingInstrumentation: bTrace.instrumentationMetrics,
      rendererCpuClaim:
        "not made; callback timings are not a renderer CPU-share measurement",
    },
    lifecycle: {
      A: aTrace?.state?.events ?? [],
      B: bTrace.state.events,
      BRepeat: repeatTrace.state.events,
      jobsAdmissions,
    },
    replay: {
      checkpoints: p51CheckpointsForEvidence(A, B, BRepeat),
      bundleSha256,
      replayHarnessSha256,
      sourceHashes,
      baselineTunedNativeParityFixture: {
        path: "test-artifacts/benchmark/settings/baseline-tuned.json",
        present: false,
        limitation:
          "The existing baseline-tuned.json native-parity fixture is absent; this experiment uses controlled exact Chromium A/B/B-repeat.",
      },
    },
  };
}
