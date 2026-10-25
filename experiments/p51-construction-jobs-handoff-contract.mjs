import { P42_EXPECTED } from "./p42-construction-priority-counterfactual-policy.mjs";

export const P51_QUARRY_REQUEST = Object.freeze({
  requestId: "p51-test-only-quarry-priority-request-v1",
  origin: "test-only",
  generation: 1,
  active: true,
  period: P42_EXPECTED.period,
  workCycleId: P42_EXPECTED.workCycleId,
  orderingGeneration: P42_EXPECTED.orderingGeneration,
  targetBuildingId: P42_EXPECTED.quarryTarget,
  suspendSavingPriorityForBuildingId: P42_EXPECTED.previousTarget,
  suspendSavingPriorityAcknowledged: true,
  maximumPurchases: 1,
  playerSelected: false,
  productionAuthorized: false,
});

const MAX_EVENTS = 16;
const MAX_EVENT_BYTES = 16_384;
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finiteIdentity = (value) => Number.isSafeInteger(value) && value >= 0;

function diagnosticNow() {
  const clock = globalThis.eaDiagnosticsNow;
  return typeof clock === "function" ? clock() : undefined;
}

function ensureState(hooks) {
  if (!isRecord(hooks.p51HandoffState)) {
    hooks.p51HandoffState = {
      pendingReceipt: null,
      stagedPurchase: null,
      constructionCycleCompleted: false,
      lastActionIdentity: null,
      lastConsumedReceiptId: null,
      latestNativePostcondition: null,
      events: [],
      eventBytes: 0,
      metrics: {
        receiptCreations: 0,
        rejectedPublications: 0,
        consumedReceipts: 0,
        invalidations: 0,
        callbackIncrementsByCycle: {},
        maxCallbackIncrement: 0,
        publishMs: 0,
        consumeMs: 0,
        maxReceiptBytes: 0,
        eventOverflow: 0,
      },
    };
  }
  return hooks.p51HandoffState;
}

function retainEvent(state, event) {
  if (state.events.length >= MAX_EVENTS) {
    state.metrics.eventOverflow++;
    return;
  }
  const bytes = JSON.stringify(event).length * 2;
  if (state.eventBytes + bytes > MAX_EVENT_BYTES) {
    state.metrics.eventOverflow++;
    return;
  }
  state.events.push(Object.freeze(event));
  state.eventBytes += bytes;
}

function rejectPublication(state, reason, details = {}) {
  state.metrics.rejectedPublications++;
  retainEvent(state, {
    kind: "publication-rejected",
    reason,
    ...details,
  });
  return Object.freeze({ published: false, reason });
}

export function qualifyP51QuarryRequest(request, arm) {
  if (arm === "A")
    return Object.freeze({ qualified: false, reason: "historical-control" });
  if (arm !== "B" && arm !== "B-repeat")
    return Object.freeze({ qualified: false, reason: "unknown-arm" });
  for (const [key, expected] of Object.entries(P51_QUARRY_REQUEST)) {
    if (request?.[key] !== expected)
      return Object.freeze({
        qualified: false,
        reason: `request-mismatch:${key}`,
      });
  }
  return Object.freeze({
    qualified: true,
    reason: "bounded-test-only-quarry-request",
  });
}

export function createP51HandoffState() {
  return ensureState({});
}

export function recordP51NativePostconditionForTest(hooks, postcondition) {
  const state = ensureState(hooks);
  state.latestNativePostcondition = Object.freeze({
    targetBuildingId: postcondition.targetBuildingId,
    actionReportedSuccess: postcondition.actionReportedSuccess === true,
    beforeCount: postcondition.beforeCount,
    afterCount: postcondition.afterCount,
  });
}

