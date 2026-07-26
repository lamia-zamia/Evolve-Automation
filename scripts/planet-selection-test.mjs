import assert from "node:assert/strict";

import { createPlanetSelectionControls } from "../src/adapters/browser/progression-controls.ts";
import {
  createPlanetSelectionCommandExecutor,
  createPlanetSelectionReader,
} from "../src/adapters/evolve/progression/evolution/planet-selection.ts";
import { runPlanetSelection } from "../src/application/planet-selection.ts";
import {
  planetSelectionAchievementIds,
  planPlanetSelection,
  shouldSelectPlanet,
} from "../src/domain/progression/evolution/planet-selection.ts";

// Static lists copied from the composition root.
const PLANET_BIOMES = [
  "eden",
  "ashland",
  "volcanic",
  "taiga",
  "tundra",
  "swamp",
  "oceanic",
  "forest",
  "savanna",
  "grassland",
  "desert",
  "hellscape",
];
const PLANET_TRAITS = [
  "elliptical",
  "magnetic",
  "permafrost",
  "rage",
  "retrograde",
  "none",
  "stormy",
  "toxic",
  "trashed",
  "dense",
  "unstable",
  "ozone",
  "mellow",
  "flare",
  "kamikaze",
];
const PLANET_BIOME_GENUS = {
  hellscape: "demonic",
  eden: "angelic",
  oceanic: "aquatic",
  forest: "fey",
  desert: "sand",
  volcanic: "heat",
  tundra: "polar",
};

class FakeMouseEvent {
  constructor(type) {
    this.type = type;
  }
}

const clonePlanets = (planets) =>
  planets.map((planet) => ({
    id: planet.id,
    biome: planet.biome,
    orbit: planet.orbit,
    traits: [...planet.traits],
    geology: { ...planet.geology },
  }));

function makeSettings(scenario) {
  const settings = { extra_w_Achievement: 0, extra_w_Orbit: 0 };
  for (const planet of scenario.planets ?? []) {
    settings[`biome_w_${planet.biome}`] = 0;
    for (const trait of planet.traits) {
      settings[`trait_w_${trait}`] = 0;
    }
    for (const id of Object.keys(planet.geology)) {
      settings[`extra_w_${id}`] = 0;
    }
  }
  if ("targetName" in scenario) {
    settings.userPlanetTargetName = scenario.targetName;
  }
  Object.assign(settings, scenario.settings ?? {});
  for (const key of scenario.omitSettings ?? []) {
    delete settings[key];
  }
  return settings;
}

function buildFixtures(scenario, trace, queried) {
  const settings = makeSettings(scenario);
  const race = {
    universe: scenario.universe ?? "standard",
    seeded: scenario.seeded ?? true,
    gods: scenario.gods ?? "none",
  };
  if (scenario.chose) {
    race.chose = true;
  }
  const game = {
    global: { race, stats: { achieve: scenario.achieve ?? {} } },
  };
  const domIds = scenario.domIds ?? (scenario.planets ?? []).map((p) => p.id);
  const document = {
    getElementById: (id) =>
      domIds.includes(id)
        ? {
            dispatchEvent: (event) => trace.push(["hover", id, event.type]),
            children: [{ click: () => trace.push(["click", id]) }],
          }
        : null,
  };
  const generatePlanets = () => {
    trace.push(["generate"]);
    return clonePlanets(scenario.planets ?? []);
  };
  const isAchievementUnlocked = (id, level) => {
    queried.push(`${id}@${level}`);
    return !(scenario.locked ?? []).includes(id);
  };
  return { game, settings, document, generatePlanets, isAchievementUnlocked };
}

function runModern(scenario) {
  const trace = [];
  const queried = [];
  const fixture = buildFixtures(scenario, trace, queried);
  runPlanetSelection({
    reader: createPlanetSelectionReader({
      getGame: () => fixture.game,
      getSettings: () => fixture.settings,
      getGeneratePlanets: () => fixture.generatePlanets,
      getStarLevel: () => () => scenario.starLevel ?? 1,
      getIsAchievementUnlocked: () => fixture.isAchievementUnlocked,
      getRaces: () => scenario.races ?? {},
      biomeGenus: PLANET_BIOME_GENUS,
      biomeOrder: PLANET_BIOMES,
      planetTraitOrder: PLANET_TRAITS,
    }),
    executor: createPlanetSelectionCommandExecutor({
      getGame: () => fixture.game,
      controls: createPlanetSelectionControls(
        () => fixture.document,
        () => FakeMouseEvent,
      ),
    }),
  });
  return { trace, queried };
}

