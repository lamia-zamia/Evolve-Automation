import assert from "node:assert/strict";

import { createCapturedCostConflictReader } from "../../src/adapters/evolve/captured-cost-conflict.ts";
import {
  applyP42ConstructionReservation,
  P42_EXPECTED,
  P42_INTERVENTION_IDENTITY,
  qualifyP42ConstructionReservation,
  shouldReleaseP42ConstructionReservation,
} from "../../experiments/p42-construction-priority-counterfactual-policy.mjs";

const baseInput = () => ({
  enabled: true,
  arm: "B",
  identity: { ...P42_INTERVENTION_IDENTITY },
  authorizationHistoryMatched: true,
  preSubstitutionBoundaryCaptured: true,
  p36GatherActions: P42_EXPECTED.p36GatherActions,
  p38Authorization: {
    id: P42_EXPECTED.p38AuthorizationId,
    additionalGatherLimit: P42_EXPECTED.p38GatherLimit,
  },
  ownerContext: {
    period: P42_EXPECTED.period,
    workCycleId: P42_EXPECTED.workCycleId,
    orderingGeneration: P42_EXPECTED.orderingGeneration,
    rootGeneration: 4,
    progressionGeneration: "standard-human|progression-4",
  },
  publishedWorkCycleId: P42_EXPECTED.publishedWorkCycleId,
  currentCandidate: {
    orderingGeneration: P42_EXPECTED.orderingGeneration,
    candidateKey: P42_EXPECTED.quarryTarget,
    cost: { ...P42_EXPECTED.quarryCost },
  },
  quarryOrder: {
    key: P42_EXPECTED.quarryTarget,
    orderingIndex: 0,
    weighting: 300,
    important: false,
    knowledge: false,
    cost: { ...P42_EXPECTED.quarryCost },
    authority: {
      rootGeneration: 4,
      progressionGeneration: "standard-human|progression-4",
      controlGeneration: 9,
    },
  },
  currentAuthority: {
    rootGeneration: 4,
    progressionGeneration: "standard-human|progression-4",
    controlGeneration: 9,
    controlElementId: P42_EXPECTED.quarryTarget,
    controlActionAvailable: true,
  },
  nativeQueue: { available: true, targets: [] },
  scriptReservations: {
    available: true,
    targets: [
      {
        name: P42_EXPECTED.previousTarget,
        cause: "Saving",
        cost: { ...P42_EXPECTED.previousCost },
      },
    ],
  },
  stock: { ...P42_EXPECTED.quarryStock },
});

const qualified = applyP42ConstructionReservation(baseInput());
assert.equal(qualified.applied, true);
assert.equal(qualified.reason, "exact-p720-construction-owner-cycle");
assert.deepEqual(qualified.targets, [
  {
    name: P42_EXPECTED.quarryTarget,
    cause: "Saving",
    cost: P42_EXPECTED.quarryCost,
  },
]);

const rejects = [
  ["wrong arm", { arm: "A" }],
  ["wrong period", { ownerContext: { period: 719 } }],
  [
    "wrong owner cycle",
    { ownerContext: { workCycleId: P42_EXPECTED.workCycleId + 1 } },
  ],
  [
    "wrong ordering generation",
    {
      ownerContext: { orderingGeneration: P42_EXPECTED.orderingGeneration + 1 },
    },
  ],
  [
    "wrong candidate ordering generation",
    { currentCandidate: { orderingGeneration: 91 } },
  ],
  ["wrong completed publication", { publishedWorkCycleId: 88 }],
  [
    "current Construction candidate changed",
    { currentCandidate: { candidateKey: "city-basic_housing" } },
  ],
  ["wrong fixture identity", { identity: { fixtureSha256: "other" } }],
  ["authorization history differs", { authorizationHistoryMatched: false }],
  [
    "pre-boundary state unavailable",
    { preSubstitutionBoundaryCaptured: false },
  ],
  ["P36 click allowance differs", { p36GatherActions: 138 }],
  [
    "P38 authorization differs",
    { p38Authorization: { id: "other", additionalGatherLimit: 18 } },
  ],
  ["Quarry candidate moved", { quarryOrder: { orderingIndex: 1 } }],
  ["Quarry target changed", { quarryOrder: { key: "city-other" } }],
  ["Quarry weight changed", { quarryOrder: { weighting: 301 } }],
  ["important flag changed", { quarryOrder: { important: true } }],
  ["Knowledge flag changed", { quarryOrder: { knowledge: true } }],
  ["Quarry repriced", { quarryOrder: { cost: { Lumber: 51, Stone: 10 } } }],
  [
    "current Quarry candidate repriced",
    { currentCandidate: { cost: { Lumber: 50, Stone: 11 } } },
  ],
  ["Quarry root authority stale", { currentAuthority: { rootGeneration: 5 } }],
  [
    "Quarry progression authority stale",
    { currentAuthority: { progressionGeneration: "other" } },
  ],
  [
    "Quarry control generation stale",
    { currentAuthority: { controlGeneration: 10 } },
  ],
  [
    "Quarry control unavailable",
    { currentAuthority: { controlActionAvailable: false } },
  ],
  [
    "native queue unavailable",
    { nativeQueue: { available: false, targets: [] } },
  ],
  [
    "native queue claim present",
    { nativeQueue: { available: true, targets: [{ name: "queued" }] } },
  ],
  [
    "script reservations unavailable",
    { scriptReservations: { available: false, targets: [] } },
  ],
  ["missing reservations", { scriptReservations: { targets: null } }],
  ["missing holdings", { stock: { Lumber: null, Stone: 10 } }],
  ["changed Lumber stock", { stock: { Lumber: 49 } }],
  ["changed Stone stock", { stock: { Stone: 9 } }],
  [
    "Farm reservation changed",
    {
      scriptReservations: {
        available: true,
        targets: [
          {
            name: P42_EXPECTED.previousTarget,
            cause: "Saving",
            cost: { Lumber: 28, Stone: 14 },
          },
        ],
      },
    },
  ],
  [
    "additional script claim present",
    {
      scriptReservations: {
        available: true,
        targets: [
          ...baseInput().scriptReservations.targets,
          { name: "city-other", cause: "Saving", cost: { Lumber: 1 } },
        ],
      },
    },
  ],
];

