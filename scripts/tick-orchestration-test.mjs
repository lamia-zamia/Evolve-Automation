import assert from "node:assert/strict";

import {
  shouldStartTick,
  advanceScriptTick,
  effectiveTickRate,
  isThrottledTick,
  advanceStateLog,
} from "../src/domain/tick.ts";
import { createTickReader } from "../src/adapters/evolve/tick.ts";
import { runTick } from "../src/application/tick.ts";
// --- Pure domain unit tests ---------------------------------------------------------------------

assert.equal(
  shouldStartTick({ goal: "Standard", forcedUpdate: false, gameTicked: true }),
  true,
);
assert.equal(
  shouldStartTick({
    goal: "GameOverMan",
    forcedUpdate: false,
    gameTicked: true,
  }),
  false,
);
assert.equal(
  shouldStartTick({ goal: "Standard", forcedUpdate: true, gameTicked: true }),
  false,
);
assert.equal(
  shouldStartTick({ goal: "Standard", forcedUpdate: false, gameTicked: false }),
  false,
);

assert.equal(advanceScriptTick(0), 1);
assert.equal(advanceScriptTick(41), 42);
assert.equal(advanceScriptTick(Number.MAX_SAFE_INTEGER), 1);

assert.equal(effectiveTickRate(3, false), 3);
assert.equal(effectiveTickRate(3, true), 6);

assert.equal(isThrottledTick(3, 3, false), false);
assert.equal(isThrottledTick(4, 3, false), true);
assert.equal(isThrottledTick(3, 3, true), true); // divisor doubled to 6
assert.equal(isThrottledTick(6, 3, true), false);

assert.deepEqual(advanceStateLog(0, 2), { next: 1, record: false });
assert.deepEqual(advanceStateLog(1, 2), { next: 2, record: true });

// --- Adapter contract tests ---------------------------------------------------------------------

function makeReader(overrides = {}) {
  return createTickReader({
    getSettings: () =>
      overrides.settings ?? { tickRate: 2, stateLogInterval: 5 },
    getState: () =>
      overrides.state ?? { goal: "Standard", scriptTick: 4, gameTicked: true },
    getGame: () =>
      overrides.game ?? {
        global: { race: {}, settings: {} },
      },
  });
}

const preamble = makeReader().samplePreamble();
assert.equal(preamble.goal, "Standard");
assert.equal(preamble.gameTicked, true);
assert.equal(preamble.scriptTick, 4);
assert.equal(preamble.tickRate, 2);
assert.equal(preamble.accelerated, false);
assert.equal(preamble.exposeGating, false);
assert.equal(
  makeReader({
    settings: { tickRate: 2, exposeGating: 1 },
  }).samplePreamble().exposeGating,
  true,
);

// Lenient coercions: non-string goal -> "", truthy accelerated flag, boolean gating fields.
const odd = makeReader({
  state: { goal: 7, scriptTick: 9, gameTicked: 1, forcedUpdate: 0 },
  game: { global: { race: {}, settings: { at: "yes" } } },
}).samplePreamble();
assert.equal(odd.goal, "");
assert.equal(odd.scriptTick, 9);
assert.equal(odd.gameTicked, true);
assert.equal(odd.forcedUpdate, false);
assert.equal(odd.accelerated, true);

// The script owns its tick counter and initializes it, so a non-number is a defect, not a value.
assert.throws(
  () => makeReader({ state: { goal: "Standard" } }).samplePreamble(),
  /state\.scriptTick must be a finite number, got undefined/,
);
assert.throws(
  () =>
    makeReader({
      state: { goal: "Standard", scriptTick: "9" },
    }).samplePreamble(),
  /state\.scriptTick must be a finite number, got string "9"/,
);

// Settings restored from storage or an imported file stay lenient: a numeric string still reads.
assert.equal(
  makeReader({ settings: { tickRate: "2" } }).samplePreamble().tickRate,
  2,
);
assert.ok(
  Number.isNaN(makeReader({ settings: {} }).samplePreamble().tickRate),
  "an absent tickRate coerces to NaN instead of throwing",
);