function dualRun(name, scenario, expectedClicks) {
  const modern = runModern(scenario);
  if (expectedClicks !== undefined) {
    assert.deepEqual(
      modern.trace.filter((entry) => entry[0] === "click").map((e) => e[1]),
      expectedClicks,
      `${name}: unexpected selection`,
    );
  }
  return modern;
}

const planet = (id, biome, overrides = {}) => ({
  id,
  biome,
  orbit: 365,
  traits: ["none"],
  geology: {},
  ...overrides,
});

// --- Gate scenarios: no planet generation, no DOM contact ---

for (const [name, scenario] of [
  ["bigbang universe", { universe: "bigbang" }],
  ["not seeded", { seeded: false }],
  ["already chose", { chose: true }],
  ["target none", { targetName: "none" }],
]) {
  const result = dualRun(name, {
    targetName: "weighting",
    planets: [planet("Grassland1", "grassland")],
    ...scenario,
  });
  assert.deepEqual(result.trace, [], `${name}: expected no actions`);
}

// --- Weighting mode ---

dualRun(
  "weighting picks the heaviest biome",
  {
    targetName: "weighting",
    planets: [
      planet("Grassland1", "grassland"),
      planet("Desert2", "desert"),
      planet("Forest3", "forest"),
    ],
    settings: { biome_w_grassland: 10, biome_w_desert: 50, biome_w_forest: 30 },
  },
  ["Desert2"],
);

// Achievement bonuses: biome, atmosphere, extinct races of the biome genus,
// genus itself, and the oceanic Madagascar Tree bonus gated on gods.
const achievementScenario = (gods) => ({
  targetName: "weighting",
  gods,
  starLevel: 3,
  planets: [
    planet("Oceanic1", "oceanic", { traits: ["toxic"] }),
    planet("Grassland2", "grassland"),
  ],
  races: {
    sharkin: { genus: "aquatic" },
    octigoran: { genus: "aquatic" },
    human: { genus: "humanoid" },
  },
  locked: [
    "biome_oceanic",
    "atmo_toxic",
    "extinct_sharkin",
    "genus_aquatic",
    "madagascar_tree",
  ],
  settings: { biome_w_grassland: 4500, extra_w_Achievement: 1000 },
});
dualRun(
  "achievement bonuses win with madagascar",
  achievementScenario("human"),
  ["Oceanic1"],
);
dualRun(
  "sharkin gods drop the madagascar bonus",
  achievementScenario("sharkin"),
  ["Grassland2"],
);

// --- Geology: miners_dream precise slots versus sign-only weighting ---

const geologyScenario = (achieve) => ({
  targetName: "weighting",
  achieve,
  planets: [
    planet("Volcanic1", "volcanic", { geology: { Copper: 0.05 } }),
    planet("Grassland2", "grassland"),
  ],
  settings: { extra_w_Copper: 100, biome_w_grassland: 300 },
});
dualRun(
  "miners_dream unlocks precise geology weighting",
  geologyScenario({ miners_dream: { l: 1 } }),
  ["Volcanic1"],
);
dualRun("without miners_dream geology counts sign only", geologyScenario({}), [
  "Grassland2",
]);
dualRun(
  "lamentis grants one precise geology slot",
  geologyScenario({ lamentis: { l: 0 } }),
  ["Volcanic1"],
);
dualRun(
  "pre-initialized miners_dream entry falls through leniently",
  geologyScenario({ miners_dream: {} }),
  ["Grassland2"],
);

dualRun(
  "zero geology entries are skipped without consuming slots",
  {
    targetName: "weighting",
    achieve: { miners_dream: { l: 2 } },
    planets: [
      planet("Volcanic1", "volcanic", {
        geology: { Copper: 0.05, Coal: 0, Iron: -0.02 },
      }),
      planet("Grassland2", "grassland"),
    ],
    settings: {
      extra_w_Copper: 100,
      extra_w_Coal: 1000,
      extra_w_Iron: 100,
      biome_w_grassland: 100,
    },
  },
  ["Volcanic1"],
);

dualRun(
  "high miners_dream level expands precise slots",
  {
    targetName: "weighting",
    achieve: { miners_dream: { l: 5 } },
    planets: [
      planet("Volcanic1", "volcanic", {
        geology: {
          Copper: 0.01,
          Iron: 0.01,
          Aluminium: 0.01,
          Coal: 0.01,
          Oil: 0.01,
          Titanium: 0.01,
          Uranium: 0.01,
        },
      }),
      planet("Grassland2", "grassland"),
    ],
    settings: {
      extra_w_Copper: 10,
      extra_w_Iron: 10,
      extra_w_Aluminium: 10,
      extra_w_Coal: 10,
      extra_w_Oil: 10,
      extra_w_Titanium: 10,
      extra_w_Uranium: 10,
      biome_w_grassland: 50,
    },
  },
  ["Volcanic1"],
);

