import assert from "node:assert/strict";
import { createWeightingSnapshotReader } from "../src/adapters/evolve/progression/build/weighting-snapshot.ts";

const validState = () => ({
  queuedTargets: [],
  triggerTargets: [],
  knowledgeRequiredByTechs: 0,
  knowledgeRequiredByBuildTargets: 0,
  cheapestTechKnowledge: 0,
});

let state = validState();
const read = createWeightingSnapshotReader({ getState: () => state });

// The uninitialized state the runtime installs before the first cycle reads as
// a valid empty snapshot.
const empty = read();
assert.equal(Object.isFrozen(empty), true);
assert.equal(empty.queuedTargets.size, 0);
assert.equal(empty.triggerTargets.size, 0);
assert.equal(empty.knowledgeRequiredByTechs, 0);
assert.equal(empty.knowledgeRequiredByBuildTargets, 0);
assert.equal(empty.cheapestTechKnowledge, 0);

// Membership is by wrapper identity, not by name or index.
const queued = { _vueBinding: "city-bank" };
const triggered = { _vueBinding: "city-temple" };
state = {
  ...validState(),
  queuedTargets: [queued],
  triggerTargets: [triggered],
  knowledgeRequiredByTechs: 1_500,
  knowledgeRequiredByBuildTargets: 900,
  cheapestTechKnowledge: 250,
};
const sample = read();
assert.equal(sample.queuedTargets.has(queued), true);
assert.equal(sample.queuedTargets.has(triggered), false);
assert.equal(sample.triggerTargets.has(triggered), true);
assert.equal(sample.knowledgeRequiredByTechs, 1_500);
assert.equal(sample.knowledgeRequiredByBuildTargets, 900);
assert.equal(sample.cheapestTechKnowledge, 250);

// Later target-list mutation cannot reach an already-sampled snapshot.
state.queuedTargets.push(triggered);
assert.equal(sample.queuedTargets.has(triggered), false);
assert.equal(read().queuedTargets.has(triggered), true);

const rejects = (mutate, message) => {
  state = validState();
  mutate(state);
  assert.throws(read, { name: "TypeError", message });
};
rejects((s) => delete s.queuedTargets, "state.queuedTargets must be an array");
rejects(
  (s) => (s.triggerTargets = { 0: queued }),
  "state.triggerTargets must be an array",
);
rejects(
  (s) => (s.knowledgeRequiredByTechs = undefined),
  "state.knowledgeRequiredByTechs must be a finite number",
);
rejects(
  (s) => (s.knowledgeRequiredByBuildTargets = Number.NaN),
  "state.knowledgeRequiredByBuildTargets must be a finite number",
);
rejects(
  (s) => (s.cheapestTechKnowledge = "250"),
  "state.cheapestTechKnowledge must be a finite number",
);

assert.throws(createWeightingSnapshotReader({ getState: () => null }), {
  name: "TypeError",
  message: "state must be an object",
});

console.log("Building weighting snapshot adapter tests passed");
