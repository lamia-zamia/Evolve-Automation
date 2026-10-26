import assert from "node:assert/strict";

import {
  P53_QUARRY_REQUEST,
  qualifyP53QuarryRequest,
} from "../../experiments/p53-construction-owned-target-authority-contract.mjs";
import { decideConstructionTargetAdmission } from "../../src/domain/progression/build/construction-target-admission.ts";
import { stageP51VerifiedPurchaseForTest } from "../../experiments/p51-construction-jobs-handoff-contract.mjs";

const farmSaving = {
  name: "city-farm",
  cause: "Saving",
  cost: { Lumber: 27, Stone: 14 },
};
const otherScriptReservation = {
  name: "script-stone-claim",
  cause: "Mech",
  cost: { Money: 1 },
};

function baseInput() {
  return {
    request: P53_QUARRY_REQUEST,
    owner: {
      period: 720,
      workCycleId: 90,
      orderingGeneration: 90,
      rootGeneration: 4,
      progressionGeneration: "standard-human|progression-4",
      publicationWorkCycleId: 89,
      publicationRootGeneration: 4,
      publicationProgressionGeneration: "standard-human|progression-4",
    },
    candidate: {
      key: "city-rock_quarry",
      actionId: "city-rock_quarry",
      family: "buildings",
      ignored: false,
      important: false,
      knowledge: false,
      cost: { Lumber: 50, Stone: 10 },
    },
    orderingIndex: 0,
    candidateCatalogComplete: true,
    affordable: true,
    control: {
      actionId: "city-rock_quarry",
      available: true,
      generation: 9,
      price: { cost: { Lumber: 50, Stone: 10 } },
    },
    nativeQueue: { targets: [], unavailable: false },
    scriptReservations: {
      targets: [farmSaving, otherScriptReservation],
      unavailable: false,
    },
    previousSavingTarget: {
      name: farmSaving.name,
      cost: farmSaving.cost,
    },
    verifiedPurchases: 0,
    verifiedResourceDebits: {},
  };
}

const accepted = decideConstructionTargetAdmission(baseInput());
assert.equal(accepted.status, "accepted-for-owner-decision");
assert.deepEqual(accepted.revision, {
  requestId: P53_QUARRY_REQUEST.requestId,
  requestGeneration: P53_QUARRY_REQUEST.generation,
  previous: { name: "city-farm", cost: { Lumber: 27, Stone: 14 } },
  replacement: {
    name: "city-rock_quarry",
    cost: { Lumber: 50, Stone: 10 },
  },
  workCycleId: 90,
  orderingGeneration: 90,
  reason: "explicit-test-only-priority-replacement",
  lifetime: "this-construction-cycle",
});
assert.equal(qualifyP53QuarryRequest(P53_QUARRY_REQUEST, "C").qualified, true);
assert.equal(qualifyP53QuarryRequest(P53_QUARRY_REQUEST, "D").qualified, true);
assert.equal(
  qualifyP53QuarryRequest(P53_QUARRY_REQUEST, "D-repeat").qualified,
  true,
);
assert.equal(
  qualifyP53QuarryRequest(P53_QUARRY_REQUEST, "C-repeat").qualified,
  true,
);
assert.equal(qualifyP53QuarryRequest(P53_QUARRY_REQUEST, "B").qualified, false);

