import assert from "node:assert/strict";

import { runEvolution } from "../src/application/evolution.ts";
import { planEvolutionTarget } from "../src/domain/progression/evolution/evolution.ts";
import { createCapturedEvolution } from "../src/adapters/evolve/progression/evolution/captured-evolution.ts";

const root = {
  race: {
    species: "protoplasm",
    universe: "standard",
    seeded: true,
    chose: "Grassland42",
  },
  stats: { achieve: {} },
  resource: { RNA: { amount: 0, max: 0 }, DNA: { amount: 0, max: 0 } },
  evolution: {},
};

const settings = {
  autoEvolution: true,
  userEvolutionTarget: "human",
  userUniverseTargetName: "magic",
  evolutionQueue: [],
  evolutionQueueEnabled: false,
  evolutionQueueRepeat: false,
  imitateRace: "human",
};

const trace = [];
const actionRows = [
  { id: "evolution-rna", cost: { RNA: 1 } },
  { id: "evolution-plasmid", cost: { DNA: 99 } },
  { id: "evolution-bunker", cost: { DNA: 10 } },
  { id: "evolution-membrane", cost: { RNA: 2 } },
];

const handles = new Map();
for (const id of ["evolution-rna", "evolution-dna", "evolution-bunker"]) {
  handles.set(id, { elementId: id, generation: 1, methods: ["action"] });
}
const controls = {
  resolve: (id) => handles.get(id),
  invoke: (handle, method) => {
    assert.equal(method, "action");
    trace.push(["invoke", handle.elementId]);
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => [...handles.keys()],
};
const drawnActions = {
  read: (selector) => {
    assert.equal(selector, "#evolution > .action");
    return actionRows;
  },
  exists: () => true,
};
const universeControls = {
  selectUniverse: (name) => {
    trace.push(["universe", name]);
    root.race.universe = name;
    root.race.bigbang = false;
    return true;
  },
};

const evolution = createCapturedEvolution({
  rootState: {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls,
  drawnActions,
  readSettings: () => settings,
  readEvolutionAttempts: () => 2,
  loadQueuedSettings: () => trace.push(["queue"]),
  universeControls,
  challengeGroups: [{ members: [{ id: "plasmid", trait: "no_plasmid" }] }],
  onActivity: (activity) => trace.push(["activity", activity.message]),
});

// Universe selection uses the game-drawn control, then the root itself proves the landing gate.
root.race.universe = "bigbang";
root.race.bigbang = true;
evolution.runUniverseSelection();
assert.deepEqual(trace.shift(), ["universe", "magic"]);
assert.equal(evolution.reader.sampleLandingGate().universe, "magic");

// Explicit targets are supported without importing the module-lexical race catalog.
assert.deepEqual(
  evolution.reader.sampleTargetSelection().races.map((race) => race.id),
  ["human"],
);
assert.deepEqual(evolution.reader.sampleCosts("human"), {
  maxRna: 2,
  maxDna: 10,
  rnaCurrent: 0,
  rnaMax: 0,
  dnaCurrent: 0,
  dnaMax: 0,
});
assert.deepEqual(
  evolution.reader.sampleEvolutionTree("human").map((action) => action.id),
  ["bunker", "membrane"],
);

// The full application pass loads settings, commits the target, and invokes the captured action.
runEvolution({
  reader: evolution.reader,
  executor: evolution.executor,
  runUniverseSelection: evolution.runUniverseSelection,
  runPlanetSelection: () => {},
  challengeGroups: [],
});
assert.deepEqual(trace, [
  ["queue"],
  ["activity", "Attempting evolution of human."],
  ["invoke", "evolution-bunker"],
]);
assert.equal(evolution.reader.storedTargetId(), "human");

// DeadSpace's final menu exposes imitation rows only. The configured imitation must win even if
// another row appears first in the DOM.
settings.imitateRace = "human";
root.race.evoFinalMenu = "synth";
actionRows.unshift({ id: "evolution-s-other", cost: {} });
actionRows.push({ id: "evolution-s-human", cost: {} });
handles.set("evolution-s-human", {
  elementId: "evolution-s-human",
  generation: 1,
  methods: ["action"],
});
runEvolution({
  reader: evolution.reader,
  executor: evolution.executor,
  runUniverseSelection: evolution.runUniverseSelection,
  runPlanetSelection: () => {},
  challengeGroups: [],
});
assert.deepEqual(trace, [
  ["queue"],
  ["activity", "Attempting evolution of human."],
  ["invoke", "evolution-bunker"],
  ["invoke", "evolution-s-human"],
]);

// Auto selection cannot be guessed from the root; the pure planner therefore waits rather than
// importing or duplicating DeadSpace's private Race catalog.
settings.userEvolutionTarget = "auto";
assert.deepEqual(
  planEvolutionTarget(evolution.reader.sampleTargetSelection()),
  { kind: "wait" },
);

// A transition out of protoplasm clears the page-session target before the next evolution.
root.race.species = "human";
evolution.reader.sampleSpecies();
assert.equal(evolution.reader.storedTargetId(), null);

console.log("captured evolution checks passed");
