export type ResourceClaimLifecycleEvidence = Readonly<{
  nativeActionId: string;
  goal: "active" | "cancelled" | "unknown";
  permission: "enabled" | "disabled" | "unknown";
  queues: "empty" | "player-committed" | "unknown";
  root: "current" | "replaced" | "unknown";
  progression: "current" | "changed" | "unknown";
  obligation: "mandatory" | "not-mandatory" | "unknown";
  grant: "incomplete" | "complete" | "unknown";
  offerSet: Readonly<{
    status: "complete-fresh" | "failed" | "incomplete" | "stale" | "unknown";
    identity: string | undefined;
    observationId: string | undefined;
    previousObservationId: string;
  }>;
  previousContext: Readonly<{
    rootGeneration: number;
    progressionGeneration: string;
  }>;
  currentContext: Readonly<{
    rootGeneration: number | undefined;
    progressionGeneration: string | undefined;
    routeIdentity: string | undefined;
  }>;
  currentObservation: Readonly<{
    status: "validated" | "failed" | "incomplete" | "stale" | "unknown";
    rootGeneration: number | undefined;
    progressionGeneration: string | undefined;
    routeIdentity: string | undefined;
    offerSetIdentity: string | undefined;
    observationId: string | undefined;
    actionId: string | undefined;
    manaPrice: number | undefined;
    offerGeneration: number | undefined;
    controlGeneration: number | undefined;
    resources: "complete" | "unknown";
  }>;
  offer: "current" | "absent" | "unknown";
  price: "current" | "changed" | "unknown";
  binding: "current" | "changed" | "unknown";
  nonMana: "affordable" | "insufficient" | "unknown";
}>;

export type ResourceClaimLifecycleDecision = Readonly<{
  state: "active" | "released" | "completed" | "invalidated" | "suspended";
  reason:
    | "current-mandatory-offer"
    | "verified-non-mana-shortage"
    | "verified-offer-absent"
    | "grant-completed"
    | "goal-or-authority-ended"
    | "obligation-ended"
    | "evidence-unavailable";
  retainClaim: boolean;
}>;

/**
 * Decides whether an admitted test claim still protects stock. A verified
 * non-Mana shortage releases spending protection while the prerequisite graph
 * continues to represent the obligation. Unknown evidence retains the claim
 * for fail-closed ledger accounting.
 */
export function decideResourceClaimLifecycle(
  evidence: ResourceClaimLifecycleEvidence,
): ResourceClaimLifecycleDecision {
  if (
    evidence.goal === "cancelled" ||
    evidence.permission === "disabled" ||
    evidence.queues === "player-committed" ||
    evidence.root === "replaced"
  )
    return Object.freeze({
      state: "invalidated",
      reason: "goal-or-authority-ended",
      retainClaim: false,
    });
  if (
    evidence.goal === "unknown" ||
    evidence.permission === "unknown" ||
    evidence.queues === "unknown" ||
    evidence.root === "unknown" ||
    evidence.obligation === "unknown" ||
    evidence.grant === "unknown"
  )
    return Object.freeze({
      state: "suspended",
      reason: "evidence-unavailable",
      retainClaim: true,
    });
  if (evidence.grant === "complete")
    return Object.freeze({
      state: "completed",
      reason: "grant-completed",
      retainClaim: false,
    });
  if (evidence.progression === "unknown")
    return Object.freeze({
      state: "suspended",
      reason: "evidence-unavailable",
      retainClaim: true,
    });
  if (evidence.obligation === "not-mandatory")
    return Object.freeze({
      state: "invalidated",
      reason: "obligation-ended",
      retainClaim: false,
    });
  const observation = evidence.currentObservation;
  const progressionEvidenceMatches =
    evidence.progression ===
    (evidence.previousContext.progressionGeneration ===
    evidence.currentContext.progressionGeneration
      ? "current"
      : "changed");
  const currentContextMatches =
    observation.status === "validated" &&
    Number.isSafeInteger(evidence.currentContext.rootGeneration) &&
    Number.isSafeInteger(evidence.previousContext.rootGeneration) &&
    evidence.previousContext.rootGeneration ===
      evidence.currentContext.rootGeneration &&
    progressionEvidenceMatches &&
    observation.rootGeneration === evidence.currentContext.rootGeneration &&
    evidence.currentContext.progressionGeneration !== undefined &&
    evidence.currentContext.progressionGeneration !== "" &&
    observation.progressionGeneration ===
      evidence.currentContext.progressionGeneration &&
    evidence.currentContext.routeIdentity !== undefined &&
    evidence.currentContext.routeIdentity !== "" &&
    observation.routeIdentity === evidence.currentContext.routeIdentity &&
    evidence.offerSet.identity !== undefined &&
    evidence.offerSet.identity !== "" &&
    evidence.offerSet.observationId !== undefined &&
    evidence.offerSet.observationId !== "" &&
    observation.offerSetIdentity === evidence.offerSet.identity &&
    observation.observationId === evidence.offerSet.observationId &&
    observation.observationId !== evidence.offerSet.previousObservationId &&
    evidence.offerSet.status === "complete-fresh";
  if (evidence.offer === "absent") {
    if (
      !currentContextMatches ||
      observation.actionId !== undefined ||
      observation.manaPrice !== undefined ||
      observation.offerGeneration !== undefined ||
      observation.controlGeneration !== undefined
    )
      return Object.freeze({
        state: "suspended",
        reason: "evidence-unavailable",
        retainClaim: true,
      });
    return Object.freeze({
      state: "released",
      reason: "verified-offer-absent",
      retainClaim: false,
    });
  }
  const reconciledCurrentOffer =
    currentContextMatches &&
    observation.actionId === evidence.nativeActionId &&
    typeof observation.manaPrice === "number" &&
    Number.isFinite(observation.manaPrice) &&
    observation.manaPrice >= 0 &&
    Number.isSafeInteger(observation.offerGeneration) &&
    observation.offerGeneration === observation.controlGeneration &&
    observation.resources === "complete";
  const unresolved = Object.entries(evidence).some(
    ([key, value]) =>
      key !== "offerSet" &&
      key !== "currentContext" &&
      key !== "currentObservation" &&
      key !== "nativeActionId" &&
      typeof value === "string" &&
      value === "unknown",
  );
  if (
    !reconciledCurrentOffer ||
    unresolved ||
    evidence.goal !== "active" ||
    evidence.permission !== "enabled"
  )
    return Object.freeze({
      state: "suspended",
      reason: "evidence-unavailable",
      retainClaim: true,
    });
  if (evidence.nonMana === "insufficient")
    return Object.freeze({
      state: "released",
      reason: "verified-non-mana-shortage",
      retainClaim: false,
    });
  const changedEvidence = Object.entries(evidence).some(
    ([key, value]) =>
      key !== "offerSet" &&
      key !== "currentContext" &&
      key !== "currentObservation" &&
      key !== "nativeActionId" &&
      value === "changed",
  );
  if (changedEvidence)
    return Object.freeze({
      state: "suspended",
      reason: "evidence-unavailable",
      retainClaim: true,
    });
  if (unresolved)
    return Object.freeze({
      state: "suspended",
      reason: "evidence-unavailable",
      retainClaim: true,
    });
  return Object.freeze({
    state: "active",
    reason: "current-mandatory-offer",
    retainClaim: true,
  });
}
