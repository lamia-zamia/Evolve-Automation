import assert from "node:assert/strict";
import { readCapturedJobStrategyPair } from "../../../src/adapters/evolve/civic/captured-job-strategy.ts";

const resource = (resourceId, before, after, capacity = 1_000_000) => ({
  resourceId,
  poolId: "anywhere",
  amountBefore: before,
  amountAfter: after,
  capacityBefore: capacity,
  capacityAfter: capacity,
});

const cell = ({ jobsBefore, jobsAfter = jobsBefore, resources }) => ({
  initialStateKey: "frozen-save:settings:seed",
  validityEpoch: "root:4|control:6|production:9",
  rootStable: true,
  controlStable: true,
  productionWindow: 1,
  jobsBefore,
  jobsAfter,
  resources,
});

const pair = (changes = {}) => ({
  id: "scientist-from-quarry",
  goalId: "tech-mad",
  targetJob: "scientist",
  sourceJob: "quarry_worker",
  targetPermitted: true,
  targetControlBound: true,
  targetAvailable: true,
  baseline: cell({
    jobsBefore: { scientist: 3, quarry_worker: 59 },
    resources: [
      resource("Knowledge", 20_000, 21_400),
      resource("Stone", 100_000, 107_700),
    ],
  }),
  intervention: cell({
    jobsBefore: { scientist: 3, quarry_worker: 59 },
    jobsAfter: { scientist: 4, quarry_worker: 58 },
    resources: [
      resource("Knowledge", 20_000, 21_459),
      resource("Stone", 100_000, 107_568),
    ],
  }),
  ...changes,
});

{
  const observed = readCapturedJobStrategyPair(pair());
  assert.deepEqual(observed.unavailableReasons, []);
  assert.equal(observed.candidate.preconditions.satisfied, true);
  assert.equal(observed.candidate.effectsComplete, false);
  assert.equal(observed.candidate.effectAuthority, "provisional");
  assert.deepEqual(observed.candidate.productionChanges, [
    {
      resourceId: "Knowledge",
      poolId: "anywhere",
      netRateDelta: 59,
    },
    {
      resourceId: "Stone",
      poolId: "anywhere",
      netRateDelta: -132,
    },
  ]);
  assert.equal(observed.stocks[0].amount, 20_000);
  assert.equal(observed.stocks[0].netRate, 1_400);
}

{
  const stale = readCapturedJobStrategyPair(
    pair({
      intervention: cell({
        jobsBefore: { scientist: 3, quarry_worker: 59 },
        jobsAfter: { scientist: 4, quarry_worker: 58 },
        resources: [resource("Knowledge", 20_000, 21_459)],
      }),
    }),
  );
  assert.equal(stale.candidate.productionChanges, undefined);
  assert.ok(
    stale.unavailableReasons.includes(
      "paired intervention omitted Stone stock",
    ),
  );
}

{
  const mismatchedStart = readCapturedJobStrategyPair(
    pair({
      intervention: cell({
        jobsBefore: { scientist: 3, quarry_worker: 59 },
        jobsAfter: { scientist: 4, quarry_worker: 58 },
        resources: [
          resource("Knowledge", 20_001, 21_460),
          resource("Stone", 100_000, 107_568),
        ],
      }),
    }),
  );
  assert.equal(mismatchedStart.candidate.productionChanges, undefined);
  assert.ok(
    mismatchedStart.unavailableReasons.includes(
      "paired Knowledge observations do not share the same starting stock and capacity",
    ),
  );

  const mismatchedCapacity = readCapturedJobStrategyPair(
    pair({
      intervention: cell({
        jobsBefore: { scientist: 3, quarry_worker: 59 },
        jobsAfter: { scientist: 4, quarry_worker: 58 },
        resources: [
          resource("Knowledge", 20_000, 21_459, 900_000),
          resource("Stone", 100_000, 107_568),
        ],
      }),
    }),
  );
  assert.equal(mismatchedCapacity.candidate.productionChanges, undefined);
  assert.ok(
    mismatchedCapacity.unavailableReasons.includes(
      "paired Knowledge observations do not share the same starting stock and capacity",
    ),
  );
}

{
  const unavailable = readCapturedJobStrategyPair(
    pair({ targetPermitted: false }),
  );
  assert.equal(unavailable.candidate.preconditions.satisfied, false);
  assert.ok(
    unavailable.unavailableReasons.includes(
      "target job permission is unavailable",
    ),
  );
}

{
  for (const changes of [
    { targetControlBound: false },
    { targetAvailable: false },
    {
      baseline: {
        ...pair().baseline,
        rootStable: false,
      },
    },
    {
      intervention: {
        ...pair().intervention,
        controlStable: false,
      },
    },
    {
      intervention: {
        ...pair().intervention,
        validityEpoch: "root:4|control:7|production:9",
      },
    },
    {
      intervention: {
        ...pair().intervention,
        productionWindow: 2,
      },
    },
  ]) {
    const rejected = readCapturedJobStrategyPair(pair(changes));
    assert.equal(rejected.candidate.preconditions.satisfied, false);
    assert.ok(rejected.unavailableReasons.length > 0);
  }
}

{
  const mismatched = readCapturedJobStrategyPair(
    pair({
      intervention: {
        ...cell({
          jobsBefore: { scientist: 3, quarry_worker: 59 },
          jobsAfter: { scientist: 4, quarry_worker: 58 },
          resources: [
            resource("Knowledge", 20_000, 21_459),
            resource("Stone", 100_000, 107_568),
          ],
        }),
        initialStateKey: "different-save",
      },
    }),
  );
  assert.equal(mismatched.candidate.preconditions.satisfied, false);
  assert.ok(
    mismatched.unavailableReasons.includes(
      "paired job captures do not share an identical initial state",
    ),
  );
}
