import assert from "node:assert/strict";

import { createCapturedConstructionAdapter } from "../src/adapters/evolve/progression/construction/captured-construction.ts";
import { runBuildAutomation } from "../src/application/build.ts";

/**
 * Two families over one pot of money. Each source is a stand-in for a real one — it offers
 * candidates and buys them — so what is under test is the merged order and the shared judgement,
 * not either family's own capture.
 */
function makeSource(family, candidates, holdings, bought) {
  let cycle = new Map();
  return {
    family,
    beginCycle() {
      cycle = new Map(
        candidates().map((candidate) => [
          candidate.key,
          {
            important: false,
            ignored: false,
            knowledge: false,
            ...candidate,
          },
        ]),
      );
      return [...cycle.values()];
    },
    execute(key) {
      const candidate = cycle.get(key);
      if (candidate === undefined) {
        return {
          outcome: { status: "stale", failure: { code: "x", message: "x" } },
          clicked: false,
          mission: false,
          consumption: [],
        };
      }
      for (const [id, amount] of Object.entries(candidate.cost)) {
        holdings[id] -= amount;
      }
      bought.push(key);
      return {
        outcome: { status: "succeeded" },
        clicked: true,
        mission: false,
        consumption: candidate.consumption ?? [],
      };
    },
  };
}

function makeResources(holdings) {
  return {
    readResources(ids) {
      return {
        resources: new Map(
          [...ids].map((id) => [
            id,
            holdings[id] === undefined
              ? {
                  unlocked: false,
                  amount: 0,
                  max: 0,
                  rateOfChange: 0,
                  storageRatio: 0,
                }
              : {
                  unlocked: true,
                  amount: holdings[id],
                  max: 100000,
                  rateOfChange: 10,
                  storageRatio: holdings[id] / 100000,
                },
          ]),
        ),
      };
    },
  };
}

function makeCycle({
  city = [],
  arpa = [],
  holdings = {},
  conflict = { status: "none" },
  respectReservations = true,
  knowledgeGate,
  storageRequired,
  consumptionMode = "unlimited",
} = {}) {
  const bought = [];
  const adapter = createCapturedConstructionAdapter({
    sources: [
      makeSource("city", () => city, holdings, bought),
      makeSource("arpa", () => arpa, holdings, bought),
    ],
    resources: makeResources(holdings),
    conflicts: { evaluate: () => conflict },
    ...(knowledgeGate === undefined
      ? {}
      : { readKnowledgeGate: () => knowledgeGate }),
    ...(storageRequired === undefined
      ? {}
      : { readStorageRequired: () => storageRequired }),
    readOptions: () => ({
      consumptionMode,
      buildIfStorageFull: false,
      ignoreZeroRate: false,
      respectReservations,
      saveWhiteholeGems: false,
    }),
  });
  return { adapter, bought, holdings };
}

function runCycle(cycle) {
  return runBuildAutomation({
    reader: cycle.adapter.reader,
    executor: cycle.adapter.executor,
  });
}

// Per-resource consumption is sampled from the managed candidate and is remembered after the
// purchase, so a later candidate consuming the same resource waits in perResource mode.
{
  const cycle = makeCycle({
    city: [
      {
        key: "first",
        weighting: 20,
        cost: { Money: 1 },
        consumption: [{ resourceId: "Food", nonNegativeRate: true }],
      },
      {
        key: "second",
        weighting: 10,
        cost: { Money: 1 },
        consumption: [{ resourceId: "Food", nonNegativeRate: true }],
      },
    ],
    holdings: { Money: 100 },
    consumptionMode: "perResource",
  });
  assert.equal(runBuildAutomation(cycle.adapter).status, "succeeded");
  assert.deepEqual(cycle.bought, ["first"]);
}

// A known storage requirement makes a nearly full resource non-contended; absent requirements
// remain unknown and keep the lower-weighted candidate waiting.
{
  const makeStorageCycle = (readStorageRequired) =>
    makeCycle({
      city: [
        { key: "expensive", weighting: 90, cost: { Money: 100000 } },
        { key: "cheap", weighting: 10, cost: { Money: 20 } },
      ],
      holdings: { Money: 99900 },
      ...(readStorageRequired === undefined
        ? {}
        : { storageRequired: readStorageRequired }),
    });
  const unknown = makeStorageCycle(undefined);
  assert.equal(runBuildAutomation(unknown.adapter).status, "succeeded");
  assert.deepEqual(unknown.bought, []);

  const known = makeStorageCycle({ Money: 900 });
  assert.equal(runBuildAutomation(known.adapter).status, "succeeded");
  assert.deepEqual(known.bought, ["cheap"]);
}

