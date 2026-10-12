import assert from "node:assert/strict";

import {
  compareGoalStrategies,
  evaluateGoalFeasibility,
} from "../../../src/domain/economy/goal-feasibility.ts";

const need = (resourceId, amount, poolId = "anywhere") => ({
  resourceId,
  poolId,
  amount,
});

const stock = (
  resourceId,
  amount,
  netRate,
  capacity = -1,
  poolId = "anywhere",
  rateConfidence = "stable",
  validityEpoch = "epoch:1",
) => ({
  resourceId,
  poolId,
  amount,
  capacity,
  netRate,
  rateConfidence,
  validityEpoch,
});

const candidate = (id, options = {}) => ({
  id,
  goalId: "goal:target",
  preconditions: { satisfied: true, reasons: [] },
  acquisitionCosts: [],
  productionChanges: [],
  unavailableReasons: [],
  ...options,
});

const compare = (requirements, stocks, candidates = [], commitments = []) =>
  compareGoalStrategies(
    "goal:target",
    requirements,
    stocks,
    commitments,
    candidates,
    "epoch:1",
  );

{
  const result = compare(
    [need("Knowledge", 10)],
    [stock("Knowledge", 0, 1)],
    [
      candidate("investment", {
        acquisitionCosts: [need("Knowledge", 4)],
        productionChanges: [
          { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 0.5 },
        ],
      }),
    ],
  );
  assert.equal(result.winner, "wait");
}

{
  const result = compare(
    [need("Knowledge", 10)],
    [stock("Knowledge", 0, 1)],
    [
      candidate("library", {
        acquisitionCosts: [need("Knowledge", 2)],
        productionChanges: [
          { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 2 },
        ],
      }),
    ],
  );
  assert.equal(result.winner, "library");
  assert.equal(result.strategies[1].acquisitionTime, 2);
}

{
  const duplicateNeeds = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 3), need("Knowledge", 7)],
    [stock("Knowledge", 5, 5)],
    [],
    "epoch:1",
  );
  assert.equal(duplicateNeeds.unmetRequirements.length, 1);
  assert.equal(duplicateNeeds.unmetRequirements[0].amount, 10);
  assert.equal(duplicateNeeds.unmetRequirements[0].shortfall, 5);
  assert.equal(duplicateNeeds.estimatedTime, 1);

  const duplicateCosts = compare(
    [need("Knowledge", 10)],
    [stock("Knowledge", 0, 1)],
    [
      candidate("duplicate-cost", {
        acquisitionCosts: [need("Knowledge", 1), need("Knowledge", 1)],
        productionChanges: [
          { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 2 },
        ],
      }),
    ],
  );
  assert.equal(duplicateCosts.strategies[1].acquisitionTime, 2);
  assert.ok(
    Math.abs(duplicateCosts.strategies[1].completionTime - 16 / 3) < 1e-9,
  );
}

{
  const result = compare(
    [need("Knowledge", 10), need("Food", 4)],
    [stock("Knowledge", 0, 1), stock("Food", 0, 5)],
    [
      candidate("scientists", {
        productionChanges: [
          { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 4 },
          { resourceId: "Food", poolId: "anywhere", netRateDelta: -3 },
        ],
      }),
    ],
  );
  assert.equal(result.winner, "scientists");
  assert.deepEqual(
    result.strategies[1].opportunityCosts.map((entry) => entry.resourceId),
    ["Food"],
  );

  const capacityCost = compare(
    [need("Knowledge", 10)],
    [stock("Knowledge", 0, 2, 20)],
    [
      candidate("capacity-cost", {
        productionChanges: [
          {
            resourceId: "Knowledge",
            poolId: "anywhere",
            netRateDelta: 0,
            capacityDelta: -5,
          },
        ],
      }),
    ],
  );
  assert.deepEqual(
    capacityCost.strategies[1].opportunityCosts.map(
      (entry) => entry.capacityDelta,
    ),
    [-5],
  );
}

{
  const result = compare(
    [need("Knowledge", 10)],
    [stock("Knowledge", 0, 1), stock("Money", 0, 1)],
    [
      candidate("late-producer", {
        acquisitionCosts: [need("Money", 20)],
        productionChanges: [
          { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 9 },
        ],
      }),
    ],
  );
  assert.equal(result.winner, "wait");
  assert.ok(result.strategies[1].completionTime > 10);
}

{
  const result = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 10), need("Oil", 9)],
    [stock("Knowledge", 0, 2), stock("Oil", 1, 1)],
    [],
    "epoch:1",
  );
  assert.equal(result.estimatedTime, 8);
}

{
  const result = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 10)],
    [stock("Knowledge", 3, 4, 8)],
    [],
    "epoch:1",
  );
  assert.equal(result.status, "infeasible");
  assert.equal(result.estimatedTime, undefined);
  assert.ok(result.limitingConstraints[0].includes("capacity"));

  const heldAboveRequirement = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 10)],
    [stock("Knowledge", 12, 0, 8)],
    [],
    "epoch:1",
  );
  assert.equal(heldAboveRequirement.status, "feasible");
  assert.equal(heldAboveRequirement.unmetRequirements[0].shortfall, 0);
}

