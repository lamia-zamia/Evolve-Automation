import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import {
  readCapturedBuildingGenerationWitness,
  trackCapturedBuildingGenerationStructure,
} from "../../../src/adapters/evolve/progression/build/captured-building-generation.ts";

const root = resolve(import.meta.dirname, "../../..");
const requireTools = createRequire(resolve(root, "tools/package.json"));
const vue = requireTools("vue");
assert.equal(requireTools("vue/package.json").version, "3.5.22");

const binding = "city-mill";
const identities = [
  {
    entryKey: "city:mill",
    region: "city",
    sector: "city",
    struct: "mill",
    actionId: binding,
  },
];
const elementIds = [binding];
const controlData = vue.reactive({ act: { on: 0 } });
const controls = { resolve: () => ({ data: controlData }) };
const rootState = vue.reactive({
  resource: { Food: { amount: 10, rate: 2 } },
  city: { mill: { count: 1, on: 0 } },
});
let trackerRuns = 0;
let witness = readCapturedBuildingGenerationWitness(
  rootState,
  controls,
  elementIds,
  identities,
);
const stop = vue.watch(
  trackCapturedBuildingGenerationStructure(
    rootState,
    controls,
    elementIds,
    identities,
  ),
  () => {
    witness = readCapturedBuildingGenerationWitness(
      rootState,
      controls,
      elementIds,
      identities,
    );
    trackerRuns += 1;
  },
  { flush: "sync" },
);

const initialWitness = witness;
rootState.resource.Food.amount += 1;
rootState.resource.Food.rate += 1;
rootState.city.mill.on = 2;
assert.equal(
  trackerRuns,
  0,
  "resource and numeric on writes do not rebuild facts",
);
assert.equal(
  witness,
  initialWitness,
  "numeric on changes do not change the witness",
);

rootState.city.mill.added = true;
delete rootState.city.mill.added;
assert.equal(
  trackerRuns,
  0,
  "irrelevant own-key changes do not invalidate structure tracking",
);

delete rootState.city.mill.on;
assert.equal(
  trackerRuns,
  1,
  "on membership deletion invalidates synchronously",
);
assert.notEqual(witness, initialWitness);
rootState.city.mill.on = 0;
assert.equal(
  trackerRuns,
  2,
  "on membership addition invalidates synchronously",
);
assert.equal(witness, initialWitness);

rootState.city.mill = 0;
assert.equal(trackerRuns, 3, "record to primitive transitions invalidate");
assert.notEqual(witness, initialWitness);
rootState.city.mill = { count: 1, on: 0 };
assert.equal(trackerRuns, 4, "primitive to record transitions invalidate");
assert.equal(witness, initialWitness);

rootState.city = { mill: { count: 2, on: 0 } };
assert.equal(trackerRuns, 5, "region replacement invalidates synchronously");
rootState.city.mill = { count: 3, on: 0 };
assert.equal(trackerRuns, 6, "structure replacement invalidates synchronously");

rootState.city = 0;
assert.equal(
  trackerRuns,
  7,
  "region record to primitive transitions invalidate",
);
rootState.city = { mill: { count: 4, on: 0 } };
assert.equal(
  trackerRuns,
  8,
  "region primitive to record transitions invalidate",
);

controlData.act.on = 1;
assert.equal(trackerRuns, 8, "numeric control act on writes do not invalidate");
controlData.act = 0;
assert.equal(trackerRuns, 9, "control act identity/type changes invalidate");
controlData.act = { on: 0 };
assert.equal(trackerRuns, 10, "control act record transitions invalidate");
delete controlData.act.on;
assert.equal(trackerRuns, 11, "control act on membership deletion invalidates");
controlData.act.on = 0;
assert.equal(trackerRuns, 12, "control act on membership addition invalidates");
const beforeMatchingControl = witness;
controlData.act = rootState.city.mill;
assert.equal(
  trackerRuns,
  13,
  "control act replacement invalidates synchronously",
);
const matchingControlWitness = readCapturedBuildingGenerationWitness(
  rootState,
  controls,
  elementIds,
  identities,
);
assert.notEqual(
  matchingControlWitness,
  beforeMatchingControl,
  "control act identity is reflected in the resampled witness",
);
stop();

console.log("pinned Vue production Building tracker checks passed");