// A Knowledge-raising building may spend through a lower-priority saving target when the
// storage planner has proved that Knowledge capacity is the blocking resource.
{
  const conflict = {
    status: "conflict",
    conflict: {
      targetNames: ["Queued research"],
      resourceNames: ["Money"],
      targetCause: "Saving",
    },
  };
  const gated = makeCycle({
    city: [
      {
        key: "library",
        weighting: 10,
        knowledge: true,
        cost: { Money: 10 },
      },
    ],
    holdings: { Money: 100 },
    conflict,
    knowledgeGate: {
      cheapestTechKnowledge: 500,
      knowledgeRequiredByBuildTargets: 0,
      knowledgeCapacity: 100,
    },
  });
  assert.equal(runBuildAutomation(gated.adapter).status, "succeeded");
  assert.deepEqual(gated.bought, ["library"]);

  const ungated = makeCycle({
    city: [
      {
        key: "library",
        weighting: 10,
        knowledge: true,
        cost: { Money: 10 },
      },
    ],
    holdings: { Money: 100 },
    conflict,
    knowledgeGate: {
      cheapestTechKnowledge: 50,
      knowledgeRequiredByBuildTargets: 0,
      knowledgeCapacity: 100,
    },
  });
  assert.equal(runBuildAutomation(ungated.adapter).status, "succeeded");
  assert.deepEqual(ungated.bought, []);
}

// --- one weighting order across both families ---------------------------------------------------

{
  const cycle = makeCycle({
    city: [
      { key: "city-farm", weighting: 90, cost: { Money: 100 } },
      { key: "city-mine", weighting: 10, cost: { Money: 100 } },
    ],
    arpa: [{ key: "arpalhc", weighting: 50, cost: { Money: 100 } }],
    holdings: { Money: 1000 },
  });
  const setup = cycle.adapter.reader.beginCycle();
  assert.deepEqual(
    setup.candidates.map((candidate) => candidate.key),
    ["city-farm", "arpalhc", "city-mine"],
    "a project is ordered by its weighting, not by which family sampled first",
  );
  assert.equal(runBuildAutomation(cycle.adapter).status, "succeeded");
  assert.deepEqual(cycle.bought, ["city-farm", "arpalhc", "city-mine"]);
  assert.equal(cycle.holdings.Money, 700);
}

// A tie keeps the family order the caller gave, matching the game's own building-then-project list.
{
  const cycle = makeCycle({
    city: [{ key: "city-farm", weighting: 50, cost: { Money: 1 } }],
    arpa: [{ key: "arpalhc", weighting: 50, cost: { Money: 1 } }],
    holdings: { Money: 10 },
  });
  assert.deepEqual(
    cycle.adapter.reader
      .beginCycle()
      .candidates.map((candidate) => candidate.key),
    ["city-farm", "arpalhc"],
  );
}

// --- families compete for the same resource ------------------------------------------------------

{
  // The whole point of one cycle: the cheap building yields to the expensive project it cannot
  // outrank, instead of spending money the project is closer to affording.
  const cycle = makeCycle({
    city: [{ key: "city-farm", weighting: 10, cost: { Money: 200 } }],
    arpa: [{ key: "arpalhc", weighting: 90, cost: { Money: 1000 } }],
    holdings: { Money: 300 },
  });
  assert.equal(runBuildAutomation(cycle.adapter).status, "succeeded");
  assert.deepEqual(cycle.bought, []);
  assert.equal(cycle.holdings.Money, 300);
}

{
  // With enough for both, the project is bought first and the building is then measured against
  // the holdings that purchase actually left, rather than against a snapshot taken before it.
  const cycle = makeCycle({
    city: [{ key: "city-farm", weighting: 10, cost: { Money: 200 } }],
    arpa: [{ key: "arpalhc", weighting: 90, cost: { Money: 1000 } }],
    holdings: { Money: 3000 },
  });
  assert.equal(runBuildAutomation(cycle.adapter).status, "succeeded");
  assert.deepEqual(cycle.bought, ["arpalhc", "city-farm"]);
  assert.equal(cycle.holdings.Money, 1800);
}

// --- the shared conflict gate covers both families -----------------------------------------------

