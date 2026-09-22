import assert from "node:assert/strict";

import { createCapturedMech } from "../src/adapters/evolve/combat/captured-mech.ts";
import { runCapturedMechAutomation } from "../src/application/captured-mech.ts";
import { planCapturedMechAuto as planAuto } from "../src/domain/combat/captured-mech.ts";

// Game-owned figures, hardcoded from portal.js (mechCost/mechSize) so the
// fake does not test our transcription against itself.
const GAME_COST = {
  small: { supply: 75_000, gems: 1, space: 2, mounts: 1, slots: 1 },
  medium: { supply: 180_000, gems: 4, space: 5, mounts: 2, slots: 2 },
  large: { supply: 375_000, gems: 20, space: 10, mounts: 2, slots: 3 },
  titan: { supply: 750_000, gems: 75, space: 25, mounts: 4, slots: 4 },
  collector: { supply: 10_000, gems: 1, space: 1, mounts: 0, slots: 3 },
};
const GENERAL_DEFAULTS = [
  "shields",
  "sonar",
  "grapple",
  "infrared",
  "pontoon",
  "radiator",
  "coolant",
  "ablative",
  "stabilizer",
  "seals",
];

function makeWorld(overrides = {}) {
  const root = {
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
      purifier: { supply: 1_000_000, sup_max: 2_000_000 },
      spire: {
        count: 1,
        type: "rocky",
        progress: 0,
        status: { dark: true },
        boss: "water_elm",
      },
    },
    resource: {
      Soul_Gem: { amount: 500 },
      Supply: { rateOfChange: 5_000, maxQuantity: 2_000_000 },
    },
    ...overrides,
  };
  const calls = [];
  const assembly = {
    elementId: "mechAssembly",
    generation: 1,
    methods: [
      "setSize",
      "setType",
      "setWep",
      "setEquip",
      "build",
      "bay",
      "price",
      "soul",
    ],
  };
  const reshape = (blueprint) => {
    const figures = GAME_COST[blueprint.size];
    blueprint.hardpoint = new Array(figures.mounts).fill("laser");
    blueprint.equip = ["special", ...GENERAL_DEFAULTS.slice(0, figures.slots)];
  };
  const controls = {
    resolve: (id) => (id === "mechAssembly" ? assembly : undefined),
    invoke: (handle, method, args = []) => {
      assert.equal(handle, assembly);
      calls.push([method, ...args]);
      const blueprint = root.portal.mechbay.blueprint;
      if (method === "bay")
        return { ok: true, value: GAME_COST[args[0]].space };
      if (method === "price")
        return { ok: true, value: GAME_COST[args[0]].supply };
      if (method === "soul")
        return { ok: true, value: GAME_COST[args[0]].gems };
      if (method === "setSize") {
        blueprint.size = args[0];
        reshape(blueprint);
        assembly.generation += 1;
        return { ok: true, value: undefined };
      }
      if (method === "setType") {
        blueprint.chassis = args[0];
        assembly.generation += 1;
        return { ok: true, value: undefined };
      }
      if (method === "setWep") {
        blueprint.hardpoint[args[1]] = args[0];
        assembly.generation += 1;
        return { ok: true, value: undefined };
      }
      if (method === "setEquip") {
        blueprint.equip[args[1]] = args[0];
        assembly.generation += 1;
        return { ok: true, value: undefined };
      }
      if (method === "build") {
        const figures = GAME_COST[blueprint.size];
        const avail = root.portal.mechbay.max - root.portal.mechbay.bay;
        if (
          root.portal.purifier.supply >= figures.supply &&
          avail >= figures.space &&
          root.resource.Soul_Gem.amount >= figures.gems
        ) {
          root.portal.mechbay.mechs.push({
            size: blueprint.size,
            chassis: blueprint.chassis,
            hardpoint: [...blueprint.hardpoint],
            equip: [...blueprint.equip],
            infernal: blueprint.infernal,
          });
          root.portal.mechbay.bay += figures.space;
          root.portal.mechbay.active += 1;
          root.portal.purifier.supply -= figures.supply;
          root.resource.Soul_Gem.amount -= figures.gems;
        } else {
          calls.push(["queued-instead"]);
        }
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => ["mechAssembly"],
  };
  const settings = {
    autoMech: true,
    mechBuild: "random",
    mechSize: "medium",
    mechSizeGravity: "auto",
    mechFillBay: false,
    mechSaveSupplyRatio: 0,
  };
  const adapter = createCapturedMech({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => settings,
    keyState: { readPressed: () => false },
  });
  return { root, settings, controls, calls, adapter };
}

const zeroRandom = { nextUnit: () => 0 };

// Full automatic cycle: medium design is set through game methods, then one
// verified build lands a matching mech.
{
  const world = makeWorld();
  const state = world.adapter.reader.readState();
  assert.equal(state.available, true);
  const plan = planAuto(state, () => 0);
  assert.equal(plan !== null, true);
  assert.equal(plan.design.size, "medium");
  const outcome = runCapturedMechAutomation({
    ...world.adapter,
    random: zeroRandom,
  });
  assert.equal(outcome.status, "succeeded");
  const methods = world.calls.map((call) => call[0]);
  for (const step of ["setSize", "setType", "setWep", "setEquip"]) {
    assert.ok(methods.includes(step), `expected ${step}`);
  }
  assert.equal(
    methods.filter((method) => method === "build").length,
    1,
    "exactly one build",
  );
  assert.ok(!methods.includes("queued-instead"), "must build, not queue");
  assert.equal(world.root.portal.mechbay.mechs.length, 1);
  const built = world.root.portal.mechbay.mechs[0];
  assert.equal(built.size, plan.design.size);
  assert.equal(built.chassis, plan.design.chassis);
  assert.deepEqual(built.hardpoint, [...plan.design.hardpoint]);
  assert.deepEqual(built.equip, [...plan.design.equip]);
  assert.equal(world.root.portal.mechbay.bay, plan.space);
  assert.equal(world.root.portal.purifier.supply, 1_000_000 - plan.supply);
}

// A blueprint that already matches skips every setter: one build, no sets.
{
  const world = makeWorld();
  const plan = planAuto(world.adapter.reader.readState(), () => 0);
  assert.equal(plan !== null, true);
  world.root.portal.mechbay.blueprint = {
    size: plan.design.size,
    chassis: plan.design.chassis,
    hardpoint: [...plan.design.hardpoint],
    equip: [...plan.design.equip],
    infernal: false,
  };
  world.calls.length = 0;
  const outcome = runCapturedMechAutomation({
    ...world.adapter,
    random: zeroRandom,
  });
  assert.equal(outcome.status, "succeeded");
  const methods = world.calls.map((call) => call[0]);
  assert.ok(!methods.some((method) => method.startsWith("set")), "no setters");
  assert.equal(
    methods.filter((method) => method === "build").length,
    1,
    "exactly one build",
  );
  assert.equal(world.root.portal.mechbay.mechs.length, 1);
}

// Invoked but unverified: exactly one build call, then STOP.
{
  const world = makeWorld();
  const plan = planAuto(world.adapter.reader.readState(), () => 0);
  world.root.portal.mechbay.blueprint = {
    size: plan.design.size,
    chassis: plan.design.chassis,
    hardpoint: [...plan.design.hardpoint],
    equip: [...plan.design.equip],
    infernal: false,
  };
  const frozen = world.controls.invoke;
  let builds = 0;
  world.controls.invoke = (handle, method, args = []) => {
    if (method === "build") {
      builds += 1;
      return { ok: true, value: undefined };
    }
    return frozen(handle, method, args);
  };
  world.calls.length = 0;
  const outcome = runCapturedMechAutomation({
    ...world.adapter,
    random: zeroRandom,
  });
  assert.equal(outcome.status, "stale");
  assert.equal(builds, 1);
  assert.equal(world.root.portal.mechbay.mechs.length, 0);
}

// Missing facts stand down with no game calls.
{
  const warlord = makeWorld();
  warlord.root.race = { warlord: true };
  assert.equal(
    runCapturedMechAutomation({ ...warlord.adapter, random: zeroRandom })
      .status,
    "succeeded",
  );
  assert.deepEqual(warlord.calls, []);

  const unknownBoss = makeWorld();
  unknownBoss.root.portal.spire.boss = "abyssal";
  assert.equal(
    runCapturedMechAutomation({ ...unknownBoss.adapter, random: zeroRandom })
      .status,
    "succeeded",
  );
  assert.deepEqual(unknownBoss.calls, []);
  assert.equal(
    planAuto(unknownBoss.adapter.reader.readState(), () => 0),
    null,
  );

  const full = makeWorld();
  full.root.portal.mechbay.bay = 25;
  full.root.portal.mechbay.mechs = [
    {
      size: "titan",
      chassis: "tread",
      hardpoint: ["laser", "laser", "laser", "laser"],
      equip: ["special"],
      infernal: false,
    },
  ];
  assert.equal(
    runCapturedMechAutomation({ ...full.adapter, random: zeroRandom }).status,
    "succeeded",
  );
  assert.deepEqual(full.calls, []);
}

// Saving for the next floor beats building when income is thin.
{
  const poor = makeWorld();
  poor.root.portal.mechbay.mechs = [
    {
      size: "titan",
      chassis: "tread",
      hardpoint: ["laser", "laser", "laser", "laser"],
      equip: ["special", "shields", "sonar", "grapple", "infrared"],
      infernal: false,
    },
  ];
  poor.root.portal.mechbay.bay = 25 - 5;
  poor.root.portal.mechbay.active = 1;
  poor.root.portal.spire.progress = 99;
  poor.root.portal.purifier.supply = 1_900_000;
  poor.root.resource.Supply.rateOfChange = 100;
  poor.settings.mechSaveSupplyRatio = 1;
  assert.equal(
    planAuto(poor.adapter.reader.readState(), () => 0),
    null,
  );

  const rich = makeWorld();
  rich.root.portal.mechbay.mechs = structuredClone(
    poor.root.portal.mechbay.mechs,
  );
  rich.root.portal.mechbay.bay = 25 - 5;
  rich.root.portal.mechbay.active = 1;
  rich.root.portal.spire.progress = 99;
  rich.root.portal.purifier.supply = 1_900_000;
  rich.root.resource.Supply.rateOfChange = 100_000;
  rich.settings.mechSaveSupplyRatio = 1;
  assert.notEqual(
    planAuto(rich.adapter.reader.readState(), () => 0),
    null,
  );
}

console.log("captured mech auto checks passed");
