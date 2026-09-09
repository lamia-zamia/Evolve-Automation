import assert from "node:assert/strict";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";

let listener;
let unsubscribeCount = 0;
let storageValue = null;
const errors = [];

const stop = startCapturedRuntime({
  pageCapture: {
    isComplete: () => true,
    rootState: {
      readRoot: () => undefined,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        listener = next;
        return () => unsubscribeCount++;
      },
    },
    mountSuppression: { available: false, withoutMounting: () => undefined },
    uninstall: () => {},
  },
  document: {},
  mouseEvent: class {},
  storage: {
    getItem() {
      return storageValue;
    },
  },
  logError: (message) => errors.push(message),
});

assert.equal(typeof listener, "function");

// A fresh install inherits the game's defaults: the captured runtime must not start an
// automation family merely because the script settings key is absent.
listener({ periods: 1 });
assert.deepEqual(errors, []);

storageValue = JSON.stringify({
  masterScriptToggle: false,
  autoResearch: true,
});
listener({ periods: 1 });
assert.deepEqual(errors, []);

stop();
assert.equal(unsubscribeCount, 1);

// The persisted settings must reach the construction policy: without them no managed building is
// ever a candidate and autoBuild silently builds nothing.
{
  const invoked = [];
  const root = {
    race: {},
    tech: {},
    city: { cottage: { count: 0 } },
    space: {},
    queue: { display: true, pause: false, queue: [] },
    r_queue: { display: false, pause: false, queue: [] },
    settings: {},
    resource: {
      Money: { amount: 0, max: 100000, display: true, diff: 0, name: "$" },
    },
  };
  const handles = new Map(
    ["buildQueue", "city-cottage"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: ["setData", "action"] },
    ]),
  );
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (id) => handles.get(id),
        invoke: (handle, method) => {
          invoked.push(`${handle.elementId}.${method}`);
          return method === "setData"
            ? { ok: true, value: { "res-Money": 500 } }
            : { ok: true, value: undefined };
        },
        capturedElementIds: () => [...handles.keys()],
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: true,
          "batcity-cottage": true,
          "bld_w_city-cottage": 100,
        }),
    },
    logError: () => {},
  });
  cycle({ periods: 1 });
  stopCycle();
  assert.ok(
    invoked.includes("buildQueue.setData"),
    `the construction cycle never priced the managed building: ${JSON.stringify(invoked)}`,
  );
}

// A candidate the cycle cannot supply is reported, and reported once rather than every period.
{
  const reported = [];
  const root = {
    race: {},
    tech: {},
    city: {},
    space: {},
    queue: { display: true, pause: false, queue: [] },
    settings: {},
    resource: {},
  };
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: () => undefined,
        invoke: () => ({ ok: false, reason: "unknown-control" }),
        capturedElementIds: () => ["city-cottage"],
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: true,
          "batcity-cottage": true,
        }),
    },
    logError: (message) => reported.push(message),
  });
  cycle({ periods: 1 });
  cycle({ periods: 1 });
  stopCycle();
  const skipped = reported.filter((message) =>
    message.includes("city-cottage"),
  );
  assert.deepEqual(skipped, [
    "progression skipped city-cottage: captured city state is unavailable",
  ]);
}

// What the cycle is saving for is held back from the cheaper candidates that arrive after it: the
// expensive target is unaffordable, and the cheap one must not spend the money it is accumulating.
{
  const invoked = [];
  const root = {
    race: {},
    tech: {},
    city: { bank: { count: 0 }, farm: { count: 0 } },
    space: {},
    queue: { display: true, pause: false, queue: [] },
    settings: {},
    resource: {
      Money: { amount: 600, max: 10000, display: true, diff: 0, name: "$" },
    },
  };
  const prices = { "city-bank": 5000, "city-farm": 500 };
  const handles = new Map(
    ["buildQueue", "city-bank", "city-farm"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: ["setData", "action"] },
    ]),
  );
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (id) => handles.get(id),
        invoke: (handle, method, args = []) => {
          if (method === "setData") {
            const entry = root.queue.queue[args[0]];
            return { ok: true, value: { "res-Money": prices[entry.id] } };
          }
          invoked.push(handle.elementId);
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => [...handles.keys()],
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: true,
          "batcity-bank": true,
          "bld_w_city-bank": 300,
          "batcity-farm": true,
          "bld_w_city-farm": 100,
        }),
    },
    logError: () => {},
  });
  // The first cycle has no reservation in force yet, so the cheap candidate is still bought.
  cycle({ periods: 1 });
  assert.deepEqual(invoked, ["city-farm"]);
  // The bank is now the published saving target, and its cost holds the farm back.
  cycle({ periods: 1 });
  cycle({ periods: 1 });
  stopCycle();
  assert.deepEqual(invoked, ["city-farm"]);
}

// autoPower reaches the captured city producer control without requiring the legacy manager.
{
  const root = {
    city: {
      powered: true,
      power: -1,
      mill: { count: 2, on: 0 },
    },
  };
  const invoked = [];
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (id) =>
          id === "city-mill"
            ? { elementId: id, generation: 1, methods: ["power_on"] }
            : undefined,
        invoke: (handle, method) => {
          invoked.push(`${handle.elementId}.${method}`);
          root.city.mill.on += 1;
          root.city.power = 1;
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ["city-mill"],
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({ masterScriptToggle: true, autoPower: true }),
    },
    logError: () => {},
  });
  cycle({ periods: 1 });
  stopCycle();
  assert.deepEqual(invoked, ["city-mill.power_on"]);
  assert.equal(root.city.mill.on, 1);
}

