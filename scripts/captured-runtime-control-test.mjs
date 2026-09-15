import assert from "node:assert/strict";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";

// The captured runtime gates its cycles on the script's own `tickRate`, which defaults to four game
// periods. These fixtures therefore deliver a four-period batch per intended cycle; the gate itself
// is exercised separately at the end of this file.

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
listener({ periods: 4 });
assert.deepEqual(errors, []);

storageValue = JSON.stringify({
  masterScriptToggle: false,
  autoResearch: true,
});
listener({ periods: 4 });
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
        invoke: (handle, method, args = []) => {
          invoked.push(`${handle.elementId}.${method}`);
          return method === "setData"
            ? { ok: true, value: { [`${args[1]}-Money`]: 500 } }
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
  cycle({ periods: 4 });
  stopCycle();
  assert.ok(
    invoked.includes("buildQueue.setData"),
    `the construction cycle never priced the managed building: ${JSON.stringify(invoked)}`,
  );
}

// A returned construction rejection is surfaced by the runtime phase instead of being mistaken
// for a completed autoBuild pass.
{
  const reported = [];
  const diagnostics = {
    readPerformanceEnabled: () => true,
    nowMs: () => 0,
    recordPerformance: () => {},
    recordCount: () => {},
    flushPerformance: () => {},
  };
  const diagnosticLog = [];
  const root = {
    race: {},
    tech: {},
    city: { cottage: { count: 0 } },
    space: {},
    queue: { display: true, pause: false, queue: [] },
    settings: {},
    resource: {
      Money: { amount: 1000, max: 100000, display: true, diff: 0, name: "$" },
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
        invoke: (_handle, method, args = []) =>
          method === "setData"
            ? { ok: true, value: { [`${args[1]}-Money`]: 10 } }
            : { ok: false, reason: "unknown-method" },
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
    diagnostics,
    log: (message) => diagnosticLog.push(message),
    logError: (message) => reported.push(message),
  });
  cycle({ periods: 4 });
  stopCycle();
  assert.deepEqual(reported, ["autoBuild: build-click-failed: unknown-method"]);
  assert.ok(diagnosticLog.includes("autoBuild.candidates 1"));
  assert.ok(diagnosticLog.includes("build.execute.invokeOk false"));
  assert.ok(diagnosticLog.includes("autoBuild.outcome rejected"));
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
  cycle({ periods: 4 });
  cycle({ periods: 4 });
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
            return {
              ok: true,
              value: { [`${args[1]}-Money`]: prices[entry.id] },
            };
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
  cycle({ periods: 4 });
  assert.deepEqual(invoked, ["city-farm"]);
  // The bank is now the published saving target, and its cost holds the farm back.
  cycle({ periods: 4 });
  cycle({ periods: 4 });
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
  cycle({ periods: 4 });
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
          // A profile that has been through a job settings reset; without breakpoints the
          // captured catalog plans nothing rather than reading every absence as a zero target.
          job_b1_unemployed: 0,
          job_b2_unemployed: 0,
          job_b3_unemployed: 0,
          job_b1_farmer: -1,
          job_b2_farmer: -1,
          job_b3_farmer: -1,
        }),
    },
    logError: () => {},
  });
  cycle({ periods: 4 });
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
          job_b1_unemployed: 0,
          job_b2_unemployed: 0,
          job_b3_unemployed: 0,
          job_b1_farmer: -1,
          job_b2_farmer: -1,
          job_b3_farmer: -1,
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
  cycle({ periods: 4 });
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

