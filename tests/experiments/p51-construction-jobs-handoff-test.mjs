import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  P51_QUARRY_REQUEST,
  consumeP51ConstructionReceiptForTest,
  completeP51ConstructionCycleForTest,
  createP51HandoffState,
  invalidateP51ConstructionReceiptForTest,
  publishP51ConstructionReceiptForTest,
  qualifyP51QuarryRequest,
  recordP51ConstructionAttemptForTest,
  recordP51NativePostconditionForTest,
  stageP51VerifiedPurchaseForTest,
} from "../../experiments/p51-construction-jobs-handoff-contract.mjs";
import {
  P42_EXPECTED,
  P42_INTERVENTION_IDENTITY,
  qualifyP42ConstructionReservation,
} from "../../experiments/p42-construction-priority-counterfactual-policy.mjs";

const p51PortSource = (
  await Promise.all([
    readFile(
      new URL(
        "../../experiments/p51-construction-jobs-handoff-contract.mjs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../experiments/p51-construction-jobs-handoff-trace.mjs",
        import.meta.url,
      ),
      "utf8",
    ),
  ])
).join("\n");
assert.equal(
  p51PortSource.match(
    /(?:rootState|resources|costs|buildCosts|native)\.(?:readRoot|readResources|readCost|readBuildTargets|readQueue|resolve)\s*\(/g,
  )?.length ?? 0,
  0,
  "the P51 receipt/consumer path cannot read native game state",
);
assert.equal(
  p51PortSource.match(
    /(?:controls|pageCapture\.controls)\.(?:resolve|invoke|click|action)\s*\(/g,
  )?.length ?? 0,
  0,
  "the P51 receipt/consumer path cannot invoke native controls",
);

function hooks(overrides = {}) {
  return {
    p51Arm: "B",
    p51ConstructionRequest: P51_QUARRY_REQUEST,
    p42OwnerCycleApplied: true,
    p40OwnerContext: {
      period: P42_EXPECTED.period,
      workCycleId: P42_EXPECTED.workCycleId,
      orderingGeneration: P42_EXPECTED.orderingGeneration,
      rootGeneration: 4,
      progressionGeneration: "standard-human|progression-4",
    },
    p51HandoffState: createP51HandoffState(),
    ...overrides,
  };
}

function successResult(overrides = {}) {
  return {
    clicked: true,
    outcome: { status: "succeeded" },
    disposition: "verified-success",
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    key: P42_EXPECTED.quarryTarget,
    cost: { ...P42_EXPECTED.quarryCost },
    ...overrides,
  };
}

function purchase(overrides = {}) {
  const host = hooks(overrides.hooks);
  const target = candidate(overrides.candidate);
  const result = successResult(overrides.result);
  recordP51NativePostconditionForTest(host, {
    targetBuildingId: target.key,
    actionReportedSuccess: true,
    beforeCount: 0,
    afterCount: 1,
    ...overrides.postcondition,
  });
  host.p51HandoffState.constructionCycleCompleted = true;
  const publication = publishP51ConstructionReceiptForTest(host, {
    candidate: target,
    result,
  });
  return { host, target, result, publication };
}

function jobsObservation(overrides = {}) {
  const { evidence: evidenceOverrides = {}, ...topOverrides } = overrides;
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
      jobsPreparationGeneration: 22,
      workCycleIdentity: P42_EXPECTED.workCycleId,
      capturedRootIdentity: {
        referenceMatchedAtExecution: true,
        preparationGeneration: 22,
      },
      jobsFoundryFreshness:
        ownerScope === "ordinary-jobs-only"
          ? "unavailable"
          : "verified-current",
      foundryJobs: ownerScope === "ordinary-jobs-only" ? null : [],
      foundryCrafts: ownerScope === "ordinary-jobs-only" ? null : [],
      foundryWorkerPool: ownerScope === "ordinary-jobs-only" ? null : 0,
      progressionEvidence: {
        workCycle: P42_EXPECTED.workCycleId,
        rootGeneration: "unavailable",
        progressionEpoch: "unavailable",
      },
      ordinaryJobs: [{ id: "quarry_worker", unlocked: true }],
      plannedDecisionIdentity: "jobs-plan:22",
      ...evidenceOverrides,
    },
    ...topOverrides,
  };
}