// autoJobs reaches captured ordinary civ controls without the compatibility manager.
{
  const root = {
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 2,
        workers: 2,
        max: 0,
        display: true,
      },
      farmer: {
        job: "farmer",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
    },
    resource: { Population: { amount: 2, max: 10 } },
  };
  const invoked = [];
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (id) =>
          id === "civ-unemployed" || id === "civ-farmer"
            ? {
                elementId: id,
                generation: 1,
                methods: ["add", "sub", "setDefault"],
              }
            : undefined,
        invoke: (handle, method, args = []) => {
          invoked.push(`${handle.elementId}.${method}`);
          if (method === "setDefault") {
            root.civic.d_job = args[0];
          } else {
            const id = handle.elementId.slice("civ-".length);
            root.civic[id].workers += method === "add" ? 1 : -1;
          }
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ["civ-unemployed", "civ-farmer"],
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoJobs: true,
          job_unemployed: true,
          job_farmer: true,
          jobSetDefault: true,
        }),
    },
    logError: () => {},
  });
  cycle({ periods: 1 });
  stopCycle();
  assert.deepEqual(invoked, [
    "civ-unemployed.sub",
    "civ-unemployed.sub",
    "civ-farmer.add",
    "civ-farmer.add",
    "civ-farmer.setDefault",
  ]);
}

// When both job families are enabled, the runtime uses one combined decision and command phase.
// The fixture includes both ordinary and skilled servants so the branch also proves that the
// runtime does not fall back to a second craftsmen-only pass after the full phase succeeds.
{
  const root = {
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 4,
        workers: 4,
        max: 0,
        display: true,
      },
      farmer: {
        job: "farmer",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
      craftsman: { workers: 1, max: 2 },
    },
    city: {
      foundry: {
        Plywood: 1,
        Brick: 0,
        crafting: 1,
        cap: 2,
        rcap: { Plywood: 2, Brick: 2 },
      },
    },
    race: {
      servants: {
        jobs: { farmer: 0 },
        sjobs: { Plywood: 1 },
        max: 1,
        used: 0,
        smax: 1,
        sused: 1,
      },
    },
    resource: {
      Population: { amount: 4, max: 10 },
      Plywood: { amount: 100, max: 1000, name: "Plywood", display: true },
      Brick: { amount: 0, max: 1000, name: "Brick", display: true },
      Iron: { amount: 100, max: 1000, name: "Iron", display: true },
    },
  };
  const invoked = [];
  let cycle;
  const controlIds = [
    "civ-unemployed",
    "civ-farmer",
    "servant-farmer",
    "foundry",
    "scraftPlywood",
    "scraftBrick",
    "resPlywood",
    "resBrick",
  ];
  const controls = {
    resolve: (elementId) => {
      if (!controlIds.includes(elementId)) return undefined;
      const methods = elementId.startsWith("res")
        ? ["craftCost"]
        : elementId === "foundry" ||
            elementId.startsWith("scraft") ||
            elementId.startsWith("servant-")
          ? ["add", "sub"]
          : ["add", "sub", "setDefault"];
      return { elementId, generation: 1, methods };
    },
    invoke: (handle, method, args = []) => {
      if (method === "craftCost")
        return { ok: true, value: "<div>Iron 1</div>" };
      invoked.push(`${handle.elementId}.${method}`);
      if (handle.elementId === "foundry") {
        const id = args[0];
        root.city.foundry[id] += method === "add" ? 1 : -1;
        root.city.foundry.crafting += method === "add" ? 1 : -1;
        root.civic.craftsman.workers += method === "add" ? 1 : -1;
        root.civic.unemployed.workers += method === "add" ? -1 : 1;
      } else if (handle.elementId.startsWith("scraft")) {
        const id = args[0];
        root.race.servants.sjobs[id] =
          (root.race.servants.sjobs[id] ?? 0) + (method === "add" ? 1 : -1);
        root.race.servants.sused += method === "add" ? 1 : -1;
      } else if (handle.elementId === "servant-farmer") {
        root.race.servants.jobs.farmer += method === "add" ? 1 : -1;
        root.race.servants.used += method === "add" ? 1 : -1;
      } else if (method === "setDefault") {
        root.civic.d_job = args[0];
      } else {
        const id = handle.elementId.slice("civ-".length);
        root.civic[id].workers += method === "add" ? 1 : -1;
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => controlIds,
  };
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls,
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoJobs: true,
          autoCraftsmen: true,
          job_unemployed: true,
          job_farmer: true,
          jobManageServants: true,
          productionCraftsmen: "always",
          craftPlywood: true,
          job_Plywood: true,
          foundry_w_Plywood: 1,
          craftBrick: true,
          job_Brick: true,
          foundry_w_Brick: 1,
        }),
    },
    logError: (message) => {
      throw new Error(message);
    },
  });
  cycle({ periods: 1 });
  stopCycle();
  assert.ok(invoked.some((entry) => entry.startsWith("foundry.")));
  assert.ok(invoked.some((entry) => entry.startsWith("scraft")));
  assert.ok(invoked.some((entry) => entry.startsWith("servant-farmer.")));
  assert.equal(
    invoked.filter((entry) => entry.startsWith("foundry.")).length,
    1,
    "the combined branch must not run a second craftsmen-only pass",
  );
}

console.log("captured-runtime-control ok");
