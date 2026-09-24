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
assert.equal(advanceScriptTick(0), 1);
assert.equal(advanceScriptTick(Number.MAX_SAFE_INTEGER), 1);
assert.equal(effectiveTickRate(3, true), 6);
assert.equal(isThrottledTick(4, 3, false), true);
assert.deepEqual(advanceStateLog(1, 2), { next: 2, record: true });
assert.deepEqual(
  advancePeriodGate({
    pendingPeriods: 1,
    completedPeriods: 6,
    periodsPerCycle: 4,
  }),
  { run: true, pendingPeriods: 3 },
);

assert.equal(readPeriodsPerScriptCycle({ tickRate: 4 }), 4);
assert.equal(readScriptCyclesPerSecond({ tickRate: 4 }), 1);
assert.equal(readScriptCyclesPerSecond({ tickRate: 1 }), 4);
assert.equal(readPeriodsPerScriptCycle(undefined), 4);
assert.equal(readPeriodsPerScriptCycle({ tickRate: 0 }), 1);
assert.equal(readPeriodsPerScriptCycle({ tickRate: "slower" }), 4);
assert.equal(readPeriodsPerScriptCycle({ tickRate: 1000 }), 240);

console.log("Tick domain and captured-rate tests passed");
