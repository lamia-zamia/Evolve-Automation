import assert from "node:assert/strict";

import { runBuildAutomation } from "../src/application/build.ts";
import { createBuildAdapter } from "../src/adapters/evolve/progression/build/build.ts";
import {
  applyBuildClickResult,
  candidateSampleNeeds,
  competitionSampleRequest,
  initialBuildLoopState,
  planBuildCompetition,
} from "../src/domain/progression/build/build.ts";

// ---------------------------------------------------------------------------
// Fixture world
// ---------------------------------------------------------------------------

function makeResource(
  world,
  id,
  {
    quantity = 0,
    rate = 0,
    ratio = 0,
    required = 0,
    unlocked = true,
    name = id,
  } = {},
) {
  const resource = {
    id,
    _id: id,
    name,
    currentQuantity: quantity,
    rateOfChange: rate,
    storageRatio: ratio,
    storageRequired: required,
    isUnlocked: () => (typeof unlocked === "function" ? unlocked() : unlocked),
  };
  world.resources[id] = resource;
  return resource;
}

function makeTarget(
  world,
  key,
  {
    weighting,
    cost = {},
    consumption = [],
    important = false,
    mission = false,
    title = key,
    affordable, // optional override; default derives from resources
    clickSucceeds = true,
    project = false,
  } = {},
) {
  const target = {
    _vueBinding: key,
    title,
    weighting,
    cost,
    is: { important },
    consumption: consumption.map(({ resource, rate }) => ({
      resource: { _id: resource },
      rate,
    })),
    extraDescription: "",
    isAffordable() {
      if (affordable !== undefined) {
        return affordable;
      }
      return Object.entries(cost).every(
        ([res, amount]) => world.resources[res].currentQuantity >= amount,
      );
    },
    isMission: () => mission,
    click() {
      if (!clickSucceeds) {
        world.trace.push(["click-failed", key]);
        return false;
      }
      world.trace.push(["click", key]);
      // Mirror the real entity click: deduct costs from the resource model.
      for (const [res, amount] of Object.entries(cost)) {
        world.resources[res].currentQuantity -= amount;
      }
      return true;
    },
  };
  (project ? world.projects : world.buildings).push(target);
  return target;
}

function makeWorld({ settings = {}, conflicts = {} } = {}) {
  const world = {
    buildings: [],
    projects: [],
    resources: {},
    trace: [],
    conflicts,
    settings: {
      buildingConsumptionCheck: "unlimited",
      buildingBuildIfStorageFull: false,
      buildingsIgnoreZeroRate: false,
      prestigeType: "mad",
      prestigeWhiteholeSaveGems: false,
      ...settings,
    },
    state: { queuedTargets: [], triggerTargets: [], unlockedBuildings: [] },
  };
  world.BuildingManager = {
    updateWeighting: () => world.trace.push(["weighting", "buildings"]),
    managedPriorityList: () => [...world.buildings],
  };
  world.ProjectManager = {
    updateWeighting: () => world.trace.push(["weighting", "projects"]),
    managedPriorityList: () => [...world.projects],
  };
  world.getCostConflict = (target) => {
    world.trace.push(["conflict-check", target._vueBinding]);
    return world.conflicts[target._vueBinding] ?? null;
  };
  return world;
}

function runNew(world, diagnostics) {
  const adapter = createBuildAdapter({
    getBuildingManager: () => world.BuildingManager,
    getProjectManager: () => world.ProjectManager,
    getState: () => world.state,
    getSettings: () => world.settings,
    getResources: () => world.resources,
    getCostConflict: (target) => world.getCostConflict(target),
    diagnostics,
  });
  return runBuildAutomation({ ...adapter, diagnostics });
}

function runScenario(name, buildWorld) {
  const newWorld = buildWorld();
  const outcome = runNew(newWorld);
  assert.equal(outcome.status, "succeeded", `${name}: outcome`);
  return newWorld;
}

// ---------------------------------------------------------------------------
// Build automation scenarios
// ---------------------------------------------------------------------------

