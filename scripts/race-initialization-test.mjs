import assert from "node:assert/strict";
import { createRaceInitialization } from "../src/game/race-initialization.ts";

const pathActionIds = [
  "bunker",
  "warlord",
  "sentience",
  "bilateral_symmetry",
  "multicellular",
  "phagocytosis",
  "sexual_reproduction",
  "mammals",
  "humanoid",
  "endothermic",
  "eggshell",
  "bryophyte",
  "poikilohydric",
  "chloroplasts",
];

function makeContext(label, raceDefinitions) {
  class EvolutionAction {
    constructor(id) {
      this.id = `${label}:${id}`;
    }
  }
  class Race {
    constructor(id) {
      this.id = `${label}:${id}`;
      this.genus = raceDefinitions[id].genus;
      this.evolutionTree = {};
    }
  }
  const raceIds = Object.keys(raceDefinitions).filter(
    (id) => id !== "protoplasm",
  );
  return {
    game: {
      actions: {
        evolution: Object.fromEntries(
          [...pathActionIds, ...raceIds].map((id) => [id, {}]),
        ),
      },
      races: raceDefinitions,
    },
    evolutions: {},
    races: {},
    imitations: {},
    EvolutionAction,
    Race,
  };
}

let context = makeContext("first", {
  protoplasm: { genus: "small" },
  normal: { genus: "humanoid" },
  hybrid: { genus: "avian", type: "hybrid", hybrid: ["avian", "plant"] },
  sludge: { genus: "small" },
});
const { initialiseRaces } = createRaceInitialization({
  getGame: () => context.game,
  getEvolutions: () => context.evolutions,
  getRaces: () => context.races,
  getImitations: () => context.imitations,
  getEvolutionAction: () => context.EvolutionAction,
  getRace: () => context.Race,
});

initialiseRaces();
const firstContext = context;
assert.equal("protoplasm" in firstContext.races, false);
assert.deepEqual(
  firstContext.races.normal.evolutionTree.humanoid.map((action) => action?.id),
  [
    "first:bunker",
    "first:normal",
    "first:sentience",
    "first:humanoid",
    "first:mammals",
    "first:bilateral_symmetry",
    "first:multicellular",
    "first:phagocytosis",
    "first:sexual_reproduction",
  ],
);
assert.deepEqual(Object.keys(firstContext.races.hybrid.evolutionTree), [
  "avian",
  "plant",
]);
assert.equal(Object.keys(firstContext.races.sludge.evolutionTree).length, 19);
assert.equal(firstContext.imitations.normal.id, "first:s-normal");

context = makeContext("second", {
  oddball: { genus: "unknown" },
});
initialiseRaces();
assert.deepEqual(
  context.races.oddball.evolutionTree.unknown.map((action) => action.id),
  ["second:bunker", "second:oddball"],
);
assert.equal(context.imitations.oddball.id, "second:s-oddball");
assert.equal(firstContext.races.normal.id, "first:normal");

console.log("Race initialization module tests passed");
