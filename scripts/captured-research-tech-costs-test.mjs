import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { installCapturedGameMechanics } from "../src/adapters/evolve/captured-game-mechanics.ts";
import { createCapturedActionCostReader } from "../src/adapters/evolve/captured-action-costs.ts";
import { createCapturedResearchTechPriceReader } from "../src/adapters/evolve/progression/research/captured-tech-costs.ts";

function makePage() {
  const page = runInNewContext(
    "({ Object, Map, Number, Math, Array, String })",
  );
  const nativeDefineProperty = page.Object.defineProperty;
  let registryInterceptions = 0;
  page.Object.defineProperty = function (target, key, descriptor) {
    if (target === page.Object && key === "keys") registryInterceptions += 1;
    return Reflect.apply(nativeDefineProperty, this, [target, key, descriptor]);
  };
  return { page, readRegistryInterceptions: () => registryInterceptions };
}

function makeAction(id, cost) {
  return { id, grant: [id.slice("tech-".length), 1], cost };
}

function makeFixture() {
  const { page, readRegistryInterceptions } = makePage();
  const rawCosts = {
    Knowledge: () => 100,
    Helium_3: () => 20,
    Free: () => 0,
    Debt: () => -5,
    Synthetic: () => "special",
  };
  const alphaAction = makeAction("tech-alpha", rawCosts);
  const betaAction = makeAction("tech-beta", { Knowledge: () => 400 });
  const actions = { tech: { alpha: alphaAction, beta: betaAction } };
  const registry = actions.tech;
  const root = {
    queue: {
      queue: [
        { id: "city-farm", label: "existing first", q: 2 },
        { id: "city-housing", label: "existing second", q: 1 },
      ],
    },
  };
  const originalQueue = [...root.queue.queue];
  const adjustmentTargets = [];
  const aliasStates = [];
  let throwCostRead = false;
  let throwControlInvoke = false;
  let replaceRegistryDuringCostRead = false;
  let setDataCalls = 0;

  function adjustCosts(action) {
    adjustmentTargets.push(action);
    return Object.fromEntries(
      Object.entries(action.cost).map(([resource, readRaw]) => [
        resource,
        () => {
          const raw = readRaw();
          return typeof raw === "number" ? raw * 1.5 : raw;
        },
      ]),
    );
  }

  function setData(index, prefix) {
    setDataCalls += 1;
    const entry = root.queue.queue[index];
    const segments = entry.id.split("-");
    let action;
    if (
      segments[0] === "city" ||
      segments[0] === "evolution" ||
      segments[0] === "starDock"
    ) {
      action = actions[segments[0]][segments[1]];
    } else {
      page.Object.keys(actions[segments[0]]).forEach((region) => {
        // eslint-disable-next-line no-prototype-builtins -- mirrors pinned buildQueue.setData lookup
        if (actions[segments[0]][region].hasOwnProperty(segments[1])) {
          action = actions[segments[0]][region][segments[1]];
        }
      });
    }

    if (entry.id === "tech-__ea_research_cost_probe__") {
      const descriptor = Object.getOwnPropertyDescriptor(
        alphaAction,
        "__ea_research_cost_probe__",
      );
      aliasStates.push({
        present: descriptor !== undefined,
        enumerable: descriptor?.enumerable,
        value: descriptor?.value,
        ownKeys: Object.keys(alphaAction),
      });
      if (throwCostRead) throw new Error("native setData failed");
      if (replaceRegistryDuringCostRead) {
        registry.beta = makeAction("tech-beta", { Knowledge: () => 401 });
      }
    }

    const finalCosts = {};
    if (action.cost) {
      const costs = adjustCosts(action);
      page.Object.keys(costs).forEach((resource) => {
        const cost = costs[resource]();
        if (cost > 0) finalCosts[`${prefix}-${resource}`] = cost;
      });
    }
    return finalCosts;
  }

  const control = {
    elementId: "buildQueue",
    generation: 1,
    methods: ["setData"],
  };
  const controls = {
    resolve: (elementId) => (elementId === "buildQueue" ? control : undefined),
    capturedElementIds: () => ["buildQueue"],
    invoke(handle, method, args = []) {
      if (handle.generation !== control.generation)
        return { ok: false, reason: "stale-control" };
      if (throwControlInvoke) throw new Error("control invoke failed");
      try {
        return { ok: true, value: { setData }[method](...args) };
      } catch (error) {
        return { ok: false, reason: "threw", detail: String(error) };
      }
    },
  };
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  const installed = installCapturedGameMechanics(
    page,
    { subscribe: () => () => {} },
    rootState,
  );
  installed.mechanics.captureTechDefinitionsDuring(() =>
    page.Object.keys(registry),
  );
  const interceptsAfterCapture = readRegistryInterceptions();
  const costs = createCapturedActionCostReader({ rootState, controls });
  const nativePrices = createCapturedResearchTechPriceReader({
    mechanics: installed.mechanics,
    costs,
  });

  return {
    page,
    registry,
    alphaAction,
    betaAction,
    root,
    originalQueue,
    adjustmentTargets,
    aliasStates,
    installed,
    nativePrices,
    costs,
    readRegistryInterceptions,
    interceptsAfterCapture,
    readSetDataCalls: () => setDataCalls,
    setThrowCostRead: (value) => {
      throwCostRead = value;
    },
    setThrowControlInvoke: (value) => {
      throwControlInvoke = value;
    },
    setReplaceRegistryDuringCostRead: (value) => {
      replaceRegistryDuringCostRead = value;
    },
  };
}

