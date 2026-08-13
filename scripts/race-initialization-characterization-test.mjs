import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";
import { createHash } from "node:crypto";

const { hooks } = await loadCharacterizationBundle({
  cloneInto: (value) => value,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  unsafeWindow: {},
  $: () => ({ ready() {} }),
});

assert.equal(typeof hooks.initialiseRaces, "function");
assert.equal(typeof hooks.setRaceInitializationTestContext, "function");

const raceDefinitions = {
  protoplasm: { genus: "small" },
  human: { genus: "humanoid" },
  hellspawn: { genus: "demonic" },
  junker: { genus: "small" },
  sludge: { genus: "giant" },
  ultra_sludge: { genus: "aquatic" },
  chimera: { genus: "avian", type: "hybrid", hybrid: ["avian", "plant"] },
  oddball: { genus: "unknown" },
};
const actionIds = [
  "bunker",
  "warlord",
  "sentience",
  "eldritch",
  "bilateral_symmetry",
  "multicellular",
  "phagocytosis",
  "sexual_reproduction",
  "aquatic",
  "athropods",
  "mammals",
  "humanoid",
  "gigantism",
  "dwarfism",
  "carnivore",
  "animalism",
  "herbivore",
  "demonic",
  "celestial",
  "fey",
  "heat",
  "polar",
  "sand",
  "endothermic",
  "eggshell",
  "ectothermic",
  "bryophyte",
  "poikilohydric",
  "chloroplasts",
  "spores",
  "chitin",
  "exterminate",
  ...Object.keys(raceDefinitions).filter((id) => id !== "protoplasm"),
];
const game = {
  actions: { evolution: Object.fromEntries(actionIds.map((id) => [id, {}])) },
  races: raceDefinitions,
};
const constructorTrace = [];
class TestEvolutionAction {
  constructor(id) {
    this.id = id;
    constructorTrace.push(["action", id]);
  }
}
class TestRace {
  constructor(id) {
    this.id = id;
    this.genus = raceDefinitions[id].genus;
    this.evolutionTree = {};
    constructorTrace.push(["race", id]);
  }
}
const evolutions = {};
const races = {};
const imitations = {};
hooks.setRaceInitializationTestContext({
  game,
  evolutions,
  races,
  imitations,
  EvolutionAction: TestEvolutionAction,
  Race: TestRace,
});
hooks.initialiseRaces();

const treeIds = Object.fromEntries(
  Object.entries(races).map(([id, race]) => [
    id,
    Object.fromEntries(
      Object.entries(race.evolutionTree).map(([genus, path]) => [
        genus,
        Array.from(path, (action) => action?.id),
      ]),
    ),
  ]),
);
const hash = createHash("sha256")
  .update(JSON.stringify({ constructorTrace, treeIds }))
  .digest("hex");

assert.equal("protoplasm" in races, false);
assert.equal("protoplasm" in imitations, false);
assert.deepEqual(treeIds.human.humanoid, [
  "bunker",
  "human",
  "sentience",
  "humanoid",
  "mammals",
  "bilateral_symmetry",
  "multicellular",
  "phagocytosis",
  "sexual_reproduction",
]);
assert.deepEqual(treeIds.hellspawn.demonic, [
  "bunker",
  "warlord",
  "sentience",
  "demonic",
  "mammals",
  "bilateral_symmetry",
  "multicellular",
  "phagocytosis",
  "sexual_reproduction",
]);
assert.deepEqual(treeIds.chimera.avian.slice(0, 4), [
  "bunker",
  "chimera",
  "sentience",
  "endothermic",
]);
assert.deepEqual(treeIds.chimera.plant.slice(0, 4), [
  "bunker",
  "chimera",
  "sentience",
  "bryophyte",
]);
assert.deepEqual(treeIds.oddball.unknown, ["bunker", "oddball"]);
assert.deepEqual(Object.keys(treeIds.junker), Object.keys(treeIds.sludge));
assert.deepEqual(
  Object.keys(treeIds.sludge),
  Object.keys(treeIds.ultra_sludge),
);

assert.deepEqual(
  {
    actions: Object.keys(evolutions).length,
    races: Object.keys(races).length,
    imitations: Object.keys(imitations).length,
    sludgeGenera: Object.keys(treeIds.sludge).length,
    trace: constructorTrace.length,
    hash,
  },
  {
    actions: 39,
    races: 7,
    imitations: 7,
    sludgeGenera: 19,
    trace: 53,
    hash: "e03537d8e339d13053b8280e60e39e37d63a11b17f7105fcfae05a429fee584f",
  },
);

console.log("Race initialization bundled characterization tests passed");
