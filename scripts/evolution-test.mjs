import assert from "node:assert/strict";

import {
  createEvolutionCommandExecutor,
  createEvolutionReader,
} from "../src/adapters/evolve/progression/evolution/evolution.ts";
import { runEvolution } from "../src/application/evolution.ts";
import {
  evolutionChallengeCandidates,
  planEvolutionCells,
  planEvolutionTarget,
  planEvolutionTreeClick,
  planImitation,
  planResourceAccumulation,
} from "../src/domain/progression/evolution/evolution.ts";
import { createLegacyAutoEvolution } from "./test-support/legacy-auto-evolution.ts";

// Representative subset of the composition-root challenge table: two multi- and
// single-member ordinary groups plus the two cycle-ending challenges.
const CHALLENGES = [
  [
    { id: "plasmid", trait: "no_plasmid" },
    { id: "mastery", trait: "weak_mastery" },
  ],
  [{ id: "trade", trait: "no_trade" }],
  [{ id: "sludge", trait: "sludge" }],
  [{ id: "junker", trait: "junker" }],
];
const challengeGroups = CHALLENGES.map((members) => ({ members }));

const ALL_CHALLENGE_IDS = CHALLENGES.flat().map((c) => c.id);
const CELL_IDS = [
  "mitochondria",
  "eukaryotic_cell",
  "membrane",
  "nucleus",
  "organelles",
];

function makeFixture(scenario, impl) {
  const trace = [];
  const record = (...event) => trace.push(event);

  const resources = {
    RNA: {
      currentQuantity: scenario.rna?.current ?? 0,
      maxQuantity: scenario.rna?.max ?? 0,
    },
    DNA: {
      currentQuantity: scenario.dna?.current ?? 0,
      maxQuantity: scenario.dna?.max ?? 0,
    },
  };

  const evolutions = {};
  const makeAction = (id, opts = {}) => {
    const action = {
      id,
      count: opts.count ?? 0,
      definition: { rna: opts.rna, dna: opts.dna },
      isUnlocked: () => opts.unlocked ?? false,
      click: () => {
        record("click", id);
        return opts.clickResult ?? true;
      },
    };
    evolutions[id] = action;
    return action;
  };

  // Cells default to satisfied counts unless the scenario overrides them.
  for (const id of CELL_IDS) {
    makeAction(id, {
      count:
        id === "nucleus" || id === "organelles"
          ? 10
          : (scenario.cells?.[id]?.count ?? 1),
      ...(scenario.cells?.[id] ?? {}),
    });
  }
  // Challenge action objects (clicked by id during the challenge phase).
  for (const id of ALL_CHALLENGE_IDS) {
    makeAction(id, {
      clickResult: scenario.challengeClick?.[id] ?? true,
    });
  }

  const races = {};
  const imitations = {};
  for (const [id, spec] of Object.entries(scenario.races ?? {})) {
    const treeActions = (spec.tree ?? []).map((node) =>
      makeAction(node.id, node),
    );
    races[id] = {
      id,
      genus: spec.genus,
      name: spec.name ?? id,
      getWeighting: () => spec.weighting ?? -1,
      getHabitability: () => spec.habitability ?? 0,
      evolutionTree: spec.tree ? { [spec.genus]: treeActions } : {},
    };
    imitations[id] = {
      id: `s-${id}`,
      click: () => {
        record("imitate", `s-${id}`);
        return scenario.imitateClickResult ?? true;
      },
    };
  }

  const game = {
    global: {
      race: {
        species: scenario.species ?? "protoplasm",
        universe: scenario.universe ?? "standard",
        seeded: scenario.seeded ?? false,
        chose: scenario.chose ?? false,
        evoFinalMenu: scenario.evoFinalMenu ?? false,
        ...(scenario.raceTraits ?? {}),
      },
      stats: { achieve: scenario.achieve ?? {} },
    },
    actions: {
      evolution: {
        rna: { action: () => record("rna") },
        dna: { action: () => record("dna") },
      },
    },
  };

  const settings = {
    userEvolutionTarget: scenario.userEvolutionTarget ?? "auto",
    userEvolutionGenus: scenario.userEvolutionGenus,
    evolutionQueueEnabled: scenario.queueEnabled ?? false,
    evolutionQueueRepeat: scenario.queueRepeat ?? false,
    imitateRace: scenario.imitateRace ?? "",
  };
  for (const id of scenario.enabledChallenges ?? []) {
    settings[`challenge_${id}`] = true;
  }

  const settingsRaw = { evolutionQueue: scenario.queue ?? [] };
  const state = {
    evolutionTarget:
      scenario.preTarget == null
        ? null
        : impl === "legacy"
          ? races[scenario.preTarget]
          : scenario.preTarget,
    evolutionAttempts: scenario.attempts ?? 0,
  };

  const poly = {
    adjustCosts: (definition) => {
      const costs = {};
      if (definition.rna != null) {
        costs.RNA = () => definition.rna;
      }
      if (definition.dna != null) {
        costs.DNA = () => definition.dna;
      }
      return costs;
    },
  };

  const GameLog = {
    logSuccess: (type, message, tags) =>
      record("logSuccess", type, message, tags),
    logDanger: (type, message, tags) =>
      record("logDanger", type, message, tags),
  };

  const loadQueuedSettings = () => {
    record("loadQueue");
    scenario.onLoadQueue?.({ settings, settingsRaw, state });
  };

  const autoUniverseSelection = () => record("universe");
  const autoPlanetSelection = () => record("planet");

  return {
    trace,
    resources,
    game,
    settings,
    settingsRaw,
    state,
    races,
    evolutions,
    imitations,
    poly,
    GameLog,
    loadQueuedSettings,
    autoUniverseSelection,
    autoPlanetSelection,
  };
}

