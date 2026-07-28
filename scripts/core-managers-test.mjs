import assert from "node:assert/strict";
import { createCoreManagers } from "../src/game/core-managers.ts";

let game;
let settings;
let state;
let buildings;
let projects;
let prestigeAllowed = () => false;
let bananaComplete = () => true;
let inflationActive = () => false;
let earlyGame = false;
let vacuumSyphonStage = false;
const prompts = [];

// One active rule: doubles weighting for buildings flagged `boost`.
const weightingRules = [
  {
    id: "boost",
    enabled: () => true,
    match: (b) => (b.boost ? "boosted" : false),
    describe: () => "note",
    multiplier: () => 2,
  },
];
let niceNumberCalls = 0;

class Trigger {
  constructor(seq, priority, rType, rId, rCount, aType, aId, aCount) {
    Object.assign(this, {
      seq,
      priority,
      requirementType: rType,
      requirementId: rId,
      requirementCount: rCount,
      actionType: aType,
      actionId: aId,
      actionCount: aCount,
    });
  }
}

const { JobManager, BuildingManager, ProjectManager, TriggerManager } =
  createCoreManagers({
    getGame: () => game,
    getSettings: () => settings,
    getState: () => state,
    getBuildings: () => buildings,
    getProjects: () => projects,
    isVacuumSyphonStage: () => vacuumSyphonStage,
    getNiceNumber: (n) => {
      niceNumberCalls++;
      return String(n);
    },
    weightingRules,
    isEarlyGame: () => earlyGame,
    getIsPrestigeAllowed: () => prestigeAllowed,
    getBananaRepublicObjectiveComplete: () => bananaComplete,
    getInflationChallengeAssistActive: () => inflationActive,
    Trigger,
    getWindow: () => ({
      prompt: (title, value) => prompts.push([title, value]),
    }),
  });

// ---------- Jobs ----------
const managed = (m) => ({ isManaged: () => m });
JobManager.priorityList = [
  { ...managed(true), priority: 2, id: "b" },
  { ...managed(false), priority: 1, id: "a" },
];
JobManager.craftingJobs = [managed(true), managed(false)];
JobManager.sortByPriority();
assert.deepEqual(
  JobManager.priorityList.map((j) => j.id),
  ["a", "b"],
);
settings = { autoJobs: false, autoCraftsmen: false };
assert.equal(JobManager.managedPriorityList().length, 0);
settings = { autoJobs: true, autoCraftsmen: false };
assert.equal(JobManager.managedPriorityList().length, 1); // only the managed job
settings = { autoJobs: true, autoCraftsmen: true };
assert.equal(JobManager.managedPriorityList().length, 2); // + managed crafting job

// servantsMax subtracts unmanaged serving jobs.
game = { global: { race: { servants: { max: 10, smax: 6 } } } };
JobManager.priorityList = [
  { is: { serve: true }, isManaged: () => false, servants: 3 },
  { is: { serve: true }, isManaged: () => true, servants: 4 },
];
assert.equal(JobManager.servantsMax(), 7); // 10 - 3
game = { global: { race: {} } };
assert.equal(JobManager.servantsMax(), 0); // no servants

// craftingMax subtracts unmanaged crafters and Thermite.
game = {
  global: {
    city: { foundry: { Thermite: 2 } },
    civic: { craftsman: { max: 12 } },
  },
};
JobManager.craftingJobs = [{ isManaged: () => false, count: 3 }];
assert.equal(JobManager.craftingMax(), 7); // 12 - 3 - 2

// ---------- Buildings ----------
buildings = {
  A: { updateResourceRequirements: () => {}, extraDescription: "x" },
};
BuildingManager.updateBuildings();
assert.equal(buildings.A.extraDescription, "");

BuildingManager.priorityList = [
  { _weighting: 5, count: 0, boost: true, weighting: 0, extraDescription: "" },
  { _weighting: 5, count: 0, boost: false, weighting: 0, extraDescription: "" },
];
BuildingManager.updateWeighting();
assert.equal(BuildingManager.priorityList[0].weighting, 10); // doubled
assert.equal(BuildingManager.priorityList[1].weighting, 5); // untouched
assert.match(
  BuildingManager.priorityList[0].extraDescription,
  /AutoBuild weighting/,
);
assert.equal(niceNumberCalls, 2);
BuildingManager.priorityList.forEach((building) => {
  building.extraDescription = "";
});
BuildingManager.updateWeighting();
assert.equal(niceNumberCalls, 2); // unchanged numeric weightings reuse formatting
assert.equal(BuildingManager.managedPriorityList().length, 2);

BuildingManager.statePriorityList = [
  { hasState: () => true, autoStateEnabled: true, count: 1, priority: 0 },
  { hasState: () => true, autoStateEnabled: false, count: 1, priority: 1 },
  { hasState: () => false, autoStateEnabled: true, count: 1, priority: 2 },
];
assert.equal(BuildingManager.managedStatePriorityList().length, 1);

