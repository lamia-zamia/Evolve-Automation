import assert from "node:assert/strict";

import { createCapturedMechReservationSource } from "../src/adapters/evolve/combat/captured-mech-reservations.ts";
import { createCapturedMechDemandSource } from "../src/adapters/evolve/combat/captured-mech-demand.ts";
import { createCapturedProgressionControl } from "../src/bootstrap/captured-progression-control.ts";
import {
  createCapturedResourceDemand,
  EMPTY_DEMAND_SAMPLE,
} from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";
import { planMechDemandCosts } from "../src/domain/combat/mech-auto-choice.ts";
import { planCapturedMechAuto } from "../src/domain/combat/captured-mech.ts";
import { readCapturedMechState } from "../src/domain/combat/mech-state.ts";
import { runCraftAutomation } from "../src/application/craft.ts";
import {
  createCapturedCraftExecutor,
  createCapturedCraftReader,
} from "../src/adapters/evolve/economy/production/captured-crafting.ts";
import { createCapturedCraftCosts } from "../src/adapters/evolve/economy/production/captured-craft-costs.ts";

function makeRoot() {
  return {
    settings: { qKey: false, keyMap: { q: "q" } },
    race: {},
    blood: {},
    stats: {},
    portal: {
      mechbay: {
        max: 25,
        bay: 0,
        active: 0,
        scouts: 2,
        mechs: [],
        blueprint: {
          size: "small",
          chassis: "tread",
          hardpoint: ["laser"],
          equip: ["special", "shields"],
          infernal: false,
        },
      },
      purifier: {
        supply: 1_900_000,
        sup_max: 2_000_000,
        count: 1,
        on: 1,
        diff: 0,
      },
      spire: { count: 1, type: "sand", progress: 0, status: {}, boss: "snake" },
    },
    resource: {
      Soul_Gem: { amount: 0, max: 100, stackable: false, diff: 0 },
      Supply: { amount: 1_000, max: -1, stackable: false },
      Money: { amount: 0, max: 500, stackable: false },
    },
  };
}

const settings = {
  autoMech: true,
  mechBuild: "random",
  mechSize: "medium",
  mechSizeGravity: "auto",
  mechFillBay: false,
  mechSaveSupplyRatio: 0,
};

function plan(root, scriptSettings = settings, userBuildCost) {
  return planMechDemandCosts({
    state: readCapturedMechState({
      root,
      settings: scriptSettings,
      queueKeyHeld: false,
    }),
    ...(userBuildCost === undefined ? {} : { userBuildCost }),
  });
}

function makeDemandSource(root, scriptSettings = settings, methods) {
  const availableMethods = methods ?? ["build", "bay", "price", "soul"];
  const control = {
    elementId: "mechAssembly",
    generation: 1,
    methods: availableMethods,
  };
  return createCapturedMechDemandSource({
    rootState: { readRoot: () => root },
    readSettings: () => scriptSettings,
    controls: {
      resolve: () => control,
      invoke: (_handle, method) => ({
        ok: true,
        value: { bay: 5, price: 180_000, soul: 4 }[method],
      }),
    },
  });
}

