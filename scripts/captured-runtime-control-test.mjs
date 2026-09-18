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
    setItem(_key, value) {
      storageValue = value;
    },
  },
  logError: (message) => errors.push(message),
});

assert.equal(typeof listener, "function");
assert.notEqual(storageValue, null);
assert.equal(JSON.parse(storageValue).autoBuild, false);
assert.equal(JSON.parse(storageValue).autoMarket, false);

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

// A genuinely empty profile is normalized by the production runtime before its first consumer
// runs. A second runtime then proves that the captured market row uses those persisted settings.
{
  const invoked = [];
  const root = {
    race: {},
    tech: { trade: true, currency: 0 },
    civic: {},
    settings: { showMarket: true },
    city: { market: { qty: 1, mtrade: 1, trade: 0 } },
    resource: {
      Money: { amount: 1000, max: 10000, display: true, diff: 0, value: 1 },
      Food: {
        amount: 0,
        max: 100,
        display: true,
        diff: 0,
        value: 1,
        trade: 0,
        stackable: true,
      },
    },
  };
  const market = root.city.market;
  const handles = new Map([
    [
      "market-qty",
      {
        elementId: "market-qty",
        generation: 1,
        methods: [],
        data: market,
      },
    ],
    [
      "market-Food",
      {
        elementId: "market-Food",
        generation: 1,
        methods: ["autoBuy", "autoSell", "zero", "purchase", "sell"],
      },
    ],
  ]);
  let cycle;
  const persisted = { value: null };
  const pageCapture = {
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
        const resourceId = args[0];
        if (method === "purchase" && resourceId === "Food") {
          const quantity = market.qty;
          root.resource.Food.amount += quantity;
          root.resource.Money.amount -= quantity * root.resource.Food.value;
        }
        if (method === "sell" && resourceId === "Food") {
          const quantity = market.qty;
          root.resource.Food.amount -= quantity;
          root.resource.Money.amount += quantity * root.resource.Food.value;
        }
        if (method === "autoBuy" && resourceId === "Food") {
          root.city.market.trade += 1;
          root.resource.Food.trade += 1;
        }
        if (method === "autoSell" && resourceId === "Food") {
          root.city.market.trade -= 1;
          root.resource.Food.trade -= 1;
        }
        if (method === "zero" && resourceId === "Food") {
          root.city.market.trade -= root.resource.Food.trade;
          root.resource.Food.trade = 0;
        }
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
  };
  const firstStop = startCapturedRuntime({
    pageCapture,
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () => persisted.value,
      setItem: (_key, value) => {
        persisted.value = value;
      },
    },
    logError: (message) => {
      throw new Error(message);
    },
  });
  cycle({ periods: 4 });
  firstStop();
  const fresh = JSON.parse(persisted.value);
  assert.equal(fresh.res_trade_buy_Food, true);
  assert.equal(fresh.res_storageFood, true);

  persisted.value = JSON.stringify({
    ...fresh,
    autoMarket: true,
    buyFood: true,
  });
  const secondStop = startCapturedRuntime({
    pageCapture,
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () => persisted.value,
      setItem: (_key, value) => {
        persisted.value = value;
      },
    },
    logError: (message) => {
      throw new Error(message);
    },
  });
  cycle({ periods: 4 });
  secondStop();
  assert.ok(invoked.includes("market-Food.purchase"));
}

// The persisted settings must reach the construction policy: a quiet trigger phase — including a
// configured trigger whose building is not captured yet — must not suppress autoBuild.
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
          autoTrigger: true,
          triggers: [
            {
              priority: 0,
              requirementType: "BuildingCount",
              requirementId: "city-cottage",
              requirementCount: 0,
              actionType: "build",
              actionId: "city-not-yet-unlocked",
              actionCount: 1,
            },
          ],
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

// A city control with no matching state record is not a positive building identity, so it is
// ignored rather than reported as a skipped building candidate.
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
  assert.deepEqual(
    reported.filter((message) => message.includes("city-cottage")),
    [],
  );
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

