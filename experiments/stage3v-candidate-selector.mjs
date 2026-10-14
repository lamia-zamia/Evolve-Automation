/** Test-surface-only strategy candidate selection. Native Research remains the executor. */
export function selectGoalResourceCandidate({
  hooks,
  input,
  demand,
  settings: currentSettings,
  goalActionId,
  currentGame,
  currentRootGeneration,
  readFreshStock,
}) {
  const unavailable = (reason) => ({ apply: false, status: "unknown", reason });
  if (currentSettings.autoSmelter !== true || input.initialised !== true)
    return {
      ...unavailable("explicit Smelter permission or producer is absent"),
      status: "permission-disabled",
    };
  const catalog = hooks.readCurrentResearchCatalog?.(goalActionId);
  if (
    catalog?.current !== true ||
    catalog.source !== "shared-current-cycle" ||
    !Array.isArray(catalog.offers) ||
    !Array.isArray(catalog.definitions) ||
    !Array.isArray(catalog.grantLevels) ||
    !Array.isArray(catalog.applicability)
  )
    return unavailable("current native goal/offer evidence is incomplete");
  const goal = catalog.definitions.find(
    (definition) => definition.actionId === goalActionId,
  );
  const goalApplicability = new Map(catalog.applicability).get(goalActionId);
  if (
    goal?.prerequisites?.kind !== "declared" ||
    goalApplicability?.status !== "eligible" ||
    goal.eligibility.hasNativeCondition
  )
    return unavailable("the selected goal route is not fully established");
  const levels = new Map(catalog.grantLevels);
  const missingRequirements = goal.prerequisites.requirements.filter(
    ({ technologyId, requiredLevel }) =>
      (levels.get(technologyId) ?? 0) < requiredLevel,
  );
  const candidate = missingRequirements
    .flatMap((requirement) =>
      catalog.offers
        .filter(
          (offer) =>
            offer.grantTechnology === requirement.technologyId &&
            offer.grantLevel >= requirement.requiredLevel,
        )
        .map((offer) => ({ requirement, offer })),
    )
    .find(({ offer }) =>
      ["Iron", "Steel"].some((resourceId) =>
        Object.hasOwn(offer.cost, resourceId),
      ),
    );
  if (candidate === undefined)
    return unavailable(
      "no current offered action advances a missing goal requirement",
    );
  const resourceId = Object.hasOwn(candidate.offer.cost, "Steel")
    ? "Steel"
    : "Iron";
  const currentQuantity = readFreshStock(currentGame, resourceId);
  const requestedQuantity = demand.requestedQuantity(resourceId);
  const price = candidate.offer.cost[resourceId];
  const shortfall = Math.max(0, price - currentQuantity);
  if (
    !Number.isFinite(currentQuantity) ||
    !Number.isFinite(requestedQuantity) ||
    !Number.isFinite(price) ||
    shortfall <= 0
  )
    return unavailable("candidate price, holding, or shortfall is unavailable");
  const freshness = {
    rootGeneration: catalog.rootGeneration,
    progressionEpoch: catalog.progressionEpoch,
    offerIdentity: `${candidate.offer.elementId}:${candidate.offer.generation}`,
    offerGeneration: candidate.offer.generation,
    price: Object.entries(candidate.offer.cost).map(([id, amount]) => ({
      resourceId: id,
      amount,
    })),
    settingsFingerprint: JSON.stringify({
      autoSmelter: currentSettings.autoSmelter,
      productionSmelting: currentSettings.productionSmelting,
    }),
    productionFingerprint: JSON.stringify(input),
    stockResourceId: resourceId,
    stockAmount: currentQuantity,
    stockRootGeneration: currentRootGeneration,
  };
  if (
    catalog.current !== true ||
    catalog.rootGeneration !== freshness.rootGeneration ||
    catalog.progressionEpoch !== freshness.progressionEpoch ||
    candidate.offer.generation !== freshness.offerGeneration ||
    currentRootGeneration !== catalog.rootGeneration ||
    candidate.offer.cost[resourceId] !== price ||
    JSON.stringify(input) !== freshness.productionFingerprint ||
    JSON.stringify({
      autoSmelter: currentSettings.autoSmelter,
      productionSmelting: currentSettings.productionSmelting,
    }) !== freshness.settingsFingerprint
  )
    return unavailable(
      "candidate failed same-call root, offer, price, settings, or production revalidation",
    );
  const uncoveredDemand = Math.max(0, requestedQuantity - currentQuantity);
  if (uncoveredDemand >= shortfall)
    return {
      apply: false,
      selection: "candidate",
      mandatory: false,
      status: "already-demanded",
      reason: "exact competing demand covers the goal shortfall",
      route: `${goalActionId} -> ${candidate.requirement.technologyId}:${candidate.requirement.requiredLevel}`,
      actionId: candidate.offer.elementId,
      resourceId,
      shortfall,
      requestedQuantity,
      currentQuantity,
    };
  const alreadyDemanded =
    input[resourceId === "Steel" ? "steelDemanded" : "ironDemanded"];
  if (alreadyDemanded)
    return {
      apply: false,
      selection: "candidate",
      mandatory: false,
      status: "demand-insufficient",
      reason:
        "the native Smelter input already sees demand and cannot express a larger quantity",
      route: `${goalActionId} -> ${candidate.requirement.technologyId}:${candidate.requirement.requiredLevel}`,
      actionId: candidate.offer.elementId,
      resourceId,
      shortfall,
      requestedQuantity,
      currentQuantity,
    };
  return {
    apply: true,
    selection: "candidate",
    mandatory: false,
    status: "intent-applied",
    reason: null,
    route: `${goalActionId} -> ${candidate.requirement.technologyId}:${candidate.requirement.requiredLevel}`,
    actionId: candidate.offer.elementId,
    resourceId,
    shortfall,
    requestedQuantity,
    currentQuantity,
    freshness,
    stock: Object.freeze({
      resourceId,
      amount: currentQuantity,
      rootGeneration: currentRootGeneration,
    }),
    boundedRisk:
      "one native demand bit; no reservation, allocation, stock, or technology mutation",
  };
}