function runConstructionWithMechPriority(buildingMechsFirst) {
  const root = makeRoot();
  let buildingMechsFirstSetting = buildingMechsFirst;
  let readDemand = () => EMPTY_DEMAND_SAMPLE;
  const mechPriorityBudget = new Map();
  root.settings = { qKey: false, qAny: false };
  root.city = { factory: { count: 0, on: 0 } };
  root.resource.Supply.amount = 100_000;
  root.resource.Supply.max = -1;
  root.resource.Supply.stackable = false;
  root.resource.Soul_Gem.amount = 4;
  root.resource.Soul_Gem.max = 100;
  root.resource.Soul_Gem.stackable = false;
  root.queue = { display: false, queue: [], max: 10 };
  const target = {
    catalogKey: "factory",
    name: "Factory",
    _id: "factory",
    _tab: "city",
    _location: "city",
    _weighting: 1,
    weighting: 1,
    elementId: "city-factory",
    definition: { region: "city" },
    is: {},
    autoBuildEnabled: true,
    isUnlocked: () => true,
    isSmartManaged: () => false,
    count: 0,
    autoMax: 1,
    stateOffCount: 0,
    isAffordable: () => true,
    powered: 0,
    cost: { Supply: 50_000 },
    getMissingConsumption: () => null,
    getMissingSupport: () => null,
    getUselessSupport: () => null,
    consumption: [],
  };
  const controlGenerations = new Map([
    ["city-factory", 1],
    ["buildQueue", 1],
    ["mechAssembly", 1],
  ]);
  let actionCalls = 0;
  const controls = {
    resolve(elementId) {
      const generation = controlGenerations.get(elementId);
      if (generation === undefined) return undefined;
      const methods =
        elementId === "city-factory"
          ? ["action"]
          : elementId === "buildQueue"
            ? ["setData"]
            : ["build", "bay", "price", "soul"];
      return {
        elementId,
        generation,
        methods,
        data:
          elementId === "city-factory"
            ? { act: { name: "Factory" } }
            : undefined,
      };
    },
    invoke(handle, method) {
      if (controlGenerations.get(handle.elementId) !== handle.generation) {
        return { ok: false, reason: "stale-control" };
      }
      if (method === "setData") {
        return { ok: true, value: { "data-Supply": 50_000 } };
      }
      if (handle.elementId === "mechAssembly") {
        return {
          ok: true,
          value: { bay: 5, price: 180_000, soul: 4 }[method],
        };
      }
      if (method === "action") {
        actionCalls += 1;
        root.city.factory.count += 1;
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => [...controlGenerations.keys()],
  };
  const progression = createCapturedProgressionControl({
    rootState: { readRoot: () => root, subscribeRootReplaced: () => () => {} },
    controls,
    mountSuppression: { available: true, withoutMounting: (draw) => draw() },
    panels: { open: () => undefined },
    drawnActions: { read: () => [], exists: () => false },
    drawnProjects: { read: () => undefined, exists: () => false },
    getBuildingManager: () => ({
      updateWeighting: () => {},
      managedPriorityList: () => [target],
    }),
    readSettings: () => ({
      autoMech: true,
      mechBuild: "user",
      buildingMechsFirst: buildingMechsFirstSetting,
    }),
    readReservedQuantityForMechPriority: (resourceId) => {
      const requested =
        readDemand().requestedQuantityForMechPriority(resourceId);
      mechPriorityBudget.set(resourceId, requested);
      return requested;
    },
    nowMs: () => 0,
  });
  const resourceDemand = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({
      autoMech: true,
      mechBuild: "user",
      buildingMechsFirst: buildingMechsFirstSetting,
    }),
    construction: progression.observations,
    mechDemand: progression.mechDemand,
  });
  readDemand = () => resourceDemand.sample();
  return {
    progression,
    resourceDemand,
    root,
    actionCalls: () => actionCalls,
    setBuildingMechsFirst: (value) => {
      buildingMechsFirstSetting = value;
    },
    mechPriorityBudget: (resourceId) => mechPriorityBudget.get(resourceId),
  };
}

// The pursued build's cost is one shared answer for demand and reservations.
{
  const demand = plan(makeRoot());
  assert.deepEqual(demand, {
    status: "ready",
    cost: { supply: 180_000, gems: 4, space: 5 },
  });

  assert.deepEqual(plan(makeRoot(), { ...settings, mechBuild: "user" }), {
    status: "unavailable",
  });
  assert.deepEqual(plan(makeRoot(), { ...settings, autoMech: false }), {
    status: "none",
  });
  const warlord = makeRoot();
  warlord.race = { warlord: true };
  assert.deepEqual(plan(warlord), { status: "none" });
}

// A governor task holds titan cost even when the script builds by hand.
{
  const governed = makeRoot();
  governed.race = { governor: { tasks: { slot1: "mech" } } };
  assert.deepEqual(plan(governed, { ...settings, mechBuild: "user" }), {
    status: "ready",
    cost: { supply: 750_000, gems: 75, space: 25 },
  });
}

// User-blueprint prices come from the captured assembly methods, not a copied cost formula.
{
  const root = makeRoot();
  const userSettings = { ...settings, mechBuild: "user" };
  const demand = makeDemandSource(root, userSettings);
  assert.deepEqual(demand.read().plan, {
    status: "ready",
    cost: { supply: 180_000, gems: 4, space: 5 },
  });
  assert.deepEqual(
    makeDemandSource(root, userSettings, ["build", "bay", "soul"]).read().plan,
    { status: "unavailable" },
  );
  assert.deepEqual(
    createCapturedMechReservationSource({
      demand: makeDemandSource(root, userSettings, ["build", "bay", "soul"]),
    }).readReservations(),
    { unavailable: true, targets: [] },
  );
  assert.deepEqual(
    createCapturedMechReservationSource({
      demand: makeDemandSource(
        root,
        { ...userSettings, buildingMechsFirst: false },
        ["build", "bay", "soul"],
      ),
    }).readReservations(),
    { unavailable: false, targets: [] },
  );
  root.portal.mechbay.max = 4;
  assert.deepEqual(demand.read().plan, { status: "none" });
}

