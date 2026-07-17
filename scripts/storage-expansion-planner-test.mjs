import assert from "node:assert/strict";

import { createStorageCommandExecutor } from "../src/adapters/evolve/storage-command-executor.ts";
import { createEvolveStorageExpansionReader } from "../src/adapters/evolve/storage-expansion-reader.ts";
import { createStorageExpansionSettingsReader } from "../src/adapters/storage/storage-expansion-settings-reader.ts";
import { planStorageExpansion } from "../src/domain/storage-expansion.ts";

const clock = Object.freeze({ nowMs: () => 1 });

// Exact copy of the deleted src/planning/storage-expansion.ts expandStorage.
function legacyExpandStorage(ctx, storageToBuild) {
  const { settings, resources, buildings, storageManager: sm } = ctx;
  let missingStorage = storageToBuild;
  let numberOfCratesWeCanBuild =
    resources.Crates.maxQuantity - resources.Crates.currentQuantity;
  let numberOfContainersWeCanBuild =
    resources.Containers.maxQuantity - resources.Containers.currentQuantity;
  for (const resourceId in resources.Crates.cost) {
    numberOfCratesWeCanBuild = Math.min(
      numberOfCratesWeCanBuild,
      resources[resourceId].currentQuantity / resources.Crates.cost[resourceId],
    );
  }
  for (const resourceId in resources.Containers.cost) {
    numberOfContainersWeCanBuild = Math.min(
      numberOfContainersWeCanBuild,
      resources[resourceId].currentQuantity /
        resources.Containers.cost[resourceId],
    );
  }
  if (settings.storageLimitPreMad && ctx.isEarlyGame()) {
    if (resources.Steel.storageRatio < 0.8) {
      numberOfContainersWeCanBuild = 0;
    }
    const library = buildings.Library;
    if (
      ctx.isLumberRace() &&
      library.count < 20 &&
      library.cost["Plywood"] > resources.Plywood.currentQuantity &&
      resources.Steel.maxQuantity >= resources.Steel.storageRequired
    ) {
      numberOfCratesWeCanBuild = 0;
    }
  }
  const cratesToBuild = Math.min(
    Math.floor(numberOfCratesWeCanBuild),
    Math.ceil(missingStorage / sm.crateValue),
  );
  sm.constructCrate(cratesToBuild);
  resources.Crates.currentQuantity += cratesToBuild;
  for (const resourceId in resources.Crates.cost) {
    resources[resourceId].currentQuantity -=
      resources.Crates.cost[resourceId] * cratesToBuild;
  }
  missingStorage -= cratesToBuild * sm.crateValue;
  if (missingStorage > 0) {
    const containersToBuild = Math.min(
      Math.floor(numberOfContainersWeCanBuild),
      Math.ceil(missingStorage / sm.containerValue),
    );
    sm.constructContainer(containersToBuild);
    resources.Containers.currentQuantity += containersToBuild;
    for (const resourceId in resources.Containers.cost) {
      resources[resourceId].currentQuantity -=
        resources.Containers.cost[resourceId] * containersToBuild;
    }
    missingStorage -= containersToBuild * sm.containerValue;
  }
  return missingStorage < storageToBuild;
}

function makeStorageManager(calls) {
  return {
    crateValue: 50,
    containerValue: 200,
    constructCrate: (amount) => calls.push(["crate", amount]),
    constructContainer: (amount) => calls.push(["container", amount]),
  };
}

function baseContext() {
  return {
    settings: { storageLimitPreMad: false },
    isEarlyGame: () => true,
    isLumberRace: () => true,
    resources: {
      Crates: { maxQuantity: 10, currentQuantity: 2, cost: { Wood: 10 } },
      Containers: { maxQuantity: 5, currentQuantity: 1, cost: { Steel: 20 } },
      Wood: { currentQuantity: 25 },
      Steel: {
        currentQuantity: 100,
        maxQuantity: 1000,
        storageRequired: 500,
        storageRatio: 0.9,
      },
      Plywood: { currentQuantity: 200 },
    },
    buildings: { Library: { count: 10, cost: { Plywood: 100 } } },
  };
}

