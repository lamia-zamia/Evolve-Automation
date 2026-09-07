import assert from "node:assert/strict";

import { createScriptKnowledgeGateReader } from "../src/adapters/evolve/script-build-gates.ts";

const rootState = {
  cheapestTechKnowledge: 900,
  knowledgeRequiredByBuildTargets: 1200,
};
const reader = createScriptKnowledgeGateReader({
  getState: () => rootState,
  resources: {
    readResources: (ids) => ({
      resources: new Map(
        [...ids].map((id) => [
          id,
          {
            unlocked: true,
            amount: 100,
            max: id === "Knowledge" ? 1000 : 500,
            rateOfChange: 0,
            storageRatio: 0.1,
          },
        ]),
      ),
    }),
  },
});

assert.deepEqual(reader(), {
  cheapestTechKnowledge: 900,
  knowledgeRequiredByBuildTargets: 1200,
  knowledgeCapacity: 1000,
});

const unavailable = createScriptKnowledgeGateReader({
  getState: () => ({}),
  resources: { readResources: () => undefined },
});
const unavailableGate = unavailable();
assert.ok(Number.isNaN(unavailableGate.cheapestTechKnowledge));
assert.ok(Number.isNaN(unavailableGate.knowledgeRequiredByBuildTargets));
assert.ok(Number.isNaN(unavailableGate.knowledgeCapacity));

console.log("script-build-gates ok");
