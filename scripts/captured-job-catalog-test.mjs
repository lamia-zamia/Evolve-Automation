import assert from "node:assert/strict";
import {
  createCapturedJobCatalogReader,
  toCapturedJobsJobInputs,
} from "../src/adapters/evolve/civic/captured-job-catalog.ts";

const root = {
  civic: {
    d_job: "unemployed",
    unemployed: {
      job: "unemployed",
      assigned: 4,
      workers: 4,
      max: 0,
      display: true,
    },
    farmer: { job: "farmer", assigned: 3, workers: 3, max: 8, display: true },
    forager: {
      job: "forager",
      assigned: 0,
      workers: 0,
      max: -1,
      display: true,
    },
    hidden: { job: "hidden", assigned: 0, workers: 0, max: 0, display: false },
  },
};
const skipped = [];
const controls = {
  capturedElementIds: () => [
    "civ-unemployed",
    "civ-farmer",
    "civ-forager",
    "civ-hidden",
    "civ-missing",
  ],
  resolve: (id) =>
    id === "civ-missing"
      ? undefined
      : { elementId: id, generation: 1, methods: ["add", "sub", "setDefault"] },
  invoke: () => ({ ok: false, reason: "unknown-control" }),
};
const reader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls,
  readSettings: () => ({
    job_unemployed: true,
    job_farmer: false,
    job_b1_unemployed: 0,
    job_b2_unemployed: 1,
    job_b3_unemployed: -1,
    job_b1_farmer: 2,
    job_b2_farmer: 4,
    job_b3_farmer: 8,
    job_s_farmer: true,
    job_p_unemployed: 0,
    job_p_farmer: 4,
  }),
  onSkipped: (id, reason) => skipped.push({ id, reason }),
});

assert.deepEqual(reader(), {
  defaultJobId: "unemployed",
  hunterActsAsUnemployed: false,
  minimumDefault: null,
  servantModifier: 1,
  servantState: null,
  splitEntries: [{ jobToken: 2, weighting: 50, breakpoints: [0, 0, 0] }],
  defaultPreference: [
    {
      jobToken: 2,
      allocationToken: 2,
      requirement: "managed",
      managed: false,
      unlocked: true,
    },
    {
      jobToken: 3,
      allocationToken: 3,
      requirement: "managed",
      managed: false,
      unlocked: true,
    },
    {
      jobToken: 2,
      allocationToken: 2,
      requirement: "unlocked",
      managed: false,
      unlocked: true,
    },
    {
      jobToken: 0,
      allocationToken: 0,
      requirement: "unlocked",
      managed: true,
      unlocked: true,
    },
  ],
  jobs: [
    {
      id: "unemployed",
      controlId: "civ-unemployed",
      token: 0,
      kind: "other",
      smart: false,
      configuredPriority: 0,
      assigned: 4,
      workers: 4,
      servants: 0,
      count: 4,
      serves: false,
      split: false,
      smartMaximum: null,
      smartMaximumKnown: true,
      storageBackedMinimum: null,
      warlordMiner: false,
      demonicLumber: false,
      maximum: 0,
      display: true,
      unlocked: true,
      managed: true,
      configuredBreakpoints: [0, 1, -1],
      breakpoints: [0, 0, 0],
      uncappedBreakpoints: [0, 1, Number.MAX_SAFE_INTEGER],
      isDefault: true,
    },
    {
      id: "farmer",
      controlId: "civ-farmer",
      token: 3,
      kind: "farmer",
      smart: true,
      configuredPriority: 4,
      assigned: 3,
      workers: 3,
      servants: 0,
      count: 3,
      serves: false,
      split: false,
      smartMaximum: null,
      smartMaximumKnown: true,
      storageBackedMinimum: null,
      warlordMiner: false,
      demonicLumber: false,
      maximum: 8,
      display: true,
      unlocked: true,
      managed: false,
      configuredBreakpoints: [2, 4, 8],
      breakpoints: [2, 4, 8],
      uncappedBreakpoints: [2, 4, 8],
      isDefault: false,
    },
    {
      id: "forager",
      controlId: "civ-forager",
      token: 2,
      kind: "forager",
      smart: false,
      configuredPriority: null,
      assigned: 0,
      workers: 0,
      servants: 0,
      count: 0,
      serves: false,
      split: true,
      smartMaximum: null,
      smartMaximumKnown: true,
      storageBackedMinimum: null,
      warlordMiner: false,
      demonicLumber: false,
      maximum: -1,
      display: true,
      unlocked: true,
      managed: false,
      configuredBreakpoints: null,
      breakpoints: null,
      uncappedBreakpoints: null,
      isDefault: false,
    },
    {
      id: "hidden",
      controlId: "civ-hidden",
      token: null,
      kind: "other",
      smart: false,
      configuredPriority: null,
      assigned: 0,
      workers: 0,
      servants: 0,
      count: 0,
      serves: false,
      split: false,
      smartMaximum: null,
      smartMaximumKnown: true,
      storageBackedMinimum: null,
      warlordMiner: false,
      demonicLumber: false,
      maximum: 0,
      display: false,
      unlocked: false,
      managed: false,
      configuredBreakpoints: null,
      breakpoints: null,
      uncappedBreakpoints: null,
      isDefault: false,
    },
  ],
});
assert.deepEqual(skipped, [
  { id: "civ-missing", reason: "ordinary job control is incomplete" },
]);
const plannerInputs = toCapturedJobsJobInputs(reader());
assert.equal(
  plannerInputs,
  undefined,
  "the planner projection rejects a catalog containing an unknown token",
);
const knownPlannerReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-farmer", "civ-forager"],
  },
  readSettings: () => ({
    job_unemployed: true,
    job_b1_unemployed: 0,
    job_b2_unemployed: 1,
    job_b3_unemployed: -1,
    job_s_farmer: true,
  }),
});
assert.deepEqual(
  toCapturedJobsJobInputs(knownPlannerReader())?.map(
    ({ id, token, kind, crafting, smartMaximum }) => ({
      id,
      token,
      kind,
      crafting,
      smartMaximum,
    }),
  ),
  [
    {
      id: "unemployed",
      token: 0,
      kind: "other",
      crafting: false,
      smartMaximum: null,
    },
    {
      id: "farmer",
      token: 3,
      kind: "farmer",
      crafting: false,
      smartMaximum: null,
    },
    {
      id: "forager",
      token: 2,
      kind: "forager",
      crafting: false,
      smartMaximum: null,
    },
  ],
  "the planner projection preserves canonical known jobs",
);

const teamsterReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { teamster: 9 },
      tech: { transport: 3, railway: 1 },
      civic: {
        ...root.civic,
        teamster: {
          job: "teamster",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-teamster"],
  },
  readSettings: () => ({ job_s_teamster: true }),
});
assert.equal(
  teamsterReader().jobs.find(({ id }) => id === "teamster")?.smartMaximum,
  3,
  "Teamster smart maximum uses the captured race and technology levels",
);

const spaceMinerReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { high_pop: 1 },
      space: {
        elerium_ship: { on: 2 },
        iridium_ship: { on: 1 },
        iron_ship: { on: 3 },
      },
      civic: {
        ...root.civic,
        space_miner: {
          job: "space_miner",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-space_miner"],
  },
  readSettings: () => ({ job_s_space_miner: true }),
});
assert.equal(
  spaceMinerReader().jobs.find(({ id }) => id === "space_miner").smartMaximum,
  2.08,
  "Space Miner smart maximum uses Belt ship counts and high-pop worker effectiveness",
);
assert.equal(
  spaceMinerReader().jobs.find(({ id }) => id === "space_miner").token,
  28,
  "Space Miner token follows DeadSpace's canonical job order",
);

const torturerReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      city: {
        surfaceDwellers: [{}, {}],
        captive_housing: { race0: 3, jailrace0: 1, race1: 2, jailrace1: 0 },
      },
      stats: { achieve: { nightmare: { mg: 2 } } },
      civic: {
        ...root.civic,
        torturer: {
          job: "torturer",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-torturer"],
  },
  readSettings: () => ({ job_s_torturer: true }),
});
assert.equal(
  torturerReader().jobs.find(({ id }) => id === "torturer")?.smartMaximum,
  6,
  "Torturer smart maximum uses captive housing and Nightmare rank",
);

const hellSurveyorReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      portal: { fortress: { threat: 9500 } },
      resource: { Population: { amount: 50, max: 100 } },
      civic: {
        ...root.civic,
        hell_surveyor: {
          job: "hell_surveyor",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-hell_surveyor"],
  },
  readSettings: () => ({ job_s_hell_surveyor: true }),
});
assert.equal(
  hellSurveyorReader().jobs.find(({ id }) => id === "hell_surveyor")
    ?.smartMaximum,
  0,
  "Hell Surveyor smart maximum stops when threat is high and Population storage is open",
);

const scientistReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { universe: "standard", intelligent: 1 },
      tech: { science: 2, genetics: 1 },
      resource: { Knowledge: { max: 100 } },
      civic: {
        ...root.civic,
        scientist: {
          job: "scientist",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-scientist"],
  },
  readSettings: () => ({ job_s_scientist: true }),
});
assert.equal(
  scientistReader().jobs.find(({ id }) => id === "scientist")?.smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Scientist treats a ranked intelligent trait as enabled",
);

const professorReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { intelligent: 1 },
      tech: { genetics: 1, fanaticism: 1 },
      resource: { Knowledge: { max: 100 } },
      civic: {
        ...root.civic,
        professor: {
          job: "professor",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-professor"],
  },
  readSettings: () => ({ job_s_professor: true }),
});
assert.equal(
  professorReader().jobs.find(({ id }) => id === "professor")?.smartMaximum,
  null,
  "Professor treats a ranked intelligent trait as enabled",
);

const bankerReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      resource: { Money: { amount: 100, max: 100 } },
      civic: {
        ...root.civic,
        taxes: { tax_rate: 20 },
        banker: {
          job: "banker",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-banker"],
  },
  readSettings: () => ({ job_s_banker: true }),
});
assert.equal(
  bankerReader().jobs.find(({ id }) => id === "banker")?.smartMaximum,
  0,
  "Banker smart maximum stops a capped Money resource",
);

const selectionReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      civic: {
        ...root.civic,
        lumberjack: {
          job: "lumberjack",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => [
      "civ-unemployed",
      "civ-farmer",
      "civ-forager",
      "civ-lumberjack",
    ],
  },
  readSettings: () => ({
    jobSetDefault: true,
    job_lumberjack: true,
    job_forager: true,
    job_b1_lumberjack: 4,
    job_b2_lumberjack: 10,
    job_b3_lumberjack: 0,
    jobLumberWeighting: 12,
    jobForagerWeighting: 7,
  }),
});
const selectionCatalog = selectionReader();
assert.deepEqual(selectionCatalog.splitEntries, [
  { jobToken: 4, weighting: 12, breakpoints: [4, 10, 0] },
  { jobToken: 2, weighting: 7, breakpoints: [0, 0, 0] },
]);
assert.deepEqual(selectionCatalog.defaultPreference.slice(0, 3), [
  {
    jobToken: 4,
    allocationToken: 4,
    requirement: "managed-with-workers",
    managed: true,
    unlocked: true,
  },
  {
    jobToken: 2,
    allocationToken: 2,
    requirement: "managed",
    managed: true,
    unlocked: true,
  },
  {
    jobToken: 3,
    allocationToken: 3,
    requirement: "managed",
    managed: false,
    unlocked: true,
  },
]);

const warlordMinerReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { warlord: 1 },
      civic: {
        ...root.civic,
        miner: {
          job: "miner",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-miner"],
  },
  readSettings: () => ({}),
});
assert.equal(
  warlordMinerReader().jobs.find(({ id }) => id === "miner")?.warlordMiner,
  true,
  "Warlord Miner behavior follows the captured race flag",
);

const demonicLumberReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: {
        species: "demon",
        soul_eater: 1,
        evil: 1,
      },
      civic: {
        ...root.civic,
        hunter: {
          job: "hunter",
          assigned: 0,
          workers: 0,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed", "civ-hunter"],
  },
  readSettings: () => ({}),
});
assert.equal(
  demonicLumberReader().jobs.find(({ id }) => id === "hunter")?.demonicLumber,
  true,
  "Demonic Lumber follows the captured demon and lumber-race predicates",
);
assert.equal(
  demonicLumberReader().hunterActsAsUnemployed,
  true,
  "Hunter acts as unemployed for the captured soul-eater race",
);
assert.equal(
  createCapturedJobCatalogReader({
    rootState: {
      readRoot: () => ({
        ...root,
        race: { species: "wendigo", soul_eater: 1, evil: 1 },
        civic: {
          ...root.civic,
          hunter: {
            job: "hunter",
            assigned: 0,
            workers: 0,
            max: -1,
            display: true,
          },
        },
      }),
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      ...controls,
      capturedElementIds: () => ["civ-unemployed", "civ-hunter"],
    },
    readSettings: () => ({}),
  })().jobs.find(({ id }) => id === "hunter")?.demonicLumber,
  false,
  "Wendigo remains outside the demonic-lumber branch",
);

const crewReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      civic: {
        ...root.civic,
        crew: { max: 5, workers: 3 },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed"],
  },
  readSettings: () => ({}),
});
assert.equal(
  crewReader().minimumDefault,
  3,
  "crew reserve leaves one worker above the current deficit",
);

const storageFloorReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      tech: { banking: 7 },
      genes: { ancients: 2 },
      civic: {
        ...root.civic,
        d_job: "banker",
        banker: {
          job: "banker",
          assigned: 2,
          workers: 2,
          max: -1,
          display: true,
        },
        priest: {
          job: "priest",
          assigned: 1,
          workers: 1,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-banker", "civ-priest"],
  },
  readSettings: () => ({}),
});
assert.deepEqual(
  storageFloorReader().jobs.map(({ id, storageBackedMinimum }) => ({
    id,
    storageBackedMinimum,
  })),
  [
    { id: "banker", storageBackedMinimum: 2 },
    { id: "priest", storageBackedMinimum: 1 },
  ],
  "Banker and Ancient Priest workers preserve their storage-backed floors",
);

const bankerDemandReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      resource: { Money: { amount: 100, max: 200 } },
      civic: {
        ...root.civic,
        d_job: "banker",
        taxes: { tax_rate: 10 },
        banker: {
          job: "banker",
          assigned: 1,
          workers: 1,
          max: -1,
          display: true,
        },
      },
      tech: { banking: 6 },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-banker"],
  },
  readSettings: () => ({ job_s_banker: true }),
  readDemand: () => ({
    requestedQuantity: () => 0,
    isDemanded: () => false,
    storageRequired: () => 80,
  }),
});
const bankerDemandCatalog = bankerDemandReader();
assert.equal(
  bankerDemandCatalog?.jobs[0]?.smartMaximum,
  0,
  "Banker smart mode stops once the captured Money storage requirement is met",
);

const bankerUnsatisfiedReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      resource: { Money: { amount: 100, max: 200 } },
      civic: {
        ...root.civic,
        d_job: "banker",
        taxes: { tax_rate: 10 },
        banker: {
          job: "banker",
          assigned: 1,
          workers: 1,
          max: -1,
          display: true,
        },
      },
      tech: { banking: 6 },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-banker"],
  },
  readSettings: () => ({ job_s_banker: true }),
  readDemand: () => ({
    requestedQuantity: () => 0,
    isDemanded: () => false,
    storageRequired: () => 120,
  }),
});
assert.equal(
  bankerUnsatisfiedReader().jobs[0].smartMaximum,
  null,
  "Banker smart mode keeps bankers while the captured Money storage requirement is unmet",
);

const cementWorkerReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { smoldering: 1 },
      resource: {
        Stone: { amount: 5, max: 100, diff: -2 },
        Chrysotile: { amount: 20, max: 100, diff: 1 },
        Cement: { amount: 20, max: 100, diff: 0 },
      },
      civic: {
        ...root.civic,
        d_job: "cement_worker",
        cement_worker: {
          job: "cement_worker",
          assigned: 4,
          workers: 4,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-cement_worker"],
  },
  readSettings: () => ({ job_s_cement_worker: true, autoQuarry: true }),
  readDemand: () => ({
    requestedQuantity: () => 0,
    isDemanded: (id) => id === "Cement",
    storageRequired: () => 1,
  }),
});
assert.equal(
  cementWorkerReader().jobs[0].smartMaximum,
  2,
  "Cement Worker uses captured Stone and Smoldering quarry rates while Cement is useful",
);

const artificialFarmerReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { artifical: 1 },
      civic: {
        ...root.civic,
        d_job: "farmer",
        farmer: {
          job: "farmer",
          assigned: 3,
          workers: 3,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-farmer"],
  },
  readSettings: () => ({ job_s_farmer: true }),
});
assert.equal(
  artificialFarmerReader().jobs[0].smartMaximum,
  0,
  "Artificial Farmer smart mode stops at the upstream zero maximum",
);

const unfathomableFarmerReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { unfathomable: 1 },
      civic: {
        ...root.civic,
        d_job: "farmer",
        farmer: {
          job: "farmer",
          assigned: 3,
          workers: 3,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-farmer"],
  },
  readSettings: () => ({ job_s_farmer: true }),
});
assert.equal(
  unfathomableFarmerReader().jobs[0].smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Unfathomable Farmer restores the upstream uncapped maximum",
);

const unfathomableHunterReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { unfathomable: 1 },
      civic: {
        ...root.civic,
        d_job: "hunter",
        hunter: {
          job: "hunter",
          assigned: 1,
          workers: 1,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-hunter"],
  },
  readSettings: () => ({ job_s_hunter: true }),
});
assert.equal(
  unfathomableHunterReader().jobs[0].smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Unfathomable Hunter keeps the upstream later uncapped maximum",
);

const fursHunterReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { evil: 1 },
      resource: { Furs: { display: true, amount: 10, max: 100 } },
      civic: {
        ...root.civic,
        d_job: "hunter",
        hunter: {
          job: "hunter",
          assigned: 1,
          workers: 1,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-hunter"],
  },
  readSettings: () => ({ job_s_hunter: true }),
});
assert.equal(
  fursHunterReader().jobs[0].smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Evil Hunter stays uncapped when captured Furs storage is useful",
);

const lumberjackUsefulReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      resource: { Lumber: { amount: 20, max: 100 } },
      civic: {
        ...root.civic,
        d_job: "lumberjack",
        lumberjack: {
          job: "lumberjack",
          assigned: 2,
          workers: 2,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-lumberjack"],
  },
  readSettings: () => ({ job_s_lumberjack: true }),
});
assert.equal(
  lumberjackUsefulReader().jobs[0].smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Lumberjack stays available while captured Lumber storage is below the useful threshold",
);

const lumberjackDemandReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      resource: { Lumber: { amount: 100, max: 100 } },
      civic: {
        ...root.civic,
        d_job: "lumberjack",
        lumberjack: {
          job: "lumberjack",
          assigned: 2,
          workers: 2,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-lumberjack"],
  },
  readSettings: () => ({ job_s_lumberjack: true }),
  readDemand: () => ({
    requestedQuantity: () => 0,
    isDemanded: (id) => id === "Lumber",
    storageRequired: () => 1,
  }),
});
assert.equal(
  lumberjackDemandReader().jobs[0].smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Lumberjack treats a demanded full Lumber store as useful",
);

const quarryWorkerUsefulReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      resource: {
        Stone: { amount: 100, max: 100 },
        Aluminium: { display: true, amount: 10, max: 100 },
        Chrysotile: { display: false, amount: 100, max: 100 },
      },
      civic: {
        ...root.civic,
        d_job: "quarry_worker",
        quarry_worker: {
          job: "quarry_worker",
          assigned: 1,
          workers: 1,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-quarry_worker"],
  },
  readSettings: () => ({ job_s_quarry_worker: true }),
});
assert.equal(
  quarryWorkerUsefulReader().jobs[0].smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Quarry Worker stays uncapped when an unlocked captured input is useful",
);

const crystalMinerUsefulReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      resource: { Crystal: { amount: 1, max: 100 } },
      civic: {
        ...root.civic,
        d_job: "crystal_miner",
        crystal_miner: {
          job: "crystal_miner",
          assigned: 1,
          workers: 1,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-crystal_miner"],
  },
  readSettings: () => ({ job_s_crystal_miner: true }),
});
assert.equal(
  crystalMinerUsefulReader().jobs[0].smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Crystal Miner stays uncapped while captured Crystal storage is useful",
);

const minerUsefulReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { sappy: 1 },
      resource: {
        Aluminium: { display: true, amount: 10, max: 100 },
        Chrysotile: { display: false, amount: 100, max: 100 },
        Copper: { amount: 100, max: 100 },
        Iron: { display: false, amount: 100, max: 100 },
      },
      civic: {
        ...root.civic,
        d_job: "miner",
        miner: {
          job: "miner",
          assigned: 1,
          workers: 1,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-miner"],
  },
  readSettings: () => ({ job_s_miner: true }),
});
assert.equal(
  minerUsefulReader().jobs[0].smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Miner stays uncapped when a captured Sappy input is useful",
);

const coalMinerUsefulReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      resource: {
        Uranium: { display: false, amount: 100, max: 100 },
        Coal: { amount: 10, max: 100 },
      },
      civic: {
        ...root.civic,
        d_job: "coal_miner",
        coal_miner: {
          job: "coal_miner",
          assigned: 1,
          workers: 1,
          max: -1,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-coal_miner"],
  },
  readSettings: () => ({ job_s_coal_miner: true }),
});
assert.equal(
  coalMinerUsefulReader().jobs[0].smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "Coal Miner stays uncapped while captured Coal storage is useful",
);

const servantReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: {
        servants: {
          max: 4,
          used: 2,
          smax: 1,
          sused: 1,
          jobs: { farmer: 2 },
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls,
  readSettings: () => ({}),
});
assert.deepEqual(servantReader().servantState, {
  maximum: 4,
  used: 2,
  skilledMaximum: 1,
  skilledUsed: 1,
});
assert.deepEqual(
  servantReader().jobs.map(({ id, servants, serves }) => ({
    id,
    servants,
    serves,
  })),
  [
    { id: "unemployed", servants: 0, serves: false },
    { id: "farmer", servants: 2, serves: true },
    { id: "forager", servants: 0, serves: false },
    { id: "hidden", servants: 0, serves: false },
  ],
  "servant assignments come from the captured servant job map",
);

const malformedServantReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: {
        servants: {
          max: 4,
          used: 2,
          smax: 1,
          sused: 1,
          jobs: { farmer: "two" },
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls,
  readSettings: () => ({}),
});
assert.equal(
  malformedServantReader(),
  undefined,
  "malformed servant assignments do not produce a partial catalog",
);

const highPopulation = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({ ...root, race: { high_pop: 1 } }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls,
  readSettings: () => ({
    jobScalePop: true,
    job_b1_unemployed: 0,
    job_b2_unemployed: 1,
    job_b3_unemployed: -1,
    job_b1_farmer: 1,
    job_b2_farmer: 2,
    job_b3_farmer: -1,
  }),
});
const highPopulationCatalog = highPopulation();
assert.deepEqual(highPopulationCatalog.jobs[0].breakpoints, [0, 0, 0]);
assert.deepEqual(highPopulationCatalog.jobs[0].uncappedBreakpoints, [
  0,
  4,
  Number.MAX_SAFE_INTEGER,
]);
assert.deepEqual(
  highPopulationCatalog.jobs.find(({ id }) => id === "farmer").breakpoints,
  [4, 8, 8],
);
assert.deepEqual(
  highPopulationCatalog.jobs.find(({ id }) => id === "farmer")
    .uncappedBreakpoints,
  [4, 8, Number.MAX_SAFE_INTEGER],
);

const unknownHighPopulationScale = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({ ...root, race: { high_pop: 5 } }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls,
  readSettings: () => ({
    jobScalePop: true,
    job_b1_unemployed: 0,
    job_b2_unemployed: 1,
    job_b3_unemployed: -1,
  }),
});
assert.equal(
  unknownHighPopulationScale(),
  undefined,
  "an unknown high-population rank does not produce guessed breakpoints",
);

const incomplete = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      civic: {
        d_job: "unemployed",
        unemployed: {
          job: "unemployed",
          assigned: 1,
          workers: 1,
          max: 0,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    capturedElementIds: () => ["civ-unemployed"],
    resolve: () => ({
      elementId: "civ-unemployed",
      generation: 1,
      methods: ["add", "sub"],
    }),
    invoke: () => ({ ok: false, reason: "unknown-control" }),
  },
  readSettings: () => ({}),
});
assert.equal(incomplete(), undefined);

const mismatched = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      civic: {
        d_job: "unemployed",
        unemployed: {
          job: "farmer",
          assigned: 1,
          workers: 1,
          max: 0,
          display: true,
        },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    capturedElementIds: () => ["civ-unemployed"],
    resolve: () => ({
      elementId: "civ-unemployed",
      generation: 1,
      methods: ["add", "sub", "setDefault"],
    }),
    invoke: () => ({ ok: false, reason: "unknown-control" }),
  },
  readSettings: () => ({ job_unemployed: true }),
});
assert.equal(mismatched(), undefined);

console.log("captured-job-catalog ok");
