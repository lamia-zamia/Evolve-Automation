import assert from "node:assert/strict";

import { createGatherResourcesAdapter } from "../src/adapters/evolve/economy/resources/gather-resources.ts";
import { runGatherResourcesAutomation } from "../src/application/gather-resources.ts";
import { planGatherResources } from "../src/domain/economy/resources/gather-resources.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

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

function createAdapter(fixture) {
  return createGatherResourcesAdapter({
    getGame: () => fixture.game,
    getSettings: () => fixture.settings,
    getResources: () => fixture.resources,
    getBuildings: () => fixture.buildings,
    getResourcesPerClick: () => fixture.resourcesPerClick,
  });
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

console.log("Gather resources domain, adapter, and application tests passed");
