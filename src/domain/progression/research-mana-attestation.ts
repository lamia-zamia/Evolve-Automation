export type ResearchManaEvidenceStatus =
  "verified" | "source-inferred" | "observed" | "unavailable" | "conflicting";

export type ResearchManaEvidenceRequirement =
  | "upstream-runtime-identity"
  | "native-action-binding"
  | "offer-control-binding"
  | "mana-callback-identity"
  | "cost-adjustment-chain"
  | "debit-evaluation-stability"
  | "current-route-and-progression"
  | "observed-debit";

export interface ResearchManaEvidenceItem {
  readonly requirement: ResearchManaEvidenceRequirement;
  readonly status: ResearchManaEvidenceStatus;
  readonly reason?: string;
}

export interface ResearchManaDebitAttestation {
  readonly status: ResearchManaEvidenceStatus;
  readonly reasons: readonly string[];
}

const requiredResearchManaEvidence: readonly ResearchManaEvidenceRequirement[] =
  Object.freeze([
    "upstream-runtime-identity",
    "native-action-binding",
    "offer-control-binding",
    "mana-callback-identity",
    "cost-adjustment-chain",
    "debit-evaluation-stability",
    "current-route-and-progression",
    "observed-debit",
  ]);

/**
 * Folds explicit evidence without upgrading source predictions, quotes, or deltas into authority.
 * This result is diagnostic only and is not connected to Research execution.
 */
export function attestResearchManaDebit(
  evidence: readonly ResearchManaEvidenceItem[],
): ResearchManaDebitAttestation {
  const byRequirement = new Map<
    ResearchManaEvidenceRequirement,
    ResearchManaEvidenceItem
  >();
  const duplicateRequirements = new Set<ResearchManaEvidenceRequirement>();
  for (const item of evidence) {
    if (byRequirement.has(item.requirement))
      duplicateRequirements.add(item.requirement);
    byRequirement.set(item.requirement, item);
  }
  const missing = requiredResearchManaEvidence.filter(
    (requirement) => !byRequirement.has(requirement),
  );
  const unavailableReasons = missing.map(
    (requirement) => `${requirement}: required evidence was not supplied`,
  );
  const items = requiredResearchManaEvidence.flatMap((requirement) => {
    const item = byRequirement.get(requirement);
    return item === undefined ? [] : [item];
  });
  const reasons = [
    ...unavailableReasons,
    ...[...duplicateRequirements].map(
      (requirement) =>
        `${requirement}: conflicting duplicate evidence was supplied`,
    ),
    ...items.flatMap((item) =>
      item.status === "verified"
        ? []
        : [
            `${item.requirement}: ${item.reason ?? `evidence is ${item.status}`}`,
          ],
    ),
  ];
  const status: ResearchManaEvidenceStatus =
    duplicateRequirements.size > 0 ||
    items.some((item) => item.status === "conflicting")
      ? "conflicting"
      : missing.length > 0 ||
          items.some((item) => item.status === "unavailable")
        ? "unavailable"
        : items.some((item) => item.status === "source-inferred")
          ? "source-inferred"
          : items.some((item) => item.status === "observed")
            ? "observed"
            : "verified";
  return Object.freeze({ status, reasons: Object.freeze(reasons) });
}