export function stageP51VerifiedPurchaseForTest(hooks, { candidate, result }) {
  const state = ensureState(hooks);
  if (
    !qualifyP51QuarryRequest(hooks.p51ConstructionRequest, hooks.p51Arm)
      .qualified ||
    candidate?.key !== hooks.p51ConstructionRequest?.targetBuildingId ||
    result?.outcome?.status !== "succeeded" ||
    result?.disposition !== "verified-success" ||
    result?.clicked !== true
  )
    return Object.freeze({
      staged: false,
      reason: "no-qualified-verified-target",
    });
  if (state.stagedPurchase !== null)
    return Object.freeze({ staged: false, reason: "purchase-already-staged" });
  state.stagedPurchase = Object.freeze({
    candidate: Object.freeze({
      key: candidate.key,
      ...(isRecord(candidate.cost)
        ? { cost: Object.freeze({ ...candidate.cost }) }
        : {}),
    }),
    result: Object.freeze({
      clicked: true,
      disposition: "verified-success",
      outcome: Object.freeze({ status: "succeeded" }),
    }),
  });
  return Object.freeze({
    staged: true,
    reason: "verified-target-awaits-cycle-completion",
  });
}

export function completeP51ConstructionCycleForTest(hooks, completed) {
  const state = ensureState(hooks);
  state.constructionCycleCompleted = completed === true;
  const staged = state.stagedPurchase;
  state.stagedPurchase = null;
  if (staged === null)
    return Object.freeze({
      published: false,
      reason: "no-staged-target-purchase",
    });
  if (completed !== true) {
    state.latestNativePostcondition = null;
    return rejectPublication(state, "construction-cycle-incomplete", {
      targetBuildingId: staged.candidate.key,
    });
  }
  return publishP51ConstructionReceiptForTest(hooks, staged);
}

export function recordP51ConstructionAttemptForTest(
  hooks,
  { candidate, result },
) {
  const state = ensureState(hooks);
  const start = diagnosticNow();
  if (
    result?.outcome?.status === "succeeded" &&
    result?.disposition === "verified-success" &&
    result?.clicked === true
  )
    return;
  const reason =
    result?.disposition === "candidate-rejected"
      ? "candidate-rejected"
      : result?.disposition === "invoked-but-unverified"
        ? "native-postcondition-unverified"
        : result?.outcome?.status !== "succeeded"
          ? "native-action-failed"
          : result?.clicked === true
            ? "native-success-disposition-unverified"
            : "no-verified-building-count-increase";
  rejectPublication(state, reason, {
    targetBuildingId: candidate?.key ?? null,
    disposition: result?.disposition ?? null,
  });
  state.latestNativePostcondition = null;
  const elapsed = diagnosticNow();
  if (start !== undefined && elapsed !== undefined)
    state.metrics.publishMs += Math.max(0, elapsed - start);
}

function capturedCompleteCost(value) {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (
    entries.length === 0 ||
    entries.some(
      ([id, amount]) =>
        id.length === 0 ||
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount < 0,
    )
  )
    return undefined;
  return Object.freeze(Object.fromEntries(entries));
}