// --- Habitable and achieve modes ---

dualRun(
  "habitable picks the best biome",
  {
    targetName: "habitable",
    planets: [
      planet("Grassland1", "grassland"),
      planet("Tundra2", "tundra"),
      planet("Oceanic3", "oceanic"),
    ],
  },
  ["Tundra2"],
);

dualRun(
  "habitable biome ties prefer the more habitable trait",
  {
    targetName: "habitable",
    planets: [
      planet("Oceanic1", "oceanic", { traits: ["stormy"] }),
      planet("Oceanic2", "oceanic", { traits: ["elliptical"] }),
      planet("Desert3", "desert"),
    ],
  },
  ["Oceanic2"],
);

dualRun(
  "habitable ties use the best trait on a multi-trait planet",
  {
    targetName: "habitable",
    planets: [
      planet("Oceanic1", "oceanic", { traits: ["elliptical", "kamikaze"] }),
      planet("Oceanic2", "oceanic", { traits: ["magnetic"] }),
    ],
  },
  ["Oceanic1"],
);

dualRun(
  "achieve mode prefers more locked achievements",
  {
    targetName: "achieve",
    planets: [planet("Grassland1", "grassland"), planet("Savanna2", "savanna")],
    locked: ["biome_savanna"],
  },
  ["Savanna2"],
);
dualRun(
  "achieve ties fall back to habitability",
  {
    targetName: "achieve",
    planets: [planet("Desert1", "desert"), planet("Grassland2", "grassland")],
    locked: ["biome_desert", "biome_grassland"],
  },
  ["Grassland2"],
);
dualRun(
  "achieve habitability ties prefer the more habitable trait",
  {
    targetName: "achieve",
    planets: [
      planet("Oceanic1", "oceanic", { traits: ["stormy"] }),
      planet("Oceanic2", "oceanic", { traits: ["elliptical"] }),
    ],
    locked: ["atmo_stormy", "atmo_elliptical"],
  },
  ["Oceanic2"],
);

// --- Lenient edges ---

dualRun(
  "unknown mode keeps generation order",
  {
    targetName: "bogus",
    planets: [planet("Grassland1", "grassland"), planet("Desert2", "desert")],
    settings: { biome_w_desert: 100 },
  },
  ["Grassland1"],
);

dualRun(
  "absent target setting still selects the first planet",
  {
    planets: [planet("Grassland1", "grassland"), planet("Desert2", "desert")],
  },
  ["Grassland1"],
);

dualRun(
  "absent weighting settings poison weights identically",
  {
    targetName: "weighting",
    planets: [planet("Grassland1", "grassland"), planet("Desert2", "desert")],
    omitSettings: ["trait_w_none"],
    settings: { biome_w_desert: 100 },
  },
  ["Grassland1"],
);

const missingDom = dualRun("missing DOM element clicks nothing", {
  targetName: "weighting",
  planets: [planet("Grassland1", "grassland")],
  domIds: [],
});
assert.deepEqual(missingDom.trace, [["generate"]]);

console.log("Planet selection scenario and adapter tests passed");

// --- Planner unit tests ---

assert.equal(
  shouldSelectPlanet({
    universe: "bigbang",
    seeded: true,
    chose: false,
    targetName: "weighting",
  }),
  false,
);
assert.equal(
  shouldSelectPlanet({
    universe: "standard",
    seeded: false,
    chose: false,
    targetName: "weighting",
  }),
  false,
);
assert.equal(
  shouldSelectPlanet({
    universe: "standard",
    seeded: true,
    chose: true,
    targetName: "weighting",
  }),
  false,
);
assert.equal(
  shouldSelectPlanet({
    universe: "standard",
    seeded: true,
    chose: false,
    targetName: "none",
  }),
  false,
);
assert.equal(
  shouldSelectPlanet({
    universe: "standard",
    seeded: true,
    chose: false,
    targetName: null,
  }),
  true,
);
assert.equal(
  shouldSelectPlanet({
    universe: "evil",
    seeded: true,
    chose: false,
    targetName: "achieve",
  }),
  true,
);

assert.deepEqual(
  [
    ...planetSelectionAchievementIds(
      [
        planet("Oceanic1", "oceanic", { traits: ["toxic", "none"] }),
        planet("Oceanic2", "oceanic"),
        planet("Grassland3", "grassland"),
      ],
      { sharkin: "aquatic", human: "humanoid", octigoran: "aquatic" },
      PLANET_BIOME_GENUS,
    ),
  ].sort(),
  [
    "atmo_toxic",
    "biome_grassland",
    "biome_oceanic",
    "extinct_octigoran",
    "extinct_sharkin",
    "genus_aquatic",
    "madagascar_tree",
  ],
  "achievement requests dedupe and follow the legacy conditions",
);

