import assert from "node:assert/strict";

import { createCapturedMech } from "../src/adapters/evolve/combat/captured-mech.ts";
import { runCapturedMechAutomation } from "../src/application/captured-mech.ts";
import {
  planCapturedMechAuto as planAuto,
  planCapturedMechScrap as planScrap,
} from "../src/domain/combat/captured-mech.ts";

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
      purifier: { supply: 1_000_000, sup_max: 2_000_000, count: 1, on: 1 },
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
  const list = {
    elementId: "mechList",
    generation: 1,
    methods: ["scrap"],
  };
  const reshape = (blueprint) => {
    const figures = GAME_COST[blueprint.size];
    blueprint.hardpoint = new Array(figures.mounts).fill("laser");
    blueprint.equip = ["special", ...GENERAL_DEFAULTS.slice(0, figures.slots)];
  };
  const controls = {
    resolve: (id) =>
      id === "mechAssembly" ? assembly : id === "mechList" ? list : undefined,
    invoke: (handle, method, args = []) => {
      assert.ok(handle === assembly || handle === list);
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
      if (method === "scrap") {
        assert.equal(handle, list);
        const removed = root.portal.mechbay.mechs[args[0]];
        if (removed !== undefined) {
          const figures = GAME_COST[removed.size];
          root.portal.purifier.supply = Math.min(
            root.portal.purifier.supply + Math.floor(figures.supply / 3),
            root.portal.purifier.sup_max,
          );
          root.resource.Soul_Gem.amount += Math.floor(figures.gems / 2);
          root.portal.mechbay.mechs.splice(args[0], 1);
          root.portal.mechbay.bay -= figures.space;
          root.portal.mechbay.active -= 1;
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

// Bay pressure steps down to smaller frames when the bay allows them.
{
  const tight = makeWorld();
  tight.root.portal.mechbay.bay = 20;
  tight.settings.mechSize = "titan";
  tight.settings.mechFillBay = true;
  const plan = planAuto(tight.adapter.reader.readState(), () => 0);
  assert.equal(plan !== null, true);
  assert.equal(plan.design.size, "medium");
  assert.equal(plan.space, 5);

  const stubborn = makeWorld();
  stubborn.root.portal.mechbay.bay = 20;
  stubborn.settings.mechSize = "titan";
  stubborn.settings.mechFillBay = false;
  assert.equal(
    planAuto(stubborn.adapter.reader.readState(), () => 0),
    null,
  );
}

// A small bay fills to its maximum, then stands down.
{
  const capped = makeWorld();
  capped.root.portal.mechbay.max = 5;
  const first = runCapturedMechAutomation({
    ...capped.adapter,
    random: zeroRandom,
  });
  assert.equal(first.status, "succeeded");
  assert.equal(capped.root.portal.mechbay.mechs.length, 1);
  assert.equal(capped.root.portal.mechbay.bay, 5);
  const before = capped.calls.length;
  const second = runCapturedMechAutomation({
    ...capped.adapter,
    random: zeroRandom,
  });
  assert.equal(second.status, "succeeded");
  assert.equal(capped.root.portal.mechbay.mechs.length, 1);
  assert.equal(
    capped.calls.slice(before).filter((call) => call[0] === "build").length,
    0,
    "no build past the maximum",
  );
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

  // Supply is only held back while every purifier is switched on and
  // held-back building is enabled.
  const darkPurifier = makeWorld();
  darkPurifier.root.portal.mechbay.mechs = structuredClone(
    poor.root.portal.mechbay.mechs,
  );
  darkPurifier.root.portal.mechbay.bay = 25 - 5;
  darkPurifier.root.portal.mechbay.active = 1;
  darkPurifier.root.portal.spire.progress = 99;
  darkPurifier.root.portal.purifier.supply = 1_900_000;
  darkPurifier.root.portal.purifier.on = 0;
  darkPurifier.root.resource.Supply.rateOfChange = 100;
  darkPurifier.settings.mechSaveSupplyRatio = 1;
  assert.notEqual(
    planAuto(darkPurifier.adapter.reader.readState(), () => 0),
    null,
  );

  const noBaysFirst = makeWorld();
  noBaysFirst.root.portal.mechbay.mechs = structuredClone(
    poor.root.portal.mechbay.mechs,
  );
  noBaysFirst.root.portal.mechbay.bay = 25 - 5;
  noBaysFirst.root.portal.mechbay.active = 1;
  noBaysFirst.root.portal.spire.progress = 99;
  noBaysFirst.root.portal.purifier.supply = 1_900_000;
  noBaysFirst.root.resource.Supply.rateOfChange = 100;
  noBaysFirst.settings.mechSaveSupplyRatio = 1;
  noBaysFirst.settings.mechBaysFirst = false;
  assert.notEqual(
    planAuto(noBaysFirst.adapter.reader.readState(), () => 0),
    null,
  );
}

// One bad candidate is scrapped exactly once, with disappearance observed.
{
  const yard = makeWorld();
  yard.root.portal.mechbay.max = 6;
  yard.root.portal.mechbay.mechs = [
    {
      size: "small",
      chassis: "wheel",
      hardpoint: ["laser"],
      equip: ["special", "shields"],
      infernal: false,
    },
    {
      size: "small",
      chassis: "hover",
      hardpoint: ["laser"],
      equip: ["special", "grapple"],
      infernal: false,
    },
    {
      size: "small",
      chassis: "tread",
      hardpoint: ["laser"],
      equip: ["special", "sonar"],
      infernal: false,
    },
  ];
  yard.root.portal.mechbay.bay = 6;
  yard.root.portal.mechbay.active = 3;
  yard.settings.mechSize = "small";
  yard.settings.mechFillBay = true;
  yard.settings.mechScrap = "all";
  const scrap = planScrap(yard.adapter.reader.readState(), () => 0);
  assert.equal(scrap !== null, true);
  assert.equal(scrap.index, 0);
  const supplyBefore = yard.root.portal.purifier.supply;
  const outcome = runCapturedMechAutomation({
    ...yard.adapter,
    random: zeroRandom,
  });
  assert.equal(outcome.status, "succeeded");
  const methods = yard.calls.map((call) => call[0]);
  assert.equal(
    methods.filter((method) => method === "scrap").length,
    1,
    "exactly one scrap",
  );
  assert.ok(!methods.includes("build"), "no replacement in the scrap tick");
  assert.equal(yard.root.portal.mechbay.mechs.length, 2);
  assert.equal(yard.root.portal.mechbay.bay, 4);
  assert.equal(yard.root.portal.purifier.supply, supplyBefore + 25_000);

  // Replacement is a fresh plan on the next tick, verified in turn.
  const replan = planAuto(yard.adapter.reader.readState(), () => 0);
  assert.equal(replan !== null, true);
  const rebuilt = runCapturedMechAutomation({
    ...yard.adapter,
    random: zeroRandom,
  });
  assert.equal(rebuilt.status, "succeeded");
  assert.equal(yard.root.portal.mechbay.mechs.length, 3);
  const fresh = yard.root.portal.mechbay.mechs[2];
  assert.equal(fresh.size, replan.design.size);
  assert.deepEqual(fresh.hardpoint, [...replan.design.hardpoint]);
}

// Near-best mechs are not scrap candidates.
{
  const yard = makeWorld();
  const state = yard.adapter.reader.readState();
  const best = planAuto(state, () => 0);
  assert.equal(best !== null, true);
  yard.root.portal.mechbay.mechs = [
    {
      size: best.design.size,
      chassis: best.design.chassis,
      hardpoint: [...best.design.hardpoint],
      equip: [...best.design.equip],
      infernal: false,
    },
  ];
  yard.root.portal.mechbay.bay = best.space;
  yard.root.portal.mechbay.active = 1;
  yard.settings.mechSize = best.design.size;
  yard.settings.mechScrap = "all";
  assert.equal(
    planScrap(yard.adapter.reader.readState(), () => 0),
    null,
  );
}

// Invoked but still present: one scrap call, then STOP — no second scrap,
// no replacement build.
{
  const yard = makeWorld();
  yard.root.portal.mechbay.mechs = [
    {
      size: "small",
      chassis: "hover",
      hardpoint: ["laser"],
      equip: ["special", "shields"],
      infernal: false,
    },
  ];
  yard.root.portal.mechbay.bay = 2;
  yard.root.portal.mechbay.active = 1;
  yard.root.portal.mechbay.max = 2;
  yard.settings.mechSize = "small";
  yard.settings.mechFillBay = true;
  yard.settings.mechScrap = "all";
  assert.notEqual(
    planScrap(yard.adapter.reader.readState(), () => 0),
    null,
  );
  const frozen = yard.controls.invoke;
  let scraps = 0;
  yard.controls.invoke = (handle, method, args = []) => {
    if (method === "scrap") {
      scraps += 1;
      return { ok: true, value: undefined };
    }
    return frozen(handle, method, args);
  };
  const outcome = runCapturedMechAutomation({
    ...yard.adapter,
    random: zeroRandom,
  });
  assert.equal(outcome.status, "stale");
  assert.equal(scraps, 1);
  assert.equal(yard.root.portal.mechbay.mechs.length, 1);
  assert.ok(
    !yard.calls.some(
      (call) => call[0] === "build" || call[0].startsWith("set"),
    ),
    "no replacement after an unverified scrap",
  );
}

// Single mode only frees room: with headroom it builds instead of scrapping.
{
  const yard = makeWorld();
  yard.root.portal.mechbay.mechs = [
    {
      size: "small",
      chassis: "hover",
      hardpoint: ["laser"],
      equip: ["special", "shields"],
      infernal: false,
    },
  ];
  yard.root.portal.mechbay.bay = 2;
  yard.root.portal.mechbay.active = 1;
  yard.settings.mechSize = "small";
  yard.settings.mechScrap = "single";
  assert.equal(
    planScrap(yard.adapter.reader.readState(), () => 0),
    null,
  );
  const outcome = runCapturedMechAutomation({
    ...yard.adapter,
    random: zeroRandom,
  });
  assert.equal(outcome.status, "succeeded");
  assert.ok(!yard.calls.some((call) => call[0] === "scrap"), "no scrap");
  assert.ok(
    yard.calls.some((call) => call[0] === "build"),
    "builds into headroom",
  );
}

// A governor Mech Builder task stands the automation down — the governor
// assembles titans itself — except while mechs sit inactive.
{
  const governed = makeWorld();
  governed.root.race = { governor: { tasks: { slot1: "mech" } } };
  assert.equal(governed.adapter.reader.readState().governorMechTask, true);
  assert.equal(
    planAuto(governed.adapter.reader.readState(), () => 0),
    null,
  );
  assert.equal(
    runCapturedMechAutomation({ ...governed.adapter, random: zeroRandom })
      .status,
    "succeeded",
  );
  assert.deepEqual(governed.calls, []);

  const overflow = makeWorld();
  overflow.root.race = { governor: { tasks: { slot1: "mech" } } };
  overflow.root.portal.mechbay.mechs = [
    {
      size: "small",
      chassis: "tread",
      hardpoint: ["laser"],
      equip: ["special", "shields"],
      infernal: false,
    },
    {
      size: "small",
      chassis: "tread",
      hardpoint: ["laser"],
      equip: ["special", "shields"],
      infernal: false,
    },
  ];
  overflow.root.portal.mechbay.bay = 4;
  overflow.root.portal.mechbay.active = 1;
  assert.notEqual(
    planAuto(overflow.adapter.reader.readState(), () => 0),
    null,
  );

  const malformed = makeWorld();
  malformed.root.race = { governor: { tasks: { slot1: 42 } } };
  assert.equal(malformed.adapter.reader.readState().governorMechTask, true);
  assert.equal(
    planAuto(malformed.adapter.reader.readState(), () => 0),
    null,
  );
}

console.log("captured mech auto checks passed");