export function publishP51ConstructionReceiptForTest(
  hooks,
  { candidate, result },
) {
  const start = diagnosticNow();
  const state = ensureState(hooks);
  const request = hooks.p51ConstructionRequest;
  const owner = hooks.p40OwnerContext;
  const proof = state.latestNativePostcondition;
  const details = {
    targetBuildingId: candidate?.key ?? null,
    workCycleId: owner?.workCycleId ?? null,
    orderingGeneration: owner?.orderingGeneration ?? null,
  };

  let reason;
  if (!qualifyP51QuarryRequest(request, hooks.p51Arm).qualified)
    reason = "explicit-test-request-unqualified";
  else if (hooks.p42OwnerCycleApplied !== true)
    reason = "p42-intervention-not-qualified-and-applied";
  else if (
    !isRecord(owner) ||
    !finiteIdentity(owner.workCycleId) ||
    !finiteIdentity(owner.orderingGeneration) ||
    !finiteIdentity(owner.rootGeneration) ||
    typeof owner.progressionGeneration !== "string" ||
    owner.progressionGeneration.length === 0
  )
    reason = "construction-owner-identity-unavailable";
  else if (owner.period !== request.period)
    reason = "construction-period-mismatch";
  else if (owner.workCycleId !== request.workCycleId)
    reason = "construction-work-cycle-mismatch";
  else if (owner.orderingGeneration !== request.orderingGeneration)
    reason = "construction-ordering-generation-mismatch";
  else if (candidate?.key !== request.targetBuildingId)
    reason = "executed-target-does-not-match-request";
  else if (
    state.lastActionIdentity ===
    `${owner.workCycleId}:${owner.orderingGeneration}:${candidate.key}`
  )
    reason = "duplicate-purchase-notification";
  else if (state.pendingReceipt !== null) reason = "receipt-already-pending";
  else if (state.constructionCycleCompleted !== true)
    reason = "construction-cycle-not-completed";
  else if (
    result?.outcome?.status !== "succeeded" ||
    result?.disposition !== "verified-success" ||
    result?.clicked !== true
  )
    reason = "native-result-not-verified-purchase";
  else if (
    !isRecord(proof) ||
    proof.targetBuildingId !== candidate?.key ||
    proof.actionReportedSuccess !== true ||
    !Number.isFinite(proof.beforeCount) ||
    !Number.isFinite(proof.afterCount) ||
    proof.afterCount <= proof.beforeCount
  )
    reason = "native-building-count-postcondition-unverified";

  if (reason !== undefined) {
    const rejected = rejectPublication(state, reason, details);
    state.latestNativePostcondition = null;
    const end = diagnosticNow();
    if (start !== undefined && end !== undefined)
      state.metrics.publishMs += Math.max(0, end - start);
    return rejected;
  }

  const actionIdentity = `${owner.workCycleId}:${owner.orderingGeneration}:${candidate.key}`;
  const receipt = Object.freeze({
    receiptId: `construction:${actionIdentity}`,
    origin: Object.freeze({
      owner: "Construction",
      workCycleId: owner.workCycleId,
      orderingGeneration: owner.orderingGeneration,
      period: owner.period,
      rootGeneration: owner.rootGeneration,
      progressionGeneration: owner.progressionGeneration,
    }),
    targetBuildingId: candidate.key,
    result: "verified-purchase",
    nativePostcondition: Object.freeze({
      source: "captured-build-count-postcondition",
      targetBuildingId: proof.targetBuildingId,
      beforeCount: proof.beforeCount,
      afterCount: proof.afterCount,
      actionReportedSuccess: true,
      constructionCycleCompleted: true,
    }),
    ...(capturedCompleteCost(candidate.cost) === undefined
      ? {}
      : { cost: capturedCompleteCost(candidate.cost) }),
    requestIdentity: Object.freeze({
      requestId: request.requestId,
      generation: request.generation,
    }),
    executionAuthority: "none",
  });
  const receiptBytes = JSON.stringify(receipt).length * 2;
  state.pendingReceipt = receipt;
  state.lastActionIdentity = actionIdentity;
  state.metrics.receiptCreations++;
  state.metrics.maxReceiptBytes = Math.max(
    state.metrics.maxReceiptBytes,
    receiptBytes,
  );
  retainEvent(state, {
    kind: "receipt-published",
    period: owner.period,
    receipt,
  });
  state.latestNativePostcondition = null;
  const end = diagnosticNow();
  if (start !== undefined && end !== undefined)
    state.metrics.publishMs += Math.max(0, end - start);
  return Object.freeze({ published: true, receipt });
}

