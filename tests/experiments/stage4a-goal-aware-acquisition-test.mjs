import assert from "node:assert/strict";
import { evaluateGoalAwareAcquisition } from "../../experiments/stage4a-goal-aware-acquisition.ts";

const catalog = (overrides = {}) => {
  const offer = {
    elementId: "tech-metalwork",
    grantTechnology: "core",
    grantLevel: 1,
    generation: 31,
    cost: { Iron: 200, Knowledge: 9000 },
    nativeAffordable: false,
  };
  return {
    current: true,
    source: "shared-current-cycle",
    selectedPrestige: "endgame",
    rootGeneration: 9,
    progressionEpoch: "save:4",
    offers: [offer],
    definitions: [
      {
        actionId: "tech-endgame",
        grantTechnology: "endgame",
        grantLevel: 1,
        prerequisites: {
          kind: "declared",
          requirements: [{ technologyId: "core", requiredLevel: 1 }],
        },
        hasNativeCondition: false,
        routeRestrictions: undefined,
        restrictions: [],
      },
      {
        actionId: offer.elementId,
        grantTechnology: offer.grantTechnology,
        grantLevel: offer.grantLevel,
        prerequisites: { kind: "declared", requirements: [] },
        hasNativeCondition: false,
        routeRestrictions: undefined,
        restrictions: [],
      },
    ],
    grantLevels: [
      ["endgame", 0],
      ["core", 0],
    ],
    applicability: [
      ["tech-endgame", { status: "eligible" }],
      [offer.elementId, { status: "eligible" }],
    ],
    resourceSamples: [
      { resourceId: "Iron", holding: 40, capacity: 500 },
      { resourceId: "Knowledge", holding: 9500, capacity: 20000 },
    ],
    ...overrides,
  };
};

const routeInput = (overrides = {}) => ({
  settings: {
    tradeRouteSellExcess: false,
    tradeRouteMinimumMoneyPerSecond: 500,
    tradeRouteMinimumMoneyPercentage: 0,
  },
  priorityList: [
    {
      id: "Iron",
      tradeRoutes: 0,
      autoTradeBuyEnabled: true,
      autoTradeSellEnabled: true,
      usefulRatio: 0.08,
      storageRatio: 0.08,
      tradeSellPrice: 1,
      tradeBuyPrice: 12,
      rateOfChange: 0,
      tradeRouteQuantity: 2,
      autoTradeWeighting: 1,
      autoTradePriority: 3,
      isRoutesUnlocked: true,
      isDemanded: false,
    },
  ],
  money: {
    rateOfChange: 1000,
    maxQuantity: 100000,
    currentQuantity: 5000,
    isDemanded: false,
  },
  importRouteCap: 100,
  exportRouteCap: 100,
  maxTradeRoutes: 100,
  unmanagedTradeRoutes: 0,
  isBanana: false,
  isEntrepreneur: false,
  saveInflationMoney: false,
  ...overrides,
});

const marketContext = (overrides = {}) => ({
  rootCurrent: true,
  rootGeneration: 9,
  progressionEpoch: "save:4",
  boardCurrent: true,
  ownerEnabled: true,
  controls: [
    {
      elementId: "market-Iron",
      generation: 6,
      methods: ["autoBuy", "autoSell"],
    },
  ],
  resources: [
    {
      resourceId: "Iron",
      holding: 40,
      capacity: 500,
      demanded: false,
      requestedQuantity: 0,
      importsEnabled: true,
      importPricePerPeriod: 12,
      importQuantityPerPeriod: 2,
      controlElementId: "market-Iron",
      controlGeneration: 6,
    },
  ],
  ...overrides,
});

const decide = (
  catalogValue = catalog(),
  input = routeInput(),
  context = marketContext(),
) => evaluateGoalAwareAcquisition(catalogValue, input, context);

{
  const decision = decide();
  assert.equal(decision.status, "signal");
  assert.equal(decision.selectedActionId, "tech-metalwork");
  assert.equal(decision.goalActionId, "tech-endgame");
  assert.equal(decision.resourceId, "Iron");
  assert.equal(decision.targetQuantity, 200);
  assert.equal(decision.shortfall, 160);
  assert.equal(decision.candidates[0]?.relevance, "verified-prerequisite");
}

{
  const nativeShaped = catalog({
    definitions: catalog().definitions.map((definition) => ({
      actionId: definition.actionId,
      grantTechnology: definition.grantTechnology,
      grantLevel: definition.grantLevel,
      prerequisites: definition.prerequisites,
      eligibility: {
        hasNativeCondition: definition.hasNativeCondition,
        routeRestrictions: definition.routeRestrictions,
        restrictions: definition.restrictions,
      },
    })),
  });
  assert.equal(
    decide(nativeShaped).status,
    "signal",
    "native captured eligibility is nested under definition.eligibility",
  );
}