const reservationInput = () => ({
  enabled: true,
  arm: "B",
  identity: { ...P42_INTERVENTION_IDENTITY },
  authorizationHistoryMatched: true,
  preSubstitutionBoundaryCaptured: true,
  p36GatherActions: P42_EXPECTED.p36GatherActions,
  p38Authorization: {
    id: P42_EXPECTED.p38AuthorizationId,
    additionalGatherLimit: P42_EXPECTED.p38GatherLimit,
  },
  ownerContext: {
    period: P42_EXPECTED.period,
    workCycleId: P42_EXPECTED.workCycleId,
    orderingGeneration: P42_EXPECTED.orderingGeneration,
    rootGeneration: 4,
    progressionGeneration: "standard-human|progression-4",
  },
  publishedWorkCycleId: P42_EXPECTED.publishedWorkCycleId,
  currentCandidate: {
    orderingGeneration: P42_EXPECTED.orderingGeneration,
    candidateKey: P42_EXPECTED.quarryTarget,
    cost: { ...P42_EXPECTED.quarryCost },
  },
  quarryOrder: {
    key: P42_EXPECTED.quarryTarget,
    orderingIndex: 0,
    weighting: 300,
    important: false,
    knowledge: false,
    cost: { ...P42_EXPECTED.quarryCost },
    authority: {
      rootGeneration: 4,
      progressionGeneration: "standard-human|progression-4",
      controlGeneration: 9,
    },
  },
  currentAuthority: {
    rootGeneration: 4,
    progressionGeneration: "standard-human|progression-4",
    controlGeneration: 9,
    controlElementId: P42_EXPECTED.quarryTarget,
    controlActionAvailable: true,
  },
  nativeQueue: { available: true, targets: [] },
  scriptReservations: {
    available: true,
    targets: [
      {
        name: P42_EXPECTED.previousTarget,
        cause: "Saving",
        cost: { ...P42_EXPECTED.previousCost },
      },
    ],
  },
  stock: { ...P42_EXPECTED.quarryStock },
});

assert.equal(qualifyP51QuarryRequest(P51_QUARRY_REQUEST, "B").qualified, true);
assert.equal(qualifyP51QuarryRequest(P51_QUARRY_REQUEST, "A").qualified, false);
assert.equal(
  qualifyP51QuarryRequest({ ...P51_QUARRY_REQUEST, playerSelected: true }, "B")
    .qualified,
  false,
  "the test request is not labeled player-selected",
);

const verified = purchase();
assert.equal(verified.publication.published, true);
assert.equal(Object.isFrozen(verified.publication.receipt), true);
assert.equal(Object.isFrozen(verified.publication.receipt.origin), true);
assert.equal(verified.publication.receipt.result, "verified-purchase");
assert.equal(
  verified.publication.receipt.nativePostcondition.constructionCycleCompleted,
  true,
);
assert.equal(verified.publication.receipt.executionAuthority, "none");
assert.deepEqual(verified.publication.receipt.cost, P42_EXPECTED.quarryCost);
assert.deepEqual(
  Object.keys(verified.publication.receipt).sort(),
  [
    "cost",
    "executionAuthority",
    "nativePostcondition",
    "origin",
    "receiptId",
    "requestIdentity",
    "result",
    "targetBuildingId",
  ].sort(),
  "the receipt stays a compact proof record",
);

const secondNotification = publishP51ConstructionReceiptForTest(verified.host, {
  candidate: verified.target,
  result: verified.result,
});
assert.deepEqual(secondNotification, {
  published: false,
  reason: "duplicate-purchase-notification",
});

