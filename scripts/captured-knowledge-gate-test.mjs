import assert from "node:assert/strict";

import { createCapturedKnowledgeGateReader } from "../src/adapters/evolve/progression/build/captured-knowledge-gate.ts";
import { isKnowledgeGated } from "../src/domain/progression/build/building-weighting.ts";

const root = {
  resource: {
    Knowledge: { amount: 900, max: 1000 },
    Money: { amount: 5000, max: 100000 },
    Steel: { amount: 10, max: 1000 },
  },
};

const resources = {
  readResources(ids) {
    return {
      resources: new Map(
        [...ids].map((id) => {
          const held = root.resource[id];
          return [
            id,
            held === undefined
              ? {
                  unlocked: false,
                  amount: 0,
                  max: 0,
                  rateOfChange: 0,
                  storageRatio: 0,
                }
              : {
                  unlocked: true,
                  amount: held.amount,
                  max: held.max,
                  rateOfChange: 0,
                  storageRatio: held.max > 0 ? held.amount / held.max : 0,
                },
          ];
        }),
      ),
    };
  },
};

function gateFor(offered) {
  return createCapturedKnowledgeGateReader({
    rootState: { readRoot: () => root },
    resources,
    readLastOfferedTechs: () => offered,
  })();
}

// The cheapest technology that only Knowledge capacity blocks closes the gate.
{
  const gate = gateFor([
    { elementId: "tech-a", cost: { Knowledge: 1500 }, generation: 1 },
    { elementId: "tech-b", cost: { Knowledge: 4000 }, generation: 1 },
  ]);
  assert.deepEqual(gate, {
    cheapestTechKnowledge: 1500,
    knowledgeRequiredByBuildTargets: 0,
    knowledgeCapacity: 1000,
  });
  assert.equal(isKnowledgeGated(gate), true);
}

// A technology capacity already covers leaves the gate open.
{
  const gate = gateFor([
    { elementId: "tech-a", cost: { Knowledge: 800 }, generation: 1 },
  ]);
  assert.equal(gate.cheapestTechKnowledge, 800);
  assert.equal(isKnowledgeGated(gate), false);
}

// A technology still short of a material cost is not waiting on Knowledge, so it does not decide
// how much capacity research needs.
{
  const gate = gateFor([
    {
      elementId: "tech-cheap",
      cost: { Knowledge: 1200, Steel: 900 },
      generation: 1,
    },
    { elementId: "tech-dear", cost: { Knowledge: 5000 }, generation: 1 },
  ]);
  assert.equal(gate.cheapestTechKnowledge, 5000);
  assert.equal(isKnowledgeGated(gate), true);
}

// No catalog has been read: the gate stays open rather than buying a discovery pass.
{
  const gate = gateFor(undefined);
  assert.deepEqual(gate, {
    cheapestTechKnowledge: 0,
    knowledgeRequiredByBuildTargets: 0,
    knowledgeCapacity: 0,
  });
  assert.equal(isKnowledgeGated(gate), false);
}

// An empty catalog is an answer, not an absence: nothing is offered, so nothing is capacity-blocked.
{
  const gate = gateFor([]);
  assert.equal(gate.knowledgeCapacity, 1000);
  assert.equal(isKnowledgeGated(gate), false);
}

// Knowledge the game has not created yet is not a ceiling to compare against.
{
  const saved = root.resource.Knowledge;
  root.resource.Knowledge = { amount: 0, max: 0 };
  const gate = gateFor([
    { elementId: "tech-a", cost: { Knowledge: 1500 }, generation: 1 },
  ]);
  root.resource.Knowledge = saved;
  assert.equal(isKnowledgeGated(gate), false);
}

console.log("Captured knowledge-gate reader tests passed");