function runLegacy(fixture) {
  createLegacyAutoEvolution({
    getGame: () => fixture.game,
    getState: () => fixture.state,
    getSettings: () => fixture.settings,
    getSettingsRaw: () => fixture.settingsRaw,
    getRaces: () => fixture.races,
    loadQueuedSettings: fixture.loadQueuedSettings,
    GameLog: fixture.GameLog,
    getChallenges: () => CHALLENGES,
    getEvolutions: () => fixture.evolutions,
    getPoly: () => fixture.poly,
    getResources: () => fixture.resources,
    getImitations: () => fixture.imitations,
    getAutoUniverseSelection: () => fixture.autoUniverseSelection,
    getAutoPlanetSelection: () => fixture.autoPlanetSelection,
  })();
}

function runNew(fixture) {
  const reader = createEvolutionReader({
    getGame: () => fixture.game,
    getSettings: () => fixture.settings,
    getSettingsRaw: () => fixture.settingsRaw,
    getState: () => fixture.state,
    getRaces: () => fixture.races,
    getEvolutions: () => fixture.evolutions,
    getImitations: () => fixture.imitations,
    getResources: () => fixture.resources,
    getPoly: () => fixture.poly,
    challengeGroups,
  });
  const executor = createEvolutionCommandExecutor({
    getGame: () => fixture.game,
    getState: () => fixture.state,
    getResources: () => fixture.resources,
    getEvolutions: () => fixture.evolutions,
    getImitations: () => fixture.imitations,
    loadQueuedSettings: fixture.loadQueuedSettings,
    gameLog: fixture.GameLog,
  });
  runEvolution({
    reader,
    executor,
    runUniverseSelection: fixture.autoUniverseSelection,
    runPlanetSelection: fixture.autoPlanetSelection,
    challengeGroups,
  });
}

const finalResources = (fixture) => ({
  rna: fixture.resources.RNA.currentQuantity,
  dna: fixture.resources.DNA.currentQuantity,
});

function dualRun(scenario) {
  const legacy = makeFixture(scenario, "legacy");
  runLegacy(legacy);
  const migrated = makeFixture(scenario, "new");
  runNew(migrated);
  assert.deepStrictEqual(
    migrated.trace,
    legacy.trace,
    `${scenario.name}: trace mismatch`,
  );
  assert.deepStrictEqual(
    finalResources(migrated),
    finalResources(legacy),
    `${scenario.name}: resource mismatch`,
  );
}

// A target race with a small evolution tree used by the resource/tree phases.
const targetWithTree = (overrides = {}) => ({
  genus: "humanoid",
  name: "Human",
  habitability: 1,
  weighting: 5,
  tree: [
    { id: "bunker", unlocked: false },
    { id: "sentience", unlocked: false, rna: 320, dna: 240 },
    { id: "humanoid", unlocked: false, rna: 40, dna: 20 },
  ],
  ...overrides,
});

