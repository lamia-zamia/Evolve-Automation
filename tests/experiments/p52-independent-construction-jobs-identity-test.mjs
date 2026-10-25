import assert from "node:assert/strict";

import {
  P51_QUARRY_REQUEST,
  completeP51ConstructionCycleForTest,
  consumeP52ConstructionReceiptForTest,
  createP51HandoffState,
  finalizeP52ConstructionReceiptForTest,
  recordP51NativePostconditionForTest,
  stageP51VerifiedPurchaseForTest,
} from "../../experiments/p51-construction-jobs-handoff-contract.mjs";
import { createProgressionEpochReader } from "../../src/adapters/evolve/progression-epoch.ts";

const rootGeneration = 4;
const progressionFingerprint = "standard-human|progression-4";
const sharedReader = Object.freeze({
  readRootGeneration: () => rootGeneration,
  readProgressionEpoch: () => progressionFingerprint,
});

function createHooks(overrides = {}) {
  return {
    p51Arm: "B",
    p52Mode: true,
    p51ConstructionRequest: P51_QUARRY_REQUEST,
    p42OwnerCycleApplied: true,
    p40OwnerContext: {
      period: P51_QUARRY_REQUEST.period,
      workCycleId: P51_QUARRY_REQUEST.workCycleId,
      orderingGeneration: P51_QUARRY_REQUEST.orderingGeneration,
    },
    constructionPublicationAuthority: {
      workCycleId: P51_QUARRY_REQUEST.workCycleId,
      rootGeneration,
      progressionGeneration: progressionFingerprint,
      sourceProvenance: "captured-runtime-shared-progression-reader",
      identitySource: sharedReader,
    },
    p51HandoffState: createP51HandoffState(),
    ...overrides,
  };
}

function verifiedPurchase(hooks = createHooks()) {
  const candidate = {
    key: P51_QUARRY_REQUEST.targetBuildingId,
    cost: { Lumber: 50, Stone: 10 },
  };
  const result = {
    clicked: true,
    disposition: "verified-success",
    outcome: { status: "succeeded" },
  };
  recordP51NativePostconditionForTest(hooks, {
    targetBuildingId: candidate.key,
    actionReportedSuccess: true,
    beforeCount: 0,
    afterCount: 1,
  });
  assert.equal(
    stageP51VerifiedPurchaseForTest(hooks, { candidate, result }).staged,
    true,
  );
  assert.equal(
    completeP51ConstructionCycleForTest(hooks, true).deferred,
    true,
    "P52 waits for the shared runtime's post-success Construction identity",
  );
  const publication = finalizeP52ConstructionReceiptForTest(hooks);
  assert.equal(publication.published, true, publication.reason);
  return { hooks, receipt: publication.receipt };
}

function jobsObservation(overrides = {}) {
  const { evidence: evidenceOverrides = {}, ...observationOverrides } =
    overrides;
  const ownerScope = overrides.ownerScope ?? "ordinary-jobs-only";
  return {
    ownerScope,
    admission: {
      status: "admitted-for-observation",
      executionAuthority: "none",
    },
    evidence: {
      ownerSessionFreshness: "verified-current",
      jobsAvailable: true,
      workCycleIdentity: P51_QUARRY_REQUEST.workCycleId,
      jobsPreparationGeneration: 17,
      capturedRootIdentity: {
        preparationGeneration: 17,
        referenceMatchedAtExecution: true,
      },
      progressionEvidence: {
        workCycle: P51_QUARRY_REQUEST.workCycleId,
        rootGeneration: "unavailable",
        progressionEpoch: "unavailable",
      },
      ordinaryJobs: [{ id: "quarry_worker", unlocked: true }],
      ...evidenceOverrides,
    },
    ...observationOverrides,
  };
}

function identity(overrides = {}) {
  return {
    sourceProvenance: "captured-runtime-shared-progression-reader",
    sourceIdentity: sharedReader,
    samplePoint: "jobs-owner-admission",
    rootGeneration,
    progressionFingerprint,
    ...overrides,
  };
}

function correlate(overrides = {}) {
  const purchase = verifiedPurchase(overrides.hooks);
  if (overrides.requestAfterPublication !== undefined)
    purchase.hooks.p51ConstructionRequest = overrides.requestAfterPublication;
  const result = consumeP52ConstructionReceiptForTest(
    purchase.hooks,
    overrides.observation ?? jobsObservation(overrides.jobs),
    {
      workCycleId: P51_QUARRY_REQUEST.workCycleId,
      period: P51_QUARRY_REQUEST.period,
      jobsIdentity:
        overrides.identity === null ? undefined : identity(overrides.identity),
      ...(overrides.current ?? {}),
    },
  );
  return { ...purchase, result };
}

