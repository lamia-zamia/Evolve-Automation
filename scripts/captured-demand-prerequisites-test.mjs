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

function track() {
  const seen = [];
  return {
    seen,
    civic: () => seen.push("civic"),
    build: () => seen.push("build"),
  };
}

function prerequisites(root, settings, controls, tracked) {
  return ensureDemandPrerequisiteControls({
    root,
    settings,
    controls,
    ensureCivicControls: tracked.civic,
    ensureBuildControls: tracked.build,
  });
}

// The civic discovery runs while a spy-purchase reservation is possible but its control is
// not captured yet: unification researched and automation willing. A discovery that still
// leaves the control absent reports unavailable rather than silently spending onward.
{
  const root = { race: {}, tech: { unify: 1 }, resource: {} };
  const settings = { autoFight: true };
  const tracked = track();
  const controls = fakeControls();
  assert.deepEqual(prerequisites(root, settings, controls, tracked), {
    spy: "unavailable",
    ai: "not-needed",
  });
  assert.deepEqual(tracked.seen, ["civic"]);

  const discovered = track();
  controls.add("foreign", ["gvis"]);
  assert.deepEqual(prerequisites(root, settings, controls, discovered), {
    spy: "ready",
    ai: "not-needed",
  });
  assert.deepEqual(discovered.seen, []);
}

// No discovery when automation is off or unification is unresearched: the gate is root
// and settings reads only.
for (const [root, settings] of [
  [{ race: {}, tech: { unify: 1 }, resource: {} }, { autoFight: false }],
  [{ race: {}, tech: {}, resource: {} }, { autoFight: true }],
]) {
  const tracked = track();
  assert.deepEqual(prerequisites(root, settings, fakeControls(), tracked), {
    spy: "not-needed",
    ai: "not-needed",
  });
  assert.deepEqual(tracked.seen, []);
}

// Eligibility is tech-derived: core 3 alone unlocks only the Colonist, titan 8 adds the
// Decoder, eris 3 the Trooper, eris 4 the Tank. A missing eligible control sweeps and
// reports unavailable while it stays missing; a missing ineligible one is legitimately
// locked and irrelevant.
{
  const stage = (tech) => ({
    race: { truepath: true },
    tech,
    resource: {},
    space: {},
  });
  const settings = { prestigeType: "apocalypse" };

  // Core 3 alone: only the Colonist is required.
  const colonistMissing = track();
  assert.deepEqual(
    prerequisites(
      stage({ titan_ai_core: 3 }),
      settings,
      fakeControls(),
      colonistMissing,
    ),
    { spy: "not-needed", ai: "unavailable" },
  );
  assert.deepEqual(colonistMissing.seen, ["build"]);
  const colonistReady = track();
  assert.deepEqual(
    prerequisites(
      stage({ titan_ai_core: 3 }),
      settings,
      fakeControls(["space-ai_colonist"]),
      colonistReady,
    ),
    { spy: "not-needed", ai: "ready" },
  );
  assert.deepEqual(colonistReady.seen, []);

  // Titan 8, core 3, eris 3: Decoder, Colonist and Trooper required; the Tank may be
  // absent. An eligible Trooper missing after the sweep is unavailable.
  const tripleTech = { titan: 8, titan_ai_core: 3, eris: 3 };
  const tripleMissing = track();
  assert.deepEqual(
    prerequisites(
      stage(tripleTech),
      settings,
      fakeControls(["space-decoder", "space-ai_colonist"]),
      tripleMissing,
    ),
    { spy: "not-needed", ai: "unavailable" },
  );
  assert.deepEqual(tripleMissing.seen, ["build"]);
  const tripleReady = track();
  assert.deepEqual(
    prerequisites(
      stage(tripleTech),
      settings,
      fakeControls([
        "space-decoder",
        "space-ai_colonist",
        "space-shock_trooper",
      ]),
      tripleReady,
    ),
    { spy: "not-needed", ai: "ready" },
  );
  assert.deepEqual(tripleReady.seen, []);

  // Eris 4: all four required.
  const fullTech = { titan: 8, titan_ai_core: 3, eris: 4 };
  const tankMissing = track();
  assert.deepEqual(
    prerequisites(
      stage(fullTech),
      settings,
      fakeControls([
        "space-decoder",
        "space-ai_colonist",
        "space-shock_trooper",
      ]),
      tankMissing,
    ),
    { spy: "not-needed", ai: "unavailable" },
  );
  assert.deepEqual(tankMissing.seen, ["build"]);
  const fullReady = track();
  assert.deepEqual(
    prerequisites(
      stage(fullTech),
      settings,
      fakeControls([
        "space-decoder",
        "space-ai_colonist",
        "space-shock_trooper",
        "space-tank",
      ]),
      fullReady,
    ),
    { spy: "not-needed", ai: "ready" },
  );
  assert.deepEqual(fullReady.seen, []);
}