const automation = makeReader({
  settings: {
    masterScriptToggle: 1,
    autoBuild: true,
    autoFight: 0,
    stateLogInterval: "3",
  },
  state: { goal: "Standard" },
  game: { global: { race: { truepath: 1 }, settings: {} } },
}).sampleAutomation();
assert.equal(automation.masterScriptToggle, true);
assert.equal(automation.autoBuild, true);
assert.equal(automation.autoFight, false);
assert.equal(automation.truepath, true);
assert.equal(automation.stateLogInterval, 3);
// An absent state-log counter defaults to 0 (legacy `?? 0`).
assert.equal(automation.stateLogTick, 0);

// Malformed game/state containers are rejected.
assert.throws(() =>
  createTickReader({
    getSettings: () => ({}),
    getState: () => null,
    getGame: () => ({ global: { race: {}, settings: {} } }),
  }).samplePreamble(),
);

// Opt-in diagnostics measure a working tick, while the default path remains untouched.
const measuredPhases = [];
let diagnosticClock = 0;
const diagnosticReader = {
  samplePreamble: () => ({
    goal: "Standard",
    forcedUpdate: false,
    gameTicked: true,
    scriptTick: 0,
    tickRate: 1,
    accelerated: false,
    exposeGating: false,
  }),
  sampleAutomation: () => ({ masterScriptToggle: false, goal: "Standard" }),
};
const diagnosticControls = {
  markGameTickConsumed() {},
  syncPeriodGate: () => false,
  setScriptTick() {},
  updateScriptData() {},
  updateOverrides() {},
  finalizeScriptData() {},
  updateTabs: () => false,
  updateState() {},
  updateUI() {},
  keyManagerReset() {},
};
const diagnostics = {
  readPerformanceEnabled: () => true,
  nowMs: () => diagnosticClock++,
  recordPerformance: (phase) => measuredPhases.push(phase),
  recordCount: () => {},
  flushPerformance: () => measuredPhases.push("flush"),
};
assert.equal(
  runTick({
    reader: diagnosticReader,
    controls: diagnosticControls,
    diagnostics,
  }),
  true,
);
assert.deepEqual(measuredPhases, [
  "updateScriptData",
  "updateOverrides",
  "finalizeScriptData",
  "updateTabs",
  "updateState",
  "updateUI",
  "tick",
  "flush",
]);

// The period gate takes over throttling: the tick hands it the effective rate and stops applying
// its own, so a script tick that the rate would have skipped still does work.
const gateRates = [];
function runGatedTick({
  exposeGating,
  gated,
  scriptTick,
  tickRate,
  accelerated,
}) {
  let worked = false;
  const result = runTick({
    reader: {
      samplePreamble: () => ({
        goal: "Standard",
        forcedUpdate: false,
        gameTicked: true,
        scriptTick,
        tickRate,
        accelerated,
        exposeGating,
      }),
      sampleAutomation: () => ({ masterScriptToggle: false, goal: "Standard" }),
    },
    controls: {
      markGameTickConsumed() {},
      setScriptTick() {},
      syncPeriodGate: (rate) => {
        gateRates.push(rate);
        return gated;
      },
      updateScriptData() {
        worked = true;
      },
      updateOverrides() {},
      finalizeScriptData() {},
      updateTabs: () => false,
      updateState() {},
      updateUI() {},
      keyManagerReset() {},
    },
  });
  return { result, worked };
}

// Gate off: the rate handed over is 0 and the tick throttles itself as before.
assert.deepEqual(
  runGatedTick({
    exposeGating: false,
    gated: false,
    scriptTick: 2,
    tickRate: 4,
    accelerated: false,
  }),
  { result: false, worked: false },
);
// Gate on: the rate is the effective one, and the tick no longer throttles.
assert.deepEqual(
  runGatedTick({
    exposeGating: true,
    gated: true,
    scriptTick: 2,
    tickRate: 4,
    accelerated: false,
  }),
  { result: true, worked: true },
);
// Requested but not installed - a live surface the gate could not reach - falls back to the throttle.
assert.deepEqual(
  runGatedTick({
    exposeGating: true,
    gated: false,
    scriptTick: 2,
    tickRate: 4,
    accelerated: false,
  }),
  { result: false, worked: false },
);
// Accelerated time doubles the periods a working tick covers.
assert.deepEqual(
  runGatedTick({
    exposeGating: true,
    gated: true,
    scriptTick: 8,
    tickRate: 4,
    accelerated: true,
  }),
  { result: true, worked: true },
);
assert.deepEqual(gateRates, [0, 4, 4, 8]);

console.log("Tick orchestration slice tests passed");
