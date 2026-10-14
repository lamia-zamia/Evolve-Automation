import assert from "node:assert/strict";

import { decideResourceClaimLifecycle } from "../../../src/domain/economy/resources/resource-claim-lifecycle.ts";

const current = {
  goal: "active",
  permission: "enabled",
  queues: "empty",
  root: "current",
  progression: "current",
  obligation: "mandatory",
  grant: "incomplete",
  offerSet: {
    status: "complete-fresh",
    identity: "research-offers-11",
    observationId: "research-observation-11",
    previousObservationId: "research-observation-9",
  },
  currentContext: {
    rootGeneration: 1,
    progressionGeneration: "current-epoch",
    routeIdentity: '["magic",false,false]',
  },
  previousContext: {
    rootGeneration: 1,
    progressionGeneration: "current-epoch",
  },
  currentObservation: {
    status: "validated",
    rootGeneration: 1,
    progressionGeneration: "current-epoch",
    routeIdentity: '["magic",false,false]',
    offerSetIdentity: "research-offers-11",
    observationId: "research-observation-11",
    actionId: "tech-black_powder",
    manaPrice: 100,
    offerGeneration: 11,
    controlGeneration: 11,
    resources: "complete",
    nonManaCosts: { Knowledge: 4500, Crystal: 250, Coal: 300 },
    nonManaStocks: {
      Knowledge: 13526.1582,
      Crystal: 182.0556,
      Coal: 22757.3657,
    },
    limitingResource: "Crystal",
  },
  nativeActionId: "tech-black_powder",
  offer: "current",
  price: "current",
  binding: "current",
  nonMana: "affordable",
};

const decision = (overrides = {}) =>
  decideResourceClaimLifecycle({ ...current, ...overrides });
const afterProgressionChange = (overrides = {}) => {
  const input = {
    ...overrides,
    progression: "changed",
    currentContext: {
      ...current.currentContext,
      ...overrides.currentContext,
      progressionGeneration: "post-mad-science-epoch",
    },
    currentObservation: {
      ...current.currentObservation,
      ...overrides.currentObservation,
      progressionGeneration:
        overrides.currentObservation?.progressionGeneration ===
        current.currentObservation.progressionGeneration
          ? "post-mad-science-epoch"
          : (overrides.currentObservation?.progressionGeneration ??
            "post-mad-science-epoch"),
    },
  };
  const result = decision(input);
  return result;
};
const absentOffer = (overrides = {}) =>
  decision({
    offer: "absent",
    ...overrides,
    currentObservation: {
      ...current.currentObservation,
      actionId: undefined,
      manaPrice: undefined,
      offerGeneration: undefined,
      controlGeneration: undefined,
      resources: "unknown",
      ...overrides.currentObservation,
    },
  });

