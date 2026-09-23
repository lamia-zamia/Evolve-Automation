import assert from "node:assert/strict";

import { createCapturedMechReservationSource } from "../src/adapters/evolve/combat/captured-mech-reservations.ts";
import { createCapturedResourceDemand } from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";
import { planMechDemandCosts } from "../src/domain/combat/mech-auto-choice.ts";
import { findCostConflict } from "../src/domain/cost-conflicts.ts";

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

// The pursued build's cost is one shared answer for demand and reservations.
{
  const demand = planMechDemandCosts({ root: makeRoot(), settings });
  assert.deepEqual(demand, { supply: 180_000, gems: 4 });

  assert.equal(
    planMechDemandCosts({
      root: makeRoot(),
      settings: { ...settings, mechBuild: "user" },
    }),
    null,
  );
  assert.equal(
    planMechDemandCosts({
      root: makeRoot(),
      settings: { ...settings, autoMech: false },
    }),
    null,
  );
  const warlord = makeRoot();
  warlord.race = { warlord: true };
  assert.equal(planMechDemandCosts({ root: warlord, settings }), null);
}

// A governor task holds titan cost even when the script builds by hand.
{
  const governed = makeRoot();
  governed.race = { governor: { tasks: { slot1: "mech" } } };
  assert.deepEqual(
    planMechDemandCosts({
      root: governed,
      settings: { ...settings, mechBuild: "user" },
    }),
    { supply: 750_000, gems: 75 },
  );
}

// The reservation source names the same target for the build loop.
{
  const root = makeRoot();
  const source = createCapturedMechReservationSource({
    rootState: { readRoot: () => root },
    readSettings: () => settings,
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
    rootState: { readRoot: () => root },
    readSettings: () => ({ ...settings, mechBuild: "none" }),
  });
  assert.deepEqual(off.readReservations(), {
    unavailable: false,
    targets: [],
  });
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

// A Supply-cost build conflicts with the pursued Mech while stock is short:
// the same shared policy the construction loop reads.
{
  const root = makeRoot();
  const targets = createCapturedMechReservationSource({
    rootState: { readRoot: () => root },
    readSettings: () => settings,
  }).readReservations().targets;
  assert.deepEqual(
    findCostConflict({
      actionCost: { Supply: 50_000 },
      reservedTargets: targets,
      resources: {
        Supply: { name: "Supply", currentQuantity: 100_000 },
        Soul_Gem: { name: "Soul_Gem", currentQuantity: 0 },
      },
    }),
    {
      status: "conflict",
      resourceId: "Supply",
      targetName: "mech",
      targetCause: "autoMech",
      resourceNames: ["Supply"],
      targetNames: ["mech"],
    },
  );
  assert.equal(
    findCostConflict({
      actionCost: { Supply: 50_000 },
      reservedTargets: targets,
      resources: {
        Supply: { name: "Supply", currentQuantity: 500_000 },
        Soul_Gem: { name: "Soul_Gem", currentQuantity: 500 },
      },
    }),
    null,
  );
}

console.log("captured mech demand checks passed");
