export type ResourceClaimLifecycleEvidence = Readonly<{
  goal: "active" | "cancelled" | "unknown";
  permission: "enabled" | "disabled" | "unknown";
  queues: "empty" | "player-committed" | "unknown";
  root: "current" | "replaced" | "unknown";
  progression: "current" | "changed" | "unknown";
  obligation: "mandatory" | "not-mandatory" | "unknown";
  grant: "incomplete" | "complete" | "unknown";
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
    evidence.progression === "unknown" ||
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
  if (evidence.obligation === "not-mandatory")
    return Object.freeze({
      state: "invalidated",
      reason: "obligation-ended",
      retainClaim: false,
    });
  if (evidence.offer === "absent")
    return Object.freeze({
      state: "released",
      reason: "verified-offer-absent",
      retainClaim: false,
    });
  if (evidence.offer === "current" && evidence.nonMana === "insufficient")
    return Object.freeze({
      state: "released",
      reason: "verified-non-mana-shortage",
      retainClaim: false,
    });
  const unresolved = Object.values(evidence).some((value) =>
    ["unknown", "changed"].includes(value),
  );
  if (
    unresolved ||
    evidence.goal !== "active" ||
    evidence.permission !== "enabled"
  )
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
