import assert from "node:assert/strict";

import {
  evolutionChallengeCandidates,
  planEvolutionCells,
  planEvolutionTarget,
  planEvolutionTreeClick,
  planImitation,
  planResourceAccumulation,
} from "../src/domain/progression/evolution/evolution.ts";
import { createEvolutionReader } from "../src/adapters/evolve/progression/evolution/evolution.ts";

const CHALLENGES = [
  [
    { id: "plasmid", trait: "no_plasmid" },
    { id: "mastery", trait: "weak_mastery" },
  ],
  [{ id: "trade", trait: "no_trade" }],
  [{ id: "sludge", trait: "sludge" }],
  [{ id: "junker", trait: "junker" }],
];
const challengeGroups = CHALLENGES.map((members) => ({ members }));
// --- Focused unit assertions on the pure planners ------------------------

// Challenge candidate flattening honours group order and enablement.
assert.deepStrictEqual(
  evolutionChallengeCandidates(challengeGroups, {
    plasmid: true,
    junker: true,
  }).map((c) => [c.id, c.cycleEnding]),
  [
    ["plasmid", false],
    ["mastery", false],
    ["junker", true],
  ],
);

// Resource math reproduces the legacy Math.min chain.
assert.deepStrictEqual(
  planResourceAccumulation(600, 300, {
    rnaCurrent: 10,
    rnaMax: 600,
    dnaCurrent: 5,
    dnaMax: 300,
  }),
  {
    rnaForDna: 580,
    dnaForEvolution: 295,
    rnaForEvolution: 600,
    newRna: 600,
    newDna: 300,
  },
);

// Tree click picks the first unlocked non-active-challenge action.
assert.deepStrictEqual(
  planEvolutionTreeClick([
    { id: "a", unlocked: false, activeChallenge: false },
    { id: "b", unlocked: true, activeChallenge: true },
    { id: "c", unlocked: true, activeChallenge: false },
  ]),
  { kind: "click", id: "c" },
);
assert.deepStrictEqual(
  planEvolutionTreeClick([
    { id: "a", unlocked: false, activeChallenge: false },
  ]),
  { kind: "none" },
);

// Cells respect counts and max thresholds.
assert.deepStrictEqual(
  planEvolutionCells(
    {
      mitochondriaCount: 0,
      eukaryoticCellCount: 1,
      nucleusCount: 3,
      organellesCount: 10,
      rnaMax: 50,
      dnaMax: 50,
    },
    50,
    50,
  ),
  ["mitochondria", "nucleus"],
);

// Target selection wait vs fallback.
assert.deepStrictEqual(
  planEvolutionTarget({
    races: [
      {
        id: "custom",
        weighting: -1,
        habitability: 0,
        evolvable: false,
        genus: "custom",
        name: "C",
      },
      {
        id: "entish",
        weighting: 1,
        habitability: 1,
        evolvable: true,
        genus: "plant",
        name: "E",
      },
    ],
    userEvolutionTarget: "missing",
    massExtinction: false,
    queueEnabled: true,
    queueLength: 1,
    queueRepeat: false,
    evolutionAttempts: 0,
  }),
  { kind: "wait" },
);

// Auto Achievement must skip an attractive race whose race action is not unlocked
// in this run. Eye-Spector is the representative hybrid: its genus achievement can
// make habitability positive even when the race's extinction/seed gate is absent.
assert.deepStrictEqual(
  planEvolutionTarget({
    races: [
      {
        id: "beholder",
        weighting: 100,
        habitability: 1,
        evolvable: false,
        genus: "hybrid",
        name: "Eye-Spector",
      },
      {
        id: "entish",
        weighting: 1,
        habitability: 1,
        evolvable: true,
        genus: "plant",
        name: "Entish",
      },
    ],
    userEvolutionTarget: "auto",
    massExtinction: false,
    queueEnabled: false,
    queueLength: 0,
    queueRepeat: false,
    evolutionAttempts: 0,
  }),
  { kind: "target", id: "entish", name: "Entish" },
);

// The adapter samples the game action gate into the immutable selection input.
const beholderAction = { id: "beholder", isUnlocked: () => false };
const entishAction = { id: "entish", isUnlocked: () => true };
const reader = createEvolutionReader({
  getGame: () => ({
    global: {
      race: { universe: "evil" },
      stats: { achieve: {} },
    },
  }),
  getSettings: () => ({
    userEvolutionTarget: "auto",
    evolutionQueueEnabled: false,
    evolutionQueueRepeat: false,
  }),
  getSettingsRaw: () => ({ evolutionQueue: [] }),
  getState: () => ({ evolutionAttempts: 0 }),
  getRaces: () => ({
    beholder: {
      id: "beholder",
      genus: "hybrid",
      name: "Eye-Spector",
      getWeighting: () => 100,
      getHabitability: () => 1,
      evolutionTree: { eldritch: [beholderAction] },
    },
    entish: {
      id: "entish",
      genus: "plant",
      name: "Entish",
      getWeighting: () => 1,
      getHabitability: () => 1,
      evolutionTree: { plant: [entishAction] },
    },
  }),
  getEvolutions: () => ({}),
  getImitations: () => ({}),
  getResources: () => ({}),
  getPoly: () => ({}),
  challengeGroups: [],
});
const sampledTargetSelection = reader.sampleTargetSelection();
assert.equal(
  sampledTargetSelection.races.find((race) => race.id === "beholder").evolvable,
  false,
);

// Imitation planning branches.
assert.deepStrictEqual(
  planImitation({
    evoFinalMenu: false,
    imitationExists: true,
    imitateRace: "x",
  }),
  {
    kind: "skip",
  },
);
assert.deepStrictEqual(
  planImitation({
    evoFinalMenu: true,
    imitationExists: false,
    imitateRace: "x",
  }),
  {
    kind: "log-no-race",
  },
);

console.log("evolution planner unit checks passed");