for (const [name, overrides] of rejects) {
  const input = baseInput();
  for (const [key, value] of Object.entries(overrides)) {
    input[key] =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? { ...input[key], ...value }
        : value;
  }
  const decision = qualifyP42ConstructionReservation(input);
  assert.equal(decision.qualified, false, `${name} must fail closed`);
  assert.notEqual(
    decision.reason,
    undefined,
    `${name} needs a rejection reason`,
  );
}

const outsideWindow = baseInput();
outsideWindow.enabled = false;
const outsideResult = applyP42ConstructionReservation(outsideWindow);
assert.equal(outsideResult.applied, false);
assert.strictEqual(
  outsideResult.targets,
  outsideWindow.scriptReservations.targets,
);
const afterWindow = baseInput();
afterWindow.ownerContext.period = 728;
assert.equal(applyP42ConstructionReservation(afterWindow).applied, false);

assert.equal(
  shouldReleaseP42ConstructionReservation({
    ownerCycleApplied: true,
    ownerContext: baseInput().ownerContext,
    released: false,
  }),
  false,
  "the intervention remains scoped to its qualified owner cycle",
);
assert.equal(
  shouldReleaseP42ConstructionReservation({
    ownerCycleApplied: true,
    ownerContext: { ...baseInput().ownerContext, period: 728 },
    released: false,
  }),
  true,
);
assert.equal(
  shouldReleaseP42ConstructionReservation({
    ownerCycleApplied: true,
    ownerContext: { ...baseInput().ownerContext, period: 728 },
    released: true,
  }),
  false,
  "release is idempotent",
);

// The substituted Quarry target uses the native same-target exclusion: Quarry's own price does
// not conflict with its reservation, while Housing still protects the complete Quarry price.
const replacementTargets = qualified.targets;
const conflictReader = createCapturedCostConflictReader({
  resources: {
    readResources(ids) {
      return {
        resources: new Map(
          [...ids].map((id) => [
            id,
            {
              present: true,
              unlocked: true,
              amount: P42_EXPECTED.quarryStock[id] ?? 0,
              max: 100,
              rateOfChange: 0,
              storageRatio: 0,
            },
          ]),
        ),
      };
    },
  },
  reservations: {
    readReservations: () => ({ targets: [], unavailable: false }),
  },
  additionalReservations: {
    readReservations: () => ({
      targets: replacementTargets,
      unavailable: false,
    }),
  },
});
assert.deepEqual(
  conflictReader.evaluate(
    P42_EXPECTED.quarryCost,
    undefined,
    P42_EXPECTED.quarryTarget,
  ),
  { status: "none" },
);
const housingConflict = conflictReader.evaluate(
  { Lumber: 23 },
  undefined,
  "city-basic_housing",
);
assert.equal(housingConflict.status, "conflict");
assert.equal(housingConflict.conflict.targetName, P42_EXPECTED.quarryTarget);
assert.equal(housingConflict.conflict.resourceId, "Lumber");

console.log("P42 Construction priority counterfactual regressions passed");