function finishConsumption(state, receipt, status, reason, observation) {
  const stateMetrics = state.metrics;
  const cycle = observation.workCycleId;
  const callbacks = stateMetrics.callbackIncrementsByCycle[cycle] ?? 0;
  stateMetrics.callbackIncrementsByCycle[cycle] = callbacks + 1;
  stateMetrics.maxCallbackIncrement = Math.max(
    stateMetrics.maxCallbackIncrement,
    callbacks + 1,
  );
  stateMetrics.consumedReceipts++;
  state.lastConsumedReceiptId = receipt.receiptId;
  state.pendingReceipt = null;
  const event = Object.freeze({
    kind: "receipt-consumed",
    receiptId: receipt.receiptId,
    status,
    reason,
    period: observation.period ?? null,
    receiptAgePeriods:
      Number.isFinite(observation.period) &&
      Number.isFinite(receipt.origin.period)
        ? observation.period - receipt.origin.period
        : null,
    receiptAgeWorkCycles:
      Number.isSafeInteger(observation.workCycleId) &&
      Number.isSafeInteger(receipt.origin.workCycleId)
        ? observation.workCycleId - receipt.origin.workCycleId
        : null,
    ownerScope: observation.ownerScope ?? null,
    ownerSessionFreshness:
      observation.evidence?.ownerSessionFreshness ?? "unavailable",
    jobsPreparationGeneration:
      observation.evidence?.jobsPreparationGeneration ?? null,
    workCycleIdentity: observation.evidence?.workCycleIdentity ?? null,
    capturedRootIdentity: observation.evidence?.capturedRootIdentity ?? null,
    progressionEvidence: observation.evidence?.progressionEvidence ?? null,
    quarryWorker: observation.quarryWorker ?? null,
    plannedDecisionIdentity:
      observation.evidence?.plannedDecisionIdentity ?? null,
    crossOwnerIdentity: observation.crossOwnerIdentity,
    executionAuthority: "none",
  });
  retainEvent(state, event);
  retainEvent(state, {
    kind: "receipt-released",
    receiptId: receipt.receiptId,
    reason: "intended-jobs-handoff-window-ended",
  });
  return event;
}