const rejected = [
  ["request absent", { request: undefined }, "inactive"],
  [
    "missing target permission",
    { request: { ...P53_QUARRY_REQUEST, targetPermission: false } },
    "rejected-unaffordable",
  ],
  [
    "missing native execution permission",
    { request: { ...P53_QUARRY_REQUEST, nativeExecutionPermission: false } },
    "rejected-unaffordable",
  ],
  [
    "missing priority replacement permission",
    {
      request: {
        ...P53_QUARRY_REQUEST,
        priorityReplacement: {
          ...P53_QUARRY_REQUEST.priorityReplacement,
          permitted: false,
        },
      },
    },
    "rejected-priority-conflict",
  ],
  [
    "Gather authority cannot be added",
    { request: { ...P53_QUARRY_REQUEST, materialGatheringPermission: true } },
    "rejected-incomplete-authority",
  ],
  [
    "Jobs authority cannot be added",
    { request: { ...P53_QUARRY_REQUEST, jobsAssignmentPermission: true } },
    "rejected-incomplete-authority",
  ],
  [
    "production authority cannot be added",
    { request: { ...P53_QUARRY_REQUEST, productionAuthorized: true } },
    "rejected-incomplete-authority",
  ],
  [
    "wrong target",
    { request: { ...P53_QUARRY_REQUEST, targetBuildingId: "city-farm" } },
    "rejected-target-unavailable",
  ],
  ["target missing", { candidate: undefined }, "rejected-target-unavailable"],
  [
    "target no longer current",
    { candidate: { key: "city-basic_housing" } },
    "rejected-target-unavailable",
  ],
  [
    "queued target",
    { candidate: { ignored: true } },
    "rejected-target-unavailable",
  ],
  [
    "important candidate keeps ordinary behavior",
    { candidate: { important: true } },
    "rejected-target-unavailable",
  ],
  [
    "Knowledge exception keeps ordinary behavior",
    { candidate: { knowledge: true } },
    "rejected-target-unavailable",
  ],
  [
    "incomplete candidate catalog",
    { candidateCatalogComplete: false },
    "rejected-incomplete-authority",
  ],
  [
    "repriced target exceeds debit budget",
    { candidate: { cost: { Lumber: 51, Stone: 10 } } },
    "rejected-unaffordable",
  ],
  ["missing holdings", { affordable: undefined }, "rejected-unaffordable"],
  ["not affordable", { affordable: false }, "rejected-unaffordable"],
  [
    "native control missing",
    { control: undefined },
    "rejected-incomplete-authority",
  ],
  [
    "native control changed target",
    { control: { actionId: "city-farm", available: true, generation: 9 } },
    "rejected-incomplete-authority",
  ],
  [
    "native queue evidence unavailable",
    { nativeQueue: { targets: [], unavailable: true } },
    "rejected-incomplete-authority",
  ],
  [
    "native queue commitment protects its reservation",
    {
      nativeQueue: {
        targets: [
          { name: "city-warehouse", cause: "Queue", cost: { Lumber: 1 } },
        ],
        unavailable: false,
      },
    },
    "rejected-priority-conflict",
  ],
  [
    "script reservation evidence unavailable",
    { scriptReservations: { targets: [], unavailable: true } },
    "rejected-incomplete-authority",
  ],
  [
    "competing saving intent is ambiguous",
    {
      scriptReservations: {
        targets: [farmSaving, { ...farmSaving, name: "other-saving" }],
        unavailable: false,
      },
    },
    "rejected-priority-conflict",
  ],
  [
    "previous saving target changed",
    {
      previousSavingTarget: { name: "city-basic_housing", cost: { Lumber: 1 } },
    },
    "rejected-priority-conflict",
  ],
  ["root changed", { owner: { rootGeneration: 5 } }, "stale"],
  [
    "progression changed",
    { owner: { progressionGeneration: "other" } },
    "stale",
  ],
  ["publication changed", { owner: { publicationWorkCycleId: 88 } }, "stale"],
  ["period expired", { owner: { period: 721 } }, "stale"],
  ["work cycle expired", { owner: { workCycleId: 91 } }, "stale"],
  [
    "ordering generation changed",
    { owner: { orderingGeneration: 91 } },
    "stale",
  ],
  [
    "scope has multiple cycles",
    {
      request: {
        ...P53_QUARRY_REQUEST,
        expiresAt: { period: 721, workCycleId: 91 },
      },
    },
    "rejected-incomplete-authority",
  ],
  [
    "cancelled request",
    { request: { ...P53_QUARRY_REQUEST, cancelledAtGeneration: 1 } },
    "stale",
  ],
  [
    "replaced request",
    { request: { ...P53_QUARRY_REQUEST, replacedAtGeneration: 1 } },
    "stale",
  ],
  [
    "purchase budget exhausted",
    { verifiedPurchases: 1 },
    "rejected-unaffordable",
  ],
  [
    "debit budget exhausted",
    { verifiedResourceDebits: { Lumber: 50 } },
    "rejected-unaffordable",
  ],
  [
    "invalid debit authority",
    {
      request: {
        ...P53_QUARRY_REQUEST,
        maximumTotalAuthorizedResourceDebit: { Lumber: Number.NaN },
      },
    },
    "rejected-incomplete-authority",
  ],
];