// Nanite disposal runs before power producers, so the power planner sees the post-disposal rate.
{
  const root = {
    race: { deconstructor: true },
    resource: {
      Nanite: { amount: 0, max: 100, display: true },
      Supply: { amount: 0, max: 100, display: true },
      Copper: { amount: 100, max: 100, diff: 0, display: true },
    },
    interstellar: {
      mass_ejector: { count: 1, on: 1, Copper: 0 },
    },
    city: {
      powered: true,
      power: -1,
      nanite_factory: { count: 1, Copper: 0 },
      mill: { count: 2, on: 0 },
    },
    portal: {
      bireme: { count: 1, on: 1 },
      transport: { count: 1, on: 1, cargo: { max: 2, Copper: 0 } },
    },
  };
  const invoked = [];
  let cycle;
  const controls = {
    resolve: (elementId) => {
      if (elementId === "iNFactory") {
        return {
          elementId,
          generation: 1,
          methods: ["addItem", "subItem"],
        };
      }
      if (elementId === "ejectCopper") {
        return {
          elementId,
          generation: 1,
          methods: ["ejectMore", "ejectLess"],
        };
      }
      if (elementId === "supplyCopper") {
        return {
          elementId,
          generation: 1,
          methods: ["supplyMore", "supplyLess"],
        };
      }
      if (elementId === "city-mill") {
        return { elementId, generation: 1, methods: ["power_on"] };
      }
      return undefined;
    },
    invoke: (handle, method, args = []) => {
      invoked.push(`${handle.elementId}.${method}`);
      if (handle.elementId === "iNFactory") {
        root.city.nanite_factory[args[0]] += method === "addItem" ? 1 : -1;
      } else if (handle.elementId === "ejectCopper") {
        root.interstellar.mass_ejector[args[0]] +=
          method === "ejectMore" ? 1 : -1;
      } else if (handle.elementId === "supplyCopper") {
        root.portal.transport.cargo[args[0]] +=
          method === "supplyMore" ? 1 : -1;
      } else {
        root.city.mill.on += 1;
        root.city.power = 1;
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => [
      "iNFactory",
      "supplyCopper",
      "ejectCopper",
      "city-mill",
    ],
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
          autoNanite: true,
          naniteMode: "cap",
          autoSupply: true,
          supplyMode: "cap",
          autoEject: true,
          ejectMode: "cap",
          autoPower: true,
          res_naniteCopper: true,
          res_supplyCopper: true,
          res_ejectCopper: true,
        }),
    },
    logError: (message) => {
      throw new Error(message);
    },
  });
  cycle({ periods: 4 });
  stopCycle();
  const firstPower = invoked.findIndex(
    (entry) => entry === "city-mill.power_on",
  );
  assert.ok(firstPower > 0, JSON.stringify(invoked));
  assert.ok(
    invoked
      .slice(0, firstPower)
      .every(
        (entry) =>
          entry === "iNFactory.addItem" ||
          entry === "supplyCopper.supplyMore" ||
          entry === "ejectCopper.ejectMore",
      ),
    JSON.stringify(invoked),
  );
  assert.ok(
    invoked.findIndex((entry) => entry === "supplyCopper.supplyMore") >
      invoked.findIndex((entry) => entry === "iNFactory.addItem"),
    JSON.stringify(invoked),
  );
  assert.ok(
    invoked.findIndex((entry) => entry === "ejectCopper.ejectMore") >
      invoked.findIndex((entry) => entry === "supplyCopper.supplyMore"),
    JSON.stringify(invoked),
  );
  assert.equal(root.city.nanite_factory.Copper, 4);
}

// The `tickRate` gate: the game wakes the script on every period, and only every `tickRate`-th
// period's worth of them completes a working cycle. One `isComplete()` call is one cycle.
{
  const countCycles = (tickRate, batches) => {
    let cycles = 0;
    let cycle;
    const stopCycle = startCapturedRuntime({
      pageCapture: {
        isComplete: () => {
          cycles++;
          return false;
        },
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
            cycle = next;
            return () => {};
          },
        },
        mountSuppression: {
          available: false,
          withoutMounting: () => undefined,
        },
        uninstall: () => {},
      },
      document: { getElementById: () => null, querySelectorAll: () => [] },
      mouseEvent: class {},
      storage: {
        getItem: () =>
          tickRate === undefined ? "{}" : JSON.stringify({ tickRate }),
      },
      logError: () => {},
    });
    for (const periods of batches) cycle({ periods });
    stopCycle();
    return cycles;
  };

  // The default rate is four periods per cycle.
  assert.equal(countCycles(undefined, [1, 1, 1]), 0);
  assert.equal(countCycles(undefined, [1, 1, 1, 1]), 1);
  assert.equal(countCycles(undefined, [1, 1, 1, 1, 1, 1, 1, 1]), 2);

  // Rate 1 works on every period; a rate the script cannot honour is floored to that.
  assert.equal(countCycles(1, [1, 1, 1]), 3);
  assert.equal(countCycles(0, [1, 1, 1]), 3);

  // A drift batch counts for every period it carries, so a throttled tab does not starve the
  // script, and the remainder rides along: the three periods left over after a six-period batch
  // mean one more period completes the next cycle rather than four.
  assert.equal(countCycles(4, [1, 6]), 1);
  assert.equal(countCycles(4, [1, 6, 1]), 2);
  assert.equal(countCycles(4, [1, 1, 1, 1, 1, 1, 1]), 1);

  // Whole cycles missed inside one batch collapse into one; the script cannot replay them.
  assert.equal(countCycles(4, [12]), 1);
}