const scenarios = [
  {
    name: "not protoplasm — full no-op before sub-compositions",
    species: "human",
  },
  {
    name: "bigbang — sub-compositions then landing gate",
    universe: "bigbang",
  },
  {
    name: "seeded not chosen — landing gate return",
    seeded: true,
    chose: false,
  },
  {
    name: "auto target with mass extinction picks best weighting",
    userEvolutionTarget: "auto",
    achieve: { mass_extinction: true },
    userEvolutionGenus: "humanoid",
    races: {
      entish: { genus: "plant", name: "Entish", habitability: 1, weighting: 2 },
      custom: {
        genus: "custom",
        name: "Custom",
        habitability: 0,
        weighting: -1,
      },
      human: targetWithTree({ weighting: 9 }),
      orc: { genus: "giant", name: "Orc", habitability: 1, weighting: 4 },
    },
  },
  {
    name: "auto target without mass extinction picks best genus",
    userEvolutionTarget: "auto",
    userEvolutionGenus: "humanoid",
    races: {
      entish: { genus: "plant", name: "Entish", habitability: 1, weighting: 2 },
      custom: {
        genus: "custom",
        name: "Custom",
        habitability: 0,
        weighting: -1,
      },
      human: targetWithTree({ weighting: 5 }),
      elf: { genus: "humanoid", name: "Elf", habitability: 1, weighting: 3 },
      troll: { genus: "giant", name: "Troll", habitability: 1, weighting: 7 },
    },
  },
  {
    name: "user race selected when habitable",
    userEvolutionTarget: "human",
    userEvolutionGenus: "humanoid",
    races: {
      custom: { genus: "custom", name: "Custom", habitability: 0 },
      entish: { genus: "plant", name: "Entish", habitability: 1 },
      human: targetWithTree({ habitability: 1 }),
    },
  },
  {
    name: "queue pending forces wait",
    userEvolutionTarget: "human",
    queueEnabled: true,
    queue: [{ userEvolutionTarget: "human" }],
    races: {
      custom: { genus: "custom", name: "Custom", habitability: 0 },
      entish: { genus: "plant", name: "Entish", habitability: 1 },
      human: { genus: "humanoid", name: "Human", habitability: 0 },
    },
  },
  {
    name: "fallback to custom when habitable",
    userEvolutionTarget: "nonexistent",
    userEvolutionGenus: "custom",
    races: {
      custom: targetWithTree({
        genus: "custom",
        name: "Custom",
        habitability: 1,
      }),
      entish: { genus: "plant", name: "Entish", habitability: 1 },
    },
  },
  {
    name: "fallback to entish when custom unavailable",
    userEvolutionTarget: "nonexistent",
    userEvolutionGenus: "plant",
    races: {
      custom: { genus: "custom", name: "Custom", habitability: 0 },
      entish: targetWithTree({
        genus: "plant",
        name: "Entish",
        habitability: 1,
      }),
    },
  },
  {
    name: "loadQueuedSettings reloads target before selection",
    userEvolutionTarget: "auto",
    userEvolutionGenus: "humanoid",
    onLoadQueue: ({ settings }) => {
      settings.userEvolutionTarget = "human";
    },
    races: {
      custom: { genus: "custom", name: "Custom", habitability: 0 },
      entish: { genus: "plant", name: "Entish", habitability: 1 },
      human: targetWithTree({ habitability: 1 }),
    },
  },
  {
    name: "cycle-ending challenge click returns",
    preTarget: "human",
    enabledChallenges: ["plasmid", "junker"],
    raceTraits: { no_plasmid: 1 },
    races: { human: targetWithTree() },
  },
  {
    name: "ordinary challenge clicks continue through phases",
    preTarget: "human",
    enabledChallenges: ["plasmid"],
    rna: { current: 0, max: 100 },
    dna: { current: 0, max: 100 },
    races: { human: targetWithTree() },
  },
  {
    name: "active challenge trait skips the click",
    preTarget: "human",
    enabledChallenges: ["junker"],
    raceTraits: { junker: 1 },
    races: { human: targetWithTree() },
  },
  {
    name: "resource accumulation math and gather actions",
    preTarget: "human",
    rna: { current: 10, max: 600 },
    dna: { current: 5, max: 300 },
    races: { human: targetWithTree() },
  },
  {
    name: "evolution tree click succeeds and returns",
    preTarget: "human",
    rna: { current: 0, max: 1000 },
    dna: { current: 0, max: 1000 },
    races: {
      human: targetWithTree({
        tree: [
          { id: "bunker", unlocked: true, clickResult: true },
          { id: "sentience", unlocked: false, rna: 320, dna: 240 },
        ],
      }),
    },
  },
  {
    name: "evolution tree unlocked but not clickable breaks to cells",
    preTarget: "human",
    rna: { current: 0, max: 5 },
    dna: { current: 0, max: 5 },
    cells: {
      mitochondria: { count: 0 },
      eukaryotic_cell: { count: 0 },
      nucleus: { count: 0 },
      organelles: { count: 0 },
    },
    races: {
      human: targetWithTree({
        tree: [
          {
            id: "bunker",
            unlocked: true,
            clickResult: false,
            rna: 40,
            dna: 40,
          },
        ],
      }),
    },
  },
  {
    name: "active challenge in tree skipped, next action clicked",
    preTarget: "human",
    enabledChallenges: [],
    raceTraits: { junker: 1 },
    rna: { current: 0, max: 1000 },
    dna: { current: 0, max: 1000 },
    races: {
      human: targetWithTree({
        genus: "humanoid",
        tree: [
          { id: "junker", unlocked: true, clickResult: true },
          {
            id: "sentience",
            unlocked: true,
            clickResult: true,
            rna: 10,
            dna: 10,
          },
        ],
      }),
    },
  },
  {
    name: "cell upgrades clicked by count and storage",
    preTarget: "human",
    rna: { current: 0, max: 50 },
    dna: { current: 0, max: 50 },
    cells: {
      mitochondria: { count: 0 },
      eukaryotic_cell: { count: 1 },
      nucleus: { count: 3 },
      organelles: { count: 10 },
    },
    races: {
      human: targetWithTree({
        tree: [{ id: "bunker", unlocked: false, rna: 100, dna: 100 }],
      }),
    },
  },
  {
    name: "imitation clicked on final menu",
    preTarget: "human",
    evoFinalMenu: true,
    imitateRace: "elf",
    races: {
      human: targetWithTree(),
      elf: { genus: "humanoid", name: "Elf", habitability: 1 },
    },
  },
  {
    name: "imitation click fails logs warning",
    preTarget: "human",
    evoFinalMenu: true,
    imitateRace: "elf",
    imitateClickResult: false,
    races: {
      human: targetWithTree(),
      elf: { genus: "humanoid", name: "Elf", habitability: 1 },
    },
  },
  {
    name: "imitation no race selected logs warning",
    preTarget: "human",
    evoFinalMenu: true,
    imitateRace: "ghost",
    races: { human: targetWithTree() },
  },
];

