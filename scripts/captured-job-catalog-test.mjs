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
  servantState: null,
  jobs: [
    {
      id: "unemployed",
      controlId: "civ-unemployed",
      kind: "other",
      smart: false,
      configuredPriority: 0,
      assigned: 4,
      workers: 4,
      servants: 0,
      serves: false,
      split: false,
      smartMaximum: null,
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
      kind: "farmer",
      smart: true,
      configuredPriority: 4,
      assigned: 3,
      workers: 3,
      servants: 0,
      serves: false,
      split: false,
      smartMaximum: null,
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
      kind: "forager",
      smart: false,
      configuredPriority: null,
      assigned: 0,
      workers: 0,
      servants: 0,
      serves: false,
      split: true,
      smartMaximum: null,
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
      kind: "other",
      smart: false,
      configuredPriority: null,
      assigned: 0,
      workers: 0,
      servants: 0,
      serves: false,
      split: false,
      smartMaximum: null,
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
    readRoot: () => ({ ...root, race: { high_pop: true } }),
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
assert.equal(highPopulation().jobs[0].breakpoints, null);
assert.equal(highPopulation().jobs[0].uncappedBreakpoints, null);

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