assert.throws(
  () =>
    planPlanetSelection({
      planets: [],
      targetName: "weighting",
      gods: null,
      raceGenusById: {},
      biomeGenus: {},
      achievementUnlocked: {},
      minersDreamLevel: null,
      lamentisLevel: null,
      biomeWeights: {},
      traitWeights: {},
      achievementWeight: 0,
      orbitWeight: 0,
      geologyWeights: {},
      biomeOrder: PLANET_BIOMES,
      planetTraitOrder: PLANET_TRAITS,
    }),
  TypeError,
  "empty candidate list is rejected",
);

console.log("Planet selection planner unit tests passed");

// --- Adapter contract tests ---

const contractReader = (overrides = {}) =>
  createPlanetSelectionReader({
    getGame: () => ({
      global: {
        race: { universe: "standard", seeded: true, gods: "none" },
        stats: { achieve: {} },
      },
    }),
    getSettings: () => ({ userPlanetTargetName: "weighting" }),
    getGeneratePlanets: () => () => [planet("Grassland1", "grassland")],
    getStarLevel: () => () => 1,
    getIsAchievementUnlocked: () => () => true,
    getRaces: () => ({}),
    biomeGenus: PLANET_BIOME_GENUS,
    biomeOrder: PLANET_BIOMES,
    planetTraitOrder: PLANET_TRAITS,
    ...overrides,
  });

assert.throws(
  () => contractReader({ getGame: () => ({}) }).sampleGate(),
  TypeError,
  "malformed game is rejected",
);
assert.equal(
  contractReader({
    getSettings: () => ({ userPlanetTargetName: 5 }),
  }).sampleGate().targetName,
  null,
  "non-string target setting is normalized to null",
);
assert.throws(
  () =>
    contractReader({ getGeneratePlanets: () => () => [] }).sampleCandidates(),
  TypeError,
  "empty generated planet list is rejected",
);
assert.throws(
  () =>
    contractReader({
      getGeneratePlanets: () => () => [{ biome: "grassland" }],
    }).sampleCandidates(),
  TypeError,
  "planet without id is rejected",
);
assert.throws(
  () =>
    contractReader({
      getGeneratePlanets: () => () => [
        planet("Grassland1", "grassland", { geology: { Copper: "lots" } }),
      ],
    }).sampleCandidates(),
  TypeError,
  "non-numeric geology is rejected",
);

{
  const sample = contractReader({
    getGame: () => ({
      global: {
        race: { universe: "standard", seeded: true, gods: 7 },
        stats: {
          achieve: { miners_dream: {}, lamentis: { l: 2 } },
        },
      },
    }),
    getSettings: () => ({
      userPlanetTargetName: "weighting",
      biome_w_grassland: "10",
    }),
  }).sampleCandidates();
  assert.equal(sample.gods, null, "non-string gods is normalized");
  assert.ok(
    Number.isNaN(sample.minersDreamLevel),
    "pre-initialized achievement entry level collapses to NaN",
  );
  assert.equal(sample.lamentisLevel, 2);
  assert.equal(
    sample.biomeWeights.grassland,
    undefined,
    "non-numeric weighting setting stays undefined for NaN poisoning",
  );
}

assert.deepEqual(
  contractReader({
    getIsAchievementUnlocked: () => (id) => (id === "biome_oceanic" ? 1 : 0),
  }).achievementsUnlocked(["biome_oceanic", "madagascar_tree"], 1),
  { biome_oceanic: true, madagascar_tree: false },
  "achievement lookups coerce to booleans",
);

const contractExecutor = (race, selectPlanet) =>
  createPlanetSelectionCommandExecutor({
    getGame: () => ({ global: { race } }),
    controls: { selectPlanet },
  });
assert.equal(
  contractExecutor(
    { universe: "standard", seeded: true, chose: true },
    () => true,
  ).execute({ elementId: "Grassland1" }).status,
  "stale",
  "selection already made: stale",
);
assert.equal(
  contractExecutor({ universe: "standard", seeded: true }, () => false).execute(
    {
      elementId: "Grassland1",
    },
  ).status,
  "stale",
  "missing control: stale",
);
assert.equal(
  contractExecutor({ universe: "standard", seeded: true }, () => true).execute({
    elementId: "Grassland1",
  }).status,
  "succeeded",
);

console.log("Planet selection adapter contract tests passed");