function assertQueueRestored(fixture) {
  assert.deepEqual(fixture.root.queue.queue, fixture.originalQueue);
  assert.equal(fixture.root.queue.queue.length, fixture.originalQueue.length);
  for (let index = 0; index < fixture.originalQueue.length; index += 1) {
    assert.strictEqual(
      fixture.root.queue.queue[index],
      fixture.originalQueue[index],
      `queued row ${index} keeps its identity and order`,
    );
  }
}

function assertAliasAbsent(fixture) {
  assert.equal(
    Object.getOwnPropertyDescriptor(
      fixture.alphaAction,
      "__ea_research_cost_probe__",
    ),
    undefined,
  );
  assert.equal(
    Object.getOwnPropertyDescriptor(
      fixture.betaAction,
      "__ea_research_cost_probe__",
    ),
    undefined,
  );
}

{
  const fixture = makeFixture();
  const ownKeysBefore = Object.keys(fixture.alphaAction);
  assertAliasAbsent(fixture);

  assert.equal(
    fixture.costs.readCost("tech-alpha"),
    undefined,
    "the generic queue lookup does not special-case flat actions.tech",
  );
  assertQueueRestored(fixture);
  assert.equal(fixture.adjustmentTargets.length, 0);

  const alphaPrice = fixture.nativePrices.readTechCost("tech-alpha");
  assert.deepEqual(alphaPrice, {
    Knowledge: 150,
    Helium_3: 30,
  });
  assert.deepEqual(fixture.adjustmentTargets, [fixture.alphaAction]);
  assert.equal(alphaPrice.Synthetic, undefined);
  assert.equal(alphaPrice.Free, undefined);
  assert.equal(alphaPrice.Debt, undefined);
  assert.deepEqual(fixture.aliasStates, [
    {
      present: true,
      enumerable: false,
      value: fixture.alphaAction,
      ownKeys: ownKeysBefore,
    },
  ]);
  assertAliasAbsent(fixture);
  assertQueueRestored(fixture);
  assert.equal(
    fixture.readRegistryInterceptions(),
    fixture.interceptsAfterCapture,
    "a successful cost read does not recapture the page-lifetime registry",
  );
  assert.deepEqual(
    fixture.installed.mechanics
      .readTechDefinitions()
      ?.map(({ actionId }) => actionId),
    ["tech-alpha", "tech-beta"],
  );
  fixture.installed.uninstall();
}

