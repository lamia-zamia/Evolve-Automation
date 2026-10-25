import assert from "node:assert/strict";

import {
  P42_EXPECTED,
  P42_INTERVENTION_IDENTITY,
} from "./p42-construction-priority-counterfactual-policy.mjs";
import { P51_QUARRY_REQUEST } from "./p51-construction-jobs-handoff-contract.mjs";

const at = (run, period) =>
  run.checkpoints.find((checkpoint) => checkpoint.period === period);

function semanticCheckpoint(checkpoint) {
  const p51 = checkpoint?.native?.p51;
  const jobsAdmissions = (p51?.jobsAdmissions ?? []).map((event) => {
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
  const p52 = p51?.p52;
  return {
    period: checkpoint?.period,
    saveSha256: checkpoint?.saveSha256,
    state: checkpoint?.state,
    controlUsage: checkpoint?.controlUsage,
    nativeCallsSha256: checkpoint?.nativeCallsSha256,
    randomCalls: checkpoint?.randomCalls,
    rngState: checkpoint?.rngState,
    p40Purchase: p51?.p40QuarryPurchase ?? null,
    p42Events: p51?.p42Events ?? [],
    p51Events: (p51?.state?.events ?? []).map((event) => {
      if (event.kind !== "receipt-consumed") return event;
      return {
        ...event,
        identityEvidence: event.identityEvidence
          ? { ...event.identityEvidence }
          : null,
      };
    }),
    jobsAdmissions,
    p52: p52
      ? {
          classification: p52.classification,
          constructionIdentitySample: p52.constructionIdentitySample
            ? {
                ...p52.constructionIdentitySample,
                identitySampleMs: null,
              }
            : null,
          jobsIdentitySample: p52.jobsIdentitySample
            ? {
                ...p52.jobsIdentitySample,
                synchronousMs: null,
              }
            : null,
          dormantAdmissionCallbacks: p52.dormantAdmissionCallbacks,
        }
      : null,
  };
}

export function createP52IndependentConstructionJobsIdentityEvidence({
  A,
  B,
  BRepeat,
  gameSnapshotSha256,
  bundleSha256,
  replayHarnessSha256,
  sourceHashes,
  staticPortAudit,
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
    assert.ok(checkpoint, `P52 missed ${name}`);

  assert.deepEqual(
    semanticCheckpoint(a719),
    semanticCheckpoint(b719),
    "A and B must match before intervention",
  );
  assert.deepEqual(
    semanticCheckpoint(b719),
    semanticCheckpoint(repeat719),
    "B and B-repeat must match before intervention",
  );
  assert.deepEqual(
    semanticCheckpoint(b720),
    semanticCheckpoint(repeat720),
    "B and B-repeat must remain deterministic through Jobs admission",
  );

  const aTrace = a720.native.p51;
  const bTrace = b720.native.p51;
  const repeatTrace = repeat720.native.p51;
  const aEvents = aTrace?.state?.events ?? [];
  const bEvents = bTrace?.state?.events ?? [];
  const repeatEvents = repeatTrace?.state?.events ?? [];
  const published = bEvents.find(
    (event) => event.kind === "receipt-published",
  )?.receipt;
  const repeated = repeatEvents.find(
    (event) => event.kind === "receipt-published",
  )?.receipt;
  const consumed = bEvents.find((event) => event.kind === "receipt-consumed");
  const released = bEvents.filter((event) => event.kind === "receipt-released");
  const jobsObservation = bTrace?.jobsAdmissions?.find(
    (event) => event?.admission?.status === "admitted-for-observation",
  );
  const p52Construction = bTrace?.p52?.constructionIdentitySample;
  const p52Jobs = bTrace?.p52?.jobsIdentitySample;
  const nativePurchase = bTrace?.p40QuarryPurchase;
  const quarantine = jobsObservation?.evidence?.ordinaryJobs?.find(
    (job) => job.id === "quarry_worker",
  );
  const identityEqual =
    published?.origin?.rootGeneration ===
      p52Jobs?.jobsIdentity?.rootGeneration &&
    published?.origin?.progressionGeneration ===
      p52Jobs?.jobsIdentity?.progressionFingerprint;
  const purchaseVerified =
    b720.state.buildings.rock_quarry === 1 &&
    nativePurchase?.output?.afterCount === 1 &&
    nativePurchase?.input?.beforeCount === 0;
  const replayValid =
    purchaseVerified &&
    quarantine?.unlocked === true &&
    published?.result === "verified-purchase" &&
    published?.nativePostcondition?.actionReportedSuccess === true &&
    published?.requestIdentity?.requestId === P51_QUARRY_REQUEST.requestId &&
    consumed?.executionAuthority === "none";

  assert.equal(
    aEvents.some((event) => event.kind === "receipt-published"),
    false,
    "historical control A must have no Construction receipt",
  );
  assert.equal(a720.state.buildings.rock_quarry ?? 0, 0);
  assert.equal(aTrace?.p52?.jobsIdentitySample?.sampleCount ?? 0, 0);
  assert.equal(aTrace?.p52?.dormantAdmissionCallbacks > 0, true);
  assert.equal(
    bEvents.filter((event) => event.kind === "receipt-published").length,
    1,
  );
  assert.equal(
    repeatEvents.filter((event) => event.kind === "receipt-published").length,
    1,
  );
  assert.deepEqual(published, repeated, "receipt values must repeat exactly");
  assert.equal(
    published?.origin?.identityProvenance?.source,
    "captured-runtime-shared-progression-reader",
  );
  assert.equal(
    published?.origin?.identityProvenance?.samplePoint,
    "post-construction-success",
  );
  assert.equal(p52Jobs?.jobsIdentity?.samplePoint, "jobs-owner-admission");
  assert.equal(p52Jobs?.sameRuntimeProgressionSource, true);
  assert.equal(p52Jobs?.sampleCount, 1);
  assert.equal(p52Jobs?.nativeRootReads, 1);
  assert.equal(p52Jobs?.nativeMutationsAfterPublication?.length, 0);
  assert.equal(
    p52Construction?.sourceProvenance,
    "captured-runtime-shared-progression-reader",
  );
  assert.equal(p52Construction?.identityNativeRootReads, 1);
  assert.equal(p52Construction?.incrementalNativeRootReads, 0);
  assert.equal(released.length, 1);
  assert.equal(bTrace?.state?.pendingReceipt, null);
  assert.equal(bTrace?.p52?.classification?.status, "correlated-owner-event");
  assert.equal(bTrace?.p52?.classification?.executionAuthority, "none");
  assert.equal(bTrace?.state?.metrics?.p52IdentitySamples, 1);
  assert.equal(bTrace?.state?.metrics?.p52IdentityNativeRootReads, 1);
  assert.equal(bTrace?.state?.metrics?.eventOverflow, 0);
  assert.equal(bTrace?.state?.eventBytes <= 16_384, true);
  assert.equal(jobsObservation?.controlResolutionReadsDuringObservation, 0);
  assert.equal(jobsObservation?.settingsReadsDuringObservation, 0);
  assert.equal(jobsObservation?.catalogReadsDuringObservation, 0);
  assert.equal(jobsObservation?.demandReadsDuringObservation, 0);
  assert.equal(jobsObservation?.nativeRootReadsDuringObservation, 0);
  assert.equal(bTrace?.p36GatherActions, P42_EXPECTED.p36GatherActions);
  assert.equal(bTrace?.p38GatherActions, 17);
  assert.equal(staticPortAudit.jobsIdentitySampleSites, 1);
  assert.equal(staticPortAudit.jobsIdentityAccessorCalls, 2);
  assert.equal(staticPortAudit.jobsIdentityRootReadCallsites, 1);

  let outcome;
  let reason;
  if (!replayValid) {
    outcome = "D — Invalid";
    reason =
      "A/B/B-repeat replay or native purchase/Jobs unlock postconditions failed.";
  } else if (
    bTrace?.p52?.classification?.status === "correlated-owner-event" &&
    identityEqual
  ) {
    outcome = "A — Historical handoff correlation established";
    reason =
      "Construction and Jobs independently identified the same runtime reader and compatible post-success progression state.";
  } else if (
    bTrace?.p52?.classification?.status === "handoff-authority-incomplete"
  ) {
    outcome = "B — Independent identity unavailable";
    reason =
      "The replay reached Jobs admission but could not establish one required independent source or identity.";
  } else {
    outcome = "C — Identity mismatch";
    reason =
      "The replay established both boundary identities but found a stale, mismatched, or unexplained transition.";
  }

  return {
    schema: "p52-independent-construction-jobs-identity-v1",
    decision: {
      outcome,
      reason,
      executionAuthority: "none",
      allocatorIntroduced: false,
      productionChanged: false,
    },
    game: {
      pinned: P42_INTERVENTION_IDENTITY.pinnedGame,
      snapshotSha256: gameSnapshotSha256,
      fixtureName: P42_INTERVENTION_IDENTITY.fixtureName,
      fixtureSha256: P42_INTERVENTION_IDENTITY.fixtureSha256,
      seed: P42_INTERVENTION_IDENTITY.seed,
      epoch: P42_INTERVENTION_IDENTITY.epoch,
      scenario: "P42-derived Chromium A/B/B-repeat at p719 and p720",
    },
    comparison: {
      A: "Historical control: Farm saving priority remains; Quarry receipt absent.",
      B: "P42 test-only one-cycle Quarry reservation substitution and verified P51 purchase receipt.",
      BRepeat: "Exact repeat of B.",
      parity: {
        AEqualsBBeforeIntervention: true,
        BEqualsBRepeatBeforeIntervention: true,
        BEqualsBRepeatAfterIntervention: true,
      },
      p720: {
        verifiedNativeQuarryPurchase: purchaseVerified,
        quarryWorkerUnlockedInJobsObservation: quarantine?.unlocked === true,
        ordinaryJobsOutcome: {
          farmer: b720.state.jobs.farmer ?? 0,
          quarryWorker: b720.state.jobs.quarry_worker ?? 0,
          interpretation: "ordinary Jobs gameplay only",
        },
        jobsOwnerScope: jobsObservation?.ownerScope ?? null,
        nativeMutationsBetweenPublicationAndJobs:
          p52Jobs?.nativeMutationsAfterPublication ?? [],
      },
    },
    identityProvenance: {
      sourceMatrix: {
        construction: {
          value:
            "constructionPublicationAuthority after successful Construction cycle",
          service: "the runtime's existing shared ProgressionEpochReader",
          provenance: "captured-runtime-shared-progression-reader",
          samplePoint: p52Construction?.samplePoint ?? null,
          rootGeneration: published?.origin?.rootGeneration ?? null,
          progressionFingerprint:
            published?.origin?.progressionGeneration ?? null,
          runtimeWorkCycle: published?.origin?.workCycleId ?? null,
          orderingGeneration: published?.origin?.orderingGeneration ?? null,
          rootObjectIdentityCompared: false,
          additionalP52RootObservations: 0,
        },
        jobs: {
          value:
            "one bounded shared-reader sample inside P49's Jobs admission callback",
          service: "the same runtime ProgressionEpochReader object",
          provenance: p52Jobs?.jobsIdentity?.sourceProvenance ?? null,
          samplePoint: p52Jobs?.jobsIdentity?.samplePoint ?? null,
          rootGeneration: p52Jobs?.jobsIdentity?.rootGeneration ?? null,
          progressionFingerprint:
            p52Jobs?.jobsIdentity?.progressionFingerprint ?? null,
          workCycleIdentity:
            jobsObservation?.evidence?.workCycleIdentity ?? null,
          jobsPreparationGeneration:
            jobsObservation?.evidence?.jobsPreparationGeneration ?? null,
          capturedRootReferenceMatched:
            jobsObservation?.evidence?.capturedRootIdentity
              ?.referenceMatchedAtExecution ?? false,
          sameSourceObject: p52Jobs?.sameRuntimeProgressionSource ?? false,
        },
        distinction: {
          rootReplacementGeneration:
            "reader-local incremented counter; root may retain the same wrapped reference",
          progressionFingerprint:
            "coarse offer identity derived from sampled native root fields",
          runtimeInstance:
            "opaque shared ProgressionEpochReader object identity",
          jobsSessionGeneration: "Jobs-local preparation counter",
          workCycleIdentity:
            "runtime automationCycle shared into Jobs evidence",
          constructionOrderingGeneration: "Construction adapter cycle identity",
        },
      },
      currentProgressionRelationship: {
        classification: consumed?.progressionRelationship ?? null,
        equality: identityEqual,
        constructionFingerprint:
          published?.origin?.progressionGeneration ?? null,
        jobsFingerprint: p52Jobs?.jobsIdentity?.progressionFingerprint ?? null,
        equalityDoesNotEstablish: [
          "current resources or prices",
          "current queues or reservations",
          "worker commitments",
          "food sustainability",
        ],
      },
    },
    receipt: {
      published,
      consumed,
      releaseCount: released.length,
      retainedEvidenceBytes: bTrace?.state?.eventBytes ?? null,
      maxReceiptBytes: bTrace?.state?.metrics?.maxReceiptBytes ?? null,
      oneTimeConsumption: bTrace?.state?.pendingReceipt === null,
      handoffStatus: bTrace?.p52?.classification?.status ?? null,
      reason: bTrace?.p52?.classification?.reason ?? null,
      executionAuthority: "none",
    },
    measurements: {
      dormantNoReceiptPath: {
        identitySamples: aTrace?.p52?.jobsIdentitySample?.sampleCount ?? 0,
        admissionCallbacks: aTrace?.p52?.dormantAdmissionCallbacks ?? 0,
        callbackDurationsMs: (aTrace?.jobsAdmissions ?? []).map(
          (event) => event.additionalSynchronousCallbackMs ?? null,
        ),
      },
      constructionIdentityReuse: {
        reusedFromP51PostSuccessSample: true,
        identitySamplingPoint: p52Construction?.samplePoint ?? null,
        synchronousMs: p52Construction?.identitySampleMs ?? null,
        nativeRootObservations:
          p52Construction?.identityNativeRootReads ?? null,
        incrementalNativeRootObservations: 0,
      },
      jobsIdentityAcquisition: {
        sampleCount: p52Jobs?.sampleCount ?? 0,
        nativeRootObservations: p52Jobs?.nativeRootReads ?? 0,
        synchronousMs: p52Jobs?.synchronousMs ?? null,
        noCatalogOrControlReads: true,
        p49ObservationDeltas: {
          controls:
            jobsObservation?.controlResolutionReadsDuringObservation ?? null,
          settings: jobsObservation?.settingsReadsDuringObservation ?? null,
          catalog: jobsObservation?.catalogReadsDuringObservation ?? null,
          demand: jobsObservation?.demandReadsDuringObservation ?? null,
          ownerWrappedRootReads:
            jobsObservation?.nativeRootReadsDuringObservation ?? null,
        },
      },
      pureCorrelationChecksMs: bTrace?.state?.metrics?.p52CorrelationMs ?? null,
      receiptConsumptionMs:
        bTrace?.state?.metrics?.p52ReceiptConsumptionMs ?? null,
      completeConsumerMs: bTrace?.state?.metrics?.consumeMs ?? null,
      additionalNativeRootObservations: p52Jobs?.nativeRootReads ?? 0,
      callbackDurationMs:
        jobsObservation?.additionalSynchronousCallbackMs ?? null,
      sourceCallsiteAudit: staticPortAudit,
      callbackTimingIsNotRendererCpuShare: true,
    },
    artifacts: {
      bundleSha256,
      replayHarnessSha256,
      sourceHashes,
      baselineTunedNativeParity:
        "not run; test-artifacts/benchmark/settings/baseline-tuned.json is absent",
      p46RendererCpuGate: "unresolved; no benchmark rerun or 2% claim",
    },
    limitations: [
      "The progression fingerprint is coarse and excludes volatile resources, building counts, queues, prices, and worker commitments.",
      "A source-backed known progression mutation can preserve historical-event correlation only when its exact before/after fingerprints and native mutation evidence are supplied; unexplained changes are rejected.",
      "The additional Jobs identity sample reads the shared root once and measures synchronous time; this is not a renderer CPU-share benchmark.",
    ],
  };
}

export { semanticCheckpoint as p52SemanticCheckpoint };