{
  const second = catalog({
    selectedPrestige: "another-goal",
    offers: [
      {
        elementId: "tech-silicate",
        grantTechnology: "core2",
        grantLevel: 1,
        generation: 44,
        cost: { Steel: 320 },
        nativeAffordable: false,
      },
    ],
    definitions: [
      {
        actionId: "tech-another-goal",
        grantTechnology: "another-goal",
        grantLevel: 1,
        prerequisites: {
          kind: "declared",
          requirements: [{ technologyId: "core2", requiredLevel: 1 }],
        },
        hasNativeCondition: false,
        routeRestrictions: undefined,
        restrictions: [],
      },
      {
        actionId: "tech-silicate",
        grantTechnology: "core2",
        grantLevel: 1,
        prerequisites: { kind: "declared", requirements: [] },
        hasNativeCondition: false,
        routeRestrictions: undefined,
        restrictions: [],
      },
    ],
    grantLevels: [
      ["another-goal", 0],
      ["core2", 0],
    ],
    applicability: [
      ["tech-another-goal", { status: "eligible" }],
      ["tech-silicate", { status: "eligible" }],
    ],
    resourceSamples: [{ resourceId: "Steel", holding: 20, capacity: 900 }],
  });
  const steelInput = routeInput({
    priorityList: [
      {
        ...routeInput().priorityList[0],
        id: "Steel",
        tradeBuyPrice: 30,
      },
    ],
  });
  const steelContext = marketContext({
    controls: [
      {
        elementId: "market-Steel",
        generation: 8,
        methods: ["autoBuy"],
      },
    ],
    resources: [
      {
        ...marketContext().resources[0],
        resourceId: "Steel",
        holding: 20,
        capacity: 900,
        importPricePerPeriod: 30,
        controlElementId: "market-Steel",
        controlGeneration: 8,
      },
    ],
  });
  const decision = decide(second, steelInput, steelContext);
  assert.equal(decision.status, "signal");
  assert.equal(decision.resourceId, "Steel");
  assert.equal(decision.selectedActionId, "tech-silicate");
}

{
  const alternative = catalog({
    offers: [
      ...catalog().offers,
      {
        elementId: "tech-alloy",
        grantTechnology: "core",
        grantLevel: 1,
        generation: 32,
        cost: { Iron: 180, Knowledge: 9200 },
        nativeAffordable: false,
      },
    ],
    definitions: [
      ...catalog().definitions,
      {
        actionId: "tech-alloy",
        grantTechnology: "core",
        grantLevel: 1,
        prerequisites: { kind: "declared", requirements: [] },
        hasNativeCondition: false,
        routeRestrictions: undefined,
        restrictions: [],
      },
    ],
    applicability: [
      ...catalog().applicability,
      ["tech-alloy", { status: "eligible" }],
    ],
  });
  assert.equal(decide(alternative).status, "ambiguous");
}

{
  const affordable = catalog({
    offers: catalog().offers.map((offer) => ({
      ...offer,
      nativeAffordable: true,
    })),
    resourceSamples: [
      { resourceId: "Iron", holding: 250, capacity: 500 },
      { resourceId: "Knowledge", holding: 12000, capacity: 20000 },
    ],
  });
  assert.equal(decide(affordable).status, "candidate-affordable");
}

{
  assert.equal(
    decide(catalog({ offers: [] })).status,
    "unavailable",
    "a candidate that is no longer natively offered expires",
  );
  const repriced = catalog({
    offers: catalog().offers.map((offer) => ({
      ...offer,
      generation: 33,
      cost: { Iron: 250, Knowledge: 9000 },
    })),
  });
  const changedPrice = decide(repriced);
  assert.equal(changedPrice.selectedOfferGeneration, 33);
  assert.equal(changedPrice.shortfall, 210);
}

{
  assert.equal(
    decide(catalog({ current: false })).status,
    "unavailable",
    "stale root or offer generations refuse the signal",
  );
  assert.equal(
    decide(catalog(), routeInput(), marketContext({ rootGeneration: 10 }))
      .status,
    "unavailable",
    "a changed root generation refuses the signal",
  );
  for (const reason of ["race restriction", "challenge exclusion"]) {
    const excluded = catalog({
      applicability: [
        ["tech-endgame", { status: "eligible" }],
        ["tech-metalwork", { status: "excluded", reasons: [reason] }],
      ],
    });
    assert.equal(decide(excluded).status, "unavailable", reason);
  }
}

{
  assert.equal(
    decide(catalog(), routeInput(), marketContext({ ownerEnabled: false }))
      .status,
    "unavailable",
  );
  const importDisabled = marketContext({
    resources: marketContext().resources.map((resource) => ({
      ...resource,
      importsEnabled: false,
    })),
  });
  assert.equal(
    decide(catalog(), routeInput(), importDisabled).status,
    "candidate-not-marketable",
  );
  const storageUnavailable = catalog({
    resourceSamples: [
      { resourceId: "Iron", holding: 40, capacity: 150 },
      { resourceId: "Knowledge", holding: 9500, capacity: 20000 },
    ],
  });
  assert.equal(decide(storageUnavailable).status, "candidate-not-marketable");
  const storageUnknown = catalog({
    resourceSamples: [
      { resourceId: "Iron", holding: 40, capacity: undefined },
      { resourceId: "Knowledge", holding: 9500, capacity: 20000 },
    ],
  });
  assert.equal(decide(storageUnknown).status, "candidate-not-marketable");
  const staleMarketControl = marketContext({
    controls: [
      {
        elementId: "market-Iron",
        generation: 7,
        methods: ["autoBuy"],
      },
    ],
  });
  assert.equal(
    decide(catalog(), routeInput(), staleMarketControl).status,
    "candidate-not-marketable",
  );
}

{
  const goalAchieved = catalog({
    grantLevels: [
      ["endgame", 1],
      ["core", 1],
    ],
  });
  assert.equal(decide(goalAchieved).status, "unavailable");
  const demandSatisfied = marketContext({
    resources: marketContext().resources.map((resource) => ({
      ...resource,
      requestedQuantity: 200,
    })),
  });
  assert.equal(
    decide(catalog(), routeInput(), demandSatisfied).status,
    "already-demanded",
  );
}

console.log("stage 4A goal-aware acquisition contracts passed");