let world = runScenario("single affordable building", () => {
  const w = makeWorld();
  makeResource(w, "Lumber", { quantity: 100 });
  makeTarget(w, "city-house", { weighting: 5, cost: { Lumber: 20 } });
  return w;
});
assert.deepEqual(world.trace, [
  ["weighting", "buildings"],
  ["weighting", "projects"],
  ["conflict-check", "city-house"],
  ["click", "city-house"],
]);
assert.equal(world.resources.Lumber.currentQuantity, 80);
assert.deepEqual(
  world.state.unlockedBuildings.map((t) => t._vueBinding),
  ["city-house"],
);

// Opt-in profiling separates the build adapter reads from pure planning and execution.
{
  const phases = [];
  const w = makeWorld();
  makeResource(w, "Lumber", { quantity: 100 });
  makeTarget(w, "profiled-house", { weighting: 5, cost: { Lumber: 20 } });
  const outcome = runNew(w, {
    readPerformanceEnabled: () => true,
    nowMs: () => 0,
    recordPerformance: (phase) => phases.push(phase),
    flushPerformance: () => {},
  });
  assert.equal(outcome.status, "succeeded");
  assert.deepEqual(phases, [
    "autoBuild.beginCycle.updateBuildingWeighting",
    "autoBuild.beginCycle.updateProjectWeighting",
    "autoBuild.beginCycle.readCandidateLists",
    "autoBuild.beginCycle.sortCandidates",
    "autoBuild.beginCycle.publishCandidates",
    "autoBuild.beginCycle.normalizeCandidates",
    "autoBuild.beginCycle",
    "autoBuild.sampleNeeds",
    "autoBuild.sampleCandidate",
    "autoBuild.planGate",
    "autoBuild.sampleConflict",
    "autoBuild.planConflict",
    "autoBuild.sampleRequest",
    "autoBuild.sampleCompetition",
    "autoBuild.planCompetition",
    "autoBuild.executeClick",
    "autoBuild.applyClickResult",
  ]);
}

runScenario("queued and trigger targets are skipped", () => {
  const w = makeWorld();
  makeResource(w, "Lumber", { quantity: 100 });
  const queued = makeTarget(w, "city-queued", {
    weighting: 9,
    cost: { Lumber: 10 },
  });
  const triggered = makeTarget(w, "city-triggered", {
    weighting: 7,
    cost: { Lumber: 10 },
  });
  makeTarget(w, "city-free", { weighting: 5, cost: { Lumber: 10 } });
  w.state.queuedTargets.push(queued);
  w.state.triggerTargets.push(triggered);
  return w;
});

runScenario("unaffordable candidates are skipped", () => {
  const w = makeWorld();
  makeResource(w, "Stone", { quantity: 5 });
  makeTarget(w, "city-shed", { weighting: 5, cost: { Stone: 50 } });
  makeTarget(w, "city-hut", { weighting: 4, cost: { Stone: 5 } });
  return w;
});

// Buildings and projects merge into one list; stable sort keeps the
// buildings-before-projects order on ties.
world = runScenario("projects merge and sort stably", () => {
  const w = makeWorld();
  makeResource(w, "Money", { quantity: 1000 });
  makeTarget(w, "city-bank", { weighting: 3, cost: { Money: 100 } });
  makeTarget(w, "arpalhc", {
    weighting: 3,
    cost: { Money: 100 },
    project: true,
  });
  makeTarget(w, "city-temple", { weighting: 8, cost: { Money: 100 } });
  return w;
});
assert.deepEqual(
  world.state.unlockedBuildings.map((t) => t._vueBinding),
  ["city-temple", "city-bank", "arpalhc"],
);

// onePerTick: once any consuming building is built, everything else is
// blocked, including buildings without consumption. Negative (support-adding)
// rates don't mark consumption.
runScenario("onePerTick blocks after first consumer", () => {
  const w = makeWorld({
    settings: { buildingConsumptionCheck: "onePerTick" },
  });
  makeResource(w, "Copper", { quantity: 100 });
  makeTarget(w, "space-red-mine", {
    weighting: 9,
    cost: { Copper: 10 },
    consumption: [{ resource: "Helium_3", rate: 2 }],
  });
  makeTarget(w, "city-statue", { weighting: 5, cost: { Copper: 10 } });
  return w;
});

