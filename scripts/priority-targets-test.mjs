import assert from "node:assert/strict";
import { createPriorityTargets } from "../src/planning/priority-targets.ts";

function makeTarget(id, cost = {}, affordable = true) {
  return {
    id,
    _vueBinding: id,
    title: id,
    cost,
    isAffordable: () => affordable,
    updateResourceRequirements() {},
  };
}

function makeBuilding(id, autoBuildable = false, count = 0) {
  return {
    id,
    title: id,
    count,
    cost: {},
    isAutoBuildable: () => autoBuildable,
  };
}

function makeContext(overrides = {}) {
  const { settings: settingsOverride, ...rest } = overrides;
  return {
    settings: {
      prioritizeQueue: ["save"],
      prioritizeUnify: [],
      prioritizeTriggers: [],
      prioritizeOuterFleet: [],
      autoFleet: false,
      autoMech: false,
      autoTrigger: false,
      mechBuild: "random",
      fleetEmbassyKnowledge: 0,
      ...(settingsOverride || {}),
    },
    state: {},
    game: {
      global: {
        queue: { display: true, queue: [{ id: "city-mine" }] },
        r_queue: { display: false, queue: [] },
        settings: { qAny: true, qAny_res: true },
        portal: { mechbay: { max: 5, bay: 0, blueprint: { size: "large" } } },
      },
    },
    resources: { Knowledge: { maxQuantity: 0 } },
    buildings: {
      AsphodelEncampment: makeBuilding("AsphodelEncampment"),
      GorddonEmbassy: makeBuilding("GorddonEmbassy"),
      TauStarEden: makeBuilding("TauStarEden"),
      TauGas2MatrioshkaBrain: makeBuilding("TauGas2MatrioshkaBrain"),
      TauGas2IgniteGasGiant: makeBuilding("TauGas2IgniteGasGiant"),
    },
    techIds: { "tech-unification": makeTarget("tech-unification") },
    buildingIds: { "city-mine": makeTarget("city-mine", { Lumber: 10 }) },
    arpaIds: {},
    ...rest,
  };
}

// A single mutable context object, replaced wholesale between runs, proves the
// factory resolves every runtime dependency through live getters.
let context = makeContext();
let saveMoney = false;
let mechTask = false;
const techSweep = [];

const { updatePriorityTargets } = createPriorityTargets({
  getSettings: () => context.settings,
  getState: () => context.state,
  getGame: () => context.game,
  getResources: () => context.resources,
  getBuildings: () => context.buildings,
  getTechIds: () => context.techIds,
  getBuildingIds: () => context.buildingIds,
  getArpaIds: () => context.arpaIds,
  getSpyManager: () => ({ purchaseMoney: 0 }),
  getFleetManagerOuter: () => ({ nextShipAffordable: false }),
  getMechManager: () => ({
    initLab: () => true,
    getPreferredSize: () => ["collector"],
    getMechCost: () => [7, 3, 1],
  }),
  getTriggerManager: () => ({
    targetTriggers: [],
    resetTargetTriggers() {},
  }),
  getJQuery: () => () => ({
    each(callback) {
      techSweep.forEach((element) => callback.call(element));
    },
  }),
  readQueuedTarget: (item) => {
    if (context.queueUnavailable) {
      return {
        status: "unavailable",
        reason: "invalid-cost",
        itemId: item.id,
      };
    }
    const target = context.buildingIds[item.id];
    return target
      ? {
          status: "ready",
          target,
          maximumAffordable: target.isAffordable(true),
        }
      : { status: "missing", itemId: item.id };
  },
  getTechConflict: () => false,
  isPrestigeAllowed: () => false,
  haveTask: (task) => mechTask && task === "mech",
  inflationChallengeShouldSaveMoney: () => saveMoney,
  inflationChallengeMoney: 25e10,
});

// Baseline: the queued building is the only conflict source.
updatePriorityTargets();
assert.deepEqual(
  context.state.queuedTargets.map((t) => t.id),
  ["city-mine"],
);
assert.deepEqual(context.state.conflictTargets, [
  { name: "city-mine", cause: "Queue", cost: { Lumber: 10 } },
]);

// A well-formed queue entry whose catalog object disappeared is treated as a
// recoverable stale entry; later known queue entries still participate normally.
context.game.global.queue.queue = [
  { id: "missing-after-reset" },
  { id: "city-mine" },
];
updatePriorityTargets();
assert.equal(context.state.queueDataUnavailable, false);
assert.deepEqual(
  context.state.queuedTargetsAll.map((t) => t.id),
  ["city-mine"],
);
assert.deepEqual(context.state.conflictTargets, [
  { name: "city-mine", cause: "Queue", cost: { Lumber: 10 } },
]);
context.game.global.queue.queue = [{ id: "city-mine" }];

// The Inflation "Wheelbarrow" reservation, which the bundled characterization
// leaves inert, is driven here through the injected guard.
saveMoney = true;
updatePriorityTargets();
assert.deepEqual(context.state.conflictTargets, [
  { name: "city-mine", cause: "Queue", cost: { Lumber: 10 } },
  { name: "Inflation challenge", cause: "Wheelbarrow", cost: { Money: 25e10 } },
]);
saveMoney = false;

// A whole-context replacement is observed: new settings enable the mech
// reservation, and haveTask("mech") forces the titan blueprint over the
// preferred random size.
context = makeContext({ settings: { autoMech: true, prioritizeQueue: [] } });
mechTask = true;
updatePriorityTargets();
assert.deepEqual(context.state.conflictTargets, [
  { name: "Next mech (titan)", cause: "Mech", cost: { Soul_Gem: 7 } },
]);

// Without the governor mech task, the random build path asks MechManager for a
// preferred size instead.
mechTask = false;
updatePriorityTargets();
assert.deepEqual(context.state.conflictTargets, [
  { name: "Next mech (collector)", cause: "Mech", cost: { Soul_Gem: 7 } },
]);

// An Asphodel Encampment suppresses gem reservation entirely.
context.buildings.AsphodelEncampment = makeBuilding(
  "AsphodelEncampment",
  false,
  1,
);
updatePriorityTargets();
assert.deepEqual(context.state.conflictTargets, []);

// The tech sweep reads live techIds and keeps conflict-free techs.
context = makeContext({ settings: { prioritizeQueue: [] } });
context.techIds["tech-mining"] = makeTarget("tech-mining");
techSweep.push({ id: "tech-mining" });
updatePriorityTargets();
assert.deepEqual(
  context.state.unlockedTechs.map((t) => t.id),
  ["tech-mining"],
);

// Malformed visible queue data fails closed through a sentinel reservation and
// is explicitly marked instead of aborting the complete state update.
techSweep.length = 0;
context = makeContext({ queueUnavailable: true });
updatePriorityTargets();
assert.equal(context.state.queueDataUnavailable, true);
assert.deepEqual(context.state.queuedTargetsAll, []);
assert.deepEqual(context.state.conflictTargets, [
  {
    name: "Queue data unavailable",
    cause: "Queue",
    cost: { __EA_QUEUE_DATA_UNAVAILABLE__: 1 },
  },
]);

console.log("Priority targets module tests passed");
