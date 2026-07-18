import assert from "node:assert/strict";

import { runResearchAutomation } from "../src/application/research.ts";
import {
  createResearchCommandExecutor,
  createResearchReader,
} from "../src/adapters/evolve/research.ts";
import { planResearch } from "../src/domain/research.ts";

function createFixture(definitions) {
  const trace = [];
  const techs = definitions.map((definition) => ({
    id: definition.id,
    conflict: definition.conflict ?? false,
    isAffordable() {
      trace.push(["affordable", definition.id]);
      return definition.affordable;
    },
    click() {
      trace.push(["click", definition.id]);
      return definition.click ?? false;
    },
  }));
  const state = { unlockedTechs: techs };
  const BuildingManager = {
    updateBuildings: () => trace.push(["building-cache"]),
  };
  const ProjectManager = {
    updateProjects: () => trace.push(["project-cache"]),
  };
  const getCostConflict = (tech) => {
    trace.push(["conflict", tech.id]);
    return tech.conflict;
  };
  return {
    trace,
    state,
    BuildingManager,
    ProjectManager,
    getCostConflict,
  };
}

// Exact copy of the deleted factory algorithm, used only as the parity oracle.
function runLegacy(definitions) {
  const fixture = createFixture(definitions);
  for (const tech of fixture.state.unlockedTechs) {
    if (tech.isAffordable() && !fixture.getCostConflict(tech) && tech.click()) {
      fixture.BuildingManager.updateBuildings();
      fixture.ProjectManager.updateProjects();
      break;
    }
  }
  return fixture.trace;
}

function runModern(definitions) {
  const fixture = createFixture(definitions);
  const outcome = runResearchAutomation({
    reader: createResearchReader({
      getState: () => fixture.state,
      getCostConflict: fixture.getCostConflict,
    }),
    executor: createResearchCommandExecutor({
      getState: () => fixture.state,
      getBuildingManager: () => fixture.BuildingManager,
      getProjectManager: () => fixture.ProjectManager,
    }),
  });
  assert.equal(outcome.status, "succeeded");
  return fixture.trace;
}

const parityScenarios = [
  {
    name: "first eligible technology succeeds",
    techs: [
      { id: "agriculture", affordable: true, click: true },
      { id: "mining", affordable: true, click: true },
    ],
  },
  {
    name: "unaffordable technology skips conflict analysis",
    techs: [
      { id: "agriculture", affordable: false },
      { id: "mining", affordable: true, click: true },
    ],
  },
  {
    name: "cost conflict skips a technology",
    techs: [
      { id: "agriculture", affordable: true, conflict: true },
      { id: "mining", affordable: true, click: true },
    ],
  },
  {
    name: "declined safe click resumes at the following technology",
    techs: [
      { id: "agriculture", affordable: true, click: false },
      { id: "mining", affordable: true, click: true },
      { id: "storage", affordable: true, click: true },
    ],
  },
  {
    name: "all candidates are unavailable",
    techs: [
      { id: "agriculture", affordable: false },
      { id: "mining", affordable: true, conflict: true },
    ],
  },
  {
    name: "last safe click is declined",
    techs: [{ id: "agriculture", affordable: true, click: false }],
  },
  { name: "empty research list", techs: [] },
];

for (const scenario of parityScenarios) {
  assert.deepEqual(
    runModern(scenario.techs),
    runLegacy(scenario.techs),
    scenario.name,
  );
}

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

console.log("Research automation dual-run and adapter tests passed");
