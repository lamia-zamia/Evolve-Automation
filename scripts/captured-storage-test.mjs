import assert from "node:assert/strict";
import { createStorageAllocationAutomation } from "../src/application/storage-allocation.ts";
import { createCapturedStoragePorts } from "../src/adapters/evolve/economy/storage/captured-storage.ts";
import { priceLookup } from "./test-support/action-price.mjs";

function makeHarness({
  freeCrates = 0,
  savingCost = { Iron: 600 },
  savingPool,
  regional = false,
  buildTargets = [],
  buildCosts = {},
  offeredTechs,
  projects,
  autoResearch = false,
  autoARPA = false,
  projectSettings = {},
  mutateAssignments = true,
} = {}) {
  const root = {
    settings: {},
    race: regional ? { supplySplit: true } : {},
    tech: regional ? { shadow: 5 } : {},
    stats: {},
    city: { library: { count: 0 } },
    resource: {
      Crates: { display: true, amount: freeCrates, max: 5, stackable: false },
      Containers: { display: true, amount: 0, max: 5, stackable: false },
      Plywood: { display: true, amount: 100, max: 1000, stackable: false },
      Steel: { display: true, amount: 250, max: 1000, stackable: false },
      Iron: {
        display: true,
        amount: 0,
        max: 0,
        stackable: true,
        crates: 0,
        containers: 0,
        ...(regional
          ? {
              reg: { spc_mars: 0 },
              regMax: { spc_mars: 0 },
              regCrate: { spc_mars: 0 },
              regCon: { spc_mars: 0 },
            }
          : {}),
      },
    },
  };
  const calls = [];
  const skipped = [];
  const costLookups = [];
  const controls = new Map([
    [
      "createHead",
      {
        methods: ["buildCrateDesc", "buildContainerDesc", "crate", "container"],
      },
    ],
    ["stack-Iron", { methods: ["addCrate", "subCrate", "addCon", "subCon"] }],
  ]);
  const registry = {
    resolve(id) {
      const control = controls.get(id);
      return control === undefined
        ? undefined
        : { elementId: id, generation: 1, methods: control.methods };
    },
    invoke(handle, method, args = []) {
      calls.push([handle.elementId, method, ...args]);
      if (handle.elementId === "createHead" && method === "buildCrateDesc")
        return { ok: true, value: "Build 1 Plywood crate for 350 storage" };
      if (handle.elementId === "createHead" && method === "buildContainerDesc")
        return { ok: true, value: "Build 125 Steel container for 800 storage" };
      if (handle.elementId === "createHead" && method === "crate") {
        root.resource.Plywood.amount -= 10;
        root.resource.Crates.amount += 1;
        return { ok: true, value: undefined };
      }
      if (handle.elementId === "createHead" && method === "container") {
        root.resource.Steel.amount -= 125;
        root.resource.Containers.amount += 1;
        return { ok: true, value: undefined };
      }
      if (handle.elementId === "stack-Iron" && method === "addCrate") {
        if (mutateAssignments) {
          root.resource.Crates.amount -= 1;
          const pool = args[1];
          if (pool === undefined) {
            root.resource.Iron.crates += 1;
            root.resource.Iron.max += 350;
          } else {
            root.resource.Iron.regCrate[pool] += 1;
            root.resource.Iron.regMax[pool] += 350;
          }
        }
        return { ok: true, value: undefined };
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => [...controls.keys()],
  };
  const ports = createCapturedStoragePorts({
    rootState: { readRoot: () => root },
    controls: registry,
    readSettings: () => ({
      storageLimitPreMad: true,
      storageAssignExtra: false,
      storageAssignPart: false,
      storageSafeReassign: false,
      autoStorage: true,
      autoResearch,
      autoARPA,
      ...projectSettings,
      res_storageIron: true,
      res_storage_p_Iron: 0,
      res_min_storeIron: 1,
      res_max_storeIron: -1,
    }),
    readStorageRequired: () => 1,
    reservations: {
      readReservations: () => ({ unavailable: false, targets: [] }),
    },
    construction: {
      readSavingTarget: () => ({
        name: "saved",
        cost: savingCost,
        ...(savingPool === undefined ? {} : { pool: savingPool }),
      }),
    },
    readBuildTargets: () => buildTargets,
    costs: {
      readCost: (elementId) => {
        costLookups.push(elementId);
        return priceLookup(buildCosts)(elementId);
      },
    },
    ...(offeredTechs === undefined
      ? {}
      : { readOfferedTechs: () => offeredTechs }),
    ...(projects === undefined ? {} : { readProjects: () => projects }),
    onSkipped: (key, reason) => skipped.push([key, reason]),
    nowMs: () => 1,
  });
  const automation = createStorageAllocationAutomation(ports);
  return { root, calls, automation, ports, skipped, costLookups };
}

{
  const { ports, skipped } = makeHarness({
    autoResearch: true,
    autoARPA: true,
    projectSettings: { arpa_alpha: true, arpa_beta: false },
    offeredTechs: [
      { elementId: "tech-alpha", cost: { Iron: 700 }, generation: 1 },
    ],
    projects: [
      {
        elementId: "project-alpha",
        projectId: "alpha",
        rank: 0,
        progress: 0,
        cost: { Iron: 900 },
        generation: 1,
      },
      {
        elementId: "project-beta",
        projectId: "beta",
        rank: 0,
        progress: 0,
        cost: { Iron: 500 },
        generation: 1,
      },
    ],
  });
  const input = ports.reader.read();
  assert.deepEqual(
    input.targetSources.find(({ kind }) => kind === "technology"),
    {
      kind: "technology",
      enabled: true,
      targets: [
        {
          costs: [{ resourceId: "Iron", quantity: 700 }],
          isList: false,
          label: "technology/tech-alpha",
          unlocked: true,
          autoBuildEnabled: true,
        },
      ],
    },
  );
  assert.deepEqual(
    input.targetSources.find(({ kind }) => kind === "project"),
    {
      kind: "project",
      enabled: true,
      targets: [
        {
          costs: [{ resourceId: "Iron", quantity: 900 }],
          isList: false,
          label: "project/alpha",
          unlocked: true,
          autoBuildEnabled: true,
        },
        {
          costs: [{ resourceId: "Iron", quantity: 500 }],
          isList: false,
          label: "project/beta",
          unlocked: true,
          autoBuildEnabled: false,
        },
      ],
    },
  );
  assert.deepEqual(skipped, []);
}

{
  const { ports, skipped } = makeHarness({
    autoResearch: true,
    offeredTechs: [{ elementId: "tech-bad", cost: { Iron: Number.NaN } }],
  });
  assert.deepEqual(
    ports.reader.read().targetSources.find(({ kind }) => kind === "technology"),
    { kind: "technology", enabled: false, targets: [] },
  );
  assert.deepEqual(skipped, [
    ["tech-bad", "captured technology cost is invalid"],
  ]);
}

{
  const { ports, skipped } = makeHarness({
    autoARPA: true,
    projects: undefined,
  });
  assert.deepEqual(
    ports.reader.read().targetSources.find(({ kind }) => kind === "project"),
    { kind: "project", enabled: false, targets: [] },
  );
  assert.deepEqual(skipped, []);
}

{
  const { ports, skipped, costLookups } = makeHarness({
    buildTargets: [
      { key: "city-food", elementId: "undefined-food", weighting: 10 },
    ],
    buildCosts: { "undefined-food": { Iron: 400 } },
  });
  const source = ports.reader
    .read()
    .targetSources.find(({ kind }) => kind === "building");
  assert.deepEqual(source, {
    kind: "building",
    enabled: true,
    targets: [
      {
        costs: [{ resourceId: "Iron", quantity: 400 }],
        isList: false,
        label: "city-food",
        unlocked: true,
        autoBuildEnabled: true,
      },
    ],
  });
  assert.deepEqual(costLookups, ["undefined-food"]);
  assert.deepEqual(skipped, []);
}

{
  const { ports, skipped } = makeHarness({
    buildTargets: [
      { key: "city-farm", elementId: "city-farm", weighting: 10 },
      { key: "city-missing", elementId: "city-missing", weighting: 1 },
    ],
    buildCosts: { "city-farm": { Iron: 400 } },
  });
  const input = ports.reader.read();
  const source = input.targetSources.find(({ kind }) => kind === "building");
  assert.deepEqual(source, {
    kind: "building",
    enabled: false,
    targets: [],
  });
  assert.deepEqual(skipped, [
    ["city-missing", "captured build target cost is unavailable"],
  ]);
}

{
  const { ports, skipped } = makeHarness({ buildTargets: [] });
  const source = ports.reader
    .read()
    .targetSources.find(({ kind }) => kind === "building");
  assert.deepEqual(source, {
    kind: "building",
    enabled: true,
    targets: [],
  });
  assert.deepEqual(skipped, []);
}

{
  const { ports, skipped } = makeHarness({
    buildTargets: [{ key: "city-farm", elementId: "city-farm", weighting: 1 }],
    buildCosts: { "city-farm": { Iron: Number.NaN } },
  });
  const source = ports.reader
    .read()
    .targetSources.find(({ kind }) => kind === "building");
  assert.deepEqual(source, {
    kind: "building",
    enabled: false,
    targets: [],
  });
  assert.deepEqual(skipped, [
    ["city-farm", "captured build target cost is invalid"],
  ]);
}

{
  const { root, calls, automation } = makeHarness();
  assert.equal(automation.run().status, "succeeded");
  assert.equal(root.resource.Crates.amount, 2);
  assert.equal(root.resource.Plywood.amount, 80);
  assert.deepEqual(calls.filter((call) => call[1] === "crate").length, 2);
}

{
  const { root, calls, automation } = makeHarness({
    freeCrates: 1,
    savingCost: { Iron: 300 },
  });
  automation.run();
  automation.run();
  assert.equal(automation.run().status, "succeeded");
  assert.equal(root.resource.Crates.amount, 0);
  assert.equal(root.resource.Iron.crates, 1);
  assert.equal(root.resource.Iron.max, 350);
  assert.deepEqual(calls.at(-1), ["stack-Iron", "addCrate", "Iron"]);
}

{
  const { ports } = makeHarness({
    regional: true,
    freeCrates: 1,
    savingCost: { Iron: 300 },
    savingPool: "spc_mars",
  });
  const input = ports.reader.read();
  const queued = input.targetSources.find(({ kind }) => kind === "queued");
  assert.deepEqual(queued.targets[0], {
    costs: [{ resourceId: "Iron", quantity: 300, pool: "spc_mars" }],
    pool: "spc_mars",
    isList: false,
    label: "saved",
    unlocked: true,
    autoBuildEnabled: true,
  });
  assert.deepEqual(
    input.resources
      .filter(({ id }) => id === "Iron")
      .map(({ pool, maxQuantity }) => ({ pool, maxQuantity })),
    [
      { pool: undefined, maxQuantity: 0 },
      { pool: "spc_mars", maxQuantity: 0 },
    ],
  );
}

{
  const { root, calls, automation } = makeHarness({
    regional: true,
    freeCrates: 1,
    savingCost: { Iron: 300 },
    savingPool: "spc_mars",
  });
  automation.run();
  automation.run();
  assert.equal(automation.run().status, "succeeded");
  assert.equal(root.resource.Crates.amount, 0);
  assert.equal(root.resource.Iron.crates, 0);
  assert.equal(root.resource.Iron.regCrate.spc_mars, 1);
  assert.equal(root.resource.Iron.regMax.spc_mars, 350);
  assert.deepEqual(calls.at(-1), [
    "stack-Iron",
    "addCrate",
    "Iron",
    "spc_mars",
  ]);
}

{
  const { automation } = makeHarness({
    freeCrates: 1,
    savingCost: { Iron: 300 },
    mutateAssignments: false,
  });
  automation.run();
  automation.run();
  assert.equal(automation.run().status, "rejected");
}

console.log("captured storage tests passed");