{
  const conflict = {
    status: "conflict",
    conflict: {
      targetNames: ["Queued Farm"],
      resourceNames: ["Money"],
      targetCause: "Queue",
    },
  };
  const reserved = makeCycle({
    city: [{ key: "city-farm", weighting: 90, cost: { Money: 10 } }],
    arpa: [{ key: "arpalhc", weighting: 50, cost: { Money: 10 } }],
    holdings: { Money: 1000 },
    conflict,
  });
  assert.equal(runBuildAutomation(reserved.adapter).status, "succeeded");
  assert.deepEqual(reserved.bought, [], "neither family spends what is saved");

  const ignoring = makeCycle({
    city: [{ key: "city-farm", weighting: 90, cost: { Money: 10 } }],
    arpa: [{ key: "arpalhc", weighting: 50, cost: { Money: 10 } }],
    holdings: { Money: 1000 },
    conflict,
    respectReservations: false,
  });
  assert.equal(runBuildAutomation(ignoring.adapter).status, "succeeded");
  assert.deepEqual(ignoring.bought, ["city-farm", "arpalhc"]);
}

{
  // A commitment that could not be priced stops the cycle spending rather than proceeding as
  // though nothing were reserved.
  const cycle = makeCycle({
    city: [{ key: "city-farm", weighting: 90, cost: { Money: 10 } }],
    arpa: [{ key: "arpalhc", weighting: 50, cost: { Money: 10 } }],
    holdings: { Money: 1000 },
    conflict: { status: "unavailable" },
  });
  assert.equal(runBuildAutomation(cycle.adapter).status, "succeeded");
  assert.deepEqual(cycle.bought, []);
}

// --- two families may not claim the same candidate -----------------------------------------------

{
  const cycle = makeCycle({
    city: [{ key: "shared", weighting: 1, cost: { Money: 1 } }],
    arpa: [{ key: "shared", weighting: 1, cost: { Money: 1 } }],
    holdings: { Money: 10 },
  });
  assert.throws(
    () => cycle.adapter.reader.beginCycle(),
    /arpa and city both offer construction candidate shared/,
  );
}

// --- execution is routed back to the family that offered the candidate ---------------------------

{
  const cycle = makeCycle({
    city: [{ key: "city-farm", weighting: 90, cost: { Money: 1 } }],
    arpa: [{ key: "arpalhc", weighting: 50, cost: { Money: 1 } }],
    holdings: { Money: 10 },
  });
  cycle.adapter.reader.beginCycle();
  assert.equal(
    cycle.adapter.executor.executeClick({ index: 1, key: "arpalhc" }).outcome
      .status,
    "succeeded",
  );
  assert.deepEqual(cycle.bought, ["arpalhc"]);

  // A decision whose index no longer names its key is refused, never executed against whatever
  // now sits at that index.
  const stale = cycle.adapter.executor.executeClick({
    index: 1,
    key: "city-farm",
  });
  assert.equal(stale.outcome.status, "stale");
  assert.equal(stale.outcome.failure.code, "stale-construction-target");
  assert.equal(
    cycle.adapter.executor.annotate({
      kind: "text",
      index: 1,
      key: "city-farm",
      text: "note",
    }).failure.code,
    "stale-construction-target",
  );
  assert.deepEqual(cycle.bought, ["arpalhc"]);
}

// The cycle reports what it turned out to be saving for: the highest-weighted candidate it wanted,
// could eventually store, and could not afford. It becomes readable once that cycle has finished.
{
  const cycle = makeCycle({
    city: [
      { key: "city-bank", weighting: 30, cost: { Money: 5000 } },
      { key: "city-farm", weighting: 20, cost: { Money: 50 } },
    ],
    holdings: { Money: 100 },
  });
  assert.equal(cycle.adapter.savingTarget.readSavingTarget(), null);
  runCycle(cycle);
  // The cheaper candidate was still bought; saving for a target does not stop the cycle here.
  assert.deepEqual(cycle.bought, ["city-farm"]);
  // The judgement belongs to the finished cycle, so the next one publishes it.
  assert.equal(cycle.adapter.savingTarget.readSavingTarget(), null);
  runCycle(cycle);
  assert.deepEqual(cycle.adapter.savingTarget.readSavingTarget(), {
    name: "city-bank",
    cost: { Money: 5000 },
  });
}

// A cost storage can never hold is not something to save for.
{
  const cycle = makeCycle({
    city: [{ key: "city-bank", weighting: 30, cost: { Money: 250000 } }],
    holdings: { Money: 100 },
  });
  runCycle(cycle);
  runCycle(cycle);
  assert.equal(cycle.adapter.savingTarget.readSavingTarget(), null);
}

// Everything affordable is nothing to save for.
{
  const cycle = makeCycle({
    city: [{ key: "city-farm", weighting: 20, cost: { Money: 50 } }],
    holdings: { Money: 100000 },
  });
  runCycle(cycle);
  runCycle(cycle);
  assert.equal(cycle.adapter.savingTarget.readSavingTarget(), null);
}

console.log("captured construction ok");