for (const [name, override, status] of rejected) {
  const input = baseInput();
  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      input[key] !== null &&
      typeof input[key] === "object" &&
      !Array.isArray(input[key])
    )
      input[key] = { ...input[key], ...value };
    else input[key] = value;
  }
  assert.equal(decideConstructionTargetAdmission(input).status, status, name);
}

// Enable the narrowly compiled test seam before loading the adapter module.
globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ = true;
globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ = true;
const [
  { createCapturedConstructionAdapter },
  { createCapturedCostConflictReader },
  { runBuildAutomation },
] = await Promise.all([
  import("../../src/adapters/evolve/progression/construction/captured-construction.ts"),
  import("../../src/adapters/evolve/captured-cost-conflict.ts"),
  import("../../src/application/build.ts"),
]);

function makeOwnerCycle({
  request = P53_QUARRY_REQUEST,
  initialLumber = 50,
  nativeReservationsUnavailable = false,
  controlGeneration = () => 9,
  cycleComplete = () => true,
  executeMode = () => "verified-success",
  prepare = true,
  onBeforeCurrentCycle = () => {},
  initialNativePrice = { Lumber: 50, Stone: 10 },
  eventFed = false,
} = {}) {
  const root = {
    tech: {},
    race: { supplySplit: false },
    resource: {
      Lumber: { display: true, amount: initialLumber, max: 1000, diff: 1 },
      Stone: { display: true, amount: 10, max: 1000, diff: 1 },
      Money: { display: true, amount: 10, max: 1000, diff: 1 },
    },
  };
  let period = 719;
  let liveRequest = request;
  let localPendingRequest = request;
  let liveNativePrice = initialNativePrice;
  let liveProgressionGeneration = "standard-human|progression-4";
  let ownerAdapter;
  let sourceCycle = 0;
  const decisions = [];
  const operationSamples = [];
  const requestLifecycle = [];
  const reservationReads = [];
  const purchases = [];
  const nativeInvocations = [];
  const rootReplaced = new Set();
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced(listener) {
      rootReplaced.add(listener);
      return () => rootReplaced.delete(listener);
    },
  };
  const resources = {
    readResources(ids) {
      return {
        resources: new Map(
          [...ids].map((id) => [
            id,
            root.resource[id] === undefined
              ? {
                  present: false,
                  unlocked: false,
                  amount: 0,
                  max: 0,
                  rateOfChange: 0,
                  storageRatio: 0,
                }
              : {
                  present: true,
                  unlocked: true,
                  amount: root.resource[id].amount,
                  max: root.resource[id].max,
                  rateOfChange: root.resource[id].diff,
                  storageRatio:
                    root.resource[id].amount / root.resource[id].max,
                },
          ]),
        ),
      };
    },
  };
  const nativeQueue = {
    readReservations: () => ({
      targets: [],
      unavailable: nativeReservationsUnavailable,
    }),
  };
  const additionalReservations = {
    readReservations() {
      const target =
        ownerAdapter?.observations.readSavingTargetForConflict?.() ??
        ownerAdapter?.observations.readSavingTarget() ??
        null;
      const targets = [
        ...(target === null ? [] : [{ ...target, cause: "Saving" }]),
        otherScriptReservation,
      ];
      reservationReads.push(target?.name ?? null);
      return { targets, unavailable: false };
    },
  };
  const conflictReader = createCapturedCostConflictReader({
    resources,
    reservations: nativeQueue,
    additionalReservations,
  });
  const source = {
    family: "buildings",
    beginCycle() {
      sourceCycle++;
      const candidates =
        sourceCycle < 90
          ? [
              {
                key: "city-farm",
                weighting: 100,
                cost: { Lumber: 80 },
                actionId: "city-farm",
              },
            ]
          : [
              {
                key: "city-rock_quarry",
                weighting: 300,
                cost: { Lumber: 50, Stone: 10 },
                actionId: "city-rock_quarry",
              },
              {
                key: "city-farm",
                weighting: 100,
                cost: { Lumber: 80 },
                actionId: "city-farm",
              },
              {
                key: "city-basic_housing",
                weighting: 50,
                cost: { Money: 1 },
                actionId: "city-basic_housing",
              },
            ];
      return {
        complete: cycleComplete(),
        candidates: candidates.map((candidate) => ({
          ignored: false,
          important: false,
          knowledge: false,
          ...candidate,
        })),
      };
    },
    readActionAuthority(key) {
      return {
        actionId: key,
        available: true,
        generation: controlGeneration(),
        price: { cost: liveNativePrice },
      };
    },
    execute(key) {
      nativeInvocations.push(key);
      const mode = executeMode(key);
      if (mode === "native-rejected")
        return {
          outcome: { status: "succeeded" },
          disposition: "candidate-rejected",
          clicked: false,
          mission: false,
          consumption: [],
        };
      if (mode === "postcondition-failed")
        return {
          outcome: { status: "succeeded" },
          disposition: "invoked-but-unverified",
          clicked: true,
          mission: false,
          consumption: [],
        };
      if (mode !== "verified-success")
        throw new TypeError(`unknown test execution mode ${mode}`);
      purchases.push(key);
      if (key === "city-rock_quarry") {
        root.resource.Lumber.amount -= 50;
        root.resource.Stone.amount -= 10;
      } else if (key === "city-basic_housing") root.resource.Money.amount -= 1;
      return {
        outcome: { status: "succeeded" },
        disposition: "verified-success",
        clicked: true,
        mission: false,
        consumption: [],
      };
    },
  };
  ownerAdapter = createCapturedConstructionAdapter({
    sources: [source],
    resources,
    rootState,
    conflicts: conflictReader,
    readOptions: () => ({
      consumptionMode: "unlimited",
      buildIfStorageFull: false,
      ignoreZeroRate: false,
      respectReservations: true,
      saveWhiteholeGems: false,
    }),
    targetAdmissionForTest: {
      readRequest: () => (eventFed ? localPendingRequest : liveRequest),
      eventFed,
      readRootObservationCountForTest: () => 0,
      readContext: () => ({
        period,
        rootGeneration: 4,
        progressionGeneration: liveProgressionGeneration,
      }),
      onDecision: (decision, candidateKey) =>
        decisions.push({ decision, candidateKey }),
      onOperation: (operation) => operationSamples.push(operation),
      onRequestConsumed: (request) => {
        if (localPendingRequest === request) localPendingRequest = undefined;
        requestLifecycle.push("consumed");
      },
      onRequestExpired: (request) => {
        if (localPendingRequest === request) localPendingRequest = undefined;
        requestLifecycle.push("expired");
      },
      onRequestInvalidated: (request) => {
        if (localPendingRequest === request) localPendingRequest = undefined;
        requestLifecycle.push("invalidated");
      },
    },
  });

  for (let cycle = 1; cycle <= 89; cycle++) {
    ownerAdapter.reader.beginCycle();
    ownerAdapter.reader.finishCycle(true);
  }
  assert.equal(ownerAdapter.observations.readSavingTarget().name, "city-farm");
  period = 720;
  onBeforeCurrentCycle();
  let conflict = null;
  if (prepare) {
    ownerAdapter.reader.beginCycle();
    const quarryIndex = 0;
    ownerAdapter.reader.sampleCandidate(quarryIndex, {
      needAffordability: true,
      needConsumption: false,
    });
    conflict = ownerAdapter.reader.sampleConflict(quarryIndex);
  }
  return {
    adapter: ownerAdapter,
    conflict,
    decisions,
    liveRequest: () => liveRequest,
    replaceRequest(next) {
      liveRequest = next;
      if (eventFed) localPendingRequest = next;
    },
    cancelRequest() {
      liveRequest = undefined;
      if (eventFed) localPendingRequest = undefined;
    },
    pendingRequest: () => localPendingRequest,
    operationSamples,
    requestLifecycle,
    reservationReads,
    purchases,
    nativeInvocations,
    root,
    rootReplaced,
    setControlGeneration(value) {
      controlGeneration = () => value;
    },
    setNativePrice(value) {
      liveNativePrice = value;
    },
    setProgressionGeneration(value) {
      liveProgressionGeneration = value;
    },
    replaceRoot() {
      for (const listener of rootReplaced) listener();
    },
    run() {
      return runBuildAutomation({
        reader: ownerAdapter.reader,
        executor: ownerAdapter.executor,
      });
    },
  };
}

