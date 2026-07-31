import assert from "node:assert/strict";
import {
  createBuildingWeightingDecider,
  decideBuildingWeighting,
  selectActiveWeightingRules,
} from "../src/domain/progression/build/building-weighting-decision.ts";

const rule = (id, overrides) =>
  Object.freeze({
    id,
    enabled: () => true,
    match: () => true,
    describe: () => id,
    multiplier: () => 2,
    ...overrides,
  });

const candidate = (overrides) =>
  Object.freeze({ id: "Barracks", baseWeight: 100, count: 0, ...overrides });

const snapshot = Object.freeze({ marker: "phase" });

// ---------- Selecting the rules worth applying ----------
const asked = [];
const selected = selectActiveWeightingRules(
  [
    rule("disabled", {
      enabled: (given) => {
        asked.push(given);
        return false;
      },
      // A disabled rule is never asked for its multiplier, so this would throw.
      multiplier: () => {
        throw new Error("a disabled rule was asked for its multiplier");
      },
    }),
    rule("neutral", { multiplier: () => 1 }),
    rule("active"),
  ],
  snapshot,
);
assert.deepEqual(
  selected.map((selectedRule) => selectedRule.id),
  ["active"],
);
assert.deepEqual(asked, [snapshot], "selection reads only the phase snapshot");

// ---------- Applying them to one candidate ----------
const doubled = decideBuildingWeighting(
  [rule("first"), rule("second", { multiplier: () => 3 })],
  candidate(),
  snapshot,
);
assert.equal(doubled.weight, 600); // 100 * 2 * 3
assert.deepEqual(doubled.annotations, [
  { ruleId: "first", note: "first" },
  { ruleId: "second", note: "second" },
]);
assert.equal(Object.isFrozen(doubled), true);
assert.equal(Object.isFrozen(doubled.annotations), true);

// A rule that does not match neither annotates nor multiplies, and a matching
// rule with an empty note multiplies without annotating.
const partial = decideBuildingWeighting(
  [
    rule("missed", { match: () => undefined }),
    rule("silent", { describe: () => "" }),
  ],
  candidate(),
  snapshot,
);
assert.equal(partial.weight, 200);
assert.deepEqual(partial.annotations, []);

// The payload a rule returns from `match` reaches its own `describe` and
// `multiplier`, and nothing else.
const payloads = [];
const withPayload = decideBuildingWeighting(
  [
    rule("payload", {
      match: () => ({ scale: 4 }),
      describe: (match) => `scaled ${match.scale}`,
      multiplier: (_given, match) => {
        payloads.push(match);
        return match.scale;
      },
    }),
  ],
  candidate(),
  snapshot,
);
assert.equal(withPayload.weight, 400);
assert.deepEqual(withPayload.annotations, [
  { ruleId: "payload", note: "scaled 4" },
]);
assert.deepEqual(payloads, [{ scale: 4 }]);

// ---------- Order and the early stop ----------
const ran = [];
const trace = (id, overrides) =>
  rule(id, {
    match: () => {
      ran.push(id);
      return true;
    },
    ...overrides,
  });
const zeroed = decideBuildingWeighting(
  [trace("before"), trace("zero", { multiplier: () => 0 }), trace("after")],
  candidate(),
  snapshot,
);
assert.equal(zeroed.weight, 0);
assert.deepEqual(ran, ["before", "zero"], "no rule runs after the weight is 0");
assert.deepEqual(
  zeroed.annotations.map((annotation) => annotation.ruleId),
  ["before", "zero"],
);

// A negative multiplier stops the rest just as zero does.
ran.length = 0;
assert.equal(
  decideBuildingWeighting(
    [trace("negative", { multiplier: () => -1 }), trace("after")],
    candidate(),
    snapshot,
  ).weight,
  -100,
);
assert.deepEqual(ran, ["negative"]);

// A candidate whose configured weight is already zero still collects the first
// matching rule's note before stopping.
const startsAtZero = decideBuildingWeighting(
  [rule("first"), rule("second")],
  candidate({ baseWeight: 0 }),
  snapshot,
);
assert.equal(startsAtZero.weight, 0);
assert.deepEqual(
  startsAtZero.annotations.map((annotation) => annotation.ruleId),
  ["first"],
);

// With no active rules the candidate keeps its configured weight.
assert.deepEqual(decideBuildingWeighting([], candidate(), snapshot), {
  weight: 100,
  annotations: [],
});

// ---------- The built-copies tie-break ----------
assert.equal(
  decideBuildingWeighting([], candidate({ count: 3 }), snapshot).weight,
  100 - 3e-7,
  "built copies nudge an equal weight down",
);
assert.equal(
  decideBuildingWeighting(
    [],
    candidate({ baseWeight: 1e-9, count: 1000 }),
    snapshot,
  ).weight,
  Number.MIN_VALUE,
  "the tie-break never turns a wanted candidate into an unwanted one",
);
assert.equal(
  decideBuildingWeighting(
    [rule("zero", { multiplier: () => 0 })],
    candidate({ count: 3 }),
    snapshot,
  ).weight,
  0,
  "a ruled-out candidate is not nudged back above zero",
);

// ---------- The inputs are read, never written ----------
const frozenCandidate = candidate({ count: 2 });
decideBuildingWeighting([rule("first")], frozenCandidate, snapshot);
assert.deepEqual(frozenCandidate, {
  id: "Barracks",
  baseWeight: 100,
  count: 2,
});
assert.deepEqual(snapshot, { marker: "phase" });

// ---------- The decider port ----------
const enabledFor = [];
const decider = createBuildingWeightingDecider({
  weightingRules: [
    rule("phase", {
      enabled: (given) => {
        enabledFor.push(given);
        return true;
      },
    }),
  ],
});
const firstPhase = decider.beginPhase(snapshot);
assert.deepEqual(firstPhase.decide(candidate()), {
  weight: 200,
  annotations: [{ ruleId: "phase", note: "phase" }],
});
firstPhase.decide(candidate({ id: "Mine" }));
assert.deepEqual(
  enabledFor,
  [snapshot],
  "rules are selected once per phase, not once per candidate",
);
// A phase decides against the snapshot it began with, so a later phase cannot
// change what an earlier one is still deciding.
const otherSnapshot = Object.freeze({ marker: "later phase" });
decider.beginPhase(otherSnapshot);
assert.deepEqual(enabledFor, [snapshot, otherSnapshot]);

console.log("Building weighting decision policy tests passed");
