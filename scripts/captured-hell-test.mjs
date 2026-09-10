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

function makeControls(invoked, available = true, methods = ["attack"]) {
  return {
    resolve: (elementId) =>
      available && elementId === "fort"
        ? { elementId, generation: 1, methods }
        : undefined,
    invoke: (_handle, method, args) => {
      invoked.push({ method, args });
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => (available ? ["fort"] : []),
  };
}

function makeEvacuationRoot({
  assigned = 40,
  patrols = 2,
  patrolSize = 5,
} = {}) {
  return {
    race: { warlord: false },
    tech: { elysium: 0 },
    civic: { garrison: { workers: 100, max: 100, crew: 0 } },
    portal: {
      fortress: {
        garrison: 40,
        patrols,
        patrol_size: patrolSize,
        assigned,
      },
    },
    space: { fob: { troops: 0 } },
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

// When the captured counts show that Hell cannot be entered, evacuation uses only the upstream
// fortress controls; soldier-rating calculation remains intentionally unavailable below this gate.
{
  const root = makeEvacuationRoot();
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked, true, ["patSizeDec", "patDec", "aLast"]),
    readSettings: () => ({
      hellHomeGarrison: 10,
      hellMinSoldiers: 100,
      hellMinSoldiersPercent: 90,
      hellHandlePatrolSize: true,
    }),
  });
  assert.deepEqual(automation.run(), { status: "succeeded" });
  assert.deepEqual(
    Object.fromEntries(
      ["patSizeDec", "patDec", "aLast"].map((method) => [
        method,
        invoked.filter((entry) => entry.method === method).length,
      ]),
    ),
    { patSizeDec: 5, patDec: 2, aLast: 40 },
  );
}

// Once the gate allows entry, the adapter does not guess soldier ratings and reports a stale
// calculation until that direct query is captured.
{
  const root = makeEvacuationRoot({ assigned: 0, patrols: 0, patrolSize: 1 });
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([], true, ["aNext"]),
    readSettings: () => ({
      hellHomeGarrison: 10,
      hellMinSoldiers: 20,
      hellMinSoldiersPercent: 90,
    }),
  });
  const outcome = automation.run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "hell-calculation-unavailable");
}

console.log("Captured Hell adapter tests passed");