runScenario("negative-rate consumption does not block", () => {
  const w = makeWorld({
    settings: { buildingConsumptionCheck: "onePerTick" },
  });
  makeResource(w, "Copper", { quantity: 100 });
  makeTarget(w, "space-spaceport", {
    weighting: 9,
    cost: { Copper: 10 },
    consumption: [{ resource: "Red_Support", rate: -3 }],
  });
  makeTarget(w, "city-statue", { weighting: 5, cost: { Copper: 10 } });
  return w;
});

// An invalid buildingConsumptionCheck override falls into the onePerTick
// branch, exactly like the legacy A?B fallback.
runScenario("invalid consumption mode behaves as onePerTick", () => {
  const w = makeWorld({
    settings: { buildingConsumptionCheck: "perResource?unlimited" },
  });
  makeResource(w, "Copper", { quantity: 100 });
  makeTarget(w, "space-red-mine", {
    weighting: 9,
    cost: { Copper: 10 },
    consumption: [{ resource: "Helium_3", rate: 2 }],
  });
  makeTarget(w, "city-statue", { weighting: 5, cost: { Copper: 10 } });
  return w;
});

runScenario("perResource blocks only shared consumption", () => {
  const w = makeWorld({
    settings: { buildingConsumptionCheck: "perResource" },
  });
  makeResource(w, "Copper", { quantity: 100 });
  makeTarget(w, "space-red-mine", {
    weighting: 9,
    cost: { Copper: 10 },
    consumption: [{ resource: "Helium_3", rate: 2 }],
  });
  makeTarget(w, "space-red-factory", {
    weighting: 7,
    cost: { Copper: 10 },
    consumption: [{ resource: "Helium_3", rate: 1 }],
  });
  makeTarget(w, "city-coal-power", {
    weighting: 5,
    cost: { Copper: 10 },
    consumption: [{ resource: "Coal", rate: 1 }],
  });
  return w;
});

runScenario("unlimited mode builds several consumers", () => {
  const w = makeWorld({
    settings: { buildingConsumptionCheck: "unlimited" },
  });
  makeResource(w, "Copper", { quantity: 100 });
  makeTarget(w, "space-red-mine", {
    weighting: 9,
    cost: { Copper: 10 },
    consumption: [{ resource: "Helium_3", rate: 2 }],
  });
  makeTarget(w, "space-red-factory", {
    weighting: 7,
    cost: { Copper: 10 },
    consumption: [{ resource: "Helium_3", rate: 1 }],
  });
  return w;
});

world = runScenario("cost conflict annotates and skips", () => {
  const w = makeWorld({
    conflicts: {
      "city-mill": {
        status: "conflict",
        targetNames: ["Windmill", "Dam"],
        resourceNames: ["Iron", "Cement"],
        targetCause: "Queue",
      },
    },
  });
  makeResource(w, "Iron", { quantity: 100 });
  makeTarget(w, "city-mill", { weighting: 5, cost: { Iron: 10 } });
  return w;
});
assert.equal(
  world.buildings[0].extraDescription,
  'Conflicts with <span class="has-text-info">Windmill</span>, <span class="has-text-info">Dam</span> for ' +
    '<span class="has-text-info">Iron</span>, <span class="has-text-info">Cement</span> (Queue)<br>',
);

runScenario("important candidates bypass conflicts", () => {
  const w = makeWorld({
    conflicts: {
      "city-mill": {
        status: "conflict",
        targetNames: ["Windmill"],
        resourceNames: ["Iron"],
        targetCause: "Queue",
      },
    },
  });
  makeResource(w, "Iron", { quantity: 100 });
  makeTarget(w, "city-mill", {
    weighting: 5,
    cost: { Iron: 10 },
    important: true,
  });
  return w;
});