for (const ownerScope of ["ordinary-jobs-only", "full-jobs-and-foundry"]) {
  const result = correlate({ jobs: { ownerScope } }).result;
  assert.equal(result.status, "correlated-owner-event", ownerScope);
  assert.equal(result.executionAuthority, "none", ownerScope);
  assert.equal(result.identityEvidence.sameRuntimeSource, true, ownerScope);
}

{
  const otherReader = Object.freeze({
    readRootGeneration: () => rootGeneration,
    readProgressionEpoch: () => progressionFingerprint,
  });
  const result = correlate({
    identity: { sourceIdentity: otherReader },
  }).result;
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "runtime-progression-source-mismatch");
  assert.equal(
    result.identityEvidence.jobsRootGeneration,
    result.identityEvidence.constructionRootGeneration,
    "equal counters from different reader instances do not qualify",
  );
}

{
  let rootReplacementListener = () => {};
  const root = {
    tech: { mining: 1 },
    genes: { creep: 1 },
    race: { species: "human", universe: "standard" },
    stats: { achieve: {}, psykill: 0 },
    civic: { govern: { type: "anarchy" } },
    settings: { showCivic: true, showUnderground: false, showSurface: false },
    arpa: {},
  };
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced(listener) {
      rootReplacementListener = listener;
      return () => {};
    },
  };
  const reader = createProgressionEpochReader(rootState);
  const runtimeProgressionSource = Object.freeze({
    readRootGeneration: reader.readRootGeneration,
    readProgressionEpoch: reader.read,
  });
  const before = {
    sourceProvenance: "captured-runtime-shared-progression-reader",
    sourceIdentity: runtimeProgressionSource,
    samplePoint: "post-construction-success",
    rootGeneration: reader.readRootGeneration(),
    progressionGeneration: reader.read(),
  };
  assert.equal(
    rootState.readRoot(),
    root,
    "root wrapper reference is retained",
  );
  const { hooks } = verifiedPurchase(
    createHooks({
      constructionPublicationAuthority: {
        workCycleId: P51_QUARRY_REQUEST.workCycleId,
        rootGeneration: before.rootGeneration,
        progressionGeneration: before.progressionGeneration,
        sourceProvenance: before.sourceProvenance,
        identitySource: before.sourceIdentity,
      },
    }),
  );
  rootReplacementListener();
  const after = identity({
    sourceIdentity: runtimeProgressionSource,
    rootGeneration: reader.readRootGeneration(),
    progressionFingerprint: reader.read(),
  });
  assert.equal(
    rootState.readRoot(),
    root,
    "replacement notification preserves reference",
  );
  assert.equal(after.rootGeneration, before.rootGeneration + 1);
  const result = consumeP52ConstructionReceiptForTest(
    hooks,
    jobsObservation(),
    {
      workCycleId: P51_QUARRY_REQUEST.workCycleId,
      period: P51_QUARRY_REQUEST.period,
      jobsIdentity: after,
    },
  );
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "root-replacement-generation-mismatch");
  reader.release();
}

