import assert from "node:assert/strict";

import {
  ALCHEMY_CONTROL_PREFIX,
  createCapturedAlchemyAutomation,
} from "../src/adapters/evolve/economy/production/captured-alchemy.ts";

const root = {
  tech: { alchemy: 2 },
  race: { alchemy: { Iron: 0, Copper: 0 } },
  resource: {
    Mana: { amount: 100, max: 100, diff: 10 },
    Crystal: { amount: 10, max: 100, diff: 0 },
    Iron: { amount: 10, max: 100, diff: 0, display: true },
    Copper: { amount: 10, max: 100, diff: 0, display: true },
  },
};
const calls = [];
const controls = {
  capturedElementIds: () => ["alchemyIron", "alchemyCopper"],
  resolve: (elementId) =>
    elementId.startsWith(ALCHEMY_CONTROL_PREFIX)
      ? { elementId, generation: 1, methods: ["addSpell", "subSpell"] }
      : undefined,
  invoke: (handle, method, args) => {
    calls.push([handle.elementId, method, args]);
    const id = args[0];
    if (method === "addSpell") {
      root.race.alchemy[id] += 1;
      root.resource.Mana.diff -= 1;
    } else {
      root.race.alchemy[id] -= 1;
      root.resource.Mana.diff += 1;
    }
    return { ok: true, value: undefined };
  },
};
const automation = createCapturedAlchemyAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    autoPylon: false,
    magicAlchemyManaUse: 0.5,
    res_alchemy_Iron: true,
    res_alchemy_Copper: true,
    res_alchemy_w_Iron: 2,
    res_alchemy_w_Copper: 1,
  }),
});

assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(root.race.alchemy, { Iron: 6, Copper: 3 });
assert.equal(root.resource.Mana.diff, 1);
assert.equal(calls.length, 9);
assert.ok(calls.every(([elementId]) => elementId.startsWith("alchemy")));

// At capacity the bounded adapter treats a resource as not useful; it must not invent the
// legacy demand state that DeadSpace no longer exposes on resource objects.
root.resource.Iron.amount = 100;
root.resource.Copper.amount = 100;
assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(root.race.alchemy, { Iron: 0, Copper: 0 });
assert.equal(root.resource.Mana.diff, 10);
assert.equal(calls.length, 18);

console.log("Captured alchemy adapter and bounded policy tests passed");
