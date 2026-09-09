import assert from "node:assert/strict";
import { createStorageAllocationAutomation } from "../src/application/storage-allocation.ts";
import { createCapturedStoragePorts } from "../src/adapters/evolve/economy/storage/captured-storage.ts";

function makeHarness({
  freeCrates = 0,
  savingCost = { Iron: 600 },
  buildTargets = [],
  buildCosts = {},
  mutateAssignments = true,
} = {}) {
  const root = {
    settings: {},
    race: {},
    tech: {},
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
      },
    },
  };
  const calls = [];
  const skipped = [];
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
          root.resource.Iron.crates += 1;
          root.resource.Iron.max += 350;
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
      readSavingTarget: () => ({ name: "saved", cost: savingCost }),
    },
    readBuildTargets: () => buildTargets,
    costs: {
      readCost: (elementId) => buildCosts[elementId],
    },
    onSkipped: (key, reason) => skipped.push([key, reason]),
    nowMs: () => 1,
  });
  const automation = createStorageAllocationAutomation(ports);
  return { root, calls, automation, ports, skipped };
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
  assert.deepEqual(input.targetSources, [
    {
      kind: "queued",
      enabled: true,
      targets: [
        {
          costs: [{ resourceId: "Iron", quantity: 600 }],
          isList: false,
          label: "saved",
          unlocked: true,
          autoBuildEnabled: true,
        },
      ],
    },
    {
      kind: "building",
      enabled: true,
      targets: [
        {
          costs: [{ resourceId: "Iron", quantity: 400 }],
          isList: false,
          label: "city-farm",
          unlocked: true,
          autoBuildEnabled: true,
        },
      ],
    },
    {
      kind: "required",
      enabled: true,
      targets: [
        {
          costs: [{ resourceId: "Iron", quantity: 1 }],
          isList: false,
          label: "storageRequired/Iron",
          unlocked: true,
          autoBuildEnabled: true,
        },
      ],
    },
  ]);
  assert.deepEqual(skipped, [
    ["city-missing", "captured build target cost is unavailable"],
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
