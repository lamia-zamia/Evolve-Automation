import assert from "node:assert/strict";

import { createPlanetSettingsEvolveAdapter } from "../src/adapters/evolve/planet-settings.ts";

const game = {
  loc(key) {
    assert.equal(this, game);
    return `localized:${key}`;
  },
};

const adapter = createPlanetSettingsEvolveAdapter({
  getGame: () => game,
  getBiomeList: () => ["grassland", "oceanic"],
  getTraitList: () => ["none", "toxic"],
  getExtraList: () => ["Achievement"],
});
const readModel = adapter.readPlanetSettingsReadModel();

assert.equal(readModel.rows.length, 2);
assert.deepEqual(readModel.rows[0], {
  biome: {
    label: "localized:biome_grassland_name",
    settingName: "biome_w_grassland",
  },
  trait: { label: "None", settingName: "trait_w_none" },
  extra: { label: "Achievement", settingName: "extra_w_Achievement" },
});
assert.deepEqual(readModel.rows[1], {
  biome: {
    label: "localized:biome_oceanic_name",
    settingName: "biome_w_oceanic",
  },
  trait: { label: "localized:planet_toxic", settingName: "trait_w_toxic" },
});
assert.ok(Object.isFrozen(readModel));
assert.ok(Object.isFrozen(readModel.rows));
assert.ok(Object.isFrozen(readModel.rows[0]));

assert.throws(
  () =>
    createPlanetSettingsEvolveAdapter({
      getGame: () => ({}),
      getBiomeList: () => [],
      getTraitList: () => [],
      getExtraList: () => [],
    }).readPlanetSettingsReadModel(),
  /game\.loc must be a function/,
);
assert.throws(
  () =>
    createPlanetSettingsEvolveAdapter({
      getGame: () => game,
      getBiomeList: () => "grassland",
      getTraitList: () => [],
      getExtraList: () => [],
    }).readPlanetSettingsReadModel(),
  /biomeList must be an array/,
);
assert.throws(
  () =>
    createPlanetSettingsEvolveAdapter({
      getGame: () => game,
      getBiomeList: () => [42],
      getTraitList: () => [],
      getExtraList: () => [],
    }).readPlanetSettingsReadModel(),
  /biomeList\[0\] must be a string/,
);

console.log("Planet settings Evolve adapter contract tests passed");
