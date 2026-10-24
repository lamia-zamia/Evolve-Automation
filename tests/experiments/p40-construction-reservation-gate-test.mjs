import assert from "node:assert/strict";

import { createCapturedCostConflictReader } from "../../src/adapters/evolve/captured-cost-conflict.ts";
import { createCapturedConstructionAdapter } from "../../src/adapters/evolve/progression/construction/captured-construction.ts";
import {
  candidateSampleNeeds,
  competitionSampleRequest,
  initialBuildLoopState,
  planBuildConflict,
  planBuildCompetition,
  planBuildGate,
} from "../../src/domain/progression/build/build.ts";

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

function adapterForConflictReader(
  conflicts,
  candidate,
  knowledgeGate = {
    cheapestTechKnowledge: 0,
    knowledgeRequiredByBuildTargets: 0,
    knowledgeCapacity: 0,
  },
) {
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
    readKnowledgeGate: () => knowledgeGate,
    readOptions: () => ({
      consumptionMode: "unlimited",
      buildIfStorageFull: false,
      ignoreZeroRate: false,
      respectReservations: true,
      saveWhiteholeGems: false,
    }),
  });
}

function pureBuildDecision(adapter, index = 0) {
  const { reader } = adapter;
  const setup = reader.beginCycle();
  let state = initialBuildLoopState();
  const needs = candidateSampleNeeds(setup, state, index);
  if (needs.kind === "skip") return { kind: "skip", stage: "sample-needs" };

  const candidateSample = reader.sampleCandidate(index, needs.request);
  const gate = planBuildGate(setup, index, candidateSample, state);
  state = gate.state;
  if (gate.kind === "skip") return { kind: "skip", stage: "candidate-gate" };

  const conflictSample = reader.sampleConflict(index);
  const conflict = planBuildConflict(setup, index, conflictSample);
  if (conflict.kind === "skip") {
    return { kind: "skip", stage: "conflict", conflictSample };
  }

  const request = competitionSampleRequest(setup, state, index);
  const competition = planBuildCompetition(
    setup,
    index,
    reader.sampleCompetition(index, request),
    state,
  );
  return {
    kind: competition.kind === "build" ? "build" : "delay",
    stage: "competition",
    conflictSample,
    competition,
  };
}

// No reservation is not a conflict, needs no holdings read, and reaches the pure Build decision.
{
  const candidate = {
    key: "city-basic_housing",
    weighting: 70,
    cost: { Lumber: 10 },
    ignored: false,
    important: false,
    knowledge: false,
  };
  const holdings = resources({ Lumber: 100 });
  const reader = createCapturedCostConflictReader({
    resources: holdings,
    reservations: reservations(),
  });
  assert.deepEqual(reader.evaluate({ Lumber: 10 }), { status: "none" });
  assert.equal(holdings.reads, 0);
  const decision = pureBuildDecision(
    adapterForConflictReader(reader, candidate),
  );
  assert.equal(decision.kind, "build");
  assert.equal(decision.conflictSample.conflict, null);
}

// Complete holdings without a conflict remain valid evidence and preserve Build permission.
{
  const candidate = {
    key: "city-basic_housing",
    weighting: 70,
    cost: { Lumber: 10 },
    ignored: false,
    important: false,
    knowledge: false,
  };
  const reader = createCapturedCostConflictReader({
    resources: resources({ Lumber: 100 }),
    reservations: reservations([target("city-rock_quarry", { Lumber: 50 })]),
  });
  assert.deepEqual(reader.evaluate({ Lumber: 10 }), { status: "none" });
  const decision = pureBuildDecision(
    adapterForConflictReader(reader, candidate),
  );
  assert.equal(decision.kind, "build");
  assert.equal(decision.conflictSample.conflict, null);
}

