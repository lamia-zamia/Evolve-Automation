import assert from "node:assert/strict";

import { createCapturedCostConflictReader } from "../../src/adapters/evolve/captured-cost-conflict.ts";
import { createCapturedConstructionAdapter } from "../../src/adapters/evolve/progression/construction/captured-construction.ts";
import { planBuildConflict } from "../../src/domain/progression/build/build.ts";

function reservations(targets = [], unavailable = false) {
  return { readReservations: () => ({ targets, unavailable }) };
}

function resources(holdings) {
  let reads = 0;
  return {
    get reads() {
      return reads;
    },
    readResources(ids) {
      reads++;
      if (holdings === undefined) return undefined;
      return {
        resources: new Map(
          [...ids].map((id) => [
            id,
            {
              present: Object.hasOwn(holdings, id),
              unlocked: Object.hasOwn(holdings, id),
              amount: holdings[id] ?? 0,
              max: 1000,
              rateOfChange: 0,
              storageRatio: (holdings[id] ?? 0) / 1000,
            },
          ]),
        ),
      };
    },
  };
}

function target(name = "city-rock_quarry", cost = { Lumber: 100 }, pool) {
  return {
    name,
    cause: "Saving",
    ...(pool === undefined ? {} : { pool }),
    cost,
  };
}

function setupFor(candidate) {
  return {
    candidates: [candidate],
    knowledgeGate: {
      cheapestTechKnowledge: 0,
      knowledgeRequiredByBuildTargets: 0,
      knowledgeCapacity: 0,
    },
  };
}

function conflictSample({ important = false, cause = "Saving" } = {}) {
  return {
    important,
    conflict: {
      unavailable: false,
      targetNames: ["city-rock_quarry"],
      resourceNames: ["Lumber"],
      targetCause: cause,
    },
  };
}

