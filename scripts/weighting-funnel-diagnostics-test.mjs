import assert from "node:assert/strict";
import { createCoreManagers } from "../src/game/core-managers.ts";
import { createBuildingWeightingDecider } from "../src/domain/progression/build/building-weighting-decision.ts";

// The applyRules funnel diagnostics: sub-phase timings for sampling, deciding,
// and describing, plus the candidate counts that size a two-pass sampler.

const timings = [];
const counts = [];
let performanceEnabled = true;
let clock = 0;
const diagnostics = {
  readPerformanceEnabled: () => performanceEnabled,
  // Each call advances one unit, so a phase's total equals the number of
  // intervals attributed to it.
  nowMs: () => ++clock,
  recordPerformance: (phase, durationMs) => timings.push([phase, durationMs]),
  recordCount: (name, amount) => counts.push([name, amount]),
  flushPerformance: () => {},
};

// Two rules, so a candidate can be zeroed by either one or survive both.
const weightingRules = [
  {
    id: "locked",
    screening: true,
    enabled: () => true,
    match: (candidate) => !candidate.unlocked,
    describe: () => "Locked",
    multiplier: () => 0,
  },
  {
    id: "unaffordable",
    enabled: () => true,
    match: (candidate) => !candidate.affordable,
    describe: () => "",
    multiplier: () => 0,
  },
];

let sampledUnlockedFields = 0;
const { BuildingManager } = createCoreManagers({
  getGame: () => ({ global: { race: {}, city: {}, civic: { craftsman: {} } } }),
  getSettings: () => ({}),
  getState: () => ({ queuedTargets: [], triggerTargets: [] }),
  getBuildings: () => ({}),
  getProjects: () => ({}),
  isVacuumSyphonStage: () => false,
  getNiceNumber: (n) => String(n),
  weightingDecider: createBuildingWeightingDecider({ weightingRules }),
  readWeightingSnapshot: () => Object.freeze({}),
  readWeightingScreeningCandidate: (building) =>
    Object.freeze({
      id: building.id,
      unlocked: building.unlocked,
      autoBuildEnabled: true,
      count: building.count,
      autoMax: Number.MAX_SAFE_INTEGER,
      baseWeight: building._weighting,
    }),
  readWeightingCandidate: (building, screening) => {
    sampledUnlockedFields++;
    return Object.freeze({ ...screening, affordable: building.affordable });
  },
  describeBuildingWeighting: (candidateId) => `described ${candidateId}`,
  isEarlyGame: () => false,
  getIsPrestigeAllowed: () => () => false,
  getBananaRepublicObjectiveComplete: () => () => false,
  getInflationChallengeAssistActive: () => () => false,
  Trigger: class {},
  getWindow: () => ({ prompt: () => {} }),
  diagnostics,
});

const building = (id, overrides) => ({
  id,
  priority: 0,
  weighting: 0,
  extraDescription: "",
  count: 0,
  _weighting: 100,
  unlocked: true,
  affordable: true,
  ...overrides,
});
BuildingManager.priorityList = [
  building("Locked", { unlocked: false }),
  building("Broke", { affordable: false }),
  building("Buildable"),
];

BuildingManager.updateWeighting();

const timed = Object.fromEntries(timings);
const applyRules = "autoBuild.beginCycle.updateBuildingWeighting.applyRules";
for (const step of ["screen", "project", "describe"]) {
  assert.equal(
    timed[`${applyRules}.${step}`],
    3,
    `${step} is timed once per candidate and reported as one per-tick total`,
  );
}
// 12 in-loop reads plus the phase's own closing read.
assert.equal(
  timed[applyRules],
  13,
  "the sub-phases stay inside the phase that already existed",
);

const counted = Object.fromEntries(counts);
assert.equal(counted["autoBuild.weighting.candidates"], 3);
assert.equal(counted["autoBuild.weighting.sampledUnlocked"], 2);
assert.equal(counted["autoBuild.weighting.surviving"], 1);
assert.equal(counted["autoBuild.weighting.zeroedBy.locked"], 1);
assert.equal(counted["autoBuild.weighting.zeroedBy.unaffordable"], 1);
assert.equal(counted["autoBuild.weighting.projected"], 2);
assert.equal(
  sampledUnlockedFields,
  2,
  "a candidate a screening rule discarded is never projected in full",
);

// With diagnostics off, nothing is recorded and the decisions are unchanged.
performanceEnabled = false;
timings.length = 0;
counts.length = 0;
BuildingManager.priorityList.forEach((entry) => {
  entry.weighting = -1;
});
BuildingManager.updateWeighting();
assert.deepEqual(timings, []);
assert.deepEqual(counts, []);
assert.deepEqual(
  BuildingManager.priorityList.map((entry) => entry.weighting > 0),
  [false, false, true],
);

console.log("Building weighting funnel diagnostics tests passed");
