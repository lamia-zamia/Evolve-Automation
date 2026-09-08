import assert from "node:assert/strict";
import { createCapturedPylonAutomation } from "../src/adapters/evolve/economy/production/captured-pylon.ts";

function source(root) {
  return {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
}

function makeRoot() {
  return {
    race: {
      casting: {
        farmer: 0,
        miner: 0,
        lumberjack: 0,
        science: 0,
        factory: 0,
        army: 0,
        hunting: 0,
        crafting: 0,
        total: 0,
      },
    },
    tech: { magic: 4, roguemagic: 4 },
    civic: {
      priest: { workers: 0 },
      cement_worker: { workers: 1 },
    },
    resource: { Mana: { amount: 0, max: 100, diff: 0.02 } },
  };
}

function controlsFor(root, available = true) {
  const calls = [];
  const handle = {
    elementId: "iPylon",
    generation: 1,
    methods: ["addSpell", "subSpell"],
  };
  return {
    calls,
    controls: {
      resolve: (elementId) =>
        available && elementId === "iPylon" ? handle : undefined,
      invoke: (_handle, method, args = []) => {
        calls.push({ method, id: args[0] });
        const id = args[0];
        if (typeof id !== "string") return { ok: false, reason: "threw" };
        if (method === "addSpell") {
          root.race.casting[id] += 1;
          root.race.casting.total += 1;
        } else {
          root.race.casting[id] = Math.max(0, root.race.casting[id] - 1);
          root.race.casting.total = Math.max(0, root.race.casting.total - 1);
        }
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => (available ? ["iPylon"] : []),
    },
  };
}

const root = makeRoot();
const captured = controlsFor(root);
const automation = createCapturedPylonAutomation({
  rootState: source(root),
  controls: captured.controls,
  readSettings: () => ({
    productionRitualManaUse: 0.5,
    productionRitualSafe: true,
    spell_w_farmer: 1,
    spell_w_hunting: 10,
  }),
});

assert.equal(automation.run().status, "succeeded");
assert.ok(captured.calls.length > 0);
assert.ok(captured.calls.every((call) => call.method === "addSpell"));
assert.equal(root.race.casting.total, captured.calls.length);
assert.equal(root.resource.Mana.diff, 0.02);

const missing = createCapturedPylonAutomation({
  rootState: source(makeRoot()),
  controls: controlsFor(makeRoot(), false).controls,
  readSettings: () => ({}),
});
assert.equal(missing.run().status, "succeeded");

const malformed = makeRoot();
const malformedAutomation = createCapturedPylonAutomation({
  rootState: source(malformed),
  controls: controlsFor(malformed).controls,
  readSettings: () => ({ productionRitualManaUse: "bad" }),
});
assert.equal(malformedAutomation.run().status, "succeeded");
assert.equal(malformed.race.casting.total, 0);

console.log("captured-pylon ok");
