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
  city: { biome: "grassland" },
  genes: { challenge: false },
  blood: { unbound: 0 },
  prestige: { Harmony: { count: 0 } },
  stats: { achieve: {} },
  resource: { RNA: { amount: 0, max: 0 }, DNA: { amount: 0, max: 0 } },
  evolution: {
    mitochondria: { count: 0 },
    eukaryotic_cell: { count: 0 },
    nucleus: { count: 0 },
    organelles: { count: 0 },
  },
};

const settings = {
  autoEvolution: true,
  userEvolutionTarget: "human",
  userUniverseTargetName: "magic",
  evolutionQueue: [],
  evolutionQueueEnabled: false,
  evolutionQueueRepeat: false,
  imitateRace: "human",
  prestigeType: "none",
  evolutionAutoUnbound: false,
};

const trace = [];
const actionRows = [
  { id: "evolution-rna", cost: { RNA: 1 } },
  { id: "evolution-plasmid", cost: { DNA: 99 } },
  { id: "evolution-bunker", cost: { DNA: 10 } },
  { id: "evolution-membrane", cost: { RNA: 2 } },
];

const handles = new Map();
for (const id of [
  "evolution-rna",
  "evolution-dna",
  "evolution-bunker",
  "evolution-mitochondria",
  "evolution-eukaryotic_cell",
  "evolution-membrane",
  "evolution-nucleus",
  "evolution-organelles",
]) {
  handles.set(id, { elementId: id, generation: 1, methods: ["action"] });
}
let mutateBunker = true;
const controls = {
  resolve: (id) => handles.get(id),
  invoke: (handle, method) => {
    assert.equal(method, "action");
    trace.push(["invoke", handle.elementId]);
    if (handle.elementId === "evolution-bunker" && mutateBunker) {
      root.evolution.bunker = 1;
    }
    if (handle.elementId === "evolution-s-human") {
      root.race.imitation = "human";
    }
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

// Explicit targets are validated against the captured catalog, which is shared with Auto
// Achievements rather than fabricated from the setting.
assert.equal(
  evolution.reader
    .sampleTargetSelection()
    .races.some((race) => race.id === "human"),
  true,
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
  ["activity", "Attempting evolution of Human."],
  ["invoke", "evolution-bunker"],
]);
assert.equal(evolution.reader.storedTargetId(), "human");

// A Vue action wrapper can report success even when its underlying action could not pay its
// costs. The failed tree action must therefore fall through to the cell-upgrade phase rather
// than returning before the capacity upgrades run.
mutateBunker = false;
trace.length = 0;
runEvolution({
  reader: evolution.reader,
  executor: evolution.executor,
  runUniverseSelection: evolution.runUniverseSelection,
  runPlanetSelection: () => {},
  challengeGroups: [],
});
assert.deepEqual(trace, [
  ["invoke", "evolution-bunker"],
  ["invoke", "evolution-mitochondria"],
  ["invoke", "evolution-eukaryotic_cell"],
  ["invoke", "evolution-membrane"],
  ["invoke", "evolution-nucleus"],
  ["invoke", "evolution-organelles"],
]);

// DeadSpace's final menu exposes imitation rows only. The configured imitation must win even if
// another row appears first in the DOM.
settings.imitateRace = "human";
root.race.evoFinalMenu = "synth";
trace.length = 0;
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
assert.deepEqual(trace, [["invoke", "evolution-s-human"]]);

// Auto selection uses the captured race facts and chooses the strongest reachable genus.
settings.userEvolutionTarget = "auto";
assert.deepEqual(
  planEvolutionTarget(evolution.reader.sampleTargetSelection()),
  { kind: "target", id: "sporgar", name: "Sporgar" },
);

// A transition out of protoplasm clears the page-session target before the next evolution.
root.race.species = "human";
evolution.reader.sampleSpecies();
assert.equal(evolution.reader.storedTargetId(), null);

console.log("captured evolution checks passed");
