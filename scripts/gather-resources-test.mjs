import assert from "node:assert/strict";

import { createGatherResourcesAdapter } from "../src/adapters/evolve/gather-resources.ts";
import { runGatherResourcesAutomation } from "../src/application/gather-resources.ts";
import { planGatherResources } from "../src/domain/economy/resources/gather-resources.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

const RESOURCE_IDS = ["Food", "Lumber", "Stone", "Chrysotile", "Furs", "Mana"];
const ACTION_IDS = ["food", "lumber", "stone", "chrysotile", "slaughter"];

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const quantities = {};
  const resources = {
    Population: { currentQuantity: scenario.population ?? 0 },
  };
  for (const id of RESOURCE_IDS) {
    const definition = scenario.resources?.[id] ?? {};
    let current = definition.current ?? (id === "Mana" ? 0 : 0);
    quantities[id] = () => current;
    const resource = {
      maxQuantity: definition.maximum ?? (id === "Mana" ? undefined : 10),
      isUnlocked: () => definition.unlocked ?? true,
    };
    Object.defineProperty(resource, "currentQuantity", {
      get: () => current,
      set(next) {
        current = next;
        trace.stateChange("resource-cache", { resourceId: id, quantity: next });
      },
      enumerable: true,
    });
    resources[id] = resource;
  }
  const clickable = new Set(scenario.clickable ?? []);
  const buildings = Object.fromEntries(
    ACTION_IDS.map((id) => [
      id === "food"
        ? "Food"
        : id === "lumber"
          ? "Lumber"
          : id === "stone"
            ? "Stone"
            : id === "chrysotile"
              ? "Chrysotile"
              : "Slaughter",
      { isClickable: () => clickable.has(id) },
    ]),
  );
  buildings.RockQuarry = { count: scenario.quarryCount ?? 0 };
  const city = Object.fromEntries(
    ACTION_IDS.map((actionId) => [
      actionId,
      {
        action() {
          trace.managerCall("action", { actionId });
          trace.command("gather-resource", { actionId });
        },
      },
    ]),
  );
  const game = {
    global: {
      race: {
        sappy: scenario.sappy ?? false,
        fasting: scenario.fasting ?? false,
        soul_eater: scenario.soulEater ?? false,
      },
      tech: {
        conjuring: scenario.conjuring ?? 0,
        primitive: scenario.primitive ?? 0,
      },
    },
    actions: { city },
  };
  return {
    trace,
    quantities,
    resources,
    buildings,
    game,
    settings: {
      buildingAlwaysClick: scenario.alwaysClick ?? true,
      buildingClickPerTick: scenario.clickLimit ?? 3,
    },
    resourcesPerClick: scenario.resourcesPerClick ?? 2,
  };
}

