import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

// The active-targets UI block talks to the page through jQuery. This stub records what was
// selected, lets a scenario decide which ".queued" elements exist, and keeps the click handler
// so the queue-removal path can be invoked directly.
let queuedElements = [];
let jqueryCalls = [];
let clickHandler = null;
let offCalls = [];
let cssCalls = [];

function jquery(target) {
  jqueryCalls.push(typeof target === "string" ? target : "<element>");
  if (typeof target === "object" && target !== null) {
    return { data: (key) => target.data[key] };
  }
  if (target === ".queued") {
    return {
      filter: (predicate) =>
        queuedElements.filter((element, index) => predicate(index, element)),
    };
  }
  return {
    ready() {},
    each() {
      return this;
    },
    click(handler) {
      clickHandler = handler;
      return this;
    },
    off(event) {
      offCalls.push(`${target}:${event}`);
      return this;
    },
    css(property, value) {
      cssCalls.push(`${target}:${property}=${value}`);
      return this;
    },
    show() {},
    hide() {},
    html() {},
  };
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const { hooks } = await loadCharacterizationBundle({
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
  document: { querySelector: () => null },
  $: jquery,
});

assert.equal(typeof hooks.updateState, "function");
assert.equal(typeof hooks.setStateUpdateTestContext, "function");
assert.equal(typeof hooks.makeStateUpdateTargets, "function");

const targets = hooks.makeStateUpdateTargets();

function makeContext({
  species = "human",
  goal = "Standard",
  days = 100,
  race = {},
  triggers = [],
  pillars = null,
  interstellar = null,
  exoticMass = 0,
  moneyIncomes = [1, 9, 2, 8, 3, 7, 4, 6, 5, 0, 10],
  moneyRate = 100,
  optionsCached = true,
  activeTargetsUI = false,
  queuedTargetsAll = [],
  triggerTargets = [],
  targetTriggers = [],
  evolutionResult = true,
} = {}) {
  const trace = [];
  const global = {
    race: { species, ...race },
    stats: { days },
  };
  if (pillars) {
    global.pillars = pillars;
  }
  if (interstellar) {
    global.interstellar = interstellar;
  }

  const state = {
    goal,
    tooltips: { stale: true },
    moneyIncomes: [...moneyIncomes],
    moneyMedian: 0,
    whiteholeLastExoticMass: exoticMass,
    whiteholeLastStabilise: 0,
    astroSign: "",
    queuedTargetsAll,
    triggerTargets,
  };

  const resources = {
    Money: {
      maxCost: 5,
      storageRequired: 5,
      requestedQuantity: 5,
      rateOfChange: moneyRate,
    },
    Stone: {
      maxCost: 5,
      storageRequired: 5,
      requestedQuantity: 5,
      rateOfChange: 3,
    },
  };

  const buildings = {
    GateEastTower: { gameMax: 0 },
    GateWestTower: { gameMax: 0 },
    GasSpaceDock: {
      isOptionsCached: () => optionsCached,
      cacheOptions: () => trace.push("cacheOptions"),
    },
  };

  return {
    trace,
    state,
    resources,
    buildings,
    context: {
      settings: { activeTargetsUI },
      settingsRaw: { triggers },
      state,
      game: { global },
      resources,
      buildings,
      StorageManager: { crateValue: 0, containerValue: 0 },
      ProjectManager: {
        updateProjects: () => trace.push("updateProjects"),
      },
      TriggerManager: { targetTriggers },
      poly: {
        crateValue: () => 111,
        containerValue: () => 222,
        astrologySign: () => "aries",
      },
      helpers: {
        checkEvolutionResult: () => {
          trace.push("checkEvolutionResult");
          return evolutionResult;
        },
        updateTriggerSettingsContent: () =>
          trace.push("updateTriggerSettingsContent"),
        updatePriorityTargets: () => trace.push("updatePriorityTargets"),
        calculateRequiredStorages: () =>
          trace.push("calculateRequiredStorages"),
        prioritizeDemandedResources: () =>
          trace.push("prioritizeDemandedResources"),
        updateActiveTargetsUI: (list, type) =>
          trace.push(`updateActiveTargetsUI:${type}:${list.length}`),
      },
    },
  };
}

function run(options = {}) {
  queuedElements = [];
  jqueryCalls = [];
  clickHandler = null;
  offCalls = [];
  cssCalls = [];
  const fixture = makeContext(options);
  hooks.setStateUpdateTestContext(fixture.context);
  hooks.updateState();
  return fixture;
}

// Evolution: protoplasm forces the goal and then still runs the whole refresh.
const evolving = run({ species: "protoplasm", goal: "Standard" });
assert.equal(evolving.state.goal, "Evolution");
assert.deepEqual(evolving.trace, [
  "updatePriorityTargets",
  "updateProjects",
  "calculateRequiredStorages",
  "prioritizeDemandedResources",
]);

// Leaving Evolution: an accepted result promotes the goal, and trigger descriptions are rebuilt
// only when triggers exist (their tech names could not be resolved during evolution).
const evolvedNoTriggers = run({ goal: "Evolution" });
assert.equal(evolvedNoTriggers.state.goal, "Standard");
assert.deepEqual(evolvedNoTriggers.trace.slice(0, 2), [
  "checkEvolutionResult",
  "updatePriorityTargets",
]);

const evolvedWithTriggers = run({ goal: "Evolution", triggers: [{}] });
assert.deepEqual(evolvedWithTriggers.trace.slice(0, 3), [
  "checkEvolutionResult",
  "updateTriggerSettingsContent",
  "updatePriorityTargets",
]);

// A rejected result (wrong race, pending reset) abandons the tick: nothing else runs and the goal
// stays on Evolution.
const rejected = run({ goal: "Evolution", evolutionResult: false });
assert.equal(rejected.state.goal, "Evolution");
assert.deepEqual(rejected.trace, ["checkEvolutionResult"]);
assert.equal(rejected.resources.Money.maxCost, 5);

// Fallback for a page reload right after evolution: on day 1, the slow/hyper/junker races are
// re-checked even though the goal is already Standard.
for (const race of [{ slow: true }, { hyper: true }]) {
  const reloaded = run({ days: 1, race });
  assert.equal(reloaded.trace[0], "checkEvolutionResult");
}
assert.equal(
  run({ days: 1, species: "junker" }).trace[0],
  "checkEvolutionResult",
);
assert.deepEqual(
  run({ days: 1, evolutionResult: false, race: { slow: true } }).trace,
  ["checkEvolutionResult"],
);
// Day 1 without one of those races, or a later day, skips the fallback entirely.
assert.equal(run({ days: 1 }).trace[0], "updatePriorityTargets");
assert.equal(
  run({ days: 2, race: { slow: true } }).trace[0],
  "updatePriorityTargets",
);

// The standard refresh: every resource's per-tick cost/storage/request accumulators are cleared,
// storage unit values are re-read, and the four planning passes run in dependency order.
const standard = run();
assert.deepEqual(standard.trace, [
  "updatePriorityTargets",
  "updateProjects",
  "calculateRequiredStorages",
  "prioritizeDemandedResources",
]);
for (const resource of Object.values(standard.resources)) {
  assert.equal(resource.maxCost, 0);
  assert.equal(resource.storageRequired, 1);
  assert.equal(resource.requestedQuantity, 0);
}
assert.equal(standard.context.StorageManager.crateValue, 111);
assert.equal(standard.context.StorageManager.containerValue, 222);
// tooltips is replaced with a fresh (userscript-realm) object each tick, so compare its contents.
assert.deepEqual(Object.keys(standard.state.tooltips), []);
assert.equal(standard.state.astroSign, "aries");

// Money income is a rolling 11-sample window: the oldest sample is dropped and the window is
// refilled with the current rate, then the median is the 6th of the sorted samples.
assert.deepEqual(
  standard.state.moneyIncomes,
  [9, 2, 8, 3, 7, 4, 6, 5, 0, 10, 100],
);
assert.equal(standard.state.moneyMedian, 6);
// A short window is padded up to 11 with the current rate before the median is taken.
const shortWindow = run({ moneyIncomes: [1, 2], moneyRate: 50 });
assert.deepEqual(
  shortWindow.state.moneyIncomes,
  [2, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
);
assert.equal(shortWindow.state.moneyMedian, 50);

// Hell tower height shrinks as pillars are raised (2 per pillar rank plus 2), with a floor of 250.
assert.equal(standard.buildings.GateEastTower.gameMax, 1000);
assert.equal(standard.buildings.GateWestTower.gameMax, 1000);
const somePillars = run({ pillars: { human: 3, elven: 0, orc: 1 } });
// human: 3*2+2 = 8, orc: 1*2+2 = 4, elven contributes nothing while unraised.
assert.equal(somePillars.buildings.GateEastTower.gameMax, 1000 - 8 - 4);
// Enough raised pillars to drive the height under the floor: 30 races at rank 20 would remove
// 30 * (20 * 2 + 2) = 1260, but the tower never shrinks below 250.
const allPillars = run({
  pillars: Object.fromEntries(
    Array.from({ length: 30 }, (unused, index) => [`race${index}`, 20]),
  ),
});
assert.equal(allPillars.buildings.GateEastTower.gameMax, 250);
assert.equal(allPillars.buildings.GateWestTower.gameMax, 250);

// Stabilisation is detected by exotic mass going down, not by any game event.
const stabilised = run({
  interstellar: { stellar_engine: { exotic: 5 } },
  exoticMass: 9,
});
assert.equal(stabilised.state.whiteholeLastExoticMass, 5);
assert.ok(stabilised.state.whiteholeLastStabilise > 0);

const growing = run({
  interstellar: { stellar_engine: { exotic: 12 } },
  exoticMass: 9,
});
assert.equal(growing.state.whiteholeLastExoticMass, 12);
assert.equal(growing.state.whiteholeLastStabilise, 0);

// No stellar engine reads as zero exotic mass, which counts as a decrease from any prior value.
const noEngine = run({ exoticMass: 3 });
assert.equal(noEngine.state.whiteholeLastExoticMass, 0);
assert.ok(noEngine.state.whiteholeLastStabilise > 0);

// The Space Dock's extra buildings live in a modal, so its options are cached once.
assert.equal(
  run({ optionsCached: true }).trace.includes("cacheOptions"),
  false,
);
assert.equal(
  run({ optionsCached: false }).trace.includes("cacheOptions"),
  true,
);

// With the active-targets panel off, the only UI work is unbinding the removal handler.
assert.deepEqual(
  standard.trace.filter((call) => call.startsWith("updateActiveTargetsUI")),
  [],
);
assert.deepEqual(offCalls, [".active-target-remove-x:click"]);

// With the panel on, queued targets are split by type: Technology to research, Project to ARPA,
// everything else to buildings. Triggers come from the trigger list, not the queue.
const panel = run({
  activeTargetsUI: true,
  queuedTargetsAll: [
    targets.technology,
    targets.building,
    targets.project,
    targets.technology,
  ],
  triggerTargets: [{}, {}],
});
assert.deepEqual(
  panel.trace.filter((call) => call.startsWith("updateActiveTargetsUI")),
  [
    "updateActiveTargetsUI:triggers:2",
    "updateActiveTargetsUI:buildings:1",
    "updateActiveTargetsUI:research:2",
    "updateActiveTargetsUI:arpa:1",
  ],
);
assert.deepEqual(offCalls, []);
assert.equal(typeof clickHandler, "function");

// Clicking a queued item's X clicks the game's own queue entry, which is what actually removes it.
const queueEntry = {
  id: "city-bank",
  clicked: 0,
  click() {
    this.clicked += 1;
  },
};
queuedElements = [{ id: "space-mine" }, queueEntry];
clickHandler.call({ data: { queueid: "city-bank", type: "buildings" } });
assert.equal(queueEntry.clicked, 1);
assert.deepEqual(cssCalls, ["#active_targets-wrapper:height=auto"]);

// A trigger has no queue entry: it is removed by marking the trigger complete.
const trigger = { actionId: "tech-mad", complete: false };
run({
  activeTargetsUI: true,
  targetTriggers: [{ actionId: "tech-other", complete: false }, trigger],
});
clickHandler.call({ data: { queueid: "tech-mad", type: "triggers" } });
assert.equal(trigger.complete, true);

// An unknown queue id matches nothing and must not throw.
queuedElements = [];
clickHandler.call({ data: { queueid: "missing", type: "buildings" } });

console.log("State update bundled characterization tests passed");