assert.deepEqual(
  [
    decision({ grant: "complete" }).state,
    decision({ nonMana: "affordable" }).state,
  ],
  ["completed", "active"],
  "completing Mad Science removes only that claim while an affordable Black Powder obligation can remain protected",
);
assert.deepEqual(
  [
    decision({ grant: "complete" }).state,
    decision({ grant: "complete" }).state,
  ],
  ["completed", "completed"],
  "both completed obligations leave the active protection set",
);
assert.deepEqual(decision(), {
  state: "active",
  reason: "current-mandatory-offer",
  retainClaim: true,
});
assert.equal(
  decision({ grant: "complete" }).state,
  "completed",
  "a completed member is removed while other obligations remain independently evaluated",
);
assert.equal(decision({ grant: "complete" }).retainClaim, false);
assert.equal(decision({ grant: "complete" }).state, "completed");
assert.equal(decision({ grant: "complete" }).reason, "grant-completed");
assert.equal(
  decision({ grant: "complete", price: "changed", binding: "changed" }).state,
  "completed",
  "a verified completed grant removes its own claim despite stale purchase observations",
);
assert.equal(decision({ grant: "incomplete" }).state, "active");
assert.equal(
  decision({ grant: "complete", nonMana: "insufficient" }).state,
  "completed",
  "completion removes its own claim even while an independent obligation is blocked",
);
assert.equal(
  decision({ nonMana: "insufficient" }).reason,
  "verified-non-mana-shortage",
  "known non-Mana insufficiency releases only the claim budget, not the graph obligation",
);
{
  const madScience = decision({
    nativeActionId: "tech-mad_science",
    grant: "complete",
  });
  const blackPowder = decision({
    nativeActionId: "tech-black_powder",
    grant: "incomplete",
    nonMana: "insufficient",
  });
  assert.deepEqual(
    [madScience.state, madScience.reason],
    ["completed", "grant-completed"],
    "the accepted cycle-9 grant completes Mad Science's own claim",
  );
  assert.deepEqual(
    [blackPowder.state, blackPowder.reason, blackPowder.retainClaim],
    ["released", "verified-non-mana-shortage", false],
    "fresh cycle-9 Black Powder evidence releases Mana protection only for the Crystal shortage",
  );
  assert.deepEqual(
    [
      current.currentContext.routeIdentity,
      current.offerSet.identity,
      current.currentObservation.offerGeneration,
      current.currentObservation.controlGeneration,
    ],
    ['["magic",false,false]', "research-offers-11", 11, 11],
    "the lifecycle decision is bound to the current Magic route, offer set, and control generation",
  );
  assert.deepEqual(
    [
      current.currentObservation.limitingResource,
      current.currentObservation.nonManaCosts.Crystal,
      current.currentObservation.nonManaStocks.Crystal,
    ],
    ["Crystal", 250, 182.0556],
    "the cycle-9 release is supported by the measured current Crystal shortage",
  );
  assert.deepEqual(
    [madScience, blackPowder]
      .filter((result) => result.retainClaim)
      .map((result) => result.state),
    [],
    "the recovered cycle-9 claims leave no stale active protection",
  );
}
assert.equal(absentOffer().retainClaim, false);
assert.equal(
  absentOffer().state,
  "released",
  "a fresh offer set that omits an obligation releases only its current claim",
);
assert.equal(
  decision({ offer: "current", price: "changed", nonMana: "affordable" }).state,
  "suspended",
  "a changed price must be freshly admitted before spending protection resumes",
);
assert.equal(
  decision({ offer: "current", price: "current", nonMana: "affordable" }).state,
  "active",
  "an obligation can be readmitted when fresh resources and offer evidence recover",
);
assert.equal(decision({ nonMana: "unknown" }).retainClaim, true);
assert.equal(
  decision({ nonMana: "unknown" }).reason,
  "evidence-unavailable",
  "missing resource data is not treated as a verified shortage",
);
assert.equal(decision({ offer: "unknown" }).state, "suspended");
assert.equal(decision({ root: "replaced" }).state, "invalidated");
assert.equal(decision({ progression: "changed" }).state, "suspended");
assert.equal(decision({ price: "changed" }).state, "suspended");
assert.equal(decision({ binding: "changed" }).state, "suspended");
assert.equal(decision({ queues: "unknown" }).retainClaim, true);
assert.equal(decision({ permission: "disabled" }).retainClaim, false);
assert.equal(decision({ queues: "player-committed" }).retainClaim, false);
assert.equal(decision({ obligation: "not-mandatory" }).state, "invalidated");
assert.equal(decision({ goal: "cancelled" }).retainClaim, false);
assert.equal(decision({ goal: "unknown" }).retainClaim, true);
assert.equal(
  decision({ offer: "unknown", nonMana: "insufficient" }).state,
  "suspended",
  "missing offer evidence cannot turn a previous resource shortage into verified release",
);
assert.equal(
  absentOffer({ price: "changed", nonMana: "insufficient" }).state,
  "released",
  "a complete fresh offer-set identity proves absence without a nonexistent row price",
);
for (const status of ["failed", "incomplete", "stale", "unknown"]) {
  assert.equal(
    absentOffer({
      offerSet: { ...current.offerSet, status },
    }).state,
    "suspended",
    `${status} catalog evidence cannot prove that an action is absent`,
  );
}
assert.equal(
  absentOffer({ binding: "changed" }).state,
  "released",
  "the complete offer-set identity proves absence without a current control binding",
);
assert.equal(
  absentOffer({
    grant: "complete",
    offerSet: { ...current.offerSet, status: "failed" },
  }).state,
  "completed",
  "a verified completed grant is independent of current offer availability",
);
assert.equal(
  absentOffer({
    offerSet: {
      ...current.offerSet,
      observationId: current.offerSet.previousObservationId,
    },
  }).state,
  "suspended",
  "a stale offer-set identity cannot prove current absence",
);
assert.equal(
  afterProgressionChange({
    offer: "absent",
    currentObservation: {
      ...current.currentObservation,
      actionId: undefined,
      manaPrice: undefined,
      offerGeneration: undefined,
      controlGeneration: undefined,
    },
  }).state,
  "released",
  "a complete current-context offer set reconciles an older progression epoch",
);
assert.equal(
  decision({ price: "changed", nonMana: "insufficient" }).state,
  "released",
  "a changed price is reconciled from the fresh bound offer before release",
);
assert.equal(
  decision({ binding: "changed", nonMana: "insufficient" }).state,
  "released",
  "a changed binding is reconciled only when the current offer and control generations agree",
);
assert.equal(
  afterProgressionChange({ nonMana: "insufficient" }).state,
  "released",
  "a changed prior epoch is reconciled only by the independently validated current observation",
);
assert.equal(
  afterProgressionChange({
    price: "changed",
    binding: "changed",
    nonMana: "insufficient",
    currentObservation: {
      ...current.currentObservation,
      progressionGeneration: "old-epoch",
      manaPrice: 125,
      offerGeneration: 12,
      controlGeneration: 12,
    },
  }).state,
  "suspended",
  "conflicting current epoch evidence cannot release the old reservation",
);
assert.equal(
  afterProgressionChange({
    nonMana: "insufficient",
    currentObservation: {
      ...current.currentObservation,
      routeIdentity: '["truepath",true,false]',
    },
  }).state,
  "suspended",
  "a route mismatch cannot be reconciled as current evidence",
);
assert.equal(
  afterProgressionChange({
    price: "changed",
    binding: "changed",
    nonMana: "insufficient",
    currentObservation: {
      ...current.currentObservation,
      controlGeneration: 10,
    },
  }).state,
  "suspended",
  "a changed offer binding must be rebound to the current control generation",
);
assert.equal(
  afterProgressionChange({
    price: "changed",
    binding: "changed",
    nonMana: "insufficient",
    offerSet: { ...current.offerSet, status: "incomplete" },
  }).state,
  "suspended",
  "partial offer catalogs cannot reconcile changed claim evidence",
);
assert.deepEqual(
  [
    decision({
      nativeActionId: "tech-mad_science",
      grant: "complete",
      progression: "changed",
      currentObservation: { ...current.currentObservation, status: "stale" },
    }).state,
    afterProgressionChange({
      nativeActionId: "tech-black_powder",
      price: "changed",
      binding: "changed",
      nonMana: "insufficient",
    }).state,
  ],
  ["completed", "released"],
  "the Stage 3I-to-3K transition completes Mad Science's own grant while independently reconciling Black Powder",
);
assert.equal(
  decision({ offer: "current", nonMana: "insufficient" }).state,
  "released",
  "fully current evidence permits release for a verified non-Mana shortage",
);
assert.equal(
  decision({ root: "replaced", nonMana: "insufficient" }).state,
  "invalidated",
  "root replacement invalidates claims before shortage evidence is considered",
);

console.log("resource-claim-lifecycle ok");
