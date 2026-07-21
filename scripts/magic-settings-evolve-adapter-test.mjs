import assert from "node:assert/strict";

import { createMagicSettingsEvolveAdapter } from "../src/adapters/evolve/magic-settings.ts";

const context = {
  game: {
    loc(key) {
      return `localized:${key}`;
    },
  },
  AlchemyManager: {
    priorityList: [
      { id: "Iron", name: "Iron", tier: 1 },
      { id: "Steel", name: "Steel", tier: 2 },
    ],
    transmuteTier(resource) {
      return resource.tier;
    },
  },
  RitualManager: {
    Productions: {
      Farmer: { id: "farmer" },
      Science: { id: "science" },
    },
  },
};
const adapter = createMagicSettingsEvolveAdapter({
  getGame: () => context.game,
  getAlchemyManager: () => context.AlchemyManager,
  getRitualManager: () => context.RitualManager,
});

const readModel = adapter.readMagicSettingsReadModel();
assert.deepEqual(
  readModel.alchemyControls.map((control) => control.kind),
  ["heading", "number", "toggle"],
);
assert.deepEqual(
  readModel.pylonControls.map((control) => control.kind),
  ["heading", "number", "toggle"],
);
assert.deepEqual(readModel.alchemyRows, [
  {
    id: "Iron",
    label: "Iron",
    color: "has-text-info",
    enabledSettingName: "res_alchemy_Iron",
    weightingSettingName: "res_alchemy_w_Iron",
  },
  {
    id: "Steel",
    label: "Steel",
    color: "has-text-advanced",
    enabledSettingName: "res_alchemy_Steel",
    weightingSettingName: "res_alchemy_w_Steel",
  },
]);
assert.deepEqual(readModel.pylonRows, [
  {
    id: "farmer",
    label: "localized:modal_pylon_spell_farmer",
    weightingSettingName: "spell_w_farmer",
  },
  {
    id: "science",
    label: "localized:modal_pylon_spell_science",
    weightingSettingName: "spell_w_science",
  },
]);
assert.equal(Object.isFrozen(readModel), true);
assert.equal(Object.isFrozen(readModel.alchemyRows), true);
assert.equal(Object.isFrozen(readModel.pylonRows), true);

assert.throws(
  () =>
    createMagicSettingsEvolveAdapter({
      getGame: () => context.game,
      getAlchemyManager: () => ({ priorityList: {} }),
      getRitualManager: () => context.RitualManager,
    }).readMagicSettingsReadModel(),
  /priorityList must be an array/,
);
assert.throws(
  () =>
    createMagicSettingsEvolveAdapter({
      getGame: () => context.game,
      getAlchemyManager: () => ({
        priorityList: [{ id: "Iron", name: "Iron" }],
        transmuteTier: () => "bad",
      }),
      getRitualManager: () => context.RitualManager,
    }).readMagicSettingsReadModel(),
  /transmuteTier result must be a finite number/,
);
assert.throws(
  () =>
    createMagicSettingsEvolveAdapter({
      getGame: () => context.game,
      getAlchemyManager: () => context.AlchemyManager,
      getRitualManager: () => ({ Productions: { Farmer: {} } }),
    }).readMagicSettingsReadModel(),
  /RitualManager\.Productions\.Farmer\.id must be a string/,
);

console.log("Magic settings Evolve adapter tests passed");
