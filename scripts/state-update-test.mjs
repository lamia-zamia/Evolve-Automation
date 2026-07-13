import assert from "node:assert/strict";

import { createStateUpdate } from "../src/automation/state-update.ts";

function makeJQuery() {
  const calls = [];
  const jquery = (target) => {
    calls.push(typeof target === "string" ? target : "<element>");
    return {
      click() {},
      off() {},
      css() {},
      filter: () => [],
      data: () => undefined,
    };
  };
  jquery.calls = calls;
  return jquery;
}

function makeContext(overrides = {}) {
  return {
    settings: { activeTargetsUI: false },
    settingsRaw: { triggers: [] },
    state: {
      goal: "Standard",
      tooltips: {},
      moneyIncomes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      moneyMedian: 0,
      astroSign: "",
      whiteholeLastExoticMass: 0,
      whiteholeLastStabilise: 0,
      queuedTargetsAll: [],
      triggerTargets: [],
    },
    game: { global: { race: { species: "human" }, stats: { days: 10 } } },
    resources: {
      Money: {
        maxCost: 9,
        storageRequired: 9,
        requestedQuantity: 9,
        rateOfChange: 42,
      },
    },
    buildings: {
      GateEastTower: { gameMax: 0 },
      GateWestTower: { gameMax: 0 },
      GasSpaceDock: { isOptionsCached: () => true, cacheOptions() {} },
    },
    StorageManager: { crateValue: 0, containerValue: 0 },
    ProjectManager: { updateProjects() {} },
    TriggerManager: { targetTriggers: [] },
    poly: {
      crateValue: () => 10,
      containerValue: () => 20,
      astrologySign: () => "leo",
    },
    jquery: makeJQuery(),
    ...overrides,
  };
}

// Everything the factory reads is resolved per call, so a whole-context swap after creation is
// still observed. The script replaces these objects on prestige and on test setup.
let context = makeContext();
let helpers;

const { updateState } = createStateUpdate({
  getSettings: () => context.settings,
  getSettingsRaw: () => context.settingsRaw,
  getState: () => context.state,
  getGame: () => context.game,
  getResources: () => context.resources,
  getBuildings: () => context.buildings,
  getStorageManager: () => context.StorageManager,
  getProjectManager: () => context.ProjectManager,
  getTriggerManager: () => context.TriggerManager,
  getPoly: () => context.poly,
  getJQuery: () => context.jquery,
  getHelpers: () => helpers,
  isTechnology: (target) => target?.kind === "tech",
  isProject: (target) => target?.kind === "arpa",
});

function makeHelpers(evolutionResult = true) {
  const trace = [];
  return {
    trace,
    checkEvolutionResult: () => {
      trace.push("checkEvolutionResult");
      return evolutionResult;
    },
    updateTriggerSettingsContent: () => trace.push("triggerSettings"),
    updatePriorityTargets: () => trace.push("priorityTargets"),
    calculateRequiredStorages: () => trace.push("requiredStorages"),
    prioritizeDemandedResources: () => trace.push("demandedResources"),
    updateActiveTargetsUI: (list, type) =>
      trace.push(`ui:${type}:${list.length}`),
  };
}

helpers = makeHelpers();
updateState();
assert.deepEqual(helpers.trace, [
  "priorityTargets",
  "requiredStorages",
  "demandedResources",
]);
assert.equal(context.StorageManager.crateValue, 10);
assert.equal(context.state.astroSign, "leo");
assert.equal(context.resources.Money.maxCost, 0);
assert.equal(context.buildings.GateEastTower.gameMax, 1000);

// Replace every runtime object and rerun: the new context, not the one captured at creation, is
// the one that gets updated.
const replacement = makeContext();
replacement.poly.astrologySign = () => "virgo";
replacement.game.global.race.species = "protoplasm";
const stale = context;
context = replacement;
helpers = makeHelpers();
updateState();
assert.equal(replacement.state.goal, "Evolution");
assert.equal(replacement.state.astroSign, "virgo");
assert.equal(stale.state.astroSign, "leo");

// The helpers are resolved on every call too, so a controller rewired between ticks is picked up.
helpers = makeHelpers(false);
context = makeContext();
context.state.goal = "Evolution";
updateState();
assert.deepEqual(helpers.trace, ["checkEvolutionResult"]);
assert.equal(context.state.goal, "Evolution");

// The instanceof classification is injected, so the module never needs the script's classes.
helpers = makeHelpers();
context = makeContext();
context.settings.activeTargetsUI = true;
context.state.queuedTargetsAll = [
  { kind: "tech" },
  { kind: "arpa" },
  { kind: "building" },
  { kind: "tech" },
];
context.state.triggerTargets = [{ kind: "tech" }];
updateState();
assert.deepEqual(helpers.trace.slice(3), [
  "ui:triggers:1",
  "ui:buildings:1",
  "ui:research:2",
  "ui:arpa:1",
]);
assert.ok(context.jquery.calls.includes(".active-target-remove-x"));

console.log("State update module tests passed");
