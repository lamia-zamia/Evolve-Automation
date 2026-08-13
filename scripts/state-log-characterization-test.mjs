import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const stored = new Map();
const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
});

assert.equal(typeof hooks.setStateLogTestContext, "function");
const lifecycle = hooks.stateLogLifecycle;
for (const name of [
  "makeStateLog",
  "loadStateLog",
  "saveStateLog",
  "stateLogDiff",
  "stateLogBlocker",
  "recordStateSnapshot",
]) {
  assert.equal(typeof lifecycle?.[name], "function", `${name} hook missing`);
}

function resource(title, overrides = {}) {
  return {
    title,
    currentQuantity: 0,
    maxQuantity: 1000,
    rateOfChange: 0,
    income: 1,
    storageRatio: 0,
    isUnlocked: () => true,
    isDemanded: () => false,
    ...overrides,
  };
}

const game = {
  global: {
    stats: { days: 123, reset: 7 },
    race: { species: "human" },
  },
};
const resources = {
  Money: resource("Money", { rateOfChange: 12.6, storageRatio: 0.99 }),
  Knowledge: resource("Knowledge", {
    currentQuantity: 99.6,
    rateOfChange: -1.6,
    income: -1,
    isDemanded: () => true,
  }),
  Iron: resource("Iron", {
    currentQuantity: 10,
    maxQuantity: 50,
    income: 0,
    isDemanded: () => true,
  }),
  Hidden: resource("Hidden", {
    storageRatio: 1,
    isUnlocked: () => false,
    isDemanded: () => true,
  }),
};
const blockedTarget = {
  title: "Forge",
  cost: { Iron: 100 },
  isAffordable: () => false,
};
const readyTarget = {
  title: "Research",
  cost: {},
  isAffordable: () => true,
};
const state = {
  stateLog: null,
  scriptTick: 10,
  goal: "build",
  moneyMedian: 5.5,
  unlockedBuildings: [blockedTarget],
  unlockedTechs: [readyTarget],
};
hooks.setStateLogTestContext({ game, resources, state });

const fresh = lifecycle.makeStateLog();
assert.deepEqual(
  {
    ...fresh,
    cap: [...fresh.cap],
    stall: [...fresh.stall],
    samples: [...fresh.samples],
  },
  {
    v: 2,
    reset: 7,
    startDay: 123,
    species: "human",
    cap: [],
    stall: [],
    samples: [],
  },
);

const diff = lifecycle.stateLogDiff(["A", "B"], ["B", "C"]);
assert.deepEqual(
  [...diff].map((items) => [...items]),
  [["C"], ["A"]],
);
assert.equal(lifecycle.stateLogBlocker(null), 0);
assert.deepEqual(
  [...lifecycle.stateLogBlocker(readyTarget)],
  ["Research", null, "ready", 0],
);
assert.deepEqual(
  [...lifecycle.stateLogBlocker(blockedTarget)],
  ["Forge", "Iron", "storage", Number.MAX_SAFE_INTEGER],
);

stored.set("ea_state_log", JSON.stringify({ v: 2, reset: 7, marker: "valid" }));
assert.equal(lifecycle.loadStateLog().marker, "valid");
stored.set("ea_state_log", JSON.stringify({ v: 1, reset: 7 }));
assert.equal(lifecycle.loadStateLog().v, 2);
stored.set("ea_state_log", "invalid");
assert.equal(lifecycle.loadStateLog().startDay, 123);

stored.delete("ea_state_log");
state.stateLog = null;
lifecycle.recordStateSnapshot();
assert.deepEqual([...state.stateLog.cap], ["Money"]);
assert.deepEqual([...state.stateLog.stall], ["Knowledge", "Iron"]);
assert.equal(state.stateLog.samples.length, 1);
const firstSample = state.stateLog.samples[0];
assert.deepEqual(
  {
    ...firstSample,
    b: [...firstSample.b],
    tc: [...firstSample.tc],
    ci: [...firstSample.ci],
    si: [...firstSample.si],
  },
  {
    d: 123,
    t: 10,
    g: "build",
    mr: 13,
    mm: 6,
    k: 100,
    kr: -2,
    b: ["Forge", "Iron", "storage", Number.MAX_SAFE_INTEGER],
    tc: ["Research", null, "ready", 0],
    ci: ["Money"],
    si: ["Knowledge", "Iron"],
  },
);

resources.Money.storageRatio = 0;
resources.Knowledge.income = 1;
resources.Iron.isDemanded = () => false;
state.scriptTick = 11;
lifecycle.recordStateSnapshot();
const secondSample = state.stateLog.samples[1];
assert.deepEqual([...secondSample.co], ["Money"]);
assert.deepEqual([...secondSample.so], ["Knowledge", "Iron"]);

state.stateLog.samples = Array.from({ length: 20_000 }, (_, index) => ({
  index,
}));
lifecycle.recordStateSnapshot();
assert.equal(state.stateLog.samples.length, 20_000);
assert.equal(state.stateLog.samples[0].index, 1);
assert.equal(stored.has("ea_state_log"), true);

state.stateLog = null;
stored.delete("ea_state_log");
lifecycle.saveStateLog();
assert.equal(stored.has("ea_state_log"), false);

console.log("State log bundled characterization tests passed");
