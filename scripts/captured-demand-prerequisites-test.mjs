import assert from "node:assert/strict";

import { createCapturedResourceDemand } from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";
import { ensureDemandPrerequisiteControls } from "../src/adapters/evolve/economy/resources/captured-demand-prerequisites.ts";
import { actionPrice } from "./test-support/action-price.mjs";

function fakeControls(ids = []) {
  const map = new Map(
    ids.map((id) => [
      id,
      { elementId: id, generation: 1, methods: ["gvis", "setData"] },
    ]),
  );
  return {
    resolve: (id) => map.get(id),
    invoke: () => ({ ok: true, value: true }),
    capturedElementIds: () => [...map.keys()],
    add(id, methods = ["gvis", "setData"]) {
      map.set(id, { elementId: id, generation: 1, methods });
    },
  };
}

function calls() {
  const seen = [];
  return {
    seen,
    civic: () => seen.push("civic"),
    build: () => seen.push("build"),
  };
}

// The civic discovery runs while a spy-purchase reservation is possible but its control is
// not captured yet: unification researched and automation willing.
{
  const root = { race: {}, tech: { unify: 1 }, resource: {} };
  const settings = { autoFight: true };
  const tracked = calls();
  ensureDemandPrerequisiteControls({
    root,
    settings,
    controls: fakeControls(),
    ensureCivicControls: tracked.civic,
    ensureBuildControls: tracked.build,
  });
  assert.deepEqual(tracked.seen, ["civic"]);
}

// No discovery when the control is already captured, automation is off, or unification is
// unresearched: the gate is root and settings reads only.
for (const [root, settings, controls] of [
  [
    { race: {}, tech: { unify: 1 }, resource: {} },
    { autoFight: true },
    fakeControls(["foreign"]),
  ],
  [
    { race: {}, tech: { unify: 1 }, resource: {} },
    { autoFight: false },
    fakeControls(),
  ],
  [{ race: {}, tech: {}, resource: {} }, { autoFight: true }, fakeControls()],
]) {
  const tracked = calls();
  ensureDemandPrerequisiteControls({
    root,
    settings,
    controls,
    ensureCivicControls: tracked.civic,
    ensureBuildControls: tracked.build,
  });
  assert.deepEqual(tracked.seen, []);
}

// The build sweep runs while the True Path AI hardware stage is active but some competing
// target's control is missing.
{
  const root = {
    race: { truepath: true },
    tech: { titan_ai_core: 3 },
    resource: {},
    space: {},
  };
  const settings = { prestigeType: "apocalypse" };
  const tracked = calls();
  ensureDemandPrerequisiteControls({
    root,
    settings,
    controls: fakeControls(["space-decoder"]),
    ensureCivicControls: tracked.civic,
    ensureBuildControls: tracked.build,
  });
  assert.deepEqual(tracked.seen, ["build"]);
}

// No build sweep outside the hardware stage or once every competitor is captured.
for (const [root, settings, ids] of [
  [
    { race: {}, tech: { titan_ai_core: 3 }, resource: {}, space: {} },
    { prestigeType: "apocalypse" },
    [],
  ],
  [
    {
      race: { truepath: true },
      tech: { titan_ai_core: 3 },
      resource: {},
      space: {},
    },
    { prestigeType: "none" },
    [],
  ],
  [
    {
      race: { truepath: true },
      tech: { titan_ai_core: 2 },
      resource: {},
      space: {},
    },
    { prestigeType: "apocalypse" },
    [],
  ],
  [
    {
      race: { truepath: true },
      tech: { titan_ai_core: 3 },
      resource: {},
      space: {},
    },
    { prestigeType: "apocalypse" },
    ["space-decoder", "space-ai_colonist", "space-shock_trooper", "space-tank"],
  ],
]) {
  const tracked = calls();
  ensureDemandPrerequisiteControls({
    root,
    settings,
    controls: fakeControls(ids),
    ensureCivicControls: tracked.civic,
    ensureBuildControls: tracked.build,
  });
  assert.deepEqual(tracked.seen, []);
}

// Production order: a demand sample taken before the foreign discovery omits the purchase
// reservation, while the prerequisites-first order keeps it. The control materializes only
// through the civic discovery the phase performs.
{
  const root = {
    race: {},
    tech: { unify: 1 },
    civic: {
      foreign: {
        gov0: {
          mil: 50,
          hstl: 20,
          unrest: 10,
          eco: 10,
          spy: 3,
          sab: 0,
          occ: false,
          anx: false,
          buy: false,
        },
      },
    },
    resource: {
      Money: { amount: 0, max: 1e12, stackable: true },
    },
  };
  const settings = {
    autoFight: true,
    foreignUnification: true,
    foreignPolicyInferior: "Purchase",
    foreignPolicySuperior: "Occupy",
  };
  const dependencies = (controls) => ({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    controls,
    readSettings: () => settings,
  });
  const early = createCapturedResourceDemand(
    dependencies(fakeControls()),
  ).sample();
  assert.equal(early.requestedQuantity("Money"), 0);

  const controls = fakeControls();
  ensureDemandPrerequisiteControls({
    root,
    settings,
    controls,
    ensureCivicControls: () => controls.add("foreign", ["gvis"]),
    ensureBuildControls: () => {},
  });
  const late = createCapturedResourceDemand(dependencies(controls)).sample();
  assert.equal(late.requestedQuantity("Money"), 197992);
  assert.equal(late.isDemanded("Money"), true);
}

// Production order, True Path AI half: the reservation stands down while the winner's
// control is undiscovered and reserves once the build sweep captures it.
{
  const root = {
    race: { truepath: true },
    tech: { titan_ai_core: 3 },
    space: {
      decoder: { count: 1, on: 1 },
      ai_colonist: { count: 0, on: 0 },
      shock_trooper: { count: 0, on: 0 },
      tank: { count: 0, on: 0 },
    },
    resource: {
      Money: { amount: 0, max: 1e12, stackable: true },
    },
  };
  const prices = {
    "space-decoder": { Money: 12.5e6 },
    "space-ai_colonist": { Money: 112e6 },
    "space-shock_trooper": { Money: 4.25e6 },
    "space-tank": { Money: 8.5e6 },
  };
  const settings = { prestigeType: "apocalypse" };
  const dependencies = (controls) => ({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    controls,
    costs: {
      readCost: (actionId) =>
        actionId in prices ? actionPrice(prices[actionId]) : undefined,
    },
    readSettings: () => settings,
  });
  const early = createCapturedResourceDemand(
    dependencies(fakeControls()),
  ).sample();
  assert.equal(early.requestedQuantity("Money"), 0);

  const controls = fakeControls();
  ensureDemandPrerequisiteControls({
    root,
    settings,
    controls,
    ensureCivicControls: () => {},
    ensureBuildControls: () => {
      for (const id of Object.keys(prices)) controls.add(id, ["setData"]);
    },
  });
  const late = createCapturedResourceDemand(dependencies(controls)).sample();
  assert.equal(late.requestedQuantity("Money"), 12.5e6);
}

console.log("Captured demand-prerequisites tests passed");