// Construction priority only reserves a Mech target when it can fit and pass the historical
// Supply-capacity and Soul-Gem reservation gates.
{
  const root = makeRoot();
  root.portal.purifier.sup_max = 100_000;
  const source = createCapturedMechReservationSource({
    demand: makeDemandSource(root, { ...settings, mechBuild: "user" }),
  });
  assert.deepEqual(source.readReservations(), {
    unavailable: false,
    targets: [],
  });

  const gemRoot = makeRoot();
  gemRoot.resource.Soul_Gem.amount = 4;
  const reservedGems = createCapturedMechReservationSource({
    demand: makeDemandSource(gemRoot, { ...settings, mechBuild: "user" }),
    readReservedQuantityForMechPriority: (id) => (id === "Soul_Gem" ? 4 : 0),
  });
  assert.deepEqual(reservedGems.readReservations(), {
    unavailable: false,
    targets: [],
  });

  const reservedSupplyRoot = makeRoot();
  reservedSupplyRoot.resource.Soul_Gem.amount = 4;
  reservedSupplyRoot.resource.Supply.amount = 100_000;
  const reservedSupply = createCapturedMechReservationSource({
    demand: makeDemandSource(reservedSupplyRoot, {
      ...settings,
      mechBuild: "user",
    }),
    readReservedQuantityForMechPriority: (id) =>
      id === "Supply" ? 1_800_000 : 0,
  });
  assert.deepEqual(reservedSupply.readReservations(), {
    unavailable: false,
    targets: [],
  });
}

// The reservation source names the same target for the build loop.
{
  const root = makeRoot();
  root.resource.Soul_Gem.amount = 4;
  const source = createCapturedMechReservationSource({
    demand: makeDemandSource(root),
  });
  assert.deepEqual(source.readReservations(), {
    unavailable: false,
    targets: [
      {
        name: "mech",
        cause: "autoMech",
        cost: { Supply: 180_000, Soul_Gem: 4 },
      },
    ],
  });

  const off = createCapturedMechReservationSource({
    demand: makeDemandSource(root, { ...settings, mechBuild: "none" }),
  });
  assert.deepEqual(off.readReservations(), {
    unavailable: false,
    targets: [],
  });
}

// Construction honors only the Mech-first preference; global demand above stays independent.
{
  const root = makeRoot();
  root.resource.Soul_Gem.amount = 4;
  const userSettings = { ...settings, mechBuild: "user" };
  const demand = makeDemandSource(root, userSettings);
  const enabled = createCapturedMechReservationSource({ demand });
  assert.deepEqual(enabled.readReservations().targets[0]?.cost, {
    Supply: 180_000,
    Soul_Gem: 4,
  });
  assert.deepEqual(
    createCapturedMechReservationSource({
      demand: makeDemandSource(root, {
        ...userSettings,
        buildingMechsFirst: false,
      }),
    }).readReservations(),
    { unavailable: false, targets: [] },
  );
}

