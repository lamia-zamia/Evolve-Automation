import assert from "node:assert/strict";

import {
  evolutionChallengeCandidates,
  planEvolutionCells,
  planEvolutionTarget,
  planEvolutionTreeClick,
  planImitation,
  planResourceAccumulation,
} from "../src/domain/progression/evolution/evolution.ts";
import { selectUsableHybridBranch } from "../src/adapters/evolve/progression/evolution/evolution.ts";

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
        genus: "custom",
        name: "C",
      },
      {
        id: "entish",
        weighting: 1,
        habitability: 1,
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

// Hybrid branch selection identifies the genus-confirming action as the one
// after `sentience`, even when the genus KEY differs from the action id
// (giant -> gigantism). Regression: beholder (hybrid eldritch+giant) stalled
// forever because the eldritch branch needs the nightmare achievement while
// the giant branch's `gigantism` was never recognized (id !== "giant").
const beholderEldritch = [
  { id: "bunker", unlocked: false },
  { id: "beholder", unlocked: false },
  { id: "sentience", unlocked: false },
  { id: "eldritch", unlocked: false },
  { id: "bilateral_symmetry", unlocked: false },
  { id: "sexual_reproduction", unlocked: false },
];
assert.equal(
  selectUsableHybridBranch({
    eldritch: beholderEldritch,
    giant: [
      { id: "bunker", unlocked: false },
      { id: "beholder", unlocked: false },
      { id: "sentience", unlocked: false },
      { id: "gigantism", unlocked: true },
      { id: "mammals", unlocked: false },
      { id: "sexual_reproduction", unlocked: false },
    ],
  }),
  "giant",
);

// Early in the tree neither genus action is unlocked yet: no branch is usable.
assert.equal(
  selectUsableHybridBranch({
    eldritch: beholderEldritch,
    giant: [
      { id: "sentience", unlocked: false },
      { id: "gigantism", unlocked: false },
    ],
  }),
  null,
);

console.log("evolution planner unit checks passed");
