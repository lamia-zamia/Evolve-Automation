import assert from "node:assert/strict";

import { attributeResearchBottleneck } from "../../../src/domain/economy/research-bottleneck.ts";

function observation(period, resources, overrides = {}) {
  const generation = overrides.generation ?? 1;
  const cost = overrides.cost ?? { Knowledge: 10 };
  return {
    period,
    rootGeneration: overrides.rootGeneration ?? 1,
    progressionEpoch: overrides.progressionEpoch ?? "progression-1",
    current: overrides.current ?? true,
    permission: overrides.permission ?? true,
    eligibility: overrides.eligibility ?? "eligible",
    queueEvidence: overrides.queueEvidence ?? "empty",
    offer:
      overrides.offered === false
        ? undefined
        : {
            actionId: overrides.actionId ?? "tech-generic",
            generation,
            controlGeneration: overrides.controlGeneration ?? generation,
            offerSetIdentity: overrides.offerSetIdentity ?? "set-1",
            cost,
            nativeAffordable: overrides.nativeAffordable,
          },
    resources: Object.fromEntries(
      Object.entries(resources).map(([resourceId, amount]) => [
        resourceId,
        {
          amount,
          capacity: overrides.capacities?.[resourceId] ?? 100,
          netRate: overrides.rates?.[resourceId] ?? 1,
        },
      ]),
    ),
    commitments: overrides.commitments ?? {
      coverage: "complete",
      items: [],
    },
    ...(overrides.decision === undefined
      ? {}
      : { decision: overrides.decision }),
  };
}

const invoked = {
  boundary: true,
  selectedActionId: "tech-generic",
  invocationPeriod: 3,
  nativeAffordable: true,
  resourceAffordable: true,
  reservation: "none",
};

const twoResources = attributeResearchBottleneck([
  observation(
    1,
    { Knowledge: 2, Alloy: 5 },
    {
      cost: { Knowledge: 10, Alloy: 5 },
    },
  ),
  observation(
    2,
    { Knowledge: 10, Alloy: 5 },
    {
      cost: { Knowledge: 10, Alloy: 5 },
      nativeAffordable: true,
    },
  ),
  observation(
    3,
    { Knowledge: 11, Alloy: 6 },
    {
      cost: { Knowledge: 10, Alloy: 5 },
      nativeAffordable: true,
      decision: invoked,
    },
  ),
]);
assert.equal(twoResources.lastObservedConstraint?.resourceId, "Knowledge");
assert.equal(twoResources.lastObservedConstraint?.period, 2);
assert.equal(twoResources.provenCriticalPath?.resourceId, "Knowledge");

const priceChanged = attributeResearchBottleneck([
  observation(1, { Knowledge: 8 }, { cost: { Knowledge: 10 } }),
  observation(2, { Knowledge: 10 }, { cost: { Knowledge: 10 } }),
  observation(3, { Knowledge: 10 }, { cost: { Knowledge: 12 } }),
  observation(4, { Knowledge: 12 }, { cost: { Knowledge: 12 } }),
]);
assert.equal(priceChanged.lastObservedConstraint?.period, 4);
assert.equal(priceChanged.lastObservedConstraint?.resourceId, "Knowledge");

const generationChanged = attributeResearchBottleneck([
  observation(1, { Knowledge: 2 }, { generation: 1 }),
  observation(2, { Knowledge: 10 }, { generation: 2 }),
  observation(
    3,
    { Knowledge: 11 },
    {
      generation: 2,
      decision: invoked,
    },
  ),
]);
assert.equal(generationChanged.offerGeneration, 2);
assert.equal(generationChanged.lastObservedConstraint?.period, 2);

const temporarilyNotOffered = attributeResearchBottleneck([
  observation(1, { Knowledge: 5 }, { cost: { Knowledge: 10 } }),
  observation(2, { Knowledge: 7 }, { offered: false }),
  observation(
    3,
    { Knowledge: 10 },
    {
      cost: { Knowledge: 10 },
      decision: invoked,
    },
  ),
]);
assert.equal(temporarilyNotOffered.status, "attributed");
assert.equal(temporarilyNotOffered.lastObservedConstraint?.period, 3);

const noLongerOffered = attributeResearchBottleneck([
  observation(1, { Knowledge: 5 }, { cost: { Knowledge: 10 } }),
  observation(2, { Knowledge: 7 }, { offered: false }),
]);
assert.ok(noLongerOffered.blockers.some(({ kind }) => kind === "not-offered"));

