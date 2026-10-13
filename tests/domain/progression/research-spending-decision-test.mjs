import assert from "node:assert/strict";

import { decideResearchSpend } from "../../../src/domain/progression/research-spending-decision.ts";

const epoch = "run:9|root:3|offer:7";
const action = (actionId, cost, overrides = {}) => ({
  actionId,
  cost,
  currentNativeOffer: true,
  nativeAffordable: false,
  applicability: "eligible",
  offerGeneration: 7,
  expectedOfferGeneration: 7,
  controlGeneration: 4,
  expectedControlGeneration: 4,
  ...overrides,
});
const base = (overrides = {}) => ({
  goalId: "prestige:mad",
  currentGoalId: "prestige:mad",
  terminalGoalApplicability: "eligible",
  validityEpoch: epoch,
  currentValidityEpoch: epoch,
  selectedAction: action(
    "tech-luxury",
    { Knowledge: 30 },
    { nativeAffordable: true },
  ),
  selectedByResearchOwner: true,
  selectedResourceAffordable: true,
  selectedReservationConflict: false,
  selectedExplicitExclusion: false,
  selectedEffects: {
    productionChanges: [],
    effectsComplete: true,
    effectAuthority: "validated",
    unavailableReasons: [],
  },
  target: action(
    "tech-high_tech",
    { Knowledge: 50 },
    { nativeAffordable: false },
  ),
  additionalTargetNeeds: [],
  stocks: [
    {
      resourceId: "Knowledge",
      poolId: "anywhere",
      amount: 0,
      capacity: 1_000,
      netRate: 10,
      rateConfidence: "stable",
      validityEpoch: epoch,
    },
  ],
  commitments: [],
  commitmentsKnown: true,
  acceleratorScan: "complete",
  accelerators: [],
  ...overrides,
});

{
  const comparison = decideResearchSpend(base());
  assert.equal(comparison.targetAffordability, "insufficient");
  assert.equal(comparison.decision, "save-for-target");
  assert.equal(comparison.comparison?.provisionalWinner, "wait");
  assert.equal(comparison.comparison?.winner, "wait");
}

{
  const inconsistentCapture = decideResearchSpend(
    base({
      stocks: [
        {
          resourceId: "Knowledge",
          poolId: "anywhere",
          amount: 80,
          capacity: 1_000,
          netRate: 10,
          rateConfidence: "stable",
          validityEpoch: epoch,
        },
      ],
    }),
  );
  assert.equal(
    inconsistentCapture.targetAffordability,
    "native-denied",
    "a numeric projection cannot overrule the game's current native affordability gate",
  );
}

{
  const unknown = decideResearchSpend(base({ selectedEffects: undefined }));
  assert.equal(unknown.decision, "provisional");
  assert.equal(unknown.comparison?.winner, undefined);
  const buy = unknown.comparison?.strategies.find((item) =>
    item.id.startsWith("buy-selected:"),
  );
  assert.equal(buy?.status, "feasible");
  assert.equal(buy?.authority, "provisional");
  assert.ok(
    unknown.reasons.some((reason) =>
      reason.includes("no rate or capacity change"),
    ),
  );
  assert.ok(unknown.reasons.some((reason) => reason.includes("effects")));
}

{
  const unrelatedPurchase = decideResearchSpend(
    base({
      selectedAction: action(
        "tech-unrelated",
        { Knowledge: 30 },
        { nativeAffordable: true },
      ),
      stocks: [
        {
          resourceId: "Knowledge",
          poolId: "anywhere",
          amount: 0,
          capacity: 1_000,
          netRate: 10,
          rateConfidence: "stable",
          validityEpoch: epoch,
        },
      ],
    }),
  );
  assert.equal(
    unrelatedPurchase.comparison?.strategies.find((item) => item.id === "wait")
      ?.completionTime,
    5,
  );
  assert.equal(
    unrelatedPurchase.comparison?.strategies.find(
      (item) => item.id === "buy-selected:tech-unrelated",
    )?.completionTime,
    8,
  );
  assert.equal(unrelatedPurchase.decision, "save-for-target");
}