const stagedHost = hooks();
recordP51NativePostconditionForTest(stagedHost, {
  targetBuildingId: P42_EXPECTED.quarryTarget,
  actionReportedSuccess: true,
  beforeCount: 0,
  afterCount: 1,
});
assert.equal(
  stageP51VerifiedPurchaseForTest(stagedHost, {
    candidate: candidate(),
    result: successResult(),
  }).staged,
  true,
);
assert.equal(stagedHost.p51HandoffState.pendingReceipt, null);
assert.equal(
  completeP51ConstructionCycleForTest(stagedHost, false).reason,
  "construction-cycle-incomplete",
);
assert.equal(stagedHost.p51HandoffState.pendingReceipt, null);

const completeStagedHost = hooks();
recordP51NativePostconditionForTest(completeStagedHost, {
  targetBuildingId: P42_EXPECTED.quarryTarget,
  actionReportedSuccess: true,
  beforeCount: 0,
  afterCount: 1,
});
assert.equal(
  stageP51VerifiedPurchaseForTest(completeStagedHost, {
    candidate: candidate(),
    result: successResult(),
  }).staged,
  true,
);
assert.equal(completeStagedHost.p51HandoffState.pendingReceipt, null);
assert.equal(
  completeP51ConstructionCycleForTest(completeStagedHost, true).published,
  true,
);

for (const [name, setup, expectedReason] of [
  [
    "candidate rejected",
    (host) =>
      recordP51ConstructionAttemptForTest(host, {
        candidate: candidate(),
        result: successResult({
          clicked: false,
          outcome: { status: "rejected" },
          disposition: "candidate-rejected",
        }),
      }),
    "candidate-rejected",
  ],
  [
    "click reported but count postcondition failed",
    (host) =>
      recordP51NativePostconditionForTest(host, {
        targetBuildingId: P42_EXPECTED.quarryTarget,
        actionReportedSuccess: true,
        beforeCount: 0,
        afterCount: 0,
      }),
    "native-building-count-postcondition-unverified",
  ],
  [
    "missing native postcondition",
    () => {},
    "native-building-count-postcondition-unverified",
  ],
  [
    "missing Construction owner identity",
    (host) => {
      recordP51NativePostconditionForTest(host, {
        targetBuildingId: P42_EXPECTED.quarryTarget,
        actionReportedSuccess: true,
        beforeCount: 0,
        afterCount: 1,
      });
      host.p40OwnerContext = null;
    },
    "construction-owner-identity-unavailable",
  ],
  [
    "wrong executed building",
    (host) =>
      recordP51NativePostconditionForTest(host, {
        targetBuildingId: "city-basic_housing",
        actionReportedSuccess: true,
        beforeCount: 0,
        afterCount: 1,
      }),
    "native-building-count-postcondition-unverified",
  ],
]) {
  const host = hooks();
  setup(host);
  if (expectedReason === "candidate-rejected") {
    assert.equal(host.p51HandoffState.pendingReceipt, null, name);
    assert.equal(
      host.p51HandoffState.events.at(-1)?.reason,
      expectedReason,
      name,
    );
    continue;
  }
  host.p51HandoffState.constructionCycleCompleted = true;
  const rejected = publishP51ConstructionReceiptForTest(host, {
    candidate: candidate(),
    result: successResult(),
  });
  assert.equal(rejected.published, false, name);
  assert.equal(rejected.reason, expectedReason, name);
  assert.equal(host.p51HandoffState.pendingReceipt, null, name);
}

const noClickPostcondition = purchase({
  result: { clicked: false },
});
assert.equal(noClickPostcondition.publication.published, false);
assert.equal(
  noClickPostcondition.publication.reason,
  "native-result-not-verified-purchase",
);

