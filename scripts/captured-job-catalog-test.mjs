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
    hidden: { job: "hidden", assigned: 0, workers: 0, max: 0, display: false },
  },
};
const skipped = [];
const controls = {
  capturedElementIds: () => [
    "civ-unemployed",
    "civ-farmer",
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
  onSkipped: (id, reason) => skipped.push({ id, reason }),
});

assert.deepEqual(reader(), {
  defaultJobId: "unemployed",
  jobs: [
    {
      id: "unemployed",
      controlId: "civ-unemployed",
      assigned: 4,
      workers: 4,
      maximum: 0,
      display: true,
      isDefault: true,
    },
    {
      id: "farmer",
      controlId: "civ-farmer",
      assigned: 3,
      workers: 3,
      maximum: 8,
      display: true,
      isDefault: false,
    },
    {
      id: "hidden",
      controlId: "civ-hidden",
      assigned: 0,
      workers: 0,
      maximum: 0,
      display: false,
      isDefault: false,
    },
  ],
});
assert.deepEqual(skipped, [
  { id: "civ-missing", reason: "ordinary job control is incomplete" },
]);

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
});
assert.equal(mismatched(), undefined);

console.log("captured-job-catalog ok");