function newPath(ctx, storageToBuild) {
  const calls = [];
  const storageManager = makeStorageManager(calls);
  ctx.storageManager = storageManager;
  const reader = createEvolveStorageExpansionReader({
    clock,
    getStorageToBuild: () => storageToBuild,
    getResources: () => ctx.resources,
    getBuildings: () => ctx.buildings,
    getStorageManager: () => storageManager,
    isEarlyGame: ctx.isEarlyGame,
    isLumberRace: ctx.isLumberRace,
  });
  const settingsReader = createStorageExpansionSettingsReader(
    () => ctx.settings,
  );
  const executor = createStorageCommandExecutor({
    getStorageManager: () => storageManager,
    getResources: () => ctx.resources,
  });
  const snapshot = reader.readSnapshot();
  const commands = planStorageExpansion(
    snapshot,
    settingsReader.readSettings(),
  );
  let storageAdded = 0;
  commands.forEach((command, index) => {
    const outcome = executor.execute({
      id: `command-${index + 1}`,
      expectedSnapshotId: snapshot.metadata.id,
      command,
    });
    if (outcome.status === "succeeded") {
      storageAdded += command.count * command.storagePerUnit;
    }
  });
  return { built: storageAdded > 0, calls };
}

function legacyPath(ctx, storageToBuild) {
  const calls = [];
  ctx.storageManager = makeStorageManager(calls);
  const built = legacyExpandStorage(ctx, storageToBuild);
  return { built, calls };
}

const scenarios = [
  { name: "normal build", storageToBuild: 300, mutate: () => {} },
  {
    name: "no cost resources available",
    storageToBuild: 300,
    mutate: (c) => {
      c.resources.Wood.currentQuantity = 0;
      c.resources.Steel.currentQuantity = 0;
    },
  },
  {
    name: "preMad steel + lumber block",
    storageToBuild: 100,
    mutate: (c) => {
      c.settings.storageLimitPreMad = true;
      c.resources.Steel.storageRatio = 0.7;
      c.resources.Plywood.currentQuantity = 50;
    },
  },
  {
    name: "preMad crates blocked only",
    storageToBuild: 100,
    mutate: (c) => {
      c.settings.storageLimitPreMad = true;
      c.resources.Plywood.currentQuantity = 50;
    },
  },
  {
    name: "over-cap negative crate count",
    storageToBuild: 300,
    mutate: (c) => {
      c.resources.Crates.currentQuantity = 5;
      c.resources.Crates.maxQuantity = 2;
    },
  },
  {
    name: "crates fully satisfy, no container",
    storageToBuild: 80,
    mutate: (c) => {
      c.resources.Crates.currentQuantity = 0;
      c.resources.Crates.maxQuantity = 10;
      c.resources.Wood.currentQuantity = 1000;
    },
  },
  {
    name: "fractional costs",
    storageToBuild: 130,
    mutate: (c) => {
      c.resources.Crates.cost = { Wood: 12.5 };
      c.resources.Wood.currentQuantity = 63;
    },
  },
  {
    name: "not early game ignores preMad",
    storageToBuild: 300,
    mutate: (c) => {
      c.settings.storageLimitPreMad = true;
      c.isEarlyGame = () => false;
      c.resources.Steel.storageRatio = 0.1;
    },
  },
  {
    name: "library plywood cost absent",
    storageToBuild: 100,
    mutate: (c) => {
      c.settings.storageLimitPreMad = true;
      c.buildings.Library.cost = {};
      c.resources.Plywood.currentQuantity = 0;
    },
  },
];

for (const scenario of scenarios) {
  const legacyCtx = baseContext();
  scenario.mutate(legacyCtx);
  const newCtx = baseContext();
  scenario.mutate(newCtx);

  const legacy = legacyPath(legacyCtx, scenario.storageToBuild);
  const modern = newPath(newCtx, scenario.storageToBuild);

  assert.equal(modern.built, legacy.built, `${scenario.name}: return value`);
  assert.deepEqual(modern.calls, legacy.calls, `${scenario.name}: calls`);
  assert.deepEqual(
    newCtx.resources,
    legacyCtx.resources,
    `${scenario.name}: resource model`,
  );
}

console.log("Storage expansion planner dual-run tests passed");
