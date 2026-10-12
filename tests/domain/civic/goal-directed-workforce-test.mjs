import assert from "node:assert/strict";

import { canExecuteGoalDirectedWorkforceDecision } from "../../../src/domain/civic/goal-directed-workforce.ts";

const decision = {
  terminalGoalId: "campaign-goal",
  immediateGoalId: "resource-threshold",
  change: {
    sourceJobId: "available-pool",
    destinationJobId: "production-job",
    workers: 1,
  },
  marginalEffects: [
    { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 12 },
  ],
  opportunityCosts: [
    { resourceId: "Food", poolId: "anywhere", netRateDelta: -0.5 },
  ],
  preconditions: [
    { id: "worker-available", satisfied: true, reason: undefined },
  ],
  restrictions: [{ id: "player-permission", active: false, reason: "" }],
  observationGeneration: 7,
  controlGeneration: 11,
  confidence: "validated",
  unavailableReasons: [],
  provenance: { kind: "derived-goal", id: "selected-outcome" },
  productionExecutionAuthorized: true,
};

assert.equal(canExecuteGoalDirectedWorkforceDecision(decision), true);
assert.equal(
  canExecuteGoalDirectedWorkforceDecision({
    ...decision,
    confidence: "provisional",
  }),
  false,
  "a provisional comparison is not gameplay authority",
);
assert.equal(
  canExecuteGoalDirectedWorkforceDecision({
    ...decision,
    provenance: { kind: "test-intervention", id: "isolated-run" },
  }),
  false,
  "test intervention provenance is never production authority",
);
assert.equal(
  canExecuteGoalDirectedWorkforceDecision({
    ...decision,
    preconditions: [
      { id: "worker-available", satisfied: false, reason: "none" },
    ],
  }),
  false,
);
assert.equal(
  canExecuteGoalDirectedWorkforceDecision({
    ...decision,
    restrictions: [
      { id: "manual-ownership", active: true, reason: "player-owned" },
    ],
  }),
  false,
);
assert.equal(
  canExecuteGoalDirectedWorkforceDecision({
    ...decision,
    unavailableReasons: ["collateral effects incomplete"],
  }),
  false,
);
assert.equal(
  canExecuteGoalDirectedWorkforceDecision({
    ...decision,
    productionExecutionAuthorized: false,
  }),
  false,
);
assert.equal(
  canExecuteGoalDirectedWorkforceDecision({
    ...decision,
    marginalEffects: [],
  }),
  false,
);
assert.equal(
  canExecuteGoalDirectedWorkforceDecision({
    ...decision,
    preconditions: [],
  }),
  false,
);

console.log("goal-directed workforce contract tests passed");