world = runScenario("unavailable reservation data skips for safety", () => {
  const w = makeWorld({
    conflicts: {
      "city-mill": { status: "unavailable", reason: "invalid-resource" },
    },
  });
  makeResource(w, "Iron", { quantity: 100 });
  makeTarget(w, "city-mill", { weighting: 5, cost: { Iron: 10 } });
  return w;
});
assert.equal(
  world.buildings[0].extraDescription,
  "Cost reservation data unavailable; skipped for safety<br>",
);

// Weighting protection: a cheap low-weight building must not spend resources
// a much heavier competitor is waiting for.
world = runScenario("competitor delay annotates and skips", () => {
  const w = makeWorld();
  makeResource(w, "Alloy", { quantity: 50, rate: 1, name: "Alloy" });
  makeTarget(w, "space-elevator", {
    weighting: 100,
    cost: { Alloy: 500 },
    title: "Space Elevator",
  });
  makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 40 } });
  return w;
});
assert.equal(
  world.buildings[1].extraDescription,
  'Conflicts with <span class="has-text-info">Space Elevator</span> for ' +
    '<span class="has-text-info">Alloy</span><br>',
);
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click"),
  [],
);

// The conflicted high-weight competitor stays affordable but unbuilt; below
// the 10x ratio its demands are ignored, so the candidate still builds.
world = runScenario("affordable in-window competitor is ignored", () => {
  const w = makeWorld({
    conflicts: {
      "space-elevator": {
        status: "conflict",
        targetNames: ["Trigger"],
        resourceNames: ["Alloy"],
        targetCause: "Trigger",
      },
    },
  });
  makeResource(w, "Alloy", { quantity: 500, rate: 1 });
  makeTarget(w, "space-elevator", { weighting: 40, cost: { Alloy: 450 } });
  makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 100 } });
  return w;
});
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click"),
  [["click", "city-wardenclyffe"]],
);

// At a 10x weighting gap even an affordable competitor reserves resources.
world = runScenario(
  "10x-weight competitor reserves even when affordable",
  () => {
    const w = makeWorld({
      conflicts: {
        "space-elevator": {
          status: "conflict",
          targetNames: ["Trigger"],
          resourceNames: ["Alloy"],
          targetCause: "Trigger",
        },
      },
    });
    makeResource(w, "Alloy", { quantity: 500, rate: 1 });
    makeTarget(w, "space-elevator", { weighting: 100, cost: { Alloy: 450 } });
    makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 100 } });
    return w;
  },
);
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click"),
  [],
);

runScenario("large cost gap beyond weighting ratio is tolerated", () => {
  const w = makeWorld();
  makeResource(w, "Alloy", { quantity: 50, rate: 1 });
  // costDiffRatio (500/40=12.5) >= weightDiffRatio (10) => build anyway.
  makeTarget(w, "space-elevator", {
    weighting: 50,
    cost: { Alloy: 500 },
    affordable: false,
  });
  makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 40 } });
  return w;
});

runScenario("spending inside competitor slack is allowed", () => {
  const w = makeWorld();
  // Bottleneck is Stone (200s); Alloy fills in 10s, leaving 190s of slack at
  // 5/s = 950 Alloy budget, far above the candidate's 40.
  makeResource(w, "Alloy", { quantity: 450, rate: 5 });
  makeResource(w, "Stone", { quantity: 0, rate: 1 });
  makeTarget(w, "space-elevator", {
    weighting: 100,
    cost: { Alloy: 500, Stone: 200 },
  });
  makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 40 } });
  return w;
});

runScenario("capped resources are not protected", () => {
  const w = makeWorld();
  makeResource(w, "Alloy", {
    quantity: 100,
    rate: 1,
    ratio: 1,
    required: 50,
  });
  makeTarget(w, "space-elevator", { weighting: 100, cost: { Alloy: 500 } });
  makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 40 } });
  return w;
});