// The temporary revision is visible only during Quarry's conflict read and preserves other reservations.
{
  const cycle = makeOwnerCycle();
  assert.equal(cycle.conflict.conflict, null);
  assert.deepEqual(cycle.reservationReads.slice(-2), [
    "city-farm",
    "city-rock_quarry",
  ]);
  assert.equal(cycle.adapter.observations.readSavingTarget().name, "city-farm");
  assert.equal(
    cycle.decisions.at(-1).decision.status,
    "accepted-for-owner-decision",
  );
  const first = cycle.adapter.executor.executeClick({
    index: 0,
    key: "city-rock_quarry",
  });
  assert.equal(first.disposition, "verified-success");
  const second = cycle.adapter.executor.executeClick({
    index: 0,
    key: "city-rock_quarry",
  });
  assert.equal(second.disposition, "candidate-rejected");
  assert.deepEqual(cycle.purchases, ["city-rock_quarry"]);
  assert.equal(cycle.adapter.observations.readSavingTarget().name, "city-farm");
}

// Event-fed Construction reads the exact pending request locally and releases it only after the
// same native action and verified postcondition succeed.
{
  const cycle = makeOwnerCycle({ eventFed: true });
  assert.equal(
    cycle.decisions.at(-1).decision.status,
    "accepted-for-owner-decision",
  );
  assert.ok(cycle.operationSamples.includes("local-pending-request-check"));
  assert.equal(cycle.pendingRequest(), P53_QUARRY_REQUEST);
  const result = cycle.adapter.executor.executeClick({
    index: 0,
    key: "city-rock_quarry",
  });
  assert.equal(result.disposition, "verified-success");
  assert.deepEqual(cycle.nativeInvocations, ["city-rock_quarry"]);
  assert.deepEqual(cycle.requestLifecycle, ["consumed"]);
  assert.equal(cycle.pendingRequest(), undefined);
  assert.equal(
    cycle.adapter.executor.executeClick({
      index: 0,
      key: "city-rock_quarry",
    }).disposition,
    "candidate-rejected",
  );
  assert.deepEqual(cycle.nativeInvocations, ["city-rock_quarry"]);
}