// A feature that throws is reported once and skips only itself: every later phase still runs. Before
// the per-phase boundary a single `try` covered the whole cycle, so an unavailable control in an
// early feature silently cost every feature after it — measured against the real game at zero
// build-queue cost probes over 600 periods while the market phase threw each cycle.
{
  const root = {
    race: { deconstructor: true },
    resource: {
      Nanite: { amount: 0, max: 100, display: true },
      Supply: { amount: 0, max: 100, display: true },
      Copper: { amount: 100, max: 100, diff: 0, display: true },
    },
    interstellar: { mass_ejector: { count: 1, on: 1, Copper: 0 } },
    city: {
      powered: true,
      power: -1,
      nanite_factory: { count: 1, Copper: 0 },
      mill: { count: 2, on: 0 },
    },
    portal: {
      bireme: { count: 1, on: 1 },
      transport: { count: 1, on: 1, cargo: { max: 2, Copper: 0 } },
    },
  };
  const invoked = [];
  const reported = [];
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
        resolve: (elementId) => {
          // Nanite disposal runs first of these three. Its control throwing stands in for any
          // feature whose own state has gone out from under it mid-run.
          if (elementId === "iNFactory") {
            throw new Error("nanite control exploded");
          }
          if (elementId === "ejectCopper") {
            return {
              elementId,
              generation: 1,
              methods: ["ejectMore", "ejectLess"],
            };
          }
          if (elementId === "supplyCopper") {
            return {
              elementId,
              generation: 1,
              methods: ["supplyMore", "supplyLess"],
            };
          }
          return undefined;
        },
        invoke: (handle, method, args = []) => {
          invoked.push(`${handle.elementId}.${method}`);
          if (handle.elementId === "ejectCopper") {
            root.interstellar.mass_ejector[args[0]] +=
              method === "ejectMore" ? 1 : -1;
          } else if (handle.elementId === "supplyCopper") {
            root.portal.transport.cargo[args[0]] +=
              method === "supplyMore" ? 1 : -1;
          }
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ["supplyCopper", "ejectCopper"],
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
          tickRate: 1,
          autoNanite: true,
          naniteMode: "cap",
          autoSupply: true,
          supplyMode: "cap",
          autoEject: true,
          ejectMode: "cap",
          res_naniteCopper: true,
          res_supplyCopper: true,
          res_ejectCopper: true,
        }),
    },
    logError: (message) => reported.push(message),
  });
  cycle({ periods: 1 });
  cycle({ periods: 1 });
  cycle({ periods: 1 });
  stopCycle();

  // The failing phase is named, and named once rather than every cycle.
  const failures = reported.filter((message) => message.includes("autoNanite"));
  assert.equal(
    failures.length,
    1,
    `expected one autoNanite failure: ${JSON.stringify(reported)}`,
  );
  assert.match(failures[0], /autoNanite stopped: .*nanite control exploded/);
  // Both later phases still ran, which is the whole point of the boundary.
  assert.ok(
    invoked.some((entry) => entry === "supplyCopper.supplyMore"),
    `autoSupply was skipped by autoNanite's throw: ${JSON.stringify(invoked)}`,
  );
  assert.ok(
    invoked.some((entry) => entry === "ejectCopper.ejectMore"),
    `autoEject was skipped by autoNanite's throw: ${JSON.stringify(invoked)}`,
  );
}

console.log("captured-runtime-control ok");