runScenario("locked resources are not protected", () => {
  const w = makeWorld();
  makeResource(w, "Alloy", { quantity: 100, rate: 1, unlocked: false });
  makeTarget(w, "space-elevator", { weighting: 100, cost: { Alloy: 500 } });
  makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 40 } });
  return w;
});

// A zero-rate cost (Soul Gems) estimates as instantly available, so Money
// stays the competitor's bottleneck and the candidate is delayed.
world = runScenario("zero-rate competitor cost reserves money", () => {
  const w = makeWorld();
  makeResource(w, "Soul_Gem", { quantity: 1, rate: 0 });
  makeResource(w, "Money", { quantity: 500, rate: 10 });
  makeTarget(w, "portal-gate", {
    weighting: 100,
    cost: { Soul_Gem: 5, Money: 400 },
  });
  makeTarget(w, "city-bank", { weighting: 5, cost: { Money: 300 } });
  return w;
});
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click"),
  [],
);

// With buildingsIgnoreZeroRate the stalled Soul Gem income becomes the
// competitor's (infinite) bottleneck, freeing the Money for the candidate.
world = runScenario(
  "buildingsIgnoreZeroRate frees non-bottleneck resources",
  () => {
    const w = makeWorld({ settings: { buildingsIgnoreZeroRate: true } });
    makeResource(w, "Soul_Gem", { quantity: 1, rate: 0, ratio: 0.1 });
    makeResource(w, "Money", { quantity: 500, rate: 10 });
    makeTarget(w, "portal-gate", {
      weighting: 100,
      cost: { Soul_Gem: 5, Money: 400 },
    });
    makeTarget(w, "city-bank", { weighting: 5, cost: { Money: 300 } });
    return w;
  },
);
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click"),
  [["click", "city-bank"]],
);

runScenario("storage-full bypass skips weighting protection", () => {
  const w = makeWorld({ settings: { buildingBuildIfStorageFull: true } });
  makeResource(w, "Alloy", { quantity: 100, rate: 1, ratio: 0.99 });
  makeTarget(w, "space-elevator", { weighting: 100, cost: { Alloy: 500 } });
  makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 40 } });
  return w;
});

world = runScenario("mission stops the cycle", () => {
  const w = makeWorld();
  makeResource(w, "Money", { quantity: 1000 });
  makeTarget(w, "space-test-launch", {
    weighting: 9,
    cost: { Money: 100 },
    mission: true,
  });
  makeTarget(w, "city-bank", { weighting: 5, cost: { Money: 100 } });
  return w;
});
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click"),
  [["click", "space-test-launch"]],
);

runScenario("whitehole gem saving stops after a gem purchase", () => {
  const w = makeWorld({
    settings: { prestigeType: "whitehole", prestigeWhiteholeSaveGems: true },
  });
  makeResource(w, "Soul_Gem", { quantity: 10 });
  makeResource(w, "Money", { quantity: 1000 });
  makeTarget(w, "portal-carport", {
    weighting: 9,
    cost: { Soul_Gem: 1, Money: 100 },
  });
  makeTarget(w, "city-bank", { weighting: 5, cost: { Money: 100 } });
  return w;
});

runScenario("gem purchase continues without whitehole saving", () => {
  const w = makeWorld({
    settings: { prestigeType: "mad", prestigeWhiteholeSaveGems: true },
  });
  makeResource(w, "Soul_Gem", { quantity: 10 });
  makeResource(w, "Money", { quantity: 1000 });
  makeTarget(w, "portal-carport", {
    weighting: 9,
    cost: { Soul_Gem: 1, Money: 100 },
  });
  makeTarget(w, "city-bank", { weighting: 5, cost: { Money: 100 } });
  return w;
});

world = runScenario("failed click leaves state untouched", () => {
  const w = makeWorld({
    settings: { buildingConsumptionCheck: "onePerTick" },
  });
  makeResource(w, "Copper", { quantity: 100 });
  makeTarget(w, "space-red-mine", {
    weighting: 9,
    cost: { Copper: 10 },
    consumption: [{ resource: "Helium_3", rate: 2 }],
    clickSucceeds: false,
  });
  makeTarget(w, "city-statue", { weighting: 5, cost: { Copper: 10 } });
  return w;
});
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click" || e[0] === "click-failed"),
  [
    ["click-failed", "space-red-mine"],
    ["click", "city-statue"],
  ],
);