// A denied replacement leaves the old saving priority active and lets an unrelated native action proceed.
{
  const deniedRequest = {
    ...P53_QUARRY_REQUEST,
    priorityReplacement: {
      ...P53_QUARRY_REQUEST.priorityReplacement,
      permitted: false,
    },
  };
  const cycle = makeOwnerCycle({ request: deniedRequest, prepare: false });
  const result = cycle.run();
  assert.equal(result.status, "succeeded");
  assert.equal(
    cycle.decisions.at(-1).decision.status,
    "rejected-priority-conflict",
  );
  assert.deepEqual(cycle.purchases, ["city-basic_housing"]);
}

// A failed native action or count postcondition consumes no successful-purchase credit or receipt.
for (const mode of ["native-rejected", "postcondition-failed"]) {
  const cycle = makeOwnerCycle({ executeMode: () => mode });
  const result = cycle.adapter.executor.executeClick({
    index: 0,
    key: "city-rock_quarry",
  });
  assert.equal(
    result.disposition,
    mode === "native-rejected"
      ? "candidate-rejected"
      : "invoked-but-unverified",
  );
  const repeated = cycle.adapter.executor.executeClick({
    index: 0,
    key: "city-rock_quarry",
  });
  assert.equal(repeated.disposition, "candidate-rejected");
  assert.deepEqual(cycle.purchases, []);
  assert.deepEqual(cycle.nativeInvocations, ["city-rock_quarry"]);
  const receipt = stageP51VerifiedPurchaseForTest(
    { p51ConstructionRequest: P53_QUARRY_REQUEST, p51Arm: "C" },
    {
      candidate: { key: "city-rock_quarry", cost: { Lumber: 50, Stone: 10 } },
      result,
    },
  );
  assert.equal(receipt.staged, false);
}

