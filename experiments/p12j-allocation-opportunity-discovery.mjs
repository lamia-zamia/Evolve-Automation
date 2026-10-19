/** Test-only gates for selecting a captured production allocation opportunity. */

const finite = (value) => typeof value === "number" && Number.isFinite(value);

export function assessAllocationOpportunity(evidence) {
  const reasons = [];
  const action = evidence.action;
  const target = evidence.target;
  const source = evidence.source;
  const owner = evidence.owner;

  if (!action?.current || action.rootId !== evidence.rootId)
    reasons.push("changed-root-or-action");
  if (!action?.progressionCurrent) reasons.push("changed-progression");
  if (!action?.priceCurrent || action.priceIdentity !== evidence.priceIdentity)
    reasons.push("changed-native-price");
  if (action?.permitted !== true) reasons.push("action-not-permitted");
  if (action?.affordable === true) reasons.push("resource-already-sufficient");
  if (!Array.isArray(action?.shortfalls) || action.shortfalls.length === 0)
    reasons.push("missing-current-resource-constraint");

  if (evidence.budgetExhausted === true) reasons.push("budget-exhausted");
  if (evidence.evidenceComplete !== true)
    reasons.push("missing-effect-or-authority-evidence");
  if (
    owner?.effectResourceIds?.some((id) =>
      action?.shortfalls?.some((shortfall) => shortfall.resourceId === id),
    ) !== true
  )
    reasons.push("unsupported-resource-effect");
  if (owner?.demandSatisfied === true)
    reasons.push("production-owner-already-satisfies-demand");
  if (owner?.controlAvailable !== true)
    reasons.push("native-control-unavailable");
  if (owner?.permission !== true) reasons.push("owner-not-permitted");
  if (owner?.expectedReversion === true)
    reasons.push("ordinary-owner-will-revert");

  if (target !== undefined) {
    if (!finite(target.nativeMaximum) || !finite(target.assigned))
      reasons.push("unknown-native-job-capacity");
    else if (
      target.nativeMaximum >= 0 &&
      target.assigned >= target.nativeMaximum
    )
      reasons.push("native-job-cap-reached");
    if (target.smartMaximumKnown !== true)
      reasons.push("unknown-effective-smart-maximum");
    else if (
      finite(target.smartMaximum) &&
      target.assigned >= target.smartMaximum
    )
      reasons.push("smart-maximum-reached");
    if (target.permission !== true) reasons.push("target-job-not-permitted");
    if (target.controlAvailable !== true)
      reasons.push("native-target-control-unavailable");
    if (target.foundryCoupled === true && target.couplingRepresented !== true)
      reasons.push("foundry-coupling-not-represented");

    const idle = finite(target.idleWorkers) ? target.idleWorkers : 0;
    const defaultPool = finite(target.defaultPoolWorkers)
      ? target.defaultPoolWorkers
      : 0;
    if (idle + defaultPool < 1) {
      if (source === undefined) reasons.push("no-idle-or-default-pool-worker");
      else if (
        !finite(source.assigned) ||
        !finite(source.protectedMinimum) ||
        source.permission !== true ||
        source.currentPolicyKnown !== true ||
        source.ownerPlanKnown !== true
      )
        reasons.push("source-obligations-not-established");
      else if (source.assigned - source.protectedMinimum < 1)
        reasons.push("source-assignment-protected");
      if (
        owner?.expectedReversion !== false &&
        !reasons.includes("ordinary-owner-will-revert")
      )
        reasons.push("ordinary-owner-reversion-unknown");
    }
  }

  return Object.freeze({
    id: evidence.id,
    actionable: reasons.length === 0,
    reasons: Object.freeze([...new Set(reasons)].sort()),
  });
}

/** Selects complete actionable evidence; stable identity only breaks exact ties. */
export function selectAllocationOpportunity(
  evidenceRows,
  { maxCandidates = 32 } = {},
) {
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 0)
    throw new RangeError("maxCandidates must be a non-negative safe integer");
  const considered = evidenceRows.slice(0, maxCandidates);
  const assessments = considered.map(assessAllocationOpportunity);
  const actionable = assessments
    .filter(({ actionable: canAct }) => canAct)
    .sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    assessments: Object.freeze(assessments),
    selectedId: actionable[0]?.id,
    tiedIds: Object.freeze(actionable.map(({ id }) => id)),
    budgetExhausted: evidenceRows.length > maxCandidates,
  });
}