// After a successful click every cached affordability flips to false, so an
// already-processed candidate is treated as a starving competitor even though
// it is still live-affordable.
world = runScenario("click invalidates the affordability cache", () => {
  const w = makeWorld();
  makeResource(w, "Money", { quantity: 320, rate: 0.001 });
  makeResource(w, "Stone", { quantity: 100 });
  makeTarget(w, "city-temple", { weighting: 20, cost: { Money: 200 } });
  makeTarget(w, "city-bank", { weighting: 5, cost: { Money: 70, Stone: 10 } });
  return w;
});
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click"),
  [["click", "city-temple"]],
);
assert.equal(
  world.buildings[1].extraDescription,
  'Conflicts with <span class="has-text-info">city-temple</span> for ' +
    '<span class="has-text-info">Money</span><br>',
);

// Later candidates observe post-click resource levels through fresh live
// affordability samples.
world = runScenario("later candidates observe earlier clicks", () => {
  const w = makeWorld();
  makeResource(w, "Money", { quantity: 250 });
  makeTarget(w, "city-temple", { weighting: 10, cost: { Money: 200 } });
  makeTarget(w, "city-bank", { weighting: 5, cost: { Money: 100 } });
  return w;
});
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click"),
  [["click", "city-temple"]],
);

// Estimations are cached for the whole cycle and reused even after clicks
// change the underlying resource levels.
runScenario("estimations persist across candidates and clicks", () => {
  const w = makeWorld();
  makeResource(w, "Alloy", { quantity: 50, rate: 1 });
  makeResource(w, "Stone", { quantity: 400 });
  makeTarget(w, "space-elevator", {
    weighting: 100,
    cost: { Alloy: 500, Stone: 300 },
  });
  makeTarget(w, "city-shed", { weighting: 8, cost: { Stone: 50 } });
  makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 40 } });
  makeTarget(w, "city-statue", { weighting: 4, cost: { Alloy: 30 } });
  return w;
});

// A resource locked while a competitor's estimation was cached but unlocked
// by a later click has no per-resource estimate; the NaN slack arithmetic
// must fail the budget check and fall through to the cost-ratio gate,
// exactly like the legacy `total - undefined` arithmetic.
world = runScenario("estimation cached before unlock yields NaN slack", () => {
  const w = makeWorld();
  makeResource(w, "Elerium", {
    quantity: 50,
    rate: 100,
    unlocked: () => w.trace.some((e) => e[0] === "click"),
  });
  makeResource(w, "Polymer", { quantity: 90, rate: 1 });
  makeTarget(w, "space-outpost", {
    weighting: 15,
    cost: { Elerium: 100, Polymer: 100 },
  });
  makeTarget(w, "city-factory", { weighting: 10, cost: { Polymer: 60 } });
  makeTarget(w, "city-foundry", { weighting: 5, cost: { Elerium: 40 } });
  return w;
});
assert.deepEqual(
  world.trace.filter((e) => e[0] === "click"),
  [["click", "city-factory"]],
);
assert.equal(
  world.buildings[2].extraDescription,
  'Conflicts with <span class="has-text-info">space-outpost</span> for ' +
    '<span class="has-text-info">Elerium</span><br>',
);

// Lazily-initialized resource fields flow through comparisons as NaN.
runScenario("missing numeric resource fields stay lenient", () => {
  const w = makeWorld();
  const alloy = makeResource(w, "Alloy", { quantity: 100, rate: 1 });
  delete alloy.storageRequired;
  delete alloy.storageRatio;
  makeTarget(w, "space-elevator", { weighting: 100, cost: { Alloy: 500 } });
  makeTarget(w, "city-wardenclyffe", { weighting: 5, cost: { Alloy: 40 } });
  return w;
});