const wrongTarget = purchase({ candidate: { key: "city-basic_housing" } });
assert.equal(wrongTarget.publication.published, false);
assert.equal(
  wrongTarget.publication.reason,
  "executed-target-does-not-match-request",
);

const wrongConstructionGeneration = purchase({
  hooks: {
    p40OwnerContext: {
      ...hooks().p40OwnerContext,
      orderingGeneration: P42_EXPECTED.orderingGeneration + 1,
    },
  },
});
assert.equal(wrongConstructionGeneration.publication.published, false);
assert.equal(
  wrongConstructionGeneration.publication.reason,
  "construction-ordering-generation-mismatch",
);

const wrongConstructionCycle = purchase({
  hooks: {
    p40OwnerContext: {
      ...hooks().p40OwnerContext,
      workCycleId: P42_EXPECTED.workCycleId + 1,
    },
  },
});
assert.equal(wrongConstructionCycle.publication.published, false);
assert.equal(
  wrongConstructionCycle.publication.reason,
  "construction-work-cycle-mismatch",
);

const rootMismatch = purchase();
const rootMismatchResult = consumeP51ConstructionReceiptForTest(
  rootMismatch.host,
  jobsObservation(),
  {
    workCycleId: P42_EXPECTED.workCycleId,
    period: P42_EXPECTED.period,
    rootGeneration: 5,
  },
);
assert.equal(rootMismatchResult.status, "rejected");
assert.equal(rootMismatchResult.reason, "root-generation-mismatch");

const progressionMismatch = purchase();
const progressionMismatchResult = consumeP51ConstructionReceiptForTest(
  progressionMismatch.host,
  jobsObservation(),
  {
    workCycleId: P42_EXPECTED.workCycleId,
    period: P42_EXPECTED.period,
    progressionGeneration: "replacement-epoch",
  },
);
assert.equal(progressionMismatchResult.reason, "progression-epoch-mismatch");

const oldCycle = purchase();
const oldCycleResult = consumeP51ConstructionReceiptForTest(
  oldCycle.host,
  jobsObservation(),
  {
    workCycleId: P42_EXPECTED.workCycleId + 1,
    period: P42_EXPECTED.period + 1,
  },
);
assert.equal(oldCycleResult.reason, "source-work-cycle-mismatch");
assert.equal(oldCycleResult.receiptAgeWorkCycles, 1);

const replacedRequest = purchase();
replacedRequest.host.p51ConstructionRequest = {
  ...P51_QUARRY_REQUEST,
  requestId: "p51-replacement-request",
  generation: 2,
};
const replacedRequestResult = consumeP51ConstructionReceiptForTest(
  replacedRequest.host,
  jobsObservation(),
  { workCycleId: P42_EXPECTED.workCycleId, period: P42_EXPECTED.period },
);
assert.equal(
  replacedRequestResult.reason,
  "test-request-cancelled-or-replaced",
);

const cancelledRequest = purchase();
cancelledRequest.host.p51ConstructionRequest = {
  ...P51_QUARRY_REQUEST,
  active: false,
};
assert.equal(
  consumeP51ConstructionReceiptForTest(
    cancelledRequest.host,
    jobsObservation(),
    { workCycleId: P42_EXPECTED.workCycleId, period: P42_EXPECTED.period },
  ).reason,
  "test-request-cancelled-or-replaced",
);

const unavailableJobs = purchase();
const unavailableJobsResult = consumeP51ConstructionReceiptForTest(
  unavailableJobs.host,
  undefined,
  { workCycleId: P42_EXPECTED.workCycleId, period: P42_EXPECTED.period },
);
assert.equal(unavailableJobsResult.reason, "jobs-owner-unavailable-or-stale");

const noWorkerRow = purchase();
const noWorkerRowResult = consumeP51ConstructionReceiptForTest(
  noWorkerRow.host,
  jobsObservation({ evidence: { ordinaryJobs: [] } }),
  { workCycleId: P42_EXPECTED.workCycleId, period: P42_EXPECTED.period },
);
assert.equal(noWorkerRowResult.reason, "quarry-worker-row-unavailable");
assert.deepEqual(noWorkerRowResult.quarryWorker, { status: "row-unavailable" });

