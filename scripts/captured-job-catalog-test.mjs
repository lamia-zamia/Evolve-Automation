import assert from "node:assert/strict";
import { createCapturedJobCatalogReader } from "../src/adapters/evolve/civic/captured-job-catalog.ts";

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
  servantState: null,
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
      serves: false,
      split: false,
      smartMaximum: null,
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
      serves: false,
      split: false,
      smartMaximum: null,
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
      serves: false,
      split: true,
      smartMaximum: null,
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
      serves: false,
      split: false,
      smartMaximum: null,
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

const warlordMinerReader = createCapturedJobCatalogReader({
  rootState: {
    readRoot: () => ({
      ...root,
      race: { warlord: true },
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
        soul_eater: true,
        evil: true,
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
        race: { species: "wendigo", soul_eater: true, evil: true },
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