console.log("Build slice scenario tests passed");

// ---------------------------------------------------------------------------
// Adapter contract tests
// ---------------------------------------------------------------------------

{
  // Executor calls without an active cycle are rejected.
  const w = makeWorld();
  const adapter = createBuildAdapter({
    getBuildingManager: () => w.BuildingManager,
    getProjectManager: () => w.ProjectManager,
    getState: () => w.state,
    getSettings: () => w.settings,
    getResources: () => w.resources,
    getCostConflict: (target) => w.getCostConflict(target),
  });
  const click = adapter.executor.executeClick({ index: 0, key: "city-x" });
  assert.equal(click.outcome.status, "rejected");
  assert.equal(click.outcome.failure.code, "no-build-cycle");
  assert.equal(
    adapter.executor.annotate({
      kind: "text",
      index: 0,
      key: "city-x",
      text: "x",
    }).status,
    "rejected",
  );
}

{
  // Stale decisions (captured list no longer matching) do not click.
  const w = makeWorld();
  makeResource(w, "Money", { quantity: 100 });
  makeTarget(w, "city-bank", { weighting: 5, cost: { Money: 10 } });
  const adapter = createBuildAdapter({
    getBuildingManager: () => w.BuildingManager,
    getProjectManager: () => w.ProjectManager,
    getState: () => w.state,
    getSettings: () => w.settings,
    getResources: () => w.resources,
    getCostConflict: (target) => w.getCostConflict(target),
  });
  adapter.reader.beginCycle();
  const click = adapter.executor.executeClick({
    index: 0,
    key: "city-other",
  });
  assert.equal(click.outcome.status, "stale");
  assert.equal(click.outcome.failure.code, "stale-build-target");
  assert.equal(click.clicked, false);
  assert.deepEqual(
    w.trace.filter((e) => e[0] === "click"),
    [],
  );
  const annotate = adapter.executor.annotate({
    kind: "competitor",
    index: 0,
    key: "city-bank",
    otherKey: "city-missing",
    resourceId: "Money",
  });
  assert.equal(annotate.status, "stale");
}

{
  // Malformed manager surfaces are rejected during sampling.
  const w = makeWorld();
  w.BuildingManager.managedPriorityList = () => "not-a-list";
  const adapter = createBuildAdapter({
    getBuildingManager: () => w.BuildingManager,
    getProjectManager: () => w.ProjectManager,
    getState: () => w.state,
    getSettings: () => w.settings,
    getResources: () => w.resources,
    getCostConflict: (target) => w.getCostConflict(target),
  });
  assert.throws(() => adapter.reader.beginCycle(), TypeError);
}

{
  // A cost resource missing from the resource model fails validation.
  const w = makeWorld();
  makeTarget(w, "city-bank", {
    weighting: 5,
    cost: { Money: 10 },
    affordable: true,
  });
  makeTarget(w, "city-temple", {
    weighting: 50,
    cost: { Money: 100 },
    affordable: false,
  });
  const adapter = createBuildAdapter({
    getBuildingManager: () => w.BuildingManager,
    getProjectManager: () => w.ProjectManager,
    getState: () => w.state,
    getSettings: () => w.settings,
    getResources: () => w.resources,
    getCostConflict: (target) => w.getCostConflict(target),
  });
  assert.throws(() => runBuildAutomation(adapter), /resources\.Money/);
}

{
  // Missing lazily-initialized boolean-ish settings default off, and a fresh
  // settings bag without any of the sampled keys still yields a valid cycle.
  const w = makeWorld();
  w.settings = {};
  makeResource(w, "Money", { quantity: 100 });
  makeTarget(w, "city-bank", { weighting: 5, cost: { Money: 10 } });
  const adapter = createBuildAdapter({
    getBuildingManager: () => w.BuildingManager,
    getProjectManager: () => w.ProjectManager,
    getState: () => w.state,
    getSettings: () => w.settings,
    getResources: () => w.resources,
    getCostConflict: (target) => w.getCostConflict(target),
  });
  assert.equal(runBuildAutomation(adapter).status, "succeeded");
  assert.deepEqual(
    w.trace.filter((e) => e[0] === "click"),
    [["click", "city-bank"]],
  );
}