// A material deficit is returned as a conflict with its saving cause.
{
  const candidate = {
    key: "city-basic_housing",
    weighting: 70,
    cost: { Lumber: 10 },
    ignored: false,
    important: false,
    knowledge: false,
  };
  const reader = createCapturedCostConflictReader({
    resources: resources({ Lumber: 100 }),
    reservations: reservations([target("city-rock_quarry", { Lumber: 95 })]),
  });
  const evaluated = reader.evaluate({ Lumber: 10 });
  assert.deepEqual(evaluated, {
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
  const decision = pureBuildDecision(
    adapterForConflictReader(reader, candidate),
  );
  assert.equal(decision.kind, "skip");
  assert.equal(decision.stage, "conflict");
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
  const decision = pureBuildDecision(adapter);
  assert.equal(decision.kind, "skip");
  assert.equal(decision.stage, "conflict");
  assert.equal(decision.conflictSample.conflict.unavailable, true);
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

// Missing holdings are an explicit unavailable result, never a verified absence of conflict.
{
  const reader = createCapturedCostConflictReader({
    resources: resources(undefined),
    reservations: reservations([target()]),
  });
  assert.deepEqual(reader.evaluate({ Lumber: 10 }), { status: "unavailable" });
}

// Unknown holdings reach the pure Build planner as unavailable and block an ordinary candidate.
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
  const decision = pureBuildDecision(adapter);
  assert.equal(decision.kind, "skip");
  assert.equal(decision.stage, "conflict");
  assert.deepEqual(decision.conflictSample, {
    conflict: {
      unavailable: true,
      targetNames: [],
      resourceNames: [],
      targetCause: "",
    },
    important: false,
  });
}

// An unavailable reservation source stays fail-closed and does not trigger a holdings read.
{
  const candidate = {
    key: "city-basic_housing",
    weighting: 70,
    cost: { Lumber: 10 },
    ignored: false,
    important: false,
    knowledge: false,
  };
  const holdings = resources({ Lumber: 100 });
  const reader = createCapturedCostConflictReader({
    resources: holdings,
    reservations: reservations([target()], true),
  });
  const decision = pureBuildDecision(
    adapterForConflictReader(reader, candidate),
  );
  assert.equal(decision.kind, "skip");
  assert.equal(decision.stage, "conflict");
  assert.equal(decision.conflictSample.conflict.unavailable, true);
  assert.equal(holdings.reads, 0);
}

// Important remains an intentional override, including when evidence is unavailable.
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

  const importantCandidate = {
    key: "city-important",
    weighting: 70,
    cost: { Lumber: 10 },
    ignored: false,
    important: true,
    knowledge: false,
  };
  const conflictReader = createCapturedCostConflictReader({
    resources: resources({ Lumber: 100 }),
    reservations: reservations([target("city-rock_quarry", { Lumber: 95 })]),
  });
  const knownConflictDecision = pureBuildDecision(
    adapterForConflictReader(conflictReader, importantCandidate),
  );
  assert.equal(knownConflictDecision.kind, "build");
  assert.equal(knownConflictDecision.conflictSample.important, true);
  assert.equal(
    knownConflictDecision.conflictSample.conflict.unavailable,
    false,
  );

  const unavailableReader = createCapturedCostConflictReader({
    resources: resources(undefined),
    reservations: reservations([target()]),
  });
  const unavailableDecision = pureBuildDecision(
    adapterForConflictReader(unavailableReader, importantCandidate),
  );
  assert.equal(unavailableDecision.kind, "build");
  assert.equal(unavailableDecision.conflictSample.important, true);
  assert.equal(unavailableDecision.conflictSample.conflict.unavailable, true);

  const knowledgeSetup = {
    candidates: [{ key: "city-library", knowledge: true }],
    knowledgeGate: {
      cheapestTechKnowledge: 101,
      knowledgeRequiredByBuildTargets: 0,
      knowledgeCapacity: 100,
    },
  };
  const knowledgeCandidate = {
    key: "city-library",
    weighting: 70,
    cost: { Lumber: 10 },
    ignored: false,
    important: false,
    knowledge: true,
  };
  const knowledgeReader = createCapturedCostConflictReader({
    resources: resources({ Lumber: 100 }),
    reservations: reservations([target("city-rock_quarry", { Lumber: 95 })]),
  });
  const knowledgeDecision = pureBuildDecision(
    adapterForConflictReader(
      knowledgeReader,
      knowledgeCandidate,
      knowledgeSetup.knowledgeGate,
    ),
  );
  assert.equal(knowledgeDecision.kind, "build");
  assert.equal(knowledgeDecision.conflictSample.conflict.targetCause, "Saving");
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
