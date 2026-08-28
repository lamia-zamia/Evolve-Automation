import assert from "node:assert/strict";
import { createApplicationRunner } from "../src/application/application-runner.ts";

const calls = [];
const reader = {
  samplePreamble: () => ({
    goal: "GameOverMan",
    forcedUpdate: false,
    gameTicked: true,
    scriptTick: 0,
    tickRate: 1,
    accelerated: false,
  }),
  sampleAutomation: () => {
    throw new Error("automation snapshot should not be sampled");
  },
};
const controls = {
  markGameTickConsumed: () => calls.push("consume"),
  syncPeriodGate: () => false,
  setScriptTick: () => calls.push("script-tick"),
  setPlannerFreshTick: () => calls.push("planner-fresh"),
  setStateLogTick: () => calls.push("state-log"),
  recordSoulGem: () => calls.push("soul-gem"),
  updateScriptData: () => calls.push("script-data"),
  updateOverrides: () => calls.push("overrides"),
  finalizeScriptData: () => calls.push("finalize"),
  updateTabs: () => false,
  updateState: () => calls.push("legacy-update-state"),
  updateUI: () => calls.push("ui"),
  keyManagerReset: () => calls.push("key-reset"),
  keyManagerFinish: () => calls.push("key-finish"),
};
const runner = createApplicationRunner({
  reader,
  controls,
  updateState: () => calls.push("application-update-state"),
});

assert.equal(runner.runCycle(), false);
assert.deepEqual(calls, []);
console.log("Application runner tests passed");