// No build sweep outside the hardware stage: the gate is root and settings reads only.
for (const [root, settings] of [
  [
    { race: {}, tech: { titan_ai_core: 3 }, resource: {}, space: {} },
    { prestigeType: "apocalypse" },
  ],
  [
    {
      race: { truepath: true },
      tech: { titan_ai_core: 3 },
      resource: {},
      space: {},
    },
    { prestigeType: "none" },
  ],
  [
    {
      race: { truepath: true },
      tech: { titan_ai_core: 2 },
      resource: {},
      space: {},
    },
    { prestigeType: "apocalypse" },
  ],
]) {
  const tracked = track();
  assert.deepEqual(prerequisites(root, settings, fakeControls(), tracked), {
    spy: "not-needed",
    ai: "not-needed",
  });
  assert.deepEqual(tracked.seen, []);
}

// Production order, spy half: a civic discovery that fails to capture foreign must not
// let consumers see Money as free. The failed prerequisite holds Money to its storage
// envelope; the successful one reserves the exact government price.
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
  const demand = (controls, report) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => root },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      controls,
      readSettings: () => settings,
      readPrerequisites: () => report,
    }).sample();

  const failed = track();
  const missing = fakeControls();
  const failedReport = prerequisites(root, settings, missing, failed);
  assert.equal(failedReport.spy, "unavailable");
  const held = demand(missing, failedReport);
  assert.equal(held.requestedQuantity("Money"), 1e12);
  assert.equal(held.isDemanded("Money"), true);

  const succeeded = track();
  const captured = fakeControls();
  const readyReport = ensureDemandPrerequisiteControls({
    root,
    settings,
    controls: captured,
    ensureCivicControls: () => captured.add("foreign", ["gvis"]),
    ensureBuildControls: succeeded.build,
  });
  assert.equal(readyReport.spy, "ready");
  const exact = demand(captured, readyReport);
  assert.equal(exact.requestedQuantity("Money"), 197992);
}

// Production order, True Path AI half: an eligible control missing after the sweep holds
// Money, a locked Tank is irrelevant to the eligible winner, and the complete field
// reserves exactly. Locked targets name no price, exactly as a missing control does.
{
  const root = {
    race: { truepath: true },
    tech: { titan: 8, titan_ai_core: 3, eris: 3 },
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
  const demand = (
    demandRoot,
    controls,
    report,
    offered = Object.keys(prices),
  ) =>
    createCapturedResourceDemand({
      rootState: { readRoot: () => demandRoot },
      reservations: {
        readReservations: () => ({ targets: [], unavailable: false }),
      },
      controls,
      costs: {
        readCost: (actionId) =>
          offered.includes(actionId)
            ? actionPrice(prices[actionId])
            : undefined,
      },
      readSettings: () => settings,
      readPrerequisites: () => report,
    }).sample();

  const failed = track();
  const missing = fakeControls();
  const failedReport = prerequisites(root, settings, missing, failed);
  assert.equal(failedReport.ai, "unavailable");
  const held = demand(root, missing, failedReport);
  assert.equal(held.requestedQuantity("Money"), 1e12);
  assert.equal(held.isDemanded("Money"), true);

  // The Tank stays locked (eris 4) while everything else draws: the eligible winner is
  // the Decoder, priced exactly.
  const drawable = track();
  const partial = fakeControls();
  const partialReport = ensureDemandPrerequisiteControls({
    root,
    settings,
    controls: partial,
    ensureCivicControls: drawable.civic,
    ensureBuildControls: () => {
      for (const id of Object.keys(prices)) {
        if (id !== "space-tank") partial.add(id, ["setData"]);
      }
    },
  });
  assert.equal(partialReport.ai, "ready");
  const subset = demand(
    root,
    partial,
    partialReport,
    Object.keys(prices).filter((id) => id !== "space-tank"),
  );
  assert.equal(subset.requestedQuantity("Money"), 12.5e6);

  const complete = track();
  const full = fakeControls();
  const fullRoot = {
    ...root,
    tech: { titan: 8, titan_ai_core: 3, eris: 4 },
  };
  const readyReport = ensureDemandPrerequisiteControls({
    root: fullRoot,
    settings,
    controls: full,
    ensureCivicControls: complete.civic,
    ensureBuildControls: () => {
      for (const id of Object.keys(prices)) full.add(id, ["setData"]);
    },
  });
  assert.equal(readyReport.ai, "ready");
  const exact = demand(fullRoot, full, readyReport);
  assert.equal(exact.requestedQuantity("Money"), 12.5e6);
}

console.log("Captured demand-prerequisites tests passed");