for (const [name, overrides, status, reason] of [
  [
    "root mismatch",
    { identity: { rootGeneration: 5 } },
    "rejected",
    "root-replacement-generation-mismatch",
  ],
  [
    "unexplained progression mismatch",
    { identity: { progressionFingerprint: "changed" } },
    "rejected",
    "unexplained-progression-fingerprint-change",
  ],
  [
    "missing Jobs identity",
    { identity: null },
    "handoff-authority-incomplete",
    "jobs-shared-identity-unavailable",
  ],
  [
    "missing Jobs provenance",
    { identity: { sourceProvenance: undefined } },
    "handoff-authority-incomplete",
    "jobs-shared-identity-unavailable",
  ],
  [
    "stale Jobs session",
    { jobs: { evidence: { ownerSessionFreshness: "stale" } } },
    "stale",
    "jobs-owner-session-not-current",
  ],
  [
    "wrong work cycle",
    { current: { workCycleId: P51_QUARRY_REQUEST.workCycleId + 1 } },
    "stale",
    "receipt-or-jobs-observation-expired",
  ],
  [
    "older receipt period",
    { current: { period: P51_QUARRY_REQUEST.period + 1 } },
    "stale",
    "receipt-or-jobs-observation-expired",
  ],
  [
    "cancelled request",
    { requestAfterPublication: { ...P51_QUARRY_REQUEST, active: false } },
    "rejected",
    "test-request-cancelled-or-replaced",
  ],
  [
    "replaced request",
    {
      requestAfterPublication: {
        ...P51_QUARRY_REQUEST,
        requestId: "replacement",
      },
    },
    "rejected",
    "test-request-cancelled-or-replaced",
  ],
  [
    "forged owner scope",
    { jobs: { ownerScope: "construction" } },
    "rejected",
    "jobs-owner-scope-unavailable-or-forged",
  ],
  [
    "native mutation after publication",
    {
      current: {
        nativeMutationsAfterPublication: [
          { method: "action", elementId: "city-farm" },
        ],
      },
    },
    "stale",
    "native-mutation-after-publication",
  ],
]) {
  const result = correlate(overrides).result;
  assert.equal(result.status, status, name);
  assert.equal(result.reason, reason, name);
}

{
  const { hooks } = verifiedPurchase();
  const receipt = hooks.p51HandoffState.pendingReceipt;
  hooks.p51HandoffState.pendingReceipt = Object.freeze({
    ...receipt,
    origin: Object.freeze({ ...receipt.origin, identityProvenance: undefined }),
  });
  const result = consumeP52ConstructionReceiptForTest(
    hooks,
    jobsObservation(),
    {
      workCycleId: P51_QUARRY_REQUEST.workCycleId,
      period: P51_QUARRY_REQUEST.period,
      jobsIdentity: identity(),
    },
  );
  assert.equal(result.status, "handoff-authority-incomplete");
  assert.equal(
    result.reason,
    "construction-shared-source-provenance-unavailable",
  );
}

{
  const { hooks } = verifiedPurchase();
  const receipt = hooks.p51HandoffState.pendingReceipt;
  hooks.p51HandoffState.pendingReceipt = Object.freeze({
    ...receipt,
    targetBuildingId: "city-farm",
  });
  const result = consumeP52ConstructionReceiptForTest(
    hooks,
    jobsObservation(),
    {
      workCycleId: P51_QUARRY_REQUEST.workCycleId,
      period: P51_QUARRY_REQUEST.period,
      jobsIdentity: identity(),
    },
  );
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "construction-purchase-proof-invalid");
}

{
  const changedFingerprint = "standard-human|progression-after-known-mutation";
  const result = correlate({
    identity: { progressionFingerprint: changedFingerprint },
    current: {
      progressionMutationBetweenBoundaries: {
        kind: "source-backed-known-mutation",
        source: "native-invocation-trace",
        betweenBoundaries: true,
        beforeFingerprint: progressionFingerprint,
        afterFingerprint: changedFingerprint,
        nativeMutationIds: ["native-action:42"],
      },
    },
  }).result;
  assert.equal(result.status, "correlated-owner-event");
  assert.equal(result.progressionRelationship, "source-backed-known-mutation");
  assert.equal(result.executionAuthority, "none");
}

{
  const { hooks } = verifiedPurchase();
  const first = consumeP52ConstructionReceiptForTest(hooks, jobsObservation(), {
    workCycleId: P51_QUARRY_REQUEST.workCycleId,
    period: P51_QUARRY_REQUEST.period,
    jobsIdentity: identity(),
  });
  const second = consumeP52ConstructionReceiptForTest(
    hooks,
    jobsObservation(),
    {
      workCycleId: P51_QUARRY_REQUEST.workCycleId,
      period: P51_QUARRY_REQUEST.period,
      jobsIdentity: identity(),
    },
  );
  assert.equal(first.status, "correlated-owner-event");
  assert.equal(second.status, "no-receipt");
  assert.equal(second.reason, "receipt-consumed-already");
  assert.equal(hooks.p51HandoffState.pendingReceipt, null);
  assert.equal(
    hooks.p51HandoffState.events.filter(
      (event) => event.kind === "receipt-released",
    ).length,
    1,
  );
}

assert.equal(
  consumeP52ConstructionReceiptForTest(createHooks(), jobsObservation(), {
    workCycleId: 90,
    period: 720,
    jobsIdentity: identity(),
  }).status,
  "no-receipt",
);

console.log("P52 independent Construction-to-Jobs identity regressions passed");
