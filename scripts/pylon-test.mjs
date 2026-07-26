import assert from "node:assert/strict";

import {
  createPylonCommandExecutor,
  readPylonInput,
} from "../src/adapters/evolve/economy/production/pylon.ts";
import { planPylon } from "../src/domain/economy/production/pylon.ts";

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
  const resources = { Mana: { rateOfChange: 0.0025 } };
  const decision = planPylon({
    initialised: true,
    manaRateOfChange: 0.0025,
    manaStorageRatio: 1,
    ritualManaUse: 0.5,
    ritualSafe: false,
    witchHunter: false,
    priestCount: 0,
    haveRoguemagic4: false,
    cementWorkerCount: 0,
    spells: [
      { id: "science", weighting: 1, isFactory: false, currentSpells: 0 },
    ],
  });
  assert.deepEqual(decision.manaRateAdjustment, {
    expected: 0.0025,
    value: 0,
  });
  const result = createPylonCommandExecutor(
    () => ({
      Productions: { Science: { id: "science" } },
      currentSpells: () => 0,
      decreaseRitual: (...args) => mutations.push(["decrease", ...args]),
      increaseRitual: (...args) => mutations.push(["increase", ...args]),
    }),
    () => resources,
  ).execute(decision);
  assert.equal(result.status, "succeeded");
  assert.equal(resources.Mana.rateOfChange, 0);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0][0], "increase");
  assert.equal(mutations[0][2], 1);
}

{
  const mutations = [];
  const result = createPylonCommandExecutor(
    () => ({
      Productions: { Science: { id: "science" } },
      currentSpells: () => 2,
      decreaseRitual: (...args) => mutations.push(["decrease", ...args]),
      increaseRitual: (...args) => mutations.push(["increase", ...args]),
    }),
    () => ({ Mana: { rateOfChange: 0.0025 } }),
  ).execute({
    manaRateAdjustment: null,
    decrease: [],
    increase: [{ id: "science", expectedCurrentSpells: 1, count: 1 }],
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(mutations, []);
}

{
  const resources = { Mana: { rateOfChange: 0.01 } };
  const result = createPylonCommandExecutor(
    () => ({
      Productions: { Science: { id: "science" } },
      currentSpells: () => 0,
      decreaseRitual: () => assert.fail("stale plan mutated rituals"),
      increaseRitual: () => assert.fail("stale plan mutated rituals"),
    }),
    () => resources,
  ).execute({
    manaRateAdjustment: { expected: 0.0025, value: 0 },
    decrease: [],
    increase: [],
  });
  assert.equal(result.status, "stale");
  assert.equal(resources.Mana.rateOfChange, 0.01);
}

console.log("Pylon automation reader, planner, and adapter tests passed");
