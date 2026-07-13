import assert from "node:assert/strict";

import { createStateLogLifecycle } from "../src/observability/state-log.ts";

const stored = new Map();
let game = {
  global: { stats: { days: 10, reset: 2 }, race: { species: "human" } },
};
const basicResource = {
  title: "Resource",
  currentQuantity: 0,
  rateOfChange: 0,
  income: 1,
  storageRatio: 0,
  isUnlocked: () => true,
  isDemanded: () => false,
};
let resources = {
  Money: { ...basicResource, title: "Money", rateOfChange: 2 },
  Knowledge: { ...basicResource, title: "Knowledge", currentQuantity: 3 },
};
let state = {
  stateLog: null,
  scriptTick: 1,
  goal: "idle",
  moneyMedian: 2,
  unlockedBuildings: [],
  unlockedTechs: [],
};
const lifecycle = createStateLogLifecycle({
  getGame: () => game,
  getResources: () => resources,
  getState: () => state,
  plannerLimitingResource: () => null,
  storage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  },
});

lifecycle.recordStateSnapshot();
assert.equal(state.stateLog.samples.length, 1);
assert.equal(state.stateLog.samples[0].d, 10);

game = {
  global: { stats: { days: 20, reset: 3 }, race: { species: "balorg" } },
};
resources = {
  Money: { ...basicResource, title: "Money", rateOfChange: 4 },
  Knowledge: { ...basicResource, title: "Knowledge", currentQuantity: 5 },
};
state = {
  stateLog: null,
  scriptTick: 2,
  goal: "build",
  moneyMedian: 4,
  unlockedBuildings: [],
  unlockedTechs: [],
};
assert.equal(lifecycle.makeStateLog().species, "balorg");
lifecycle.recordStateSnapshot();
assert.equal(state.stateLog.samples[0].g, "build");

console.log("State log module tests passed");
