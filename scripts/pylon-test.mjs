import assert from "node:assert/strict";

import { createAutoPylon } from "../src/automation/economy/pylon.ts";

function runPylonCase({ initialized = true } = {}) {
  const actions = [];
  const farmer = { id: "farmer", weighting: 1, isUnlocked: () => true };
  const science = { id: "science", weighting: 2, isUnlocked: () => true };
  const factory = { id: "factory", weighting: 1, isUnlocked: () => false };
  const current = { farmer: 2, science: 0 };
  const RitualManager = {
    Productions: { Farmer: farmer, Science: science, Factory: factory },
    initIndustry: () => initialized,
    costStep: () => 1,
    currentSpells: (spell) => current[spell.id],
    decreaseRitual: (spell, count) =>
      actions.push(["decrease", spell.id, count]),
    increaseRitual: (spell, count) =>
      actions.push(["increase", spell.id, count]),
  };
  const autoPylon = createAutoPylon({
    RitualManager,
    getResources: () => ({ Mana: { rateOfChange: 3, storageRatio: 1 } }),
    getSettings: () => ({
      productionRitualManaUse: 0.5,
      productionRitualSafe: false,
    }),
    getGame: () => ({ global: { race: {} } }),
    getJobs: () => ({ Priest: { count: 0 }, CementWorker: { count: 1 } }),
    haveTech: () => false,
  });

  autoPylon();
  return actions;
}

assert.deepEqual(runPylonCase(), [
  ["decrease", "farmer", 1],
  ["increase", "science", 2],
]);
assert.deepEqual(
  runPylonCase({ initialized: false }),
  [],
  "an unavailable ritual industry must not be adjusted",
);

console.log("Pylon automation regression tests passed");