{
  const fixture = makeFixture();
  Object.preventExtensions(fixture.alphaAction);
  const callsBefore = fixture.readSetDataCalls();
  assert.equal(fixture.nativePrices.readTechCost("tech-alpha"), undefined);
  assert.equal(fixture.readSetDataCalls(), callsBefore);
  assertAliasAbsent(fixture);
  assertQueueRestored(fixture);
  fixture.installed.uninstall();
}

{
  const fixture = makeFixture();
  assert.throws(
    () =>
      fixture.installed.mechanics.withTechQueueCostAlias("tech-alpha", () => {
        assert.equal(
          Object.getOwnPropertyDescriptor(
            fixture.alphaAction,
            "__ea_research_cost_probe__",
          )?.enumerable,
          false,
        );
        throw new Error("callback failed");
      }),
    /callback failed/u,
  );
  assertAliasAbsent(fixture);
  assertQueueRestored(fixture);

  fixture.setThrowCostRead(true);
  const callsBefore = fixture.readSetDataCalls();
  assert.equal(fixture.nativePrices.readTechCost("tech-alpha"), undefined);
  assert.equal(fixture.readSetDataCalls(), callsBefore + 1);
  assertAliasAbsent(fixture);
  assertQueueRestored(fixture);

  fixture.setThrowControlInvoke(true);
  assert.throws(
    () => fixture.nativePrices.readTechCost("tech-alpha"),
    /control invoke failed/u,
  );
  assertAliasAbsent(fixture);
  assertQueueRestored(fixture);
  fixture.installed.uninstall();
}

{
  const fixture = makeFixture();
  const collision = Object.freeze({ keep: true });
  Object.defineProperty(fixture.betaAction, "__ea_research_cost_probe__", {
    configurable: true,
    enumerable: false,
    value: collision,
  });
  const callsBefore = fixture.readSetDataCalls();
  assert.equal(fixture.nativePrices.readTechCost("tech-alpha"), undefined);
  assert.equal(fixture.readSetDataCalls(), callsBefore);
  assert.strictEqual(
    Object.getOwnPropertyDescriptor(
      fixture.betaAction,
      "__ea_research_cost_probe__",
    )?.value,
    collision,
  );
  assertQueueRestored(fixture);
  fixture.installed.uninstall();
}

{
  const fixture = makeFixture();
  const callsBefore = fixture.readSetDataCalls();
  assert.equal(fixture.nativePrices.readTechCost("tech-missing"), undefined);
  assert.equal(fixture.readSetDataCalls(), callsBefore);
  assertAliasAbsent(fixture);
  assertQueueRestored(fixture);
  fixture.installed.uninstall();
}

for (const invalidate of [
  (fixture) => {
    fixture.registry.alpha = makeAction("tech-alpha", { Knowledge: () => 100 });
  },
  (fixture) => {
    fixture.registry.gamma = makeAction("tech-gamma", { Knowledge: () => 1 });
  },
]) {
  const fixture = makeFixture();
  invalidate(fixture);
  const callsBefore = fixture.readSetDataCalls();
  assert.equal(fixture.nativePrices.readTechCost("tech-alpha"), undefined);
  assert.equal(fixture.readSetDataCalls(), callsBefore);
  assert.equal(fixture.installed.mechanics.readTechDefinitions(), undefined);
  assertAliasAbsent(fixture);
  assertQueueRestored(fixture);
  fixture.installed.uninstall();
}

{
  const fixture = makeFixture();
  fixture.setReplaceRegistryDuringCostRead(true);
  assert.equal(fixture.nativePrices.readTechCost("tech-alpha"), undefined);
  assert.equal(fixture.readSetDataCalls(), 1);
  assertAliasAbsent(fixture);
  assertQueueRestored(fixture);
  assert.equal(fixture.installed.mechanics.readTechDefinitions(), undefined);
  fixture.installed.uninstall();
}

console.log("captured-research-tech-costs ok");
