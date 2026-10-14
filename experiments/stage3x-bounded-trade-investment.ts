export interface BoundedTradeInvestmentInput {
  readonly goal:
    Readonly<{ resourceId: string; targetQuantity: number }> | undefined;
  readonly resource: Readonly<{
    id: string;
    holding: number;
    capacity: number;
    productionLowerBoundPerPeriod: number | undefined;
    existingImportQuantity: number;
    importPriceUpperBoundPerPeriod: number | undefined;
    importQuantityLowerBoundPerPeriod: number | undefined;
    routeAssignments: number;
  }>;
  readonly availableRouteSlots: number;
  readonly maximumRoutes: number;
  readonly maximumResourceRoutes: number;
  readonly settings: Readonly<{
    autoMarket: boolean;
    importEnabled: boolean;
  }>;
  readonly money: Readonly<{
    holding: number;
    incomePerPeriod: number | undefined;
    outflowPerPeriod: number | undefined;
    projectedNetFlowPerPeriod: number | undefined;
    protectedCommitments: number | undefined;
    commitmentsComplete: boolean;
    ongoingObligationsPerPeriod: number | undefined;
    obligationsComplete: boolean;
  }>;
  readonly freshness: Readonly<{
    root: boolean;
    marketBoard: boolean;
    quote: boolean;
    demand: boolean;
    resourceControl: boolean;
  }>;
}

export type BoundedTradeInvestmentStatus =
  | "eligible"
  | "insufficient-cash"
  | "capacity-blocked"
  | "permission-disabled"
  | "demand-satisfied"
  | "existing-import-sufficient"
  | "unknown-economics"
  | "candidate-investment";

export interface BoundedTradeInvestmentDecision {
  readonly status: BoundedTradeInvestmentStatus;
  readonly candidate: boolean;
  readonly immediateNativeAffordability:
    "affordable" | "insufficient" | "unknown";
  readonly reason: string;
  readonly missingEvidence: readonly string[];
  readonly shortfall: number | undefined;
  readonly protectedCash: number | undefined;
  readonly maximumAffordableCommitment: number | undefined;
  readonly conservativeSpendPerPeriod: number | undefined;
  readonly estimatedRequiredCommitment: number | undefined;
  readonly requiredDurationPeriods: number | undefined;
  readonly estimatedRunwayPeriods: number | undefined;
  readonly expectedAcquisition: number | undefined;
  readonly maximumPeriods: number | undefined;
  readonly creditedFutureIncomePerPeriod: 0;
  readonly exitConditions: readonly string[];
}

const EXIT_CONDITIONS = Object.freeze([
  "stop when the target shortfall is satisfied",
  "stop if permissions, root, board, quote, demand, or control freshness is lost",
  "stop before spending the protected Money floor",
]);

function investmentDecision(
  status: BoundedTradeInvestmentStatus,
  reason: string,
  values: Partial<BoundedTradeInvestmentDecision> = {},
): BoundedTradeInvestmentDecision {
  return Object.freeze({
    status,
    candidate: status === "candidate-investment",
    immediateNativeAffordability:
      values.immediateNativeAffordability ?? "unknown",
    reason,
    missingEvidence: Object.freeze(values.missingEvidence ?? []),
    shortfall: values.shortfall,
    protectedCash: values.protectedCash,
    maximumAffordableCommitment: values.maximumAffordableCommitment,
    conservativeSpendPerPeriod: values.conservativeSpendPerPeriod,
    estimatedRequiredCommitment: values.estimatedRequiredCommitment,
    requiredDurationPeriods: values.requiredDurationPeriods,
    estimatedRunwayPeriods: values.estimatedRunwayPeriods,
    expectedAcquisition: values.expectedAcquisition,
    maximumPeriods: values.maximumPeriods,
    creditedFutureIncomePerPeriod: 0,
    exitConditions: EXIT_CONDITIONS,
  });
}