function adapterForConflictReader(conflicts, candidate) {
  return createCapturedConstructionAdapter({
    sources: [
      {
        family: "city",
        beginCycle: () => ({ candidates: [candidate], complete: true }),
        execute: () => ({
          outcome: { status: "succeeded" },
          clicked: true,
          mission: false,
          consumption: [],
        }),
      },
    ],
    resources: resources({ Lumber: 10 }),
    rootState: {
      readRoot: () => ({
        tech: {},
        race: {},
        resource: { Lumber: { amount: 10, max: 1000, diff: 0 } },
      }),
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    conflicts,
    readOptions: () => ({
      consumptionMode: "unlimited",
      buildIfStorageFull: false,
      ignoreZeroRate: false,
      respectReservations: true,
      saveWhiteholeGems: false,
    }),
  });
}

// No reservation is not a conflict, and it must not require a holdings read.
{
  const holdings = resources({ Lumber: 100 });
  const reader = createCapturedCostConflictReader({
    resources: holdings,
    reservations: reservations(),
  });
  assert.deepEqual(reader.evaluate({ Lumber: 10 }), { status: "none" });
  assert.equal(holdings.reads, 0);
}

// A complete reservation with enough remaining after this action is valid evidence of no conflict.
{
  const reader = createCapturedCostConflictReader({
    resources: resources({ Lumber: 100 }),
    reservations: reservations([target("city-rock_quarry", { Lumber: 50 })]),
  });
  assert.deepEqual(reader.evaluate({ Lumber: 10 }), { status: "none" });
}

// A material deficit is returned as a conflict with its saving cause.
{
  const reader = createCapturedCostConflictReader({
    resources: resources({ Lumber: 100 }),
    reservations: reservations([target("city-rock_quarry", { Lumber: 95 })]),
  });
  assert.deepEqual(reader.evaluate({ Lumber: 10 }), {
    status: "conflict",
    conflict: {
      status: "conflict",
      resourceId: "Lumber",
      targetName: "city-rock_quarry",
      targetCause: "Saving",
      resourceNames: ["Lumber"],
      targetNames: ["city-rock_quarry"],
    },
  });
}

// Incomplete reservation sources are unavailable, not a clean no-conflict result.
{
  const candidate = {
    key: "city-basic_housing",
    actionId: "city-basic_housing",
    weighting: 70,
    cost: { Lumber: 10 },
    ignored: false,
    important: false,
    knowledge: false,
  };
  const reader = createCapturedCostConflictReader({
    resources: resources({ Lumber: 100 }),
    reservations: reservations([target()], true),
  });
  assert.deepEqual(reader.evaluate({ Lumber: 10 }), { status: "unavailable" });

  const adapter = adapterForConflictReader(reader, candidate);
  const setup = adapter.reader.beginCycle();
  const sample = adapter.reader.sampleConflict(0);
  assert.equal(sample.conflict.unavailable, true);
  assert.equal(planBuildConflict(setup, 0, sample).kind, "skip");
}

// Same-target and different-pool reservations are intentionally excluded before holdings are read.
{
  const sameTargetHoldings = resources({ Lumber: 100 });
  const sameTargetReader = createCapturedCostConflictReader({
    resources: sameTargetHoldings,
    reservations: reservations([target("city-basic_housing", { Lumber: 95 })]),
  });
  assert.deepEqual(
    sameTargetReader.evaluate({ Lumber: 10 }, undefined, "city-basic_housing"),
    { status: "none" },
  );
  assert.equal(sameTargetHoldings.reads, 0);

  const differentPoolHoldings = resources({ Lumber: 100 });
  const differentPoolReader = createCapturedCostConflictReader({
    resources: differentPoolHoldings,
    reservations: reservations([
      target("city-rock_quarry", { Lumber: 95 }, "moon"),
    ]),
  });
  assert.deepEqual(differentPoolReader.evaluate({ Lumber: 10 }, "home"), {
    status: "none",
  });
  assert.equal(differentPoolHoldings.reads, 0);
}

// The raw reader reports missing holdings as no conflict plus unavailable evidence.
{
  const reader = createCapturedCostConflictReader({
    resources: resources(undefined),
    reservations: reservations([target()]),
  });
  assert.deepEqual(reader.evaluate({ Lumber: 10 }), {
    status: "none",
    evidence: "unavailable",
  });
}

// The existing Construction adapter drops that evidence tag, so the pure Build gate sees null and
// proceeds. This is a reproducible fail-open correctness finding, independent of the P40 replay.
{
  const candidate = {
    key: "city-basic_housing",
    actionId: "city-basic_housing",
    weighting: 70,
    cost: { Lumber: 10 },
    ignored: false,
    important: false,
    knowledge: false,
  };
  const missingHoldingsReader = createCapturedCostConflictReader({
    resources: resources(undefined),
    reservations: reservations([target()]),
  });
  const adapter = createCapturedConstructionAdapter({
    sources: [
      {
        family: "city",
        beginCycle: () => ({ candidates: [candidate], complete: true }),
        execute: () => ({
          outcome: { status: "succeeded" },
          clicked: true,
          mission: false,
          consumption: [],
        }),
      },
    ],
    resources: resources({ Lumber: 10 }),
    rootState: {
      readRoot: () => ({
        tech: {},
        race: {},
        resource: { Lumber: { amount: 10, max: 1000, diff: 0 } },
      }),
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    conflicts: missingHoldingsReader,
    readOptions: () => ({
      consumptionMode: "unlimited",
      buildIfStorageFull: false,
      ignoreZeroRate: false,
      respectReservations: true,
      saveWhiteholeGems: false,
    }),
  });
  const setup = adapter.reader.beginCycle();
  const sample = adapter.reader.sampleConflict(0);
  assert.deepEqual(sample, { conflict: null, important: false });
  assert.deepEqual(planBuildConflict(setup, 0, sample), { kind: "proceed" });
}

// The normal gate skips a conflict; important bypass and the Knowledge/Saving exception proceed.
{
  const ordinarySetup = setupFor({
    key: "city-basic_housing",
    knowledge: false,
  });
  assert.equal(
    planBuildConflict(ordinarySetup, 0, conflictSample()).kind,
    "skip",
  );
  assert.deepEqual(
    planBuildConflict(ordinarySetup, 0, conflictSample({ important: true })),
    { kind: "proceed" },
  );

  const knowledgeSetup = {
    candidates: [{ key: "city-library", knowledge: true }],
    knowledgeGate: {
      cheapestTechKnowledge: 101,
      knowledgeRequiredByBuildTargets: 0,
      knowledgeCapacity: 100,
    },
  };
  assert.deepEqual(planBuildConflict(knowledgeSetup, 0, conflictSample()), {
    kind: "proceed",
  });
  assert.equal(
    planBuildConflict(knowledgeSetup, 0, conflictSample({ cause: "Queue" }))
      .kind,
    "skip",
  );
}

console.log("P40 Construction reservation gate regressions passed");
