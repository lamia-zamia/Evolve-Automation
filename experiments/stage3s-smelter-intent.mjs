/** Test-surface-only adapter experiment. The native Smelter planner and iSmelter control remain the executor. */

const samePrice = (left, right) => {
  if (
    !Array.isArray(left) ||
    !Array.isArray(right) ||
    left.length !== right.length
  )
    return false;
  const canonical = (price) =>
    [...price]
      .map(({ resourceId, amount }) => [resourceId, amount])
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId));
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
};

export function applySelectedGoalResourceIntentToSmelter({
  input,
  intent,
  currentFreshness,
  automationEnabled,
  competingDemand,
  supportedResources,
}) {
  const unchanged = (status, reason) =>
    Object.freeze({ input, status, reason, allocationChangeCost: null });
  if (automationEnabled !== true)
    return unchanged("permission-disabled", "autoSmelter is not enabled");
  if (input.initialised !== true)
    return unchanged(
      "producer-unavailable",
      "native Smelter input is unavailable",
    );
  if (
    intent === null ||
    intent === undefined ||
    intent.actionable !== true ||
    (intent.selection !== "mandatory" && intent.selection !== "candidate")
  )
    return unchanged(
      "no-verified-intent",
      "no current mandatory fact or selected strategic candidate is actionable",
    );
  if (!Number.isFinite(intent.shortfall) || intent.shortfall <= 0)
    return unchanged(
      "shortfall-satisfied",
      "the current shortfall is not positive and finite",
    );
  const freshness = intent.freshness;
  if (
    freshness === null ||
    freshness === undefined ||
    freshness.rootGeneration !== currentFreshness.rootGeneration ||
    freshness.progressionEpoch !== currentFreshness.progressionEpoch ||
    freshness.offerIdentity !== currentFreshness.offerIdentity ||
    freshness.offerGeneration !== currentFreshness.offerGeneration ||
    freshness.settingsFingerprint !== currentFreshness.settingsFingerprint ||
    freshness.productionFingerprint !==
      currentFreshness.productionFingerprint ||
    !samePrice(freshness.price, currentFreshness.price)
  )
    return unchanged(
      "stale-intent",
      "root, progression, offer, settings, or production evidence changed",
    );
  if (
    competingDemand?.evidence !== "complete" ||
    !Array.isArray(competingDemand.resources)
  )
    return unchanged(
      "demand-unknown",
      "competing spending demand is not fully observed",
    );
  if (
    !Array.isArray(supportedResources) ||
    !supportedResources.includes(intent.resourceId)
  )
    return unchanged(
      "producer-unavailable",
      "the enabled owner does not declare this resource capability",
    );
  const currentDemandField =
    intent.resourceId === "Iron"
      ? "ironDemanded"
      : intent.resourceId === "Steel"
        ? "steelDemanded"
        : undefined;
  const resourceDemand = competingDemand.resources.find(
    ({ resourceId }) => resourceId === intent.resourceId,
  );
  if (
    resourceDemand === undefined ||
    !Number.isFinite(resourceDemand.requestedQuantity) ||
    !Number.isFinite(resourceDemand.currentQuantity) ||
    resourceDemand.requestedQuantity < 0 ||
    resourceDemand.currentQuantity < 0
  )
    return unchanged(
      "demand-unknown",
      "the exact current demand quantity or holding is unavailable",
    );
  const uncoveredDemand = Math.max(
    0,
    resourceDemand.requestedQuantity - resourceDemand.currentQuantity,
  );
  if (uncoveredDemand >= intent.shortfall)
    return unchanged(
      "already-demanded",
      "current competing demand quantitatively covers the goal shortfall",
    );
  if (currentDemandField !== undefined && input[currentDemandField] === true)
    return unchanged(
      "demand-insufficient",
      "the owner already sees demand, but its native boolean input cannot express a larger quantity",
    );

  // Native resource identifiers match Smelter production fields. The existing planner retains
  // fuel constraints, allocation bounds, and all competing Iron/Iridium demand.
  const demandField =
    intent.resourceId === "Iron"
      ? "ironDemanded"
      : intent.resourceId === "Steel"
        ? "steelDemanded"
        : undefined;
  if (demandField === undefined)
    return unchanged(
      "producer-unavailable",
      "no mapped Smelter demand field exists for this resource",
    );
  return Object.freeze({
    input: Object.freeze({ ...input, [demandField]: true }),
    status: "intent-applied",
    selection: intent.selection,
    reason: null,
    allocationChangeCost:
      "must be measured by comparing native planner decisions",
  });
}