function result(fixture) {
  return Object.fromEntries(
    RESOURCE_IDS.map((id) => [id, fixture.quantities[id]()]),
  );
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const { game, resources, buildings, settings } = fixture;
  if (
    !settings.buildingAlwaysClick &&
    resources.Population.currentQuantity > 15 &&
    (buildings.RockQuarry.count > 0 || game.global.race["sappy"])
  ) {
    return { trace: fixture.trace.snapshot(), quantities: result(fixture) };
  }

  const resPerClick = fixture.resourcesPerClick;
  let amount;
  if (buildings.Food.isClickable() && !game.global.race["fasting"]) {
    if (game.global.tech.conjuring >= 1) {
      amount = Math.floor(
        Math.min(
          (resources.Food.maxQuantity - resources.Food.currentQuantity) /
            (resPerClick * 10),
          resources.Mana.currentQuantity,
          settings.buildingClickPerTick,
        ),
      );
      resources.Mana.currentQuantity -= amount;
      resources.Food.currentQuantity += amount * resPerClick;
    } else {
      amount = Math.ceil(
        Math.min(
          (resources.Food.maxQuantity - resources.Food.currentQuantity) /
            resPerClick,
          settings.buildingClickPerTick,
        ),
      );
      resources.Food.currentQuantity = Math.min(
        resources.Food.currentQuantity + amount * resPerClick,
        resources.Food.maxQuantity,
      );
    }
    const food = game.actions.city.food;
    for (let index = 0; index < amount; index++) food.action();
  }
  for (const [buildingId, resourceId, actionId] of [
    ["Lumber", "Lumber", "lumber"],
    ["Stone", "Stone", "stone"],
    ["Chrysotile", "Chrysotile", "chrysotile"],
  ]) {
    if (!buildings[buildingId].isClickable()) continue;
    if (game.global.tech.conjuring >= 2) {
      amount = Math.floor(
        Math.min(
          (resources[resourceId].maxQuantity -
            resources[resourceId].currentQuantity) /
            (resPerClick * 10),
          resources.Mana.currentQuantity,
          settings.buildingClickPerTick,
        ),
      );
      resources.Mana.currentQuantity -= amount;
      resources[resourceId].currentQuantity += amount * resPerClick;
    } else {
      amount = Math.ceil(
        Math.min(
          (resources[resourceId].maxQuantity -
            resources[resourceId].currentQuantity) /
            resPerClick,
          settings.buildingClickPerTick,
        ),
      );
      resources[resourceId].currentQuantity = Math.min(
        resources[resourceId].currentQuantity + amount * resPerClick,
        resources[resourceId].maxQuantity,
      );
    }
    const action = game.actions.city[actionId];
    for (let index = 0; index < amount; index++) action.action();
  }
  if (buildings.Slaughter.isClickable()) {
    amount = Math.min(
      Math.max(
        resources.Lumber.maxQuantity - resources.Lumber.currentQuantity,
        resources.Food.maxQuantity - resources.Food.currentQuantity,
        resources.Furs.maxQuantity - resources.Furs.currentQuantity,
      ) / resPerClick,
      settings.buildingClickPerTick,
    );
    const slaughter = game.actions.city.slaughter;
    for (let index = 0; index < amount; index++) slaughter.action();
    resources.Lumber.currentQuantity = Math.min(
      resources.Lumber.currentQuantity + amount * resPerClick,
      resources.Lumber.maxQuantity,
    );
    if (
      game.global.race["soul_eater"] &&
      game.global.tech.primitive >= 1 &&
      !game.global.race["fasting"]
    ) {
      resources.Food.currentQuantity = Math.min(
        resources.Food.currentQuantity + amount * resPerClick,
        resources.Food.maxQuantity,
      );
    }
    if (resources.Furs.isUnlocked()) {
      resources.Furs.currentQuantity = Math.min(
        resources.Furs.currentQuantity + amount * resPerClick,
        resources.Furs.maxQuantity,
      );
    }
  }
  return { trace: fixture.trace.snapshot(), quantities: result(fixture) };
}

function createAdapter(fixture) {
  return createGatherResourcesAdapter({
    getGame: () => fixture.game,
    getSettings: () => fixture.settings,
    getResources: () => fixture.resources,
    getBuildings: () => fixture.buildings,
    getResourcesPerClick: () => fixture.resourcesPerClick,
  });
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const adapter = createAdapter(fixture);
  assert.equal(
    runGatherResourcesAutomation(adapter).status,
    "succeeded",
    scenario.name,
  );
  return { trace: fixture.trace.snapshot(), quantities: result(fixture) };
}

const dualRunScenarios = [
  {
    name: "population guard",
    alwaysClick: false,
    population: 16,
    quarryCount: 1,
    clickable: ACTION_IDS,
  },
  { name: "nothing clickable", clickable: [] },
  {
    name: "ordinary direct resources in order",
    clickable: ["food", "lumber", "stone", "chrysotile"],
    clickLimit: 2,
  },
  {
    name: "conjuring consumes shared mana in order",
    clickable: ["food", "lumber", "stone", "chrysotile"],
    conjuring: 2,
    resources: {
      Food: { maximum: 100 },
      Lumber: { maximum: 100 },
      Stone: { maximum: 100 },
      Chrysotile: { maximum: 100 },
      Mana: { current: 5 },
    },
  },
  {
    name: "fasting skips food but not material gathering",
    fasting: true,
    clickable: ["food", "lumber"],
  },
  {
    name: "fractional slaughter bound rounds clicks up",
    clickable: ["slaughter"],
    soulEater: true,
    primitive: 1,
    resources: {
      Food: { current: 5, maximum: 10 },
      Lumber: { current: 5, maximum: 10 },
      Furs: { current: 5, maximum: 10, unlocked: true },
    },
  },
  {
    name: "slaughter fasting and locked furs update lumber only",
    clickable: ["slaughter"],
    soulEater: true,
    primitive: 1,
    fasting: true,
    resources: { Furs: { current: 0, maximum: 9, unlocked: false } },
  },
  {
    name: "over-cap conjuring preserves negative amount reconciliation",
    clickable: ["food"],
    conjuring: 1,
    resources: {
      Food: { current: 31, maximum: 10 },
      Mana: { current: 2 },
    },
  },
  {
    name: "zero click limit still reconciles cache",
    clickable: ["food", "slaughter"],
    clickLimit: 0,
  },
];

