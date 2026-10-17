import assert from "node:assert/strict";

import { runEvolution } from "../../../src/application/evolution.ts";
import { planEvolutionTarget } from "../../../src/domain/progression/evolution/evolution.ts";
import { createCapturedEvolution } from "../../../src/adapters/evolve/progression/evolution/captured-evolution.ts";

let root = {
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
  resource: {
    RNA: { amount: 0, max: 0, display: true },
    DNA: { amount: 0, max: 0, display: true },
  },
  evolution: {
    mitochondria: { count: 0 },
    eukaryotic_cell: { count: 0 },
    nucleus: { count: 0 },
    organelles: { count: 0 },
    membrane: { count: 0 },
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
  { id: "evolution-dna", cost: { DNA: 1 } },
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
    const cellId = handle.elementId.slice("evolution-".length);
    if (cellId in root.evolution && cellId !== "bunker") {
      root.evolution[cellId].count += 1;
    }
    if (handle.elementId === "evolution-s-human") {
      root.race.imitation = "human";
    }
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => [...handles.keys()],
};
const defaultInvoke = controls.invoke;
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

// A condition-hidden resource action does not gate an unrelated evolution cycle.
assert.equal(
  evolution.reader.sampleChallengeActionAvailability("plasmid"),
  "stale",
);
const rnaRow = actionRows.shift();
assert.equal(
  evolution.executor.accumulateResources({
    rnaForDna: 0,
    dnaForEvolution: 0,
    rnaForEvolution: 0,
    newRna: 0,
    newDna: 0,
  }),
  "complete",
);
actionRows.unshift(rnaRow);
handles.delete("evolution-rna");
root.resource.RNA = { amount: 0, max: 2, display: true };
assert.equal(
  evolution.executor.accumulateResources({
    rnaForDna: 0,
    dnaForEvolution: 0,
    rnaForEvolution: 1,
    newRna: 1,
    newDna: 0,
  }),
  "deferred",
);
controls.invoke = defaultInvoke;
handles.set("evolution-rna", {
  elementId: "evolution-rna",
  generation: 2,
  methods: ["action"],
});
assert.equal(evolution.reader.sampleCosts("human").dnaMax, 0);

// RNA-only progression remains available before DNA unlock, without requiring a DNA resource,
// row, or binding.
delete root.resource.DNA;
const preDnaCosts = evolution.reader.sampleCosts("human");
assert.equal(preDnaCosts.dnaCurrent, 0);
assert.equal(preDnaCosts.dnaMax, 0);
assert.equal(preDnaCosts.dnaDisplay, false);
const earlyDnaRowIndex = actionRows.findIndex(
  (row) => row.id === "evolution-dna",
);
const earlyDnaRow = actionRows.splice(earlyDnaRowIndex, 1)[0];
handles.delete("evolution-dna");
controls.invoke = (handle) => {
  if (handle.elementId === "evolution-rna") root.resource.RNA.amount += 1;
  return { ok: true, value: undefined };
};
assert.equal(
  evolution.executor.accumulateResources({
    rnaForDna: 0,
    dnaForEvolution: 0,
    rnaForEvolution: 1,
    newRna: 1,
    newDna: 0,
  }),
  "complete",
);
actionRows.splice(earlyDnaRowIndex, 0, earlyDnaRow);
handles.set("evolution-dna", {
  elementId: "evolution-dna",
  generation: 2,
  methods: ["action"],
});
root.resource.DNA = { amount: 0, max: 2, display: true };

// A below-cap DNA conversion invokes the current native binding. A binding invalidated by a
// concurrent draw defers safely and is retried on a later cycle.
controls.invoke = (handle) => {
  if (handle.elementId === "evolution-dna") root.resource.DNA.amount += 1;
  return { ok: true, value: undefined };
};
assert.equal(
  evolution.executor.accumulateResources({
    rnaForDna: 0,
    dnaForEvolution: 1,
    rnaForEvolution: 0,
    newRna: 0,
    newDna: 1,
  }),
  "complete",
);
root.resource.DNA.amount = 0;
controls.invoke = () => ({
  ok: false,
  reason: "stale-control",
  detail: "draw replaced the binding",
});
assert.equal(
  evolution.executor.accumulateResources({
    rnaForDna: 0,
    dnaForEvolution: 1,
    rnaForEvolution: 0,
    newRna: 0,
    newDna: 1,
  }),
  "deferred",
);
controls.invoke = defaultInvoke;

// A full DNA pool legitimately hides the native DNA control. No conversion is needed, so the
// missing row and binding must not block resource accumulation or later cell/race actions.
const dnaRowIndex = actionRows.findIndex((row) => row.id === "evolution-dna");
const dnaRow = actionRows.splice(dnaRowIndex, 1)[0];
handles.delete("evolution-dna");
root.resource.DNA.amount = root.resource.DNA.max;
assert.equal(
  evolution.executor.accumulateResources({
    rnaForDna: 0,
    dnaForEvolution: 1,
    rnaForEvolution: 0,
    newRna: 0,
    newDna: root.resource.DNA.max,
  }),
  "complete",
);
root.resource.DNA.amount = 0;
actionRows.splice(dnaRowIndex, 0, dnaRow);
handles.set("evolution-dna", {
  elementId: "evolution-dna",
  generation: 2,
  methods: ["action"],
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
  rnaCurrent: 1,
  rnaMax: 2,
  rnaDisplay: true,
  dnaCurrent: 0,
  dnaMax: 2,
  dnaDisplay: true,
});
assert.deepEqual(
  evolution.reader.sampleEvolutionTree("human").map((action) => action.id),
  ["bunker"],
);
actionRows.push(
  { id: "evolution-chloroplasts", cost: {} },
  { id: "evolution-humanoid", cost: {} },
  { id: "evolution-sentience", cost: {} },
  { id: "evolution-human", cost: {} },
);
assert.deepEqual(
  evolution.reader.sampleEvolutionTree("human").map((action) => action.id),
  ["human", "humanoid", "bunker", "sentience"],
);
handles.set("evolution-human", {
  elementId: "evolution-human",
  generation: 1,
  methods: ["action"],
});
controls.invoke = (handle, method) => {
  if (handle.elementId === "evolution-human") root.race.species = "human";
  return defaultInvoke(handle, method);
};
const raceActionOutcome = evolution.executor.clickEvolution("human");
assert.deepEqual(raceActionOutcome, {
  status: "invoked",
  stateChanged: true,
});
root.race.species = "protoplasm";
controls.invoke = defaultInvoke;
handles.delete("evolution-human");
trace.length = 0;
root.tech = { evo_humanoid: 2 };
assert.equal(
  evolution.reader
    .sampleEvolutionTree("human")
    .find((action) => action.id === "humanoid").unlocked,
  false,
);
delete root.tech;
actionRows.splice(actionRows.length - 4, 4);
root.resource = {
  RNA: { amount: 0, max: 0 },
  DNA: { amount: 0, max: 0 },
};

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

// An enabled challenge that the native game does not currently draw is skipped. It must not
// starve the reachable ordinary tree step that follows it.
settings.challenge_plasmid = true;
root.evolution.bunker = 0;
const absentChallengeIndex = actionRows.findIndex(
  (row) => row.id === "evolution-plasmid",
);
const absentChallengeRow = actionRows.splice(absentChallengeIndex, 1)[0];
const challengeCycleTrace = [];
trace.length = 0;
runEvolution({
  reader: evolution.reader,
  executor: evolution.executor,
  runUniverseSelection: evolution.runUniverseSelection,
  runPlanetSelection: () => {},
  challengeGroups: [{ members: [{ id: "plasmid", trait: "no_plasmid" }] }],
  trace: (event) => challengeCycleTrace.push(event),
});
assert.deepEqual(
  challengeCycleTrace.find((event) => event.stage === "challenge"),
  {
    stage: "challenge",
    details: {
      id: "plasmid",
      enabled: true,
      availability: "not-offered",
    },
  },
);
assert.ok(
  trace.some(
    (entry) => entry[0] === "invoke" && entry[1] === "evolution-bunker",
  ),
);
assert.equal(challengeCycleTrace.at(-1).stage, "evolution-tree");
actionRows.splice(absentChallengeIndex, 0, absentChallengeRow);
const staleChallengeTrace = [];
runEvolution({
  reader: evolution.reader,
  executor: evolution.executor,
  runUniverseSelection: evolution.runUniverseSelection,
  runPlanetSelection: () => {},
  challengeGroups: [{ members: [{ id: "plasmid", trait: "no_plasmid" }] }],
  trace: (event) => staleChallengeTrace.push(event),
});
assert.deepEqual(staleChallengeTrace.at(-1), {
  stage: "challenge",
  reason: "visible-action-binding-stale",
  details: { id: "plasmid" },
});

// A currently drawn challenge with a generation-bound action is invoked. A native invocation
// failure is distinguished from stale capture and does not starve the ordinary tree step.
handles.set("evolution-plasmid", {
  elementId: "evolution-plasmid",
  generation: 1,
  methods: ["action"],
});
root.evolution.bunker = 0;
const availableChallengeTrace = [];
controls.invoke = (handle, method) => {
  if (handle.elementId === "evolution-plasmid")
    return { ok: false, reason: "native-invocation-failed" };
  return defaultInvoke(handle, method);
};
runEvolution({
  reader: evolution.reader,
  executor: evolution.executor,
  runUniverseSelection: evolution.runUniverseSelection,
  runPlanetSelection: () => {},
  challengeGroups: [{ members: [{ id: "plasmid", trait: "no_plasmid" }] }],
  trace: (event) => availableChallengeTrace.push(event),
});
assert.deepEqual(
  availableChallengeTrace.find((event) => event.stage === "challenge"),
  {
    stage: "challenge",
    details: {
      id: "plasmid",
      enabled: true,
      availability: "available",
      outcome: { status: "failed", detail: "native-invocation-failed" },
    },
  },
);
assert.equal(
  availableChallengeTrace.some((event) => event.stage === "evolution-tree"),
  true,
);
root.race.no_plasmid = 1;
const activeChallengeTrace = [];
runEvolution({
  reader: evolution.reader,
  executor: evolution.executor,
  runUniverseSelection: evolution.runUniverseSelection,
  runPlanetSelection: () => {},
  challengeGroups: [{ members: [{ id: "plasmid", trait: "no_plasmid" }] }],
  trace: (event) => activeChallengeTrace.push(event),
});
assert.deepEqual(
  activeChallengeTrace.find((event) => event.stage === "challenge"),
  {
    stage: "challenge",
    details: {
      id: "plasmid",
      enabled: true,
      availability: "active",
    },
  },
);
delete root.race.no_plasmid;
handles.delete("evolution-plasmid");
settings.challenge_plasmid = false;
controls.invoke = defaultInvoke;

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

// Deterministic captured replay: the real captured reader commits the auto-selected race and the
// real captured executor invokes the drawn target action in the same application pass.
root.race.species = "protoplasm";
delete root.race.evoFinalMenu;
settings.userEvolutionTarget = "auto";
root.race.species = "human";
evolution.reader.sampleSpecies();
root.race.species = "protoplasm";
evolution.reader.sampleSpecies();
const expectedAutoTarget = planEvolutionTarget(
  evolution.reader.sampleTargetSelection(),
);
assert.equal(expectedAutoTarget.kind, "target");
const expectedActionId = `evolution-${expectedAutoTarget.id}`;
actionRows.splice(
  0,
  actionRows.length,
  { id: "evolution-rna", cost: { RNA: 1 } },
  { id: "evolution-dna", cost: { DNA: 1 } },
  { id: expectedActionId, cost: { DNA: 1 } },
);
handles.set(expectedActionId, {
  elementId: expectedActionId,
  generation: 1,
  methods: ["action"],
});
controls.invoke = (handle, method) => {
  assert.equal(method, "action");
  trace.push(["invoke", expectedActionId]);
  root.evolution[expectedAutoTarget.id] = 1;
  return { ok: true, value: undefined };
};
trace.length = 0;
runEvolution({
  reader: evolution.reader,
  executor: evolution.executor,
  runUniverseSelection: evolution.runUniverseSelection,
  runPlanetSelection: () => {},
  challengeGroups: [],
});
assert.equal(evolution.reader.storedTargetId(), expectedAutoTarget.id);
assert.deepEqual(trace, [
  ["queue"],
  ["activity", `Attempting evolution of ${expectedAutoTarget.name}.`],
  ["invoke", expectedActionId],
]);

// A transition out of protoplasm clears the page-session target before the next evolution.
root.race.species = "human";
evolution.reader.sampleSpecies();
assert.equal(evolution.reader.storedTargetId(), null);

// Native soft reset clears both resource records before reload; new work is judged action by
// action after the replacement document initializes.
root = {
  ...root,
  race: { ...root.race, species: "protoplasm" },
  resource: {},
  evolution: {},
};
assert.equal(evolution.reader.sampleCosts("human").rnaCurrent, 0);
root = {
  ...root,
  resource: {
    RNA: { amount: 0, max: 2, display: true },
    DNA: { amount: 0, max: 2, display: true },
  },
};
handles.set("evolution-rna", {
  elementId: "evolution-rna",
  generation: 3,
  methods: ["action"],
});
handles.set("evolution-dna", {
  elementId: "evolution-dna",
  generation: 2,
  methods: ["action"],
});
assert.deepEqual(evolution.reader.sampleCosts("human"), {
  maxRna: 0,
  maxDna: 1,
  rnaCurrent: 0,
  rnaMax: 2,
  rnaDisplay: true,
  dnaCurrent: 0,
  dnaMax: 2,
  dnaDisplay: true,
});

// An invoked RNA action that leaves RNA unchanged is a valid native no-op, not a missing control
// exception. It defers DNA and later evolution actions until a subsequent work cycle.
controls.invoke = () => ({ ok: true, value: undefined });
const noOpAccumulation = evolution.executor.accumulateResources({
  rnaForDna: 1,
  dnaForEvolution: 1,
  rnaForEvolution: 0,
  newRna: 0,
  newDna: 0,
});
assert.equal(noOpAccumulation, "deferred");

controls.invoke = (handle) => {
  if (handle.elementId === "evolution-rna") root.resource.RNA.amount += 1;
  return { ok: true, value: undefined };
};
assert.equal(
  evolution.executor.accumulateResources({
    rnaForDna: 1,
    dnaForEvolution: 0,
    rnaForEvolution: 0,
    newRna: 1,
    newDna: 0,
  }),
  "complete",
);

console.log("captured evolution checks passed");