{
  for (const netRate of [0, -2]) {
    const result = evaluateGoalFeasibility(
      "goal:target",
      [need("Knowledge", 10)],
      [stock("Knowledge", 3, netRate)],
      [],
      "epoch:1",
    );
    assert.equal(result.status, "infeasible");
    assert.equal(result.estimatedTime, undefined);
  }

  const unstable = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 10)],
    [stock("Knowledge", 3, -2, -1, "anywhere", "observed")],
    [],
    "epoch:1",
  );
  assert.equal(unstable.status, "uncertain");
  assert.equal(unstable.estimatedTime, undefined);
  assert.ok(unstable.reasons[0].includes("single-sample"));
}

{
  const separatePools = evaluateGoalFeasibility(
    "goal:target",
    [need("Alloy", 12, "city"), need("Alloy", 8, "space")],
    [stock("Alloy", 2, 2, -1, "city"), stock("Alloy", 0, 1, 0, "space")],
    [],
    "epoch:1",
  );
  assert.equal(separatePools.status, "infeasible");
  assert.ok(
    separatePools.limitingConstraints[0].includes(
      "capacity 0 is below required 8",
    ),
  );
}

{
  const result = compare(
    [need("Knowledge", 10), need("Oil", 20)],
    [stock("Knowledge", 0, 1), stock("Oil", 0, 1)],
    [
      candidate("knowledge-only", {
        productionChanges: [
          { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 100 },
        ],
      }),
    ],
  );
  assert.equal(result.winner, "wait");
  assert.equal(result.strategies[1].completionTime, 20);
}

{
  const result = compare(
    [need("Knowledge", 10)],
    [stock("Knowledge", 0, 1)],
    [candidate("unknown-marginal", { productionChanges: undefined })],
  );
  assert.deepEqual(result.rankedStrategyIds, ["wait"]);
  assert.equal(result.winner, undefined);
  assert.equal(result.strategies[1].status, "unavailable");
  assert.ok(
    result.strategies[1].unavailableReasons.includes(
      "marginal production effect is not established",
    ),
  );
}

{
  const result = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 3)],
    [stock("Knowledge", 2, 1)],
    [],
    "epoch:1",
  );
  assert.equal(result.unmetRequirements[0].availableStock, 2);
  assert.equal(result.unmetRequirements[0].shortfall, 1);
  assert.equal(result.estimatedTime, 1);
  assert.equal(result.unmetRequirements[0].status, "feasible");
}

{
  const result = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 3)],
    [stock("Knowledge", 2, 1, -1, "anywhere", "stable", "epoch:0")],
    [],
    "epoch:1",
  );
  assert.equal(result.status, "unavailable");
  assert.equal(result.estimatedTime, undefined);
  assert.ok(result.reasons[0].includes("stale"));
}

{
  const tied = compare(
    [need("Knowledge", 10)],
    [stock("Knowledge", 0, 1)],
    [candidate("zeta"), candidate("alpha")],
  );
  assert.deepEqual(tied.rankedStrategyIds, ["wait", "alpha", "zeta"]);
  assert.equal(tied.winner, "wait");
}

{
  const parallelWithCommitment = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 10), need("Oil", 10)],
    [stock("Knowledge", 8, 2), stock("Oil", 0, 1)],
    [{ resourceId: "Knowledge", poolId: "anywhere", amount: 3 }],
    "epoch:1",
  );
  assert.equal(parallelWithCommitment.unmetRequirements[0].availableStock, 5);
  assert.equal(parallelWithCommitment.estimatedTime, 10);
}

{
  const overcommitted = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 5)],
    [stock("Knowledge", 0, 1)],
    [{ resourceId: "Knowledge", poolId: "anywhere", amount: 5 }],
    "epoch:1",
  );
  assert.equal(overcommitted.status, "unavailable");
  assert.equal(overcommitted.estimatedTime, undefined);
  assert.ok(overcommitted.reasons[0].includes("exceed observed stock"));

  const commitmentCapacity = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", 8)],
    [stock("Knowledge", 4, 1, 10)],
    [{ resourceId: "Knowledge", poolId: "anywhere", amount: 3 }],
    "epoch:1",
  );
  assert.equal(commitmentCapacity.status, "infeasible");
  assert.ok(commitmentCapacity.limitingConstraints[0].includes("required 11"));
}

{
  const invalidDuplicates = evaluateGoalFeasibility(
    "goal:target",
    [need("Knowledge", -1), need("Knowledge", 2)],
    [stock("Knowledge", 0, 1)],
    [],
    "epoch:1",
  );
  assert.equal(invalidDuplicates.status, "unavailable");
  assert.ok(invalidDuplicates.reasons[0].includes("invalid quantity"));
}