// The production captured cycle is a separate orchestration boundary from runTick. These phase
// failures make its actual order observable without relying on source-text ordering or a test-only
// expected-phase constant. The always-on building preflight consumes the first root failure, and
// the captured mercenary phase is included before the existing spy/espionage/battle sequence. The
// extra bootstrap reads are the captured settings catalogs sampled before feature phases; they
// return the root unchanged so the original phase-failure boundary remains observable. The count
// is exact: the storage reset context samples the root once, so adding or removing a bootstrap
// root read moves the failure window and this number moves with it.
{
  const phaseFailures = [];
  const observedPhases = [];
  let bootstrapRootReads = 17;
  let remainingRootFailures = 4;
  let validCombatRootReads = 0;
  const root = {
    tech: { spy: 2 },
    civic: {
      foreign: {
        gov0: {
          mil: 10,
          spy: 3,
          sab: 0,
          hstl: 0,
          unrest: 0,
          eco: 1,
          occ: false,
          anx: false,
          buy: false,
        },
      },
    },
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: ["vis", "gvis", "trigModal", "spy_disabled", "spy"],
  };
  const garrison = {
    elementId: "garrison",
    generation: 1,
    methods: [
      "vis",
      "hire",
      "hell",
      "s_max",
      "campaign",
      "next",
      "last",
      "aNext",
      "aLast",
      "rating",
    ],
  };
  const controlCalls = [];
  let mercenaryPhaseObserved = false;
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => {
          if (bootstrapRootReads > 0) {
            bootstrapRootReads -= 1;
            return root;
          }
          if (remainingRootFailures > 0) {
            remainingRootFailures -= 1;
            throw new Error("phase stub");
          }
          if (validCombatRootReads < 3) {
            validCombatRootReads += 1;
            return root;
          }
          throw new Error("battle phase stub");
        },
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (id) => {
          if (
            id === "garrison" &&
            !mercenaryPhaseObserved &&
            observedPhases[observedPhases.length - 1] === "autoBuild"
          ) {
            mercenaryPhaseObserved = true;
            observedPhases.push("autoFight.mercenary");
          }
          return id === "foreign"
            ? foreign
            : id === "garrison"
              ? garrison
              : undefined;
        },
        invoke: (handle, method, args = []) => {
          if (
            handle === foreign &&
            method === "vis" &&
            observedPhases[observedPhases.length - 1] === "autoFight.mercenary"
          ) {
            observedPhases.push("autoFight.spy");
          } else if (
            handle === foreign &&
            method === "vis" &&
            observedPhases[observedPhases.length - 1] === "autoFight.spy"
          ) {
            observedPhases.push("autoFight.espionage");
          }
          controlCalls.push([handle.elementId, method, ...args]);
          if (handle === foreign && method === "vis") {
            return { ok: true, value: true };
          }
          if (handle === foreign && method === "gvis") {
            return { ok: true, value: args[0] === 0 };
          }
          return { ok: true, value: false };
        },
        capturedElementIds: () => ["foreign"],
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
          autoResearch: true,
          autoBuild: true,
          autoFight: true,
          autoTax: true,
          autoGovernment: true,
          foreignPolicyInferior: "Ignore",
          foreignPolicySuperior: "Ignore",
          foreignPolicyRival: "Ignore",
        }),
    },
    logError: (message) => {
      phaseFailures.push(message);
      const phase = message.slice(0, message.indexOf(" stopped: "));
      if (
        [
          "autoResearch",
          "autoBuild",
          "autoFight.spy",
          "autoFight.battle",
          "autoTax",
          "autoGovernment",
        ].includes(phase)
      ) {
        observedPhases.push(phase);
      }
    },
  });
  cycle({ periods: 1 });
  stopCycle();

  assert.deepEqual(observedPhases, [
    "autoResearch",
    "autoBuild",
    "autoFight.mercenary",
    "autoFight.spy",
    "autoFight.espionage",
    "autoFight.battle",
    "autoTax",
    "autoGovernment",
  ]);
  assert.deepEqual(controlCalls[0], ["foreign", "vis"]);
  assert.deepEqual(
    phaseFailures
      .filter(
        (message) =>
          message.includes(" stopped: ") &&
          !message.startsWith("buildingAlwaysClick stopped: "),
      )
      .map((message) => message.slice(0, message.indexOf(" stopped: "))),
    [
      "autoResearch",
      "autoBuild",
      "autoFight.mercenary",
      "autoFight.battle",
      "autoTax",
      "autoGovernment",
    ],
  );
}

function runCombatRuntime(autoFight) {
  const calls = [];
  const activities = [];
  const errors = [];
  const root = {
    race: {},
    tech: { mercs: 1 },
    civic: {
      garrison: {
        display: true,
        mercs: true,
        workers: 0,
        max: 1,
        crew: 0,
        m_use: 0,
      },
      foreign: {},
    },
    space: {},
    portal: {},
    eden: {},
    stats: { achieve: {} },
    resource: {
      Money: { amount: 100, max: 1_000, diff: 100, display: true },
    },
    settings: {},
  };
  const garrison = {
    elementId: "garrison",
    generation: 1,
    methods: ["vis", "hire", "hell", "s_max"],
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: ["vis", "gvis", "trigModal", "spy_disabled", "spy"],
  };
  let cycle;
  const stop = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: (id) =>
          id === "garrison" ? garrison : id === "foreign" ? foreign : undefined,
        invoke: (handle, method) => {
          calls.push(`${handle.elementId}.${method}`);
          if (handle === garrison && method === "vis") {
            return { ok: true, value: true };
          }
          if (handle === garrison && method === "hell") {
            return { ok: true, value: root.civic.garrison.workers };
          }
          if (handle === garrison && method === "s_max") {
            return { ok: true, value: root.civic.garrison.max };
          }
          if (handle === garrison && method === "hire") {
            root.resource.Money.amount -= 25;
            root.civic.garrison.workers += 1;
            root.civic.garrison.m_use += 1;
            return { ok: true, value: undefined };
          }
          if (handle === foreign && method === "vis") {
            return { ok: true, value: false };
          }
          return { ok: true, value: false };
        },
        capturedElementIds: () => ["garrison", "foreign"],
      },
      controlUsage: { readUsage: () => [] },
      keyState: { readPressed: () => false },
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
          autoFight,
          foreignTrainSpy: true,
          foreignSpyMax: 10,
          foreignHireMercDeadSoldiers: 0,
          foreignHireMercCostLowerThanIncome: 1,
          foreignHireMercMoneyStoragePercent: 0,
          storageAssignExtra: false,
        }),
    },
    onActivity: (activity) => activities.push(activity),
    logError: (message) => errors.push(message),
  });
  cycle({ periods: 1 });
  stop();
  return { calls, activities, errors, root };
}

{
  const disabled = runCombatRuntime(false);
  assert.equal(disabled.calls.includes("garrison.hire"), false);
  assert.deepEqual(disabled.activities, []);

  const enabled = runCombatRuntime(true);
  assert.equal(enabled.root.civic.garrison.workers, 1);
  assert.equal(
    enabled.calls.filter((call) => call === "garrison.hire").length,
    1,
  );
  assert.ok(
    enabled.calls.indexOf("garrison.hire") <
      enabled.calls.indexOf("foreign.vis"),
    `mercenary action did not precede the rest of autoFight: ${JSON.stringify(enabled.calls)}`,
  );
  assert.equal(enabled.activities.length, 1);
}

console.log("captured-runtime-control ok");