/** Evaluates a cash-capped native import from one current observation; it reserves no cash. */
export function evaluateBoundedTradeInvestment(
  input: Readonly<BoundedTradeInvestmentInput>,
): BoundedTradeInvestmentDecision {
  if (!input.settings.autoMarket || !input.settings.importEnabled)
    return investmentDecision(
      "permission-disabled",
      "Market ownership and resource import permission are both required",
    );

  if (input.goal === undefined)
    return investmentDecision(
      "unknown-economics",
      "No current committed acquisition target selected this resource",
      {
        missingEvidence: [
          "a unique selected goal or committed acquisition target",
        ],
      },
    );

  if (input.goal.resourceId !== input.resource.id)
    return investmentDecision(
      "eligible",
      "The current committed target names another resource",
    );

  const stale = Object.entries(input.freshness)
    .filter(([, current]) => current !== true)
    .map(([name]) => name);
  if (stale.length > 0)
    return investmentDecision(
      "unknown-economics",
      "The native observation is stale or incomplete",
      { missingEvidence: stale },
    );

  const values = [
    input.goal.targetQuantity,
    input.resource.holding,
    input.resource.capacity,
    input.money.holding,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    return investmentDecision(
      "unknown-economics",
      "Target, holding, capacity, or Money is invalid",
      { missingEvidence: ["finite non-negative target and native holdings"] },
    );

  const shortfall = Math.max(
    0,
    input.goal.targetQuantity - input.resource.holding,
  );
  if (shortfall === 0)
    return investmentDecision(
      "demand-satisfied",
      "The current target quantity is already held",
      { shortfall },
    );
  if (input.resource.holding + shortfall > input.resource.capacity)
    return investmentDecision(
      "capacity-blocked",
      "The current target exceeds native storage capacity",
      { shortfall },
    );

  if (
    !Number.isSafeInteger(input.availableRouteSlots) ||
    input.availableRouteSlots < 0 ||
    !Number.isSafeInteger(input.maximumRoutes) ||
    input.maximumRoutes < 0 ||
    !Number.isSafeInteger(input.maximumResourceRoutes) ||
    input.maximumResourceRoutes < 0 ||
    input.resource.routeAssignments < 0
  )
    return investmentDecision(
      "unknown-economics",
      "Native route availability or assignments are invalid",
      { shortfall, missingEvidence: ["current native route capacity"] },
    );

  if (input.resource.existingImportQuantity >= shortfall)
    return investmentDecision(
      "existing-import-sufficient",
      "Existing imports already cover the current shortfall",
      { shortfall },
    );

  if (
    input.availableRouteSlots === 0 ||
    input.maximumRoutes === 0 ||
    input.maximumResourceRoutes === 0 ||
    input.resource.routeAssignments >= input.maximumResourceRoutes
  )
    return investmentDecision(
      "capacity-blocked",
      "The current native route caps leave no import slot for this resource",
      { shortfall },
    );

  const unknown: string[] = [];
  if (
    !Number.isFinite(input.resource.existingImportQuantity) ||
    input.resource.existingImportQuantity < 0
  )
    unknown.push("a non-negative existing import commitment");
  if (input.resource.productionLowerBoundPerPeriod === undefined)
    unknown.push("a conservative production lower bound");
  if (input.resource.importPriceUpperBoundPerPeriod === undefined)
    unknown.push("a bounded future native import price");
  if (input.resource.importQuantityLowerBoundPerPeriod === undefined)
    unknown.push("a bounded native import quantity");
  if (
    !input.money.commitmentsComplete ||
    input.money.protectedCommitments === undefined
  )
    unknown.push("complete protected Money commitments");
  if (
    !input.money.obligationsComplete ||
    input.money.ongoingObligationsPerPeriod === undefined
  )
    unknown.push("complete ongoing Money obligations");
  if (
    input.money.incomePerPeriod === undefined ||
    input.money.outflowPerPeriod === undefined ||
    input.money.projectedNetFlowPerPeriod === undefined
  )
    unknown.push("current Money income, outflow, and net flow");
  else if (
    !Number.isFinite(input.money.incomePerPeriod) ||
    input.money.incomePerPeriod < 0 ||
    !Number.isFinite(input.money.outflowPerPeriod) ||
    input.money.outflowPerPeriod < 0 ||
    !Number.isFinite(input.money.projectedNetFlowPerPeriod)
  )
    unknown.push("finite Money income, outflow, and net flow");
  if (unknown.length > 0)
    return investmentDecision(
      "unknown-economics",
      "The cash reserve cannot be shown to cover a bounded acquisition",
      { shortfall, missingEvidence: unknown },
    );

  const protectedCash = input.money.protectedCommitments!;
  if (!Number.isFinite(protectedCash) || protectedCash < 0)
    return investmentDecision(
      "unknown-economics",
      "Protected Money commitments are invalid",
      { shortfall, missingEvidence: ["valid protected Money amount"] },
    );
  const availableCash = Math.max(0, input.money.holding - protectedCash);
  const importPrice = input.resource.importPriceUpperBoundPerPeriod!;
  const importQuantity = input.resource.importQuantityLowerBoundPerPeriod!;
  const production = Math.max(0, input.resource.productionLowerBoundPerPeriod!);
  const obligations = input.money.ongoingObligationsPerPeriod!;
  if (
    !Number.isFinite(importPrice) ||
    importPrice <= 0 ||
    !Number.isFinite(importQuantity) ||
    importQuantity <= 0 ||
    !Number.isFinite(production) ||
    !Number.isFinite(obligations) ||
    obligations < 0
  )
    return investmentDecision(
      "unknown-economics",
      "Price, quantity, production, or ongoing obligations are invalid",
      {
        shortfall,
        protectedCash,
        missingEvidence: ["bounded native economics"],
      },
    );

  const acquisitionPeriods = Math.ceil(
    shortfall / (importQuantity + production),
  );
  const immediateNativeAffordability =
    availableCash >= importPrice ? "affordable" : "insufficient";
  const spendPerPeriod =
    importPrice + input.money.outflowPerPeriod! + obligations;
  const totalCommitment = acquisitionPeriods * spendPerPeriod;
  const maximumPeriods = Math.floor(availableCash / spendPerPeriod);
  const expectedAcquisition = maximumPeriods * (importQuantity + production);
  if (immediateNativeAffordability === "insufficient")
    return investmentDecision(
      "insufficient-cash",
      "Unprotected cash cannot cover the next bounded native route charge",
      {
        shortfall,
        protectedCash,
        maximumAffordableCommitment: availableCash,
        conservativeSpendPerPeriod: spendPerPeriod,
        estimatedRequiredCommitment: totalCommitment,
        estimatedRunwayPeriods: maximumPeriods,
        expectedAcquisition,
        maximumPeriods,
        requiredDurationPeriods: acquisitionPeriods,
        immediateNativeAffordability,
      },
    );
  if (totalCommitment > availableCash)
    return investmentDecision(
      "insufficient-cash",
      "The maximum commitment from unprotected cash cannot cover the target",
      {
        shortfall,
        protectedCash,
        maximumAffordableCommitment: availableCash,
        conservativeSpendPerPeriod: spendPerPeriod,
        estimatedRequiredCommitment: totalCommitment,
        estimatedRunwayPeriods: maximumPeriods,
        expectedAcquisition,
        maximumPeriods,
        requiredDurationPeriods: acquisitionPeriods,
        immediateNativeAffordability,
      },
    );

  return investmentDecision(
    "candidate-investment",
    "A current bounded commitment can reach the target without spending protected cash or relying on future income",
    {
      shortfall,
      protectedCash,
      maximumAffordableCommitment: availableCash,
      conservativeSpendPerPeriod: spendPerPeriod,
      estimatedRequiredCommitment: totalCommitment,
      estimatedRunwayPeriods: maximumPeriods,
      expectedAcquisition,
      maximumPeriods,
      requiredDurationPeriods: acquisitionPeriods,
      immediateNativeAffordability,
    },
  );
}
