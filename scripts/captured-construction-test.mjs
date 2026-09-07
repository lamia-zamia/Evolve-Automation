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
        consumption: [],
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
} = {}) {
  const bought = [];
  const adapter = createCapturedConstructionAdapter({
    sources: [
      makeSource("city", () => city, holdings, bought),
      makeSource("arpa", () => arpa, holdings, bought),
    ],
    resources: makeResources(holdings),
    conflicts: { evaluate: () => conflict },
    readOptions: () => ({
      consumptionMode: "unlimited",
      buildIfStorageFull: false,
      ignoreZeroRate: false,
      respectReservations,
      saveWhiteholeGems: false,
    }),
  });
  return { adapter, bought, holdings };
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

console.log("captured construction ok");
