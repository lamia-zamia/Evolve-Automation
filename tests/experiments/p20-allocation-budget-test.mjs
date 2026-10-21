import assert from "node:assert/strict";
import {
  allocationClickBudget,
  allocationDenialReason,
} from "../../experiments/p20-allocation-budget.mjs";

const limits = {
  maxEpisodes: 3,
  maxEpisodeClicks: 80,
  maxTotalClicks: 140,
};

assert.equal(
  allocationClickBudget({
    episodeClicks: 0,
    totalClicks: 0,
    ...limits,
  }),
  5,
  "one work-cycle authorization can admit at most five Gather clicks",
);
assert.equal(
  allocationClickBudget({
    episodeClicks: 79,
    totalClicks: 139,
    ...limits,
  }),
  1,
  "the final click is bounded by both episode and total budgets",
);
assert.equal(
  allocationClickBudget({
    episodeClicks: 80,
    totalClicks: 80,
    ...limits,
  }),
  0,
  "an exhausted episode grants no more clicks",
);
assert.equal(
  allocationClickBudget({
    episodeClicks: 20,
    totalClicks: 140,
    ...limits,
  }),
  0,
  "an exhausted total click budget grants no more clicks",
);
assert.equal(
  allocationDenialReason({
    targetAlreadyAuthorized: true,
    episodeCount: 1,
    totalClicks: 20,
    ...limits,
  }),
  "same-target-already-authorized",
  "an unchanged target cannot reset its authorization after exhaustion",
);
assert.equal(
  allocationDenialReason({
    targetAlreadyAuthorized: false,
    episodeCount: 2,
    totalClicks: 140,
    ...limits,
  }),
  "episode-or-total-budget-exhausted",
  "total-budget exhaustion denies another target authorization",
);
assert.equal(
  allocationDenialReason({
    targetAlreadyAuthorized: false,
    episodeCount: 3,
    totalClicks: 20,
    ...limits,
  }),
  "episode-or-total-budget-exhausted",
  "episode-count exhaustion denies another target authorization",
);

console.log("P20 allocation budgets ok");
