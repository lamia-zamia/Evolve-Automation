import assert from "node:assert/strict";

import {
  shouldStartTick,
  advanceScriptTick,
  isThrottledTick,
  advanceStateLog,
} from "../src/domain/tick.ts";
import { createTickReader } from "../src/adapters/evolve/tick.ts";
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

// Lenient coercions: non-string goal -> "", truthy accelerated flag, boolean gating fields.
const odd = makeReader({
  state: { goal: 7, scriptTick: "9", gameTicked: 1, forcedUpdate: 0 },
  game: { global: { race: {}, settings: { at: "yes" } } },
}).samplePreamble();
assert.equal(odd.goal, "");
assert.equal(odd.scriptTick, 9);
assert.equal(odd.gameTicked, true);
assert.equal(odd.forcedUpdate, false);
assert.equal(odd.accelerated, true);

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

console.log("Tick orchestration slice tests passed");
