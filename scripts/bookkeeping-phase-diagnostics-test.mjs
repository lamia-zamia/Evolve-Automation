import assert from "node:assert/strict";
import { runStateUpdate } from "../src/application/state-update.ts";
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

const noop = () => {};
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
  "updateUI.readScrollTop",
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
updateUI();
assert.deepEqual(measured(), []);

console.log("Bookkeeping phase diagnostics tests passed");