// Root, control and request replacement between owner admission and execution revoke the revision.
for (const invalidation of [
  "root",
  "control",
  "request",
  "progression",
  "price",
]) {
  const cycle = makeOwnerCycle({ eventFed: true });
  if (invalidation === "root") cycle.replaceRoot();
  if (invalidation === "control") cycle.setControlGeneration(10);
  if (invalidation === "request")
    cycle.replaceRequest({
      ...P53_QUARRY_REQUEST,
      active: false,
      generation: 2,
    });
  if (invalidation === "progression")
    cycle.setProgressionGeneration("standard-human|progression-5");
  if (invalidation === "price") cycle.setNativePrice({ Lumber: 49, Stone: 10 });
  const result = cycle.adapter.executor.executeClick({
    index: 0,
    key: "city-rock_quarry",
  });
  assert.equal(result.disposition, "candidate-rejected", invalidation);
  assert.deepEqual(cycle.purchases, [], invalidation);
}

// A cancellation/replacement before the Construction decision or execution invalidates the
// original exact request object; an expired request is released at the next owner cycle.
{
  const cancelled = makeOwnerCycle({ eventFed: true });
  cancelled.cancelRequest();
  assert.equal(
    cancelled.adapter.executor.executeClick({
      index: 0,
      key: "city-rock_quarry",
    }).disposition,
    "candidate-rejected",
  );
  assert.equal(cancelled.pendingRequest(), undefined);
  assert.deepEqual(cancelled.purchases, []);

  const expired = makeOwnerCycle({ eventFed: true });
  expired.adapter.reader.finishCycle(true);
  expired.adapter.reader.beginCycle();
  assert.equal(expired.pendingRequest(), undefined);
  assert.deepEqual(expired.requestLifecycle, ["expired"]);
}

// An unavailable source rejects the requested action and leaves P41's conflict reader fail-closed.
{
  const cycle = makeOwnerCycle({ nativeReservationsUnavailable: true });
  assert.equal(
    cycle.decisions.at(-1).decision.status,
    "rejected-incomplete-authority",
  );
  assert.equal(cycle.conflict.conflict?.unavailable, true);
  assert.deepEqual(cycle.purchases, []);
}

// An incomplete Construction source set rejects admission before target selection.
{
  let sourceComplete = true;
  const cycle = makeOwnerCycle({
    prepare: false,
    cycleComplete: () => sourceComplete,
    onBeforeCurrentCycle: () => {
      sourceComplete = false;
    },
  });
  cycle.run();
  assert.equal(
    cycle.decisions.at(-1).decision.status,
    "rejected-incomplete-authority",
  );
  assert.deepEqual(cycle.purchases, []);
}

console.log(
  "P53 Construction-owned target admission and saving revision tests passed",
);