let failures = 0;
for (const scenario of scenarios) {
  try {
    dualRun(scenario);
  } catch (error) {
    failures++;
    console.error(`FAIL ${scenario.name}\n  ${error.message}`);
  }
}

// --- Focused unit assertions on the pure planners ------------------------

// Challenge candidate flattening honours group order and enablement.
assert.deepStrictEqual(
  evolutionChallengeCandidates(challengeGroups, {
    plasmid: true,
    junker: true,
  }).map((c) => [c.id, c.cycleEnding]),
  [
    ["plasmid", false],
    ["mastery", false],
    ["junker", true],
  ],
);

// Resource math reproduces the legacy Math.min chain.
assert.deepStrictEqual(
  planResourceAccumulation(600, 300, {
    rnaCurrent: 10,
    rnaMax: 600,
    dnaCurrent: 5,
    dnaMax: 300,
  }),
  {
    rnaForDna: 580,
    dnaForEvolution: 295,
    rnaForEvolution: 600,
    newRna: 600,
    newDna: 300,
  },
);

// Tree click picks the first unlocked non-active-challenge action.
assert.deepStrictEqual(
  planEvolutionTreeClick([
    { id: "a", unlocked: false, activeChallenge: false },
    { id: "b", unlocked: true, activeChallenge: true },
    { id: "c", unlocked: true, activeChallenge: false },
  ]),
  { kind: "click", id: "c" },
);
assert.deepStrictEqual(
  planEvolutionTreeClick([
    { id: "a", unlocked: false, activeChallenge: false },
  ]),
  { kind: "none" },
);

// Cells respect counts and max thresholds.
assert.deepStrictEqual(
  planEvolutionCells(
    {
      mitochondriaCount: 0,
      eukaryoticCellCount: 1,
      nucleusCount: 3,
      organellesCount: 10,
      rnaMax: 50,
      dnaMax: 50,
    },
    50,
    50,
  ),
  ["mitochondria", "nucleus"],
);

// Target selection wait vs fallback.
assert.deepStrictEqual(
  planEvolutionTarget({
    races: [
      {
        id: "custom",
        weighting: -1,
        habitability: 0,
        genus: "custom",
        name: "C",
      },
      {
        id: "entish",
        weighting: 1,
        habitability: 1,
        genus: "plant",
        name: "E",
      },
    ],
    userEvolutionTarget: "missing",
    massExtinction: false,
    queueEnabled: true,
    queueLength: 1,
    queueRepeat: false,
    evolutionAttempts: 0,
  }),
  { kind: "wait" },
);

// Imitation planning branches.
assert.deepStrictEqual(
  planImitation({
    evoFinalMenu: false,
    imitationExists: true,
    imitateRace: "x",
  }),
  {
    kind: "skip",
  },
);
assert.deepStrictEqual(
  planImitation({
    evoFinalMenu: true,
    imitationExists: false,
    imitateRace: "x",
  }),
  {
    kind: "log-no-race",
  },
);

if (failures > 0) {
  console.error(`\n${failures} evolution dual-run scenario(s) failed`);
  process.exit(1);
}
console.log(
  `evolution slice: ${scenarios.length} dual-run scenarios + planner unit checks passed`,
);
