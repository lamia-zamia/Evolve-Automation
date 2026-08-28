import assert from "node:assert/strict";

import {
  consumePeriodGate,
  initialPeriodGateState,
  pulsePeriodGate,
} from "../src/domain/period-gate.ts";
import { createPeriodGate } from "../src/adapters/browser/period-gate.ts";

// --- Pure domain unit tests ---------------------------------------------------------------------

// One open read per `rate` periods, and the open one is the period the counter wraps on.
let state = initialPeriodGateState;
const opened = [];
for (let period = 0; period < 8; period++) {
  state = pulsePeriodGate(state, 4);
  const consumed = consumePeriodGate(state);
  state = consumed.state;
  opened.push(consumed.exposed);
}
assert.deepEqual(opened, [
  false,
  false,
  false,
  true,
  false,
  false,
  false,
  true,
]);

// A closed read is consumed once: a second read in the same period sees the player's value, which
// is what keeps the autosave and the script's own forced refreshes out of the gate.
state = pulsePeriodGate(initialPeriodGateState, 4);
assert.equal(state.closed, true);
const first = consumePeriodGate(state);
assert.equal(first.exposed, false);
assert.equal(consumePeriodGate(first.state).exposed, true);

// A read with no pulse behind it fails open, so a pulse that stops cannot leave the game's debug
// data - and with it the script's only wake-up - switched off.
assert.equal(consumePeriodGate(initialPeriodGateState).exposed, true);

// Rates that gate nothing reset to the open state rather than closing reads.
for (const rate of [0, 1, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.deepEqual(pulsePeriodGate({ period: 2, closed: true }, rate), {
    period: 0,
    closed: false,
  });
}

// --- Adapter contract tests --------------------------------------------------------------------

// A stand-in for the live game surface: `settings` and the resource are reactive accessors, as Vue
// leaves them, so the adapter has to delegate rather than replace to keep them working.
function makeGame({ expose = true, rate = 1, max = 100 } = {}) {
  const writes = [];
  const settings = { civTabs: 3 };
  let exposeValue = expose;
  Object.defineProperty(settings, "expose", {
    configurable: true,
    enumerable: true,
    get: () => exposeValue,
    set: (value) => {
      writes.push(value);
      exposeValue = value;
    },
  });
  const resource = { rate, max };
  let diffValue = 0;
  Object.defineProperty(resource, "diff", {
    configurable: true,
    enumerable: true,
    get: () => diffValue,
    set: (value) => {
      diffValue = value;
    },
  });
  const views = { resMoney: { $data: resource } };
  const gate = createPeriodGate({
    getMainVue: () => ({ s: settings }),
    getVueById: (id) => views[id],
  });
  // One game period: the rate update writes `diff`, then the loop reads `expose` to decide whether
  // to clone. Returns what that read answered.
  const period = () => {
    resource.diff = 1;
    return settings.expose;
  };
  return {
    gate,
    settings,
    resource,
    views,
    writes,
    period,
    raw: () => exposeValue,
  };
}

const live = makeGame();
assert.equal(live.gate.sync(4), true);
assert.deepEqual(
  [live.period(), live.period(), live.period(), live.period(), live.period()],
  [false, false, false, true, false],
);
// The stored value is never written, so the player's debug setting survives untouched.
assert.deepEqual(live.writes, []);
assert.equal(live.raw(), true);
// The pulse still reaches the underlying resource.
assert.equal(live.resource.diff, 1);

// The save records the player's value, not a gated answer, even mid-skip.
live.resource.diff = 1;
assert.equal(JSON.parse(JSON.stringify(live.settings)).expose, true);
// Reading through the save guard does not consume the pending close.
assert.equal(live.settings.expose, false);

// `toJSON` stays out of enumeration, so it never reaches the save as a key of its own.
assert.deepEqual(Object.keys(live.settings), ["civTabs", "expose"]);

// Writes still reach the underlying reactive setter.
live.settings.expose = true;
assert.deepEqual(live.writes, [true]);

// Removing the gate restores both descriptors and the game's own behaviour.
assert.equal(live.gate.sync(0), false);
assert.equal(live.period(), true);
assert.equal(live.period(), true);
assert.equal(
  Object.prototype.hasOwnProperty.call(live.settings, "toJSON"),
  false,
);

// A player with debug mode off is never gated into having it on.
const off = makeGame({ expose: false });
assert.equal(off.gate.sync(4), true);
assert.deepEqual([off.period(), off.period()], [false, false]);
assert.equal(off.raw(), false);

// The game skips its rate update for a resource that would never pulse, so such a resource is not
// eligible and, with no eligible candidate, the gate declines to install.
const stalled = makeGame({ rate: 0, max: 100 });
assert.equal(stalled.gate.sync(4), false);
assert.equal(stalled.period(), true);
// An uncapped resource is updated even at rate 0.
const uncapped = makeGame({ rate: 0, max: -1 });
assert.equal(uncapped.gate.sync(4), true);

// A missing live surface declines rather than throwing.
const blind = createPeriodGate({
  getMainVue: () => undefined,
  getVueById: () => undefined,
});
assert.equal(blind.sync(4), false);
assert.equal(
  createPeriodGate({
    getMainVue: () => ({ s: { expose: true } }),
    getVueById: () => undefined,
  }).sync(4),
  false,
);

// A prestige replaces the live resource object, leaving the wrap on a detached one. The next
// working tick sees no pulse since the last, and rebuilds the gate around the new object.
const reset = makeGame();
assert.equal(reset.gate.sync(4), true);
for (let period = 0; period < 4; period++) reset.period();
assert.equal(reset.gate.sync(4), true);
const replacement = { rate: 1, max: 100, diff: 0 };
reset.views.resMoney = { $data: replacement };
// No pulses reached the gate between these two syncs, so it reinstalls.
assert.equal(reset.gate.sync(4), true);
replacement.diff = 1;
assert.equal(reset.settings.expose, false);

console.log("Period gate slice tests passed");