const superseded = purchase();
const supersededResult = consumeP51ConstructionReceiptForTest(
  superseded.host,
  jobsObservation(),
  {
    workCycleId: P42_EXPECTED.workCycleId,
    period: P42_EXPECTED.period,
    superseded: true,
  },
);
assert.equal(supersededResult.reason, "superseded-by-native-mutation");

for (const ownerScope of ["ordinary-jobs-only", "full-jobs-and-foundry"]) {
  const host = purchase().host;
  const consumed = consumeP51ConstructionReceiptForTest(
    host,
    jobsObservation({ ownerScope }),
    { workCycleId: P42_EXPECTED.workCycleId, period: P42_EXPECTED.period },
  );
  assert.equal(consumed.status, "handoff-authority-incomplete");
  assert.equal(consumed.ownerScope, ownerScope);
  assert.equal(consumed.quarryWorker.unlocked, true);
  assert.equal(consumed.executionAuthority, "none");
}

const absentCrossOwnerGeneration = purchase();
const incomplete = consumeP51ConstructionReceiptForTest(
  absentCrossOwnerGeneration.host,
  jobsObservation(),
  { workCycleId: P42_EXPECTED.workCycleId, period: P42_EXPECTED.period },
);
assert.equal(incomplete.status, "handoff-authority-incomplete");
assert.equal(incomplete.receiptAgePeriods, 0);
assert.equal(
  absentCrossOwnerGeneration.host.p51HandoffState.pendingReceipt,
  null,
);
assert.equal(
  consumeP51ConstructionReceiptForTest(
    absentCrossOwnerGeneration.host,
    jobsObservation(),
    { workCycleId: P42_EXPECTED.workCycleId, period: P42_EXPECTED.period },
  ).status,
  "receipt-consumed-twice",
);
assert.equal(
  publishP51ConstructionReceiptForTest(absentCrossOwnerGeneration.host, {
    candidate: candidate(),
    result: successResult(),
  }).reason,
  "duplicate-purchase-notification",
  "the same action stays deduplicated after receipt release",
);

const rootReplacement = purchase();
assert.equal(
  invalidateP51ConstructionReceiptForTest(
    rootReplacement.host,
    "progression-root-replaced",
  ).invalidated,
  true,
);
assert.equal(rootReplacement.host.p51HandoffState.pendingReceipt, null);
assert.equal(rootReplacement.host.p51HandoffState.metrics.invalidations, 1);

for (const [name, overrides] of [
  [
    "changed native cost",
    { currentCandidate: { cost: { Lumber: 50, Stone: 11 } } },
  ],
  ["unavailable native cost", { currentCandidate: { cost: undefined } }],
  [
    "different Construction ordering generation",
    {
      ownerContext: { orderingGeneration: 91 },
      currentCandidate: { orderingGeneration: 91 },
    },
  ],
  [
    "wrong building id",
    { currentCandidate: { candidateKey: "city-basic_housing" } },
  ],
  ["mismatched root", { currentAuthority: { rootGeneration: 5 } }],
  [
    "replaced progression epoch",
    { currentAuthority: { progressionGeneration: "replacement" } },
  ],
  [
    "unavailable reservations",
    { scriptReservations: { available: false, targets: [] } },
  ],
  ["unavailable holdings", { stock: { Lumber: null, Stone: 10 } }],
]) {
  const input = reservationInput();
  for (const [key, value] of Object.entries(overrides))
    input[key] = { ...input[key], ...value };
  assert.equal(
    qualifyP42ConstructionReservation(input).qualified,
    false,
    `${name} must keep P42's one-cycle substitution fail-closed`,
  );
}

console.log("P51 verified Construction-to-Jobs handoff lifecycle tests passed");