// ---------- Projects ----------
const ManaSyphon = mkProject("ManaSyphon");
const Monument = mkProject("Monument");
const StockExchange = mkProject("StockExchange");
const Other = mkProject("Other");
projects = { ManaSyphon, Monument, StockExchange };
function mkProject(name) {
  return {
    name,
    _weighting: 10,
    currentStep: 1,
    count: 0,
    autoMax: 100,
    progress: 0,
    weighting: 0,
    extraDescription: "",
    isUnlocked: () => true,
    autoBuildEnabled: true,
    isAffordable: () => true,
  };
}
state = { queuedTargets: [], triggerTargets: [] };
game = { global: { race: {} } };
settings = { autoARPA: true };
ProjectManager.priorityList = [Other];
ProjectManager.updateWeighting();
assert.equal(Other.weighting, 10); // _weighting * currentStep, no penalties

settings = {
  autoARPA: true,
  prestigeType: "vacuum",
  buildingWeightingVacuumCollapse: 10,
};
vacuumSyphonStage = true;
ProjectManager.priorityList = [ManaSyphon];
ProjectManager.updateWeighting();
assert.equal(ManaSyphon.weighting, 100);
assert.match(ManaSyphon.extraDescription, /AutoARPA weighting: 100/);
vacuumSyphonStage = false;
ProjectManager.priorityList = [Other];

// Locked project zeroes out.
Other.isUnlocked = () => false;
ProjectManager.updateWeighting();
assert.equal(Other.weighting, 0);
assert.match(Other.extraDescription, /Locked/);
Other.isUnlocked = () => true;

// Queued target zeroes out.
state.queuedTargets = [Other];
ProjectManager.updateWeighting();
assert.equal(Other.weighting, 0);
state.queuedTargets = [];

// managedPriorityList keeps only positive-weighted projects.
ProjectManager.priorityList = [Other];
Other.isUnlocked = () => true;
ProjectManager.updateWeighting();
assert.deepEqual(
  ProjectManager.managedPriorityList().map((p) => p.name),
  ["Other"],
);

// ---------- Triggers ----------
TriggerManager.priorityList = [];
const t0 = TriggerManager.AddTrigger("A", "a", 1, "X", "x", 1);
const t1 = TriggerManager.AddTrigger("B", "b", 1, "Y", "y", 1);
assert.equal(TriggerManager.priorityList.length, 2);
assert.equal(t0.seq, 0);
assert.equal(t1.seq, 1);
assert.equal(TriggerManager.getTrigger(1), t1);

// AddTriggerFromSetting dedupes by seq.
TriggerManager.AddTriggerFromSetting({ seq: 0, priority: 0 });
assert.equal(TriggerManager.priorityList.length, 2);
TriggerManager.AddTriggerFromSetting({ seq: 5, priority: 5 });
assert.equal(TriggerManager.priorityList.length, 3);

// RemoveTrigger reindexes seq/priority.
TriggerManager.RemoveTrigger(0);
assert.equal(TriggerManager.priorityList.length, 2);
assert.deepEqual(
  TriggerManager.priorityList.map((t) => t.seq),
  [0, 1],
);

// DuplicateTrigger inserts a copy and reindexes.
const lenBefore = TriggerManager.priorityList.length;
TriggerManager.DuplicateTrigger(0);
assert.equal(TriggerManager.priorityList.length, lenBefore + 1);
assert.deepEqual(
  TriggerManager.priorityList.map((t) => t.seq),
  [0, 1, 2],
);

// resetTargetTriggers picks non-complete, met, possible, non-conflicting triggers.
const mkTrig = (complete, met, possible, cost) => ({
  updateComplete() {},
  complete,
  areRequirementsMet: () => met,
  isActionPossible: () => possible,
  cost: () => cost,
});
TriggerManager.priorityList = [
  mkTrig(false, true, true, { Iron: 1 }),
  mkTrig(false, true, true, { Iron: 1 }), // conflicts with first (shared Iron)
  mkTrig(false, true, true, { Copper: 1 }),
  mkTrig(true, true, true, { Coal: 1 }), // already complete
];
TriggerManager.resetTargetTriggers();
assert.equal(TriggerManager.targetTriggers.length, 2); // #1 and #3

// EvalizeTrigger prompts with the compiled check.
TriggerManager.priorityList = [
  { seq: 0, requirementType: "Eval", requirementId: "1 > 0" },
];
prompts.length = 0;
TriggerManager.EvalizeTrigger(0);
assert.deepEqual(prompts, [["Eval of this condition:", "1 > 0"]]);

console.log("Core managers module tests passed");
