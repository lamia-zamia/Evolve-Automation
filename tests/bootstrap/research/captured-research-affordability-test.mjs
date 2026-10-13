import assert from "node:assert/strict";

import { planResearch } from "../../../src/domain/progression/research/research.ts";
import { createCapturedResearchAdapter } from "../../../src/adapters/evolve/progression/research/captured-research.ts";

function decide({ nativeAffordable, knowledge, cost }) {
  const root = { tech: {} };
  const invocations = [];
  const adapter = createCapturedResearchAdapter({
    rootState: { readRoot: () => root },
    offered: [
      {
        elementId: "tech-test",
        grantTechnology: "test",
        grantLevel: 1,
        generation: 1,
        nativeAffordable,
        cost,
      },
    ],
    resources: {
      readResources: (ids) => ({
        resources: new Map(
          [...ids].map((id) => [
            id,
            {
              present: true,
              unlocked: true,
              amount: id === "Knowledge" ? knowledge : 0,
              max: 1000,
              rateOfChange: 0,
              storageRatio: 0,
            },
          ]),
        ),
      }),
    },
    conflicts: { evaluate: () => ({ status: "none" }) },
    techConflicts: { evaluate: () => ({ status: "none" }) },
    controls: {
      resolve: () => ({
        elementId: "tech-test",
        generation: 1,
        methods: ["action"],
      }),
      invoke: () => {
        invocations.push("tech-test.action");
        root.tech.test = 1;
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => ["tech-test"],
      checkpoint: () => ({}),
      rejectChanges: () => {},
    },
  });
  const input = adapter.reader.read(0);
  const decision = planResearch(input);
  if (decision !== null) adapter.executor.execute(decision);
  return { input, decision, invocations };
}

// The current sample becomes affordable after Knowledge crosses the numeric price.
const knowledgeArrives = decide({
  nativeAffordable: true,
  knowledge: 10,
  cost: { Knowledge: 5 },
});
assert.equal(knowledgeArrives.input.techs[0]?.affordable, true);
assert.deepEqual(knowledgeArrives.decision, { index: 0, techId: "tech-test" });
assert.deepEqual(knowledgeArrives.invocations, ["tech-test.action"]);

// The reverse numeric transition is checked against current holdings, even if the native verdict lags.
const knowledgeFalls = decide({
  nativeAffordable: true,
  knowledge: 2,
  cost: { Knowledge: 5 },
});
assert.equal(knowledgeFalls.input.techs[0]?.affordable, false);
assert.equal(knowledgeFalls.decision, null);
assert.deepEqual(knowledgeFalls.invocations, []);

// A synthetic Bool gate is not represented in numeric price markup. The live native verdict must
// therefore remain authoritative when it changes independently of sufficient Knowledge.
const boolBlocks = decide({
  nativeAffordable: false,
  knowledge: 10,
  cost: { Knowledge: 5 },
});
assert.equal(boolBlocks.input.techs[0]?.affordable, false);
assert.equal(boolBlocks.decision, null);
assert.deepEqual(boolBlocks.invocations, []);
const boolOpens = decide({
  nativeAffordable: true,
  knowledge: 10,
  cost: { Knowledge: 5 },
});
assert.deepEqual(boolOpens.decision, { index: 0, techId: "tech-test" });
assert.deepEqual(boolOpens.invocations, ["tech-test.action"]);

console.log(
  "research freshness decisions and native action invocations passed",
);
