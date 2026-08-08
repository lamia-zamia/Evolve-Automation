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
    spyManager: { purchaseMoney: 0 },
    fleetManagerOuter: {
      nextShipAffordable: false,
      nextShipName: "",
      nextShipCost: {},
    },
    mechManager: {
      initLab: () => true,
      getPreferredSize: () => ["collector"],
      getMechCost: () => [7, 3, 1],
    },
    triggerManager: {
      targetTriggers: [],
      resetTargetTriggers() {},
    },
    ...rest,
  };
}

// A single mutable context object, replaced wholesale between runs, proves the
// factory resolves every runtime dependency through live getters.
let context = makeContext();
let saveMoney = false;
let mechTask = false;
const techSweep = [];

const gamePriorityTargets = {
  readQueue(kind) {
    const queueState = context.game.global[kind];
    if (!queueState) return { display: false, items: [], noorder: false };
    return {
      display: queueState.display,
      items: queueState.queue,
      noorder: Boolean(
        context.game.global.settings[kind === "r_queue" ? "qAny_res" : "qAny"],
      ),
    };
  },
  readSpyPurchaseMoney() {
    return context.spyManager.purchaseMoney;
  },
  readOuterFleetNextShip() {
    return context.fleetManagerOuter;
  },
  readMechBay() {
    const mechbay = context.game.global.portal.mechbay;
    return {
      max: mechbay.max,
      bay: mechbay.bay,
      blueprintSize: mechbay.blueprint.size,
    };
  },
  readMechLabReady() {
    return context.mechManager.initLab();
  },
  readMechPreferredSize() {
    return context.mechManager.getPreferredSize()[0];
  },
  readMechCost(size) {
    return context.mechManager.getMechCost({ size })[0];
  },
  readTriggerTargets() {
    return context.triggerManager.targetTriggers;
  },
  resetTargetTriggers() {
    context.triggerManager.resetTargetTriggers();
  },
  readTechActionIds() {
    return techSweep.map((element) => element.id);
  },
};

const { updatePriorityTargets } = createPriorityTargets({
  gamePriorityTargets,
  getSettings: () => context.settings,
  getState: () => context.state,
  getResources: () => context.resources,
  getBuildings: () => context.buildings,
  getTechIds: () => context.techIds,
  getBuildingIds: () => context.buildingIds,
  getArpaIds: () => context.arpaIds,
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

// A single mutable context is swapped wholesale between scenarios, and the
// manager slots travel with it, proving the planner resolves the port reads
// through live values rather than captured ones.
context = makeContext();

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

// A registry with no Asphodel Encampment entry at all reads as "none built" and
// keeps reserving gems instead of failing the whole update.
delete context.buildings.AsphodelEncampment;
updatePriorityTargets();
assert.deepEqual(context.state.conflictTargets, [
  { name: "Next mech (collector)", cause: "Mech", cost: { Soul_Gem: 7 } },
]);

// The tech sweep reads live techIds and keeps conflict-free techs.
context = makeContext({ settings: { prioritizeQueue: [] } });
context.techIds["tech-mining"] = makeTarget("tech-mining");
techSweep.push({ id: "tech-mining" });
updatePriorityTargets();
assert.deepEqual(
  context.state.unlockedTechs.map((t) => t.id),
  ["tech-mining"],
);

// A swept element whose id has no catalog entry is skipped, so the mapped techs
// after it are still collected.
techSweep.length = 0;
context = makeContext({ settings: { prioritizeQueue: [] } });
context.techIds["tech-mining"] = makeTarget("tech-mining");
techSweep.push({ id: "tech-vanished" }, { id: "tech-mining" });
updatePriorityTargets();
assert.deepEqual(
  context.state.unlockedTechs.map((t) => t.id),
  ["tech-mining"],
);

// The fake Embassy/Eden/Ignition triggers are skipped when their buildings are
// absent from the registry rather than aborting the trigger pass.
techSweep.length = 0;
context = makeContext({
  settings: { prioritizeQueue: [], autoTrigger: true },
});
delete context.buildings.GorddonEmbassy;
delete context.buildings.TauStarEden;
delete context.buildings.TauGas2MatrioshkaBrain;
delete context.buildings.TauGas2IgniteGasGiant;
updatePriorityTargets();
assert.deepEqual(context.state.triggerTargets, []);
assert.deepEqual(context.state.conflictTargets, []);

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
