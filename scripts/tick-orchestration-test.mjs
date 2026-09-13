import assert from "node:assert/strict";

import {
  shouldStartTick,
  advanceScriptTick,
  effectiveTickRate,
  isThrottledTick,
  advancePeriodGate,
  advanceStateLog,
} from "../src/domain/tick.ts";
import {
  readPeriodsPerScriptCycle,
  readScriptCyclesPerSecond,
} from "../src/adapters/evolve/captured-tick-rate.ts";
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

// The period gate counts game periods towards one working cycle.
assert.deepEqual(
  advancePeriodGate({
    pendingPeriods: 2,
    completedPeriods: 1,
    periodsPerCycle: 4,
  }),
  { run: false, pendingPeriods: 3 },
);
assert.deepEqual(
  advancePeriodGate({
    pendingPeriods: 3,
    completedPeriods: 1,
    periodsPerCycle: 4,
  }),
  { run: true, pendingPeriods: 0 },
);
// A drift batch counts whole; the periods past this cycle carry into the next one.
assert.deepEqual(
  advancePeriodGate({
    pendingPeriods: 1,
    completedPeriods: 6,
    periodsPerCycle: 4,
  }),
  { run: true, pendingPeriods: 3 },
);
// A rate of one period never carries anything, and a nonsense batch size cannot lose the count.
assert.deepEqual(
  advancePeriodGate({
    pendingPeriods: 0,
    completedPeriods: 1,
    periodsPerCycle: 1,
  }),
  { run: true, pendingPeriods: 0 },
);
assert.deepEqual(
  advancePeriodGate({
    pendingPeriods: 2,
    completedPeriods: -5,
    periodsPerCycle: 4,
  }),
  { run: false, pendingPeriods: 2 },
);

// The single owner of the cycle's length in game periods, shared by the gate and by every feature
// that converts a per-second game rate into a per-cycle amount.
assert.equal(readPeriodsPerScriptCycle({ tickRate: 4 }), 4);
assert.equal(readScriptCyclesPerSecond({ tickRate: 4 }), 1);
assert.equal(readScriptCyclesPerSecond({ tickRate: 1 }), 4);
// An unset rate takes the script's own default rather than running every period.
assert.equal(readPeriodsPerScriptCycle({}), 4);
assert.equal(readPeriodsPerScriptCycle(undefined), 4);
// The script cannot act more often than the game wakes it, whatever the setting says, and it never
// stops acting because the setting is nonsense.
assert.equal(readPeriodsPerScriptCycle({ tickRate: 0 }), 1);
assert.equal(readPeriodsPerScriptCycle({ tickRate: -10 }), 1);
assert.equal(readPeriodsPerScriptCycle({ tickRate: 0.5 }), 1);
assert.equal(readPeriodsPerScriptCycle({ tickRate: "slower" }), 4);
// The normalizer's own range still applies.
assert.equal(readPeriodsPerScriptCycle({ tickRate: 1000 }), 240);
assert.equal(readPeriodsPerScriptCycle({ tickRate: 5.3 }), 5.5);

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
  }),
  sampleAutomation: () => ({ masterScriptToggle: false, goal: "Standard" }),
};
const diagnosticControls = {
  markGameTickConsumed() {},
  setScriptTick() {},
  updateScriptData() {},
  updateOverrides() {},
  finalizeScriptData() {},
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
  "updateState",
  "updateUI",
  "tick",
  "flush",
]);

console.log("Tick orchestration slice tests passed");