const competition = attributeResearchBottleneck([
  observation(
    1,
    { Alloy: 12 },
    {
      cost: { Alloy: 10 },
    },
  ),
  observation(
    2,
    { Alloy: 7 },
    {
      cost: { Alloy: 10 },
      commitments: {
        coverage: "partial",
        items: [{ owner: "Construction", resourceId: "Alloy", amount: 8 }],
      },
      decision: {
        boundary: true,
        nativeAffordable: false,
        reservation: "conflict",
      },
    },
  ),
]);
assert.ok(
  competition.blockers.some(({ kind }) => kind === "resource-shortage"),
);
assert.ok(
  competition.blockers.some(({ kind }) => kind === "known-owner-commitment"),
);
assert.ok(
  competition.blockers.some(
    ({ kind }) => kind === "competing-owner-commitment",
  ),
);
assert.equal(competition.unknownCommitments, true);

const capacity = attributeResearchBottleneck([
  observation(
    1,
    { Alloy: 12 },
    {
      cost: { Alloy: 10 },
      capacities: { Alloy: 8 },
    },
  ),
]);
assert.ok(capacity.blockers.some(({ kind }) => kind === "capacity"));

const notSelected = attributeResearchBottleneck([
  observation(
    1,
    { Knowledge: 20 },
    {
      decision: {
        boundary: true,
        selectedActionId: "tech-other",
        nativeAffordable: true,
        resourceAffordable: true,
        reservation: "none",
      },
    },
  ),
]);
assert.ok(
  notSelected.blockers.some(({ kind }) => kind === "affordable-not-selected"),
);

const selectedNotInvoked = attributeResearchBottleneck([
  observation(
    1,
    { Knowledge: 20 },
    {
      decision: {
        boundary: true,
        selectedActionId: "tech-generic",
        nativeAffordable: true,
        resourceAffordable: true,
        reservation: "none",
      },
    },
  ),
]);
assert.ok(
  selectedNotInvoked.blockers.some(
    ({ kind }) => kind === "selected-not-invoked",
  ),
);

const disabled = attributeResearchBottleneck([
  observation(1, { Knowledge: 20 }, { permission: false }),
]);
assert.ok(disabled.blockers.some(({ kind }) => kind === "permission-disabled"));

const simultaneous = attributeResearchBottleneck([
  observation(
    1,
    { Knowledge: 0, Alloy: 0 },
    {
      cost: { Knowledge: 10, Alloy: 10 },
    },
  ),
  observation(
    2,
    { Knowledge: 10, Alloy: 10 },
    {
      cost: { Knowledge: 10, Alloy: 10 },
      decision: invoked,
    },
  ),
]);
assert.equal(simultaneous.lastObservedConstraint?.intervalAmbiguous, true);
assert.equal(simultaneous.provenCriticalPath, undefined);

const surplus = attributeResearchBottleneck([
  observation(1, { Knowledge: 100 }, { nativeAffordable: true }),
  observation(
    2,
    { Knowledge: 100 },
    {
      nativeAffordable: true,
      decision: {
        boundary: true,
        selectedActionId: "tech-other",
        nativeAffordable: true,
        resourceAffordable: true,
        reservation: "none",
      },
    },
  ),
]);
assert.ok(
  surplus.blockers.some(({ kind }) => kind === "affordable-not-selected"),
);
assert.equal(surplus.status, "attributed");
assert.equal(surplus.lastObservedConstraint, undefined);

const criticalShortage = attributeResearchBottleneck([
  observation(
    1,
    { Crystal: 9 },
    {
      cost: { Crystal: 10 },
      nativeAffordable: false,
    },
  ),
  observation(
    2,
    { Crystal: 10 },
    {
      cost: { Crystal: 10 },
      nativeAffordable: true,
      decision: invoked,
    },
  ),
]);
assert.equal(criticalShortage.lastObservedConstraint?.resourceId, "Crystal");
assert.equal(criticalShortage.provenCriticalPath?.resourceId, "Crystal");

const rootInvalidated = attributeResearchBottleneck([
  observation(1, { Knowledge: 2 }),
  observation(2, { Knowledge: 10 }, { rootGeneration: 2 }),
]);
assert.equal(rootInvalidated.status, "invalid");
assert.match(rootInvalidated.reason, /stale or mismatched/);

const progressionInvalidated = attributeResearchBottleneck([
  observation(1, { Knowledge: 2 }),
  observation(2, { Knowledge: 10 }, { current: false }),
]);
assert.equal(progressionInvalidated.status, "invalid");

const staleOffer = attributeResearchBottleneck([
  observation(1, { Knowledge: 20 }, { controlGeneration: 2 }),
]);
assert.equal(staleOffer.status, "invalid");

console.log("Research bottleneck attribution tests passed");
