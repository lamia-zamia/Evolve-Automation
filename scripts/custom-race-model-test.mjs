import assert from "node:assert/strict";

import { createCustomRaceModel } from "../src/game/custom-race-model.ts";

const makeGame = (extinctionLevel) => ({
  global: {
    stats: {
      achieve: {
        ascended: {},
        technophobe: { l: 0 },
        extinct_human: { l: extinctionLevel },
      },
    },
    race: { species: "human", universe: "standard" },
    civic: { govern: { type: "democracy" } },
    custom: {},
  },
  traits: {
    positive: {
      val: 2,
      taxonomy: "body",
      origin: "human",
      type: "major",
      name: "Positive",
      vars: (rank) => [rank],
      desc: "fallback",
    },
  },
  races: {
    human: { type: "humanoid", name: "Human", traits: { positive: 1 } },
  },
  actions: {
    city: {
      coal_power: { powered: () => 0 },
      oil_power: { powered: () => 0 },
    },
  },
  loc: (id) => id,
});
let game = makeGame(3);
let labels = "first";
const model = createCustomRaceModel({
  getGame: () => game,
  getPoly: () => ({
    genus_traits: { humanoid: {} },
    loc: (id, vars = []) => `${labels}:${id}:${vars.join("|")}`,
  }),
  getResources: () => ({
    Lumber: { name: "Lumber" },
    Plywood: { name: "Plywood" },
    Furs: { name: "Furs" },
    Soul_Gem: { name: "Soul Gem" },
  }),
  getRaces: () => ({ human: { genus: "humanoid" } }),
  genusOpposition: { humanoid: ["fungi"] },
});

assert.deepEqual(model.customRaceRankOptions("positive"), [0.5, 1, 2]);
assert.equal(
  model.customRaceTraitEffect("positive", 2),
  "first:wiki_trait_effect_positive:2",
);

game = makeGame(5);
labels = "replacement";
assert.deepEqual(
  model.customRaceRankOptions("positive"),
  [0.1, 0.25, 0.5, 1, 2, 3, 4],
);
assert.equal(
  model.customRaceTraitEffect("positive", 3),
  "replacement:wiki_trait_effect_positive:3",
);

console.log("Custom race model module tests passed");
