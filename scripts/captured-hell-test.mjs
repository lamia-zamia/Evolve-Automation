import assert from "node:assert/strict";

import { createCapturedHellAutomation } from "../src/adapters/evolve/combat/captured-hell.ts";

function makeRoot({ enemies = 1, minions = 1500, warlord = true } = {}) {
  return {
    race: { warlord },
    portal: {
      minions: { spawns: minions },
      throne: { enemy: Array.from({ length: enemies }, () => ({ f: 100 })) },
    },
  };
}

function makeControls(invoked, available = true) {
  return {
    resolve: (elementId) =>
      available && elementId === "fort"
        ? { elementId, generation: 1, methods: ["attack"] }
        : undefined,
    invoke: (_handle, method, args) => {
      invoked.push({ method, args });
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => (available ? ["fort"] : []),
  };
}

// A configured Warlord attacks the first captured enemy fortress.
{
  const root = makeRoot();
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    readSettings: () => ({
      warlordHandleFortress: true,
      warlordMinimumMinions: 1000,
    }),
  });
  assert.deepEqual(automation.run(), { status: "succeeded" });
  assert.deepEqual(invoked, [{ method: "attack", args: [0] }]);
}

// The minion threshold and the captured setting remain pure policy gates.
{
  const root = makeRoot({ minions: 1000 });
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    readSettings: () => ({
      warlordHandleFortress: true,
      warlordMinimumMinions: 1000,
    }),
  });
  assert.deepEqual(automation.run(), { status: "succeeded" });
  assert.deepEqual(invoked, []);
}

// The command becomes stale when the live fortress control is not captured.
{
  const root = makeRoot();
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([], false),
    readSettings: () => ({
      warlordHandleFortress: true,
      warlordMinimumMinions: 1000,
    }),
  });
  const outcome = automation.run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "hell-controls-unavailable");
}

// Non-Warlord Hell state is left alone until its direct calculation contract is ported.
{
  const root = makeRoot({ warlord: false });
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    readSettings: () => ({ warlordHandleFortress: true }),
  });
  assert.deepEqual(automation.run(), { status: "succeeded" });
  assert.deepEqual(invoked, []);
}

console.log("Captured Hell adapter tests passed");
