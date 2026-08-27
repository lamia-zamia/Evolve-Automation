import assert from "node:assert/strict";
import { runStateUpdate } from "../src/application/state-update.ts";
import { createStateUpdateControls } from "../src/adapters/evolve/state-update.ts";
import { createScriptDataLifecycle } from "../src/game/script-data.ts";
import { createUIRefresh } from "../src/ui/ui-refresh.ts";

// The three bookkeeping passes were 26% of a work tick with no internal
// structure. Each now reports its own sub-phases, and reports none of them
// while diagnostics are off.

let enabled = true;
let clock = 0;
const phases = [];
const diagnostics = {
  readPerformanceEnabled: () => enabled,
  nowMs: () => ++clock,
  recordPerformance: (phase) => phases.push(phase),
  recordCount: () => {},
  flushPerformance: () => {},
};
const measured = () => {
  const seen = [...phases];
  phases.length = 0;
  return seen;
};

// ---------- updateScriptData ----------
const noop = () => {};
const { updateScriptData } = createScriptDataLifecycle({
  getSettings: () => ({}),
  getState: () => ({ globalProductionModifier: 0 }),
  getGame: () => ({ breakdown: { p: { Global: {}, consume: {} } } }),
  getResources: () => ({ Money: { updateData: noop } }),
  getBuildings: () => ({}),
  getWarManager: () => ({ updateGarrison: noop, updateHell: noop }),
  getMarketManager: () => ({ updateData: noop }),
  getBuildingManager: () => ({ updateBuildings: noop }),
  getSpyManager: () => ({ updateForeigns: noop }),
  getEjectManager: () => ({ updateResources: noop }),
  getSupplyManager: () => ({ updateResources: noop }),
  getNaniteManager: () => ({ updateResources: noop }),
  getRitualManager: () => ({
    Productions: {},
    initIndustry: () => false,
    spellCost: () => 0,
  }),
  getUpdateCraftCost: () => noop,
  getResourcesPerClick: () => () => 0,
  getTicksPerSecond: () => () => 1,
  getHaveTech: () => () => false,
  diagnostics,
});
updateScriptData();
assert.deepEqual(measured(), [
  "updateScriptData.war",
  "updateScriptData.resourceData",
  "updateScriptData.craftCost",
  "updateScriptData.market",
  "updateScriptData.updateBuildings",
  "updateScriptData.productionModifier",
]);

// ---------- updateState ----------
const stateControls = {
  checkEvolutionResult: () => true,
  setGoal: noop,
  rebuildTriggerContent: noop,
  resetResourceAccumulators: noop,
  applyStorageUnitValues: noop,
  runPlanningPasses: noop,
  resetTooltips: noop,
  applyMoneyWindow: noop,
  applyAstroSign: noop,
  applyTowerSize: noop,
  applyStabilise: noop,
  cacheSpaceDockOptions: noop,
  updateActiveTargets: noop,
};
runStateUpdate({
  reader: {
    sampleGoalTransition: () => ({
      species: "human",
      goal: "Standard",
      day: 2,
      slow: false,
      hyper: false,
      triggerCount: 0,
    }),
    sampleRefresh: () => ({
      moneyIncomes: [],
      moneyRate: 0,
      pillars: {},
      currentExotic: 0,
      lastExoticMass: 0,
    }),
  },
  controls: stateControls,
  clock: { nowMs: () => 0 },
  diagnostics,
});
assert.deepEqual(measured(), [
  "updateState.resetResourceAccumulators",
  "updateState.applyStorageUnitValues",
  "updateState.runPlanningPasses",
  "updateState.sampleRefresh",
  "updateState.cacheSpaceDockOptions",
  "updateState.updateActiveTargets",
]);

// The four planning passes keep their dependency order and each report
// separately, so the 1.68 ms updateState figure can be attributed.
const planningOrder = [];
const record = (name) => () => planningOrder.push(name);
createStateUpdateControls({
  getState: () => ({}),
  getResources: () => ({}),
  getBuildings: () => ({}),
  getStorageManager: () => ({}),
  getPoly: () => ({}),
  checkEvolutionResult: () => true,
  updateTriggerSettingsContent: noop,
  updatePriorityTargets: record("priorityTargets"),
  updateProjects: record("projects"),
  calculateRequiredStorages: record("storages"),
  prioritizeDemandedResources: record("demand"),
  updateActiveTargets: noop,
  diagnostics,
}).runPlanningPasses();
assert.deepEqual(planningOrder, [
  "priorityTargets",
  "projects",
  "storages",
  "demand",
]);
assert.deepEqual(measured(), [
  "updateState.runPlanningPasses.updatePriorityTargets",
  "updateState.runPlanningPasses.updateProjects",
  "updateState.runPlanningPasses.calculateRequiredStorages",
  "updateState.runPlanningPasses.prioritizeDemandedResources",
]);

// ---------- updateUI ----------
let pageVisible = true;
const { updateUI } = createUIRefresh({
  getUiSurface: () => ({
    isPageVisible: () => pageVisible,
    readScrollTop: () => 0,
    resetScrollTop: noop,
  }),
  getActions: () => ({
    createOptionsModal: noop,
    updateOptionsUI: noop,
    updatePrestigeInTopBar: noop,
    updateTotalDaysInTopBar: noop,
  }),
  getPhases: () => ({
    ensureAutomationContainer: () => ({ scriptNode: null, created: false }),
    repairRuntimeAdapters: () => false,
    updateSoulGemRate: noop,
    renderPreviousGameStats: noop,
  }),
  diagnostics,
});
updateUI();
assert.deepEqual(measured(), [
  "updateUI.createOptionsModal",
  "updateUI.updateOptionsUI",
  "updateUI.updatePrestigeInTopBar",
  "updateUI.ensureAutomationContainer",
  "updateUI.repairRuntimeAdapters",
  "updateUI.updateSoulGemRate",
  "updateUI.renderPreviousGameStats",
  "updateUI.updateTotalDaysInTopBar",
]);

// A hidden tab still leaves updateUI early, before any sub-phase.
pageVisible = false;
updateUI();
assert.deepEqual(measured(), []);
pageVisible = true;

// ---------- disabled ----------
enabled = false;
updateScriptData();
updateUI();
assert.deepEqual(measured(), []);

console.log("Bookkeeping phase diagnostics tests passed");
