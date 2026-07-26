import assert from "node:assert/strict";

import {
  createResearchCommandExecutor,
  createResearchReader,
} from "../src/adapters/evolve/progression/research/research.ts";
import { planResearch } from "../src/domain/progression/research/research.ts";

assert.deepEqual(
  planResearch({
    techs: [
      {
        index: 3,
        id: "blocked",
        affordable: true,
        hasCostConflict: true,
      },
      {
        index: 4,
        id: "available",
        affordable: true,
        hasCostConflict: false,
      },
    ],
  }),
  { index: 4, techId: "available" },
  "the pure planner selects the first eligible observation",
);

let irrelevantConflictReads = 0;
const gatedReader = createResearchReader({
  getState: () => ({
    unlockedTechs: [
      { id: "locked", isAffordable: () => false },
      { id: "ready", isAffordable: () => true },
      {
        get id() {
          throw new Error("reader inspected a technology after its candidate");
        },
        isAffordable: () => true,
      },
    ],
  }),
  getCostConflict: () => {
    irrelevantConflictReads++;
    return false;
  },
});
assert.deepEqual(gatedReader.read(0).techs, [
  {
    index: 0,
    id: "locked",
    affordable: false,
    hasCostConflict: false,
  },
  {
    index: 1,
    id: "ready",
    affordable: true,
    hasCostConflict: false,
  },
]);
assert.equal(
  irrelevantConflictReads,
  1,
  "unaffordable and post-candidate technologies do not run conflict checks",
);

const successfulActions = [];
const researchPhases = [];
let researchClock = 0;
const successfulResult = createResearchCommandExecutor({
  getState: () => ({
    unlockedTechs: [
      { id: "ready", click: () => successfulActions.push("click") || true },
    ],
  }),
  getBuildingManager: () => ({
    updateBuildings: () => successfulActions.push("buildings"),
  }),
  getProjectManager: () => ({
    updateProjects: () => successfulActions.push("projects"),
  }),
  diagnostics: {
    readPerformanceEnabled: () => true,
    nowMs: () => ++researchClock,
    recordPerformance: (phase) => researchPhases.push(phase),
    flushPerformance: () => {},
  },
}).execute({ index: 0, techId: "ready" });
assert.equal(successfulResult.researched, true);
assert.deepEqual(successfulActions, ["click", "buildings", "projects"]);
assert.deepEqual(researchPhases, [
  "autoResearch.executeClick",
  "autoResearch.executeBuildings",
  "autoResearch.executeProjects",
]);

assert.throws(
  () =>
    createResearchReader({
      getState: () => ({}),
      getCostConflict: () => false,
    }).read(0),
  /state\.unlockedTechs must be an array/,
);
assert.throws(
  () =>
    createResearchReader({
      getState: () => ({
        unlockedTechs: [{ id: 7, isAffordable: () => true }],
      }),
      getCostConflict: () => false,
    }).read(0),
  /state\.unlockedTechs\[0\]\.id must be a string/,
);
assert.throws(
  () =>
    createResearchReader({
      getState: () => ({ unlockedTechs: [{ id: "broken" }] }),
      getCostConflict: () => false,
    }).read(0),
  /state\.unlockedTechs\[0\]\.isAffordable must be a function/,
);

const staleActions = [];
const staleState = {
  unlockedTechs: [
    {
      id: "changed",
      click: () => staleActions.push("click"),
    },
  ],
};
const staleResult = createResearchCommandExecutor({
  getState: () => staleState,
  getBuildingManager: () => ({
    updateBuildings: () => staleActions.push("buildings"),
  }),
  getProjectManager: () => ({
    updateProjects: () => staleActions.push("projects"),
  }),
}).execute({ index: 0, techId: "sampled" });
assert.equal(staleResult.outcome.status, "stale");
assert.deepEqual(staleActions, [], "stale research performs no mutation");

let malformedManagerClicked = false;
assert.throws(
  () =>
    createResearchCommandExecutor({
      getState: () => ({
        unlockedTechs: [
          {
            id: "ready",
            click: () => {
              malformedManagerClicked = true;
              return true;
            },
          },
        ],
      }),
      getBuildingManager: () => ({}),
      getProjectManager: () => ({ updateProjects: () => {} }),
    }).execute({ index: 0, techId: "ready" }),
  /BuildingManager\.updateBuildings must be a function/,
);
assert.equal(
  malformedManagerClicked,
  false,
  "manager contracts are validated before research mutates the game",
);

console.log("Research automation adapter and regression tests passed");