export function consumeP51ConstructionReceiptForTest(
  hooks,
  jobsObservation,
  current = {},
) {
  const start = diagnosticNow();
  const state = ensureState(hooks);
  const receipt = state.pendingReceipt;
  if (receipt === null) {
    const result = Object.freeze({
      status:
        state.lastConsumedReceiptId !== null
          ? "receipt-consumed-twice"
          : "no-pending-receipt",
      reason:
        state.lastConsumedReceiptId !== null
          ? "receipt-was-already-released"
          : "no-published-receipt",
    });
    const end = diagnosticNow();
    if (start !== undefined && end !== undefined)
      state.metrics.consumeMs += Math.max(0, end - start);
    return result;
  }

  const evidence = jobsObservation?.evidence;
  const observation = {
    ...current,
    ownerScope: jobsObservation?.ownerScope,
    evidence,
  };
  const jobs = Array.isArray(evidence?.ordinaryJobs)
    ? evidence.ordinaryJobs
    : [];
  const quarryWorker = jobs.find((job) => job.id === "quarry_worker");
  observation.quarryWorker =
    quarryWorker === undefined
      ? Object.freeze({ status: "row-unavailable" })
      : Object.freeze({
          status: "observed",
          unlocked: quarryWorker.unlocked === true,
        });

  let status = "rejected";
  let reason = "jobs-owner-observation-unavailable";
  let crossOwnerIdentity = Object.freeze({
    workCycle: "unavailable",
    rootGeneration: "unavailable",
    progressionEpoch: "unavailable",
  });
  const request = hooks.p51ConstructionRequest;
  if (current.superseded === true) reason = "superseded-by-native-mutation";
  else if (
    !qualifyP51QuarryRequest(request, hooks.p51Arm).qualified ||
    receipt.requestIdentity?.requestId !== request?.requestId ||
    receipt.requestIdentity?.generation !== request?.generation
  )
    reason = "test-request-cancelled-or-replaced";
  else if (
    current.rootGeneration !== undefined &&
    current.rootGeneration !== receipt.origin.rootGeneration
  )
    reason = "root-generation-mismatch";
  else if (
    current.progressionGeneration !== undefined &&
    current.progressionGeneration !== receipt.origin.progressionGeneration
  )
    reason = "progression-epoch-mismatch";
  else if (
    !isRecord(evidence) ||
    jobsObservation?.admission?.status !== "admitted-for-observation" ||
    evidence.ownerSessionFreshness !== "verified-current" ||
    evidence.capturedRootIdentity?.referenceMatchedAtExecution !== true ||
    evidence.jobsAvailable !== true
  )
    reason = "jobs-owner-unavailable-or-stale";
  else if (
    !["ordinary-jobs-only", "full-jobs-and-foundry"].includes(
      jobsObservation.ownerScope,
    )
  )
    reason = "jobs-owner-scope-unavailable";
  else if (
    evidence.workCycleIdentity !== receipt.origin.workCycleId ||
    evidence.progressionEvidence?.workCycle !== receipt.origin.workCycleId ||
    current.workCycleId !== receipt.origin.workCycleId
  )
    reason = "source-work-cycle-mismatch";
  else if (evidence.jobsPreparationGeneration == null)
    reason = "jobs-preparation-generation-unavailable";
  else if (quarryWorker === undefined) reason = "quarry-worker-row-unavailable";
  else if (quarryWorker.unlocked !== true)
    reason = "claimed-quarry-purchase-not-reflected-in-jobs-catalog";
  else {
    const rootGeneration = evidence.progressionEvidence?.rootGeneration;
    const progressionEpoch = evidence.progressionEvidence?.progressionEpoch;
    if (
      rootGeneration === "unavailable" ||
      progressionEpoch === "unavailable" ||
      rootGeneration == null ||
      progressionEpoch == null
    ) {
      status = "handoff-authority-incomplete";
      reason = "cross-owner-root-or-progression-generation-unavailable";
      crossOwnerIdentity = Object.freeze({
        workCycle: "matched-current",
        rootGeneration: "missing-from-p49-jobs-evidence",
        progressionEpoch: "missing-from-p49-jobs-evidence",
        jobsPreparationGeneration: evidence.jobsPreparationGeneration,
        constructionRootGeneration: receipt.origin.rootGeneration,
        constructionProgressionGeneration: receipt.origin.progressionGeneration,
      });
    } else if (
      rootGeneration !== receipt.origin.rootGeneration ||
      progressionEpoch !== receipt.origin.progressionGeneration
    ) {
      reason = "cross-owner-root-or-progression-generation-mismatch";
      crossOwnerIdentity = Object.freeze({
        workCycle: "matched-current",
        rootGeneration: "mismatched",
        progressionEpoch: "mismatched",
      });
    } else {
      status = "accepted-current-observation";
      reason = "cross-owner-source-root-cycle-identities-matched";
      crossOwnerIdentity = Object.freeze({
        workCycle: "matched-current",
        rootGeneration: "matched-current",
        progressionEpoch: "matched-current",
      });
    }
  }

  if (
    status !== "handoff-authority-incomplete" &&
    status !== "accepted-current-observation"
  ) {
    const rootGeneration = evidence?.progressionEvidence?.rootGeneration;
    const progressionEpoch = evidence?.progressionEvidence?.progressionEpoch;
    crossOwnerIdentity = Object.freeze({
      workCycle:
        evidence?.workCycleIdentity === receipt.origin.workCycleId
          ? "matched-current"
          : "unavailable-or-mismatched",
      rootGeneration:
        rootGeneration === undefined || rootGeneration === "unavailable"
          ? "missing-from-p49-jobs-evidence"
          : "available",
      progressionEpoch:
        progressionEpoch === undefined || progressionEpoch === "unavailable"
          ? "missing-from-p49-jobs-evidence"
          : "available",
    });
  }

  const consumed = finishConsumption(state, receipt, status, reason, {
    ...observation,
    crossOwnerIdentity,
  });
  const end = diagnosticNow();
  if (start !== undefined && end !== undefined)
    state.metrics.consumeMs += Math.max(0, end - start);
  return consumed;
}

export function invalidateP51ConstructionReceiptForTest(hooks, reason) {
  const state = ensureState(hooks);
  const receipt = state.pendingReceipt;
  const staged = state.stagedPurchase;
  if (receipt === null && staged === null) {
    state.latestNativePostcondition = null;
    state.constructionCycleCompleted = false;
    return Object.freeze({ invalidated: false, reason: "no-pending-receipt" });
  }
  state.pendingReceipt = null;
  state.stagedPurchase = null;
  state.latestNativePostcondition = null;
  state.constructionCycleCompleted = false;
  state.metrics.invalidations++;
  retainEvent(state, {
    kind: "receipt-invalidated",
    receiptId: receipt?.receiptId ?? null,
    targetBuildingId:
      receipt?.targetBuildingId ?? staged?.candidate.key ?? null,
    reason,
  });
  return Object.freeze({ invalidated: true, reason });
}