// The reservation is wired through captured progression into the actual construction cycle.
{
  const protectedBuild = runConstructionWithMechPriority(true);
  assert.deepEqual(protectedBuild.progression.runConstructionCycle(), {
    status: "succeeded",
  });
  assert.equal(protectedBuild.actionCalls(), 0);
  assert.equal(protectedBuild.root.city.factory.count, 0);

  const allowedBuild = runConstructionWithMechPriority(false);
  const globalDemand = createCapturedResourceDemand({
    rootState: { readRoot: () => allowedBuild.root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({
      autoMech: true,
      mechBuild: "user",
      buildingMechsFirst: false,
    }),
    mechDemand: allowedBuild.progression.mechDemand,
  }).sample();
  assert.equal(globalDemand.requestedQuantity("Supply"), 180_000);
  assert.equal(globalDemand.requestedQuantity("Soul_Gem"), 4);
  assert.deepEqual(allowedBuild.progression.runConstructionCycle(), {
    status: "succeeded",
  });
  assert.equal(allowedBuild.actionCalls(), 1);
  assert.equal(allowedBuild.root.city.factory.count, 1);
}

// Mech-first priority excludes the construction cycle's own previous saving target.
{
  const noPriority = runConstructionWithMechPriority(false);
  noPriority.root.portal.purifier.supply = 25_000;
  noPriority.progression.runConstructionCycle();
  noPriority.root.portal.purifier.supply = 50_000;
  noPriority.progression.runConstructionCycle();
  assert.equal(noPriority.actionCalls(), 1);

  const cycle = runConstructionWithMechPriority(false);
  cycle.root.portal.purifier.supply = 25_000;
  assert.deepEqual(cycle.progression.runConstructionCycle(), {
    status: "succeeded",
  });
  assert.equal(cycle.actionCalls(), 0);

  cycle.root.portal.purifier.supply = 50_000;
  cycle.setBuildingMechsFirst(true);
  assert.deepEqual(cycle.progression.runConstructionCycle(), {
    status: "succeeded",
  });
  assert.deepEqual(cycle.progression.observations.readSavingTarget(), {
    name: "factory",
    cost: { Supply: 50_000 },
  });
  const demandSample = cycle.resourceDemand.sample();
  assert.equal(demandSample.requestedQuantityExcludingMech("Supply"), 50_000);
  assert.equal(demandSample.requestedQuantityForMechPriority("Supply"), 0);
  assert.equal(cycle.mechPriorityBudget("Supply"), 0);
  assert.equal(
    cycle.progression.mechDemand.read({ supply: 0, soulGems: 0 }).immediatePlan
      .status,
    "ready",
  );
  assert.equal(cycle.actionCalls(), 0);
  assert.equal(cycle.root.city.factory.count, 0);
}

// A full bay with scrap disabled cannot have a pending random build target.
{
  const root = makeRoot();
  root.portal.mechbay.bay = 25;
  assert.deepEqual(plan(root, { ...settings, mechScrap: "none" }), {
    status: "none",
  });
  assert.deepEqual(
    createCapturedMechReservationSource({
      demand: makeDemandSource(root, { ...settings, mechScrap: "none" }),
    }).readReservations(),
    { unavailable: false, targets: [] },
  );
  // Lack of funds alone keeps an aspirational design demanded.
  root.portal.mechbay.bay = 0;
  root.portal.purifier.supply = 0;
  root.resource.Soul_Gem.amount = 0;
  assert.equal(plan(root).status, "ready");
}

// A full bay does not reserve a replacement while an affordable bay expansion can satisfy it.
{
  const root = makeRoot();
  root.portal.mechbay.max = 2;
  root.portal.mechbay.bay = 2;
  root.portal.mechbay.active = 1;
  root.portal.mechbay.mechs = [
    {
      size: "small",
      chassis: "tread",
      hardpoint: ["laser"],
      equip: ["special", "shields"],
      infernal: false,
    },
  ];
  root.portal.purifier.diff = 1_000;
  const demand = createCapturedMechDemandSource({
    rootState: { readRoot: () => root },
    readSettings: () => ({
      ...settings,
      mechMinSupply: 0,
      buildingMechsFirst: true,
    }),
    controls: {
      resolve: () => ({
        elementId: "mechAssembly",
        generation: 1,
        methods: ["build", "bay", "price", "soul"],
      }),
      invoke: (_handle, method) => ({
        ok: true,
        value: { bay: 5, price: 180_000, soul: 4 }[method],
      }),
    },
    readCanExpandBay: () => true,
  });
  assert.deepEqual(demand.read().plan, { status: "none" });
  assert.deepEqual(
    createCapturedMechReservationSource({ demand }).readReservations(),
    { unavailable: false, targets: [] },
  );
}

// Global replacement demand exists only when the shared cumulative planner can scrap a real target.
{
  const root = makeRoot();
  root.portal.mechbay.max = 5;
  root.resource.Soul_Gem.amount = 100;
  const state = readCapturedMechState({
    root,
    settings: { ...settings, mechFillBay: false },
    queueKeyHeld: false,
  });
  const best = planCapturedMechAuto(state, () => 0);
  assert.ok(best);
  root.portal.mechbay.bay = 5;
  root.portal.mechbay.active = 1;
  root.portal.mechbay.mechs = [best.design];
  const demand = createCapturedMechDemandSource({
    rootState: { readRoot: () => root },
    readSettings: () => ({
      ...settings,
      mechFillBay: false,
      mechScrap: "all",
    }),
    controls: {
      resolve: () => ({
        elementId: "mechAssembly",
        generation: 1,
        methods: ["build", "bay", "price", "soul"],
      }),
      invoke: (_handle, method) => ({
        ok: true,
        value: { bay: 5, price: 180_000, soul: 4 }[method],
      }),
    },
    readCanExpandBay: () => false,
  });
  assert.deepEqual(demand.read().plan, { status: "none" });
}

// An unpriceable enabled Mech holds both resource pools until the cost is capturable.
{
  const root = makeRoot();
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => ({ ...settings, mechBuild: "user" }),
    mechDemand: {
      read: () => ({
        buildingMechsFirst: true,
        plan: { status: "unavailable" },
        immediatePlan: { status: "unavailable" },
      }),
    },
  }).sample();
  assert.equal(sample.requestedQuantity("Supply"), Number.MAX_SAFE_INTEGER);
  assert.equal(sample.requestedQuantity("Soul_Gem"), 100);
  assert.equal(sample.isDemanded("Supply"), true);
  assert.equal(sample.isDemanded("Soul_Gem"), true);

  // The real captured crafting reader consumes this sample and must stand down before spending
  // the protected Supply, not just report a demand target in isolation.
  root.race = { species: "human" };
  root.resource.human = { name: "Human", display: true, amount: 10, max: 20 };
  root.resource.Supply = {
    name: "Supply",
    display: true,
    amount: 500,
    max: -1,
    diff: 10,
  };
  root.resource.SupplyParts = {
    name: "Supply Parts",
    display: true,
    amount: 0,
    max: -1,
    diff: 0,
  };
  const craftRow = {
    elementId: "resSupplyParts",
    generation: 1,
    methods: ["craft", "craftCost"],
  };
  let craftCalls = 0;
  const craftControls = {
    capturedElementIds: () => [craftRow.elementId],
    resolve: (elementId) =>
      elementId === craftRow.elementId ? craftRow : undefined,
    invoke: (_handle, method, args = []) => {
      if (method === "craftCost") {
        return { ok: true, value: "<div>Supply 10</div>" };
      }
      if (method === "craft") {
        const count = Number(args[1]);
        craftCalls += 1;
        root.resource.Supply.amount -= count * 10;
        root.resource.SupplyParts.amount += count;
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "missing-method" };
    },
  };
  const craftDependencies = {
    rootState: { readRoot: () => root },
    controls: craftControls,
    costs: createCapturedCraftCosts({
      rootState: { readRoot: () => root },
      controls: craftControls,
    }),
    getDocument: () => ({
      getElementById: (id) => (id === "incSupplyPartsA" ? { id } : null),
    }),
    readSettings: () => ({ tickRate: 1 }),
    readDemand: () => sample,
  };
  assert.deepEqual(
    runCraftAutomation({
      reader: createCapturedCraftReader(craftDependencies),
      executor: createCapturedCraftExecutor(craftDependencies),
    }),
    { status: "succeeded" },
  );
  assert.equal(craftCalls, 0);
  assert.equal(root.resource.Supply.amount, 500);
}