{
  const accelerator = {
    id: "buy-verified-library",
    goalId: "tech-high_tech",
    preconditions: { satisfied: true, reasons: [] },
    acquisitionCosts: [
      { resourceId: "Knowledge", poolId: "anywhere", amount: 10 },
    ],
    productionChanges: [
      { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 10 },
    ],
    effectsComplete: true,
    effectAuthority: "validated",
    validityEpoch: epoch,
    unavailableReasons: [],
  };
  const result = decideResearchSpend(base({ accelerators: [accelerator] }));
  assert.equal(result.decision, "buy-accelerator");
  assert.equal(result.comparison?.winner, "buy-verified-library");
}

{
  const result = decideResearchSpend(
    base({
      target: action(
        "tech-high_tech",
        { Knowledge: 50, Oil: 20 },
        { nativeAffordable: false },
      ),
      additionalTargetNeeds: [
        { resourceId: "Uranium", poolId: "anywhere", amount: 5 },
      ],
      stocks: [
        ...["Knowledge", "Oil", "Uranium"].map((resourceId) => ({
          resourceId,
          poolId: "anywhere",
          amount: 0,
          capacity: 100,
          netRate: 1,
          rateConfidence: "stable",
          validityEpoch: epoch,
        })),
      ],
    }),
  );
  const wait = result.comparison?.strategies.find((item) => item.id === "wait");
  assert.equal(wait?.completionTime, 50);
  assert.equal(wait?.feasibility.unmetRequirements.length, 3);
}

{
  const capacityLimited = decideResearchSpend(
    base({
      target: action(
        "tech-high_tech",
        { Knowledge: 50 },
        { nativeAffordable: false },
      ),
      stocks: [
        {
          resourceId: "Knowledge",
          poolId: "anywhere",
          amount: 0,
          capacity: 40,
          netRate: 10,
          rateConfidence: "stable",
          validityEpoch: epoch,
        },
      ],
    }),
  );
  assert.equal(capacityLimited.targetAffordability, "insufficient");
  assert.equal(
    capacityLimited.comparison?.strategies[0]?.feasibility.status,
    "infeasible",
  );
}

for (const stale of [
  base({ validityEpoch: "stale", currentValidityEpoch: epoch }),
  base({
    target: action("tech-high_tech", { Knowledge: 50 }, { offerGeneration: 6 }),
  }),
  base({
    target: action(
      "tech-high_tech",
      { Knowledge: 50 },
      { controlGeneration: 3 },
    ),
  }),
  base({ goalId: "prestige:bioseed" }),
]) {
  assert.equal(decideResearchSpend(stale).decision, "unavailable");
}

for (const blocked of [
  base({ selectedReservationConflict: true }),
  base({ selectedReservationConflict: undefined }),
  base({ selectedExplicitExclusion: true }),
  base({ selectedByResearchOwner: false }),
  base({ commitmentsKnown: false }),
  base({ acceleratorScan: "unavailable" }),
]) {
  const decision = decideResearchSpend(blocked);
  assert.notEqual(decision.decision, "buy-selected");
  assert.equal(decision.comparison?.winner, undefined);
}

{
  const inapplicable = decideResearchSpend(
    base({
      target: action(
        "tech-high_tech",
        { Knowledge: 50 },
        { applicability: "conditional" },
      ),
    }),
  );
  assert.equal(inapplicable.decision, "unavailable");
}

{
  const unresolvedTerminal = decideResearchSpend(
    base({ terminalGoalApplicability: "conditional" }),
  );
  assert.equal(unresolvedTerminal.decision, "provisional");
  assert.equal(unresolvedTerminal.comparison?.winner, undefined);
  assert.ok(
    unresolvedTerminal.reasons.some((reason) =>
      reason.includes("terminal goal applicability is conditional"),
    ),
  );
}

console.log("Research spending decision tests passed");