for (const scenario of dualRunScenarios) {
  const legacy = runLegacy(scenario);
  const modern = runModern(scenario);
  assertEquivalentTraces({
    legacy: legacy.trace,
    modern: modern.trace,
    label: `gather resources ${scenario.name}`,
  });
  assert.deepEqual(modern.quantities, legacy.quantities, scenario.name);
}

assert.equal(
  planGatherResources({
    stopped: true,
    resourcesPerClick: 1,
    clickLimit: 0,
    fasting: false,
    soulEater: false,
    primitive: false,
    foodConjuring: false,
    materialConjuring: false,
    fursUnlocked: false,
    clickable: Object.fromEntries(ACTION_IDS.map((id) => [id, false])),
    resources: Object.fromEntries(
      RESOURCE_IDS.map((id) => [id, { currentQuantity: 0, maxQuantity: 0 }]),
    ),
  }),
  null,
);

const staleFixture = createFixture({ clickable: ["food"] });
const staleAdapter = createAdapter(staleFixture);
const staleDecision = planGatherResources(staleAdapter.reader.read());
staleFixture.resources.Food.currentQuantity = 1;
const staleTraceLength = staleFixture.trace.snapshot().length;
assert.equal(staleAdapter.executor.execute(staleDecision).status, "stale");
assert.equal(staleFixture.trace.snapshot().length, staleTraceLength);

const missingActionFixture = createFixture({ clickable: ["food"] });
const missingActionAdapter = createAdapter(missingActionFixture);
const missingActionDecision = planGatherResources(
  missingActionAdapter.reader.read(),
);
delete missingActionFixture.game.actions.city.food.action;
assert.throws(
  () => missingActionAdapter.executor.execute(missingActionDecision),
  /game\.actions\.city\.food\.action/,
);
assert.deepEqual(missingActionFixture.trace.snapshot(), []);

const malformedFixture = createFixture({ clickable: ["food"] });
malformedFixture.settings.buildingClickPerTick = Number.NaN;
assert.throws(
  () => createAdapter(malformedFixture).reader.read(),
  /finite number/,
);

const lockedFixture = createFixture({ clickable: [] });
delete lockedFixture.buildings.RockQuarry;
for (const id of RESOURCE_IDS) delete lockedFixture.resources[id];
assert.equal(
  runGatherResourcesAutomation(createAdapter(lockedFixture)).status,
  "succeeded",
);

let rateRead = false;
const guardedFixture = createFixture({
  alwaysClick: false,
  population: 16,
  sappy: true,
  clickable: ACTION_IDS,
});
const guardedAdapter = createGatherResourcesAdapter({
  getGame: () => guardedFixture.game,
  getSettings: () => guardedFixture.settings,
  getResources: () => guardedFixture.resources,
  getBuildings: () => guardedFixture.buildings,
  getResourcesPerClick: () => {
    rateRead = true;
    return 2;
  },
});
assert.equal(runGatherResourcesAutomation(guardedAdapter).status, "succeeded");
assert.equal(rateRead, false);

const phaseFixture = createFixture({ clickable: ["food"] });
const phaseAdapter = createAdapter(phaseFixture);
const phases = [];
assert.equal(
  runGatherResourcesAutomation({
    reader: {
      read() {
        phases.push("read");
        return phaseAdapter.reader.read();
      },
    },
    executor: {
      execute(decision) {
        phases.push("execute");
        return phaseAdapter.executor.execute(decision);
      },
    },
  }).status,
  "succeeded",
);
assert.deepEqual(phases, ["read", "execute"]);

console.log(
  `Gather resources domain, adapter, application, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