console.log("Build adapter contract tests passed");

// ---------------------------------------------------------------------------
// Planner unit tests
// ---------------------------------------------------------------------------

const setup = Object.freeze({
  candidates: Object.freeze([
    Object.freeze({
      key: "a",
      weighting: 100,
      cost: Object.freeze({ Alloy: 500 }),
      ignored: false,
    }),
    Object.freeze({
      key: "b",
      weighting: 5,
      cost: Object.freeze({ Alloy: 40 }),
      ignored: true,
    }),
  ]),
  consumptionMode: "perResource",
  buildIfStorageFull: false,
  ignoreZeroRate: false,
  saveWhiteholeGems: false,
});

// Ignored candidates never sample; cached-unaffordable candidates skip.
assert.deepEqual(candidateSampleNeeds(setup, initialBuildLoopState(), 1), {
  kind: "skip",
});
assert.deepEqual(
  candidateSampleNeeds(
    setup,
    {
      affordable: { a: false },
      estimations: {},
      consumptionsUsed: {},
    },
    0,
  ),
  { kind: "skip" },
);
// perResource only samples consumption once something was consumed.
assert.deepEqual(candidateSampleNeeds(setup, initialBuildLoopState(), 0), {
  kind: "evaluate",
  request: { needAffordability: true, needConsumption: false },
});
assert.deepEqual(
  candidateSampleNeeds(
    setup,
    {
      affordable: { a: true },
      estimations: {},
      consumptionsUsed: { Helium_3: true },
    },
    0,
  ),
  {
    kind: "evaluate",
    request: { needAffordability: false, needConsumption: true },
  },
);

// The competition request covers exactly the higher-weighted prefix.
{
  const request = competitionSampleRequest(setup, initialBuildLoopState(), 1);
  assert.deepEqual(request.affordabilityKeys, []);
  assert.deepEqual([...request.resourceIds].sort(), ["Alloy"]);
}

// Locked resources are skipped while estimating a competitor's build time,
// and cache commits from the competition phase survive in the returned state.
{
  const lockedSetup = Object.freeze({
    ...setup,
    candidates: Object.freeze([
      Object.freeze({
        key: "a",
        weighting: 8,
        cost: Object.freeze({ Alloy: 500, Stone: 60 }),
        ignored: false,
      }),
      Object.freeze({
        key: "b",
        weighting: 5,
        cost: Object.freeze({ Stone: 40 }),
        ignored: false,
      }),
    ]),
  });
  const sample = Object.freeze({
    affordability: Object.freeze({ a: false }),
    resources: Object.freeze({
      Alloy: Object.freeze({
        unlocked: false,
        currentQuantity: 0,
        rateOfChange: 1,
        storageRatio: 0,
        storageRequired: 0,
      }),
      Stone: Object.freeze({
        unlocked: true,
        currentQuantity: 20,
        rateOfChange: 2,
        storageRatio: 0,
        storageRequired: 0,
      }),
    }),
  });
  const plan = planBuildCompetition(
    lockedSetup,
    1,
    sample,
    initialBuildLoopState(),
  );
  assert.equal(plan.kind, "delay");
  assert.deepEqual(plan.annotation, {
    kind: "competitor",
    index: 1,
    key: "b",
    otherKey: "a",
    resourceId: "Stone",
  });
  assert.deepEqual(plan.state.affordable, { a: false });
  assert.deepEqual(plan.state.estimations.a.perResource, { Stone: 20 });
  assert.equal(plan.state.estimations.a.total, 20);
}

// A click report without a click leaves the loop state untouched.
{
  const state = initialBuildLoopState();
  const applied = applyBuildClickResult(
    setup,
    0,
    { clicked: false, mission: false, consumption: [] },
    state,
  );
  assert.equal(applied.stop, false);
  assert.equal(applied.state, state);
}

console.log("Build planner unit tests passed");
