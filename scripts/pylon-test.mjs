import assert from "node:assert/strict";

import {
  createPylonCommandExecutor,
  readPylonInput,
} from "../src/adapters/evolve/economy/production/pylon.ts";

// Adapter: legacy refreshes getters before initIndustry, but does not inspect
// the returned values when the industry is unavailable.
{
  const getterCalls = [];
  const input = readPylonInput({
    getRitualManager: () => ({ initIndustry: () => false }),
    getResources: () => (getterCalls.push("resources"), null),
    getSettings: () => (getterCalls.push("settings"), null),
    getGame: () => (getterCalls.push("game"), null),
    getJobs: () => (getterCalls.push("jobs"), null),
    haveTech: () => false,
  });
  assert.equal(input.initialised, false);
  assert.deepEqual(input.spells, []);
  assert.deepEqual(getterCalls, ["resources", "settings", "game", "jobs"]);
}

// Unsafe ritual mode and a locked Factory do not require either job entry or
// the roguemagic tech probe.
{
  let techCalls = 0;
  const input = readPylonInput({
    getRitualManager: () => ({
      Productions: {
        Factory: {
          id: "factory",
          weighting: 1,
          isUnlocked: () => false,
        },
        Farmer: {
          id: "farmer",
          weighting: 1,
          isUnlocked: () => true,
        },
      },
      initIndustry: () => true,
      currentSpells: () => 0,
    }),
    getResources: () => ({ Mana: { rateOfChange: 1, storageRatio: 1 } }),
    getSettings: () => ({
      productionRitualManaUse: 0.5,
      productionRitualSafe: false,
    }),
    getGame: () => null,
    getJobs: () => null,
    haveTech: () => (techCalls++, false),
  });
  assert.equal(input.priestCount, 0);
  assert.equal(input.cementWorkerCount, 0);
  assert.equal(techCalls, 0);
}

{
  const mutations = [];
  const result = createPylonCommandExecutor(() => ({
    Productions: { Science: { id: "science" } },
    currentSpells: () => 2,
    decreaseRitual: (...args) => mutations.push(["decrease", ...args]),
    increaseRitual: (...args) => mutations.push(["increase", ...args]),
  })).execute({
    decrease: [],
    increase: [{ id: "science", expectedCurrentSpells: 1, count: 1 }],
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(mutations, []);
}

console.log("Pylon automation reader, planner, and adapter tests passed");