// The Mech budget receives other max-combined demand targets without reserving its own cost.
{
  const root = makeRoot();
  let mechBudget;
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({
        unavailable: false,
        targets: [
          {
            name: "queued factory",
            cause: "queue",
            cost: { Supply: 400_000, Soul_Gem: 20 },
          },
        ],
      }),
    },
    readSettings: () => ({
      ...settings,
      prioritizeQueue: "req",
    }),
    mechDemand: {
      read: (reserved) => {
        mechBudget = reserved;
        return {
          buildingMechsFirst: true,
          plan: {
            status: "ready",
            cost: { supply: 180_000, gems: 4, space: 5 },
          },
          immediatePlan: {
            status: "ready",
            cost: { supply: 180_000, gems: 4, space: 5 },
          },
        };
      },
    },
  }).sample();
  assert.deepEqual(mechBudget, { supply: 400_000, soulGems: 20 });
  assert.equal(sample.requestedQuantityExcludingMech("Supply"), 400_000);
  assert.equal(sample.requestedQuantityExcludingMech("Soul_Gem"), 20);
  assert.equal(sample.requestedQuantityForMechPriority("Supply"), 400_000);
  assert.equal(sample.requestedQuantityForMechPriority("Soul_Gem"), 20);
}

// The demand sample reports the planned build to every spending subsystem.
{
  const root = makeRoot();
  const sample = createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    readSettings: () => settings,
  }).sample();
  assert.equal(sample.requestedQuantity("Supply"), 180_000);
  assert.equal(sample.requestedQuantity("Soul_Gem"), 4);
  assert.equal(sample.isDemanded("Supply"), true);
  assert.equal(sample.isDemanded("Soul_Gem"), true);
  assert.equal(sample.isDemanded("Money"), false);
}

console.log("captured mech demand checks passed");
