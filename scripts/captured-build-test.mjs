import assert from "node:assert/strict";

import { createCapturedConstructionControl } from "../src/bootstrap/captured-construction-control.ts";

/**
 * A stand-in for the captured page: a game root, the game's own escalating prices behind
 * `buildQueue.setData`, and one `action()` per building that pays and increments exactly as the
 * game's does. Nothing here renders, so every call exercises the torn-down-panel path.
 */
function makePage({
  buildings,
  resources,
  queue = [],
  queueDisplay = false,
  buyAnyQueued = false,
  researchQueue,
  shadow,
  supplySplit = false,
  touch = false,
}) {
  const root = {
    settings: { expose: false, qAny: buyAnyQueued, touch },
    race: { species: "human", supplySplit },
    stats: { days: 100 },
    resource: {},
    city: {},
    tech: {
      ...(researchQueue === undefined ? {} : { r_queue: 1 }),
      ...(shadow === undefined ? {} : { shadow }),
    },
    queue: { display: queueDisplay, queue: [...queue] },
    ...(researchQueue === undefined
      ? {}
      : { r_queue: { display: true, pause: false, queue: researchQueue } }),
  };
  for (const [id, resource] of Object.entries(resources)) {
    root.resource[id] = { display: true, max: -1, diff: 0, ...resource };
  }
  const clicks = [];
  const controls = new Map();
  for (const [id, building] of Object.entries(buildings)) {
    root.city[id] = { count: building.count ?? 0 };
    controls.set(`city-${id}`, {
      generation: building.generation ?? 1,
      methods: {
        action() {
          clicks.push(`city-${id}`);
          if (building.noop === true) return;
          const price = building.priceAt(root.city[id].count);
          for (const [res, amount] of Object.entries(price)) {
            if (root.resource[res] === undefined) return;
            if (root.resource[res].amount < amount) return;
          }
          for (const [res, amount] of Object.entries(price)) {
            root.resource[res].amount -= amount;
          }
          root.city[id].count += 1;
        },
      },
    });
  }
  controls.set("buildQueue", {
    generation: 1,
    methods: {
      setData(index, prefix) {
        const entry = root.queue.queue[index];
        const building = buildings[entry.type];
        if (building === undefined) throw new TypeError("unknown action");
        const result = Object.fromEntries(
          Object.entries(building.priceAt(root.city[entry.type].count)).map(
            ([res, amount]) => [`${prefix}-${res}`, amount],
          ),
        );
        if (building.pool !== undefined)
          result[`${prefix}-pool`] = building.pool;
        return result;
      },
    },
  });

  const registry = {
    resolve(elementId) {
      const control = controls.get(elementId);
      return control === undefined
        ? undefined
        : {
            elementId,
            generation: control.generation,
            methods: Object.keys(control.methods),
          };
    },
    capturedElementIds: () => [...controls.keys()],
    invoke(handle, method, args = []) {
      const control = controls.get(handle.elementId);
      if (control === undefined)
        return { ok: false, reason: "unknown-control" };
      if (control.generation !== handle.generation) {
        return { ok: false, reason: "stale-control", detail: "superseded" };
      }
      const target = control.methods[method];
      if (target === undefined) return { ok: false, reason: "unknown-method" };
      try {
        return { ok: true, value: target(...args) };
      } catch (error) {
        return { ok: false, reason: "threw", detail: String(error) };
      }
    },
  };

  return {
    root,
    clicks,
    controls,
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    registry,
  };
}

function target(
  id,
  weighting,
  maximum = Number.MAX_SAFE_INTEGER,
  important = false,
) {
  return {
    key: `city-${id}`,
    elementId: `city-${id}`,
    region: "city",
    id,
    weighting,
    maximum,
    important,
  };
}

function policy(targets, overrides = {}) {
  return () => ({
    buildings: targets,
    respectReservations: true,
    consumptionMode: "onePerTick",
    buildIfStorageFull: false,
    ignoreZeroRate: false,
    saveWhiteholeGems: false,
    ...overrides,
  });
}

// --- white-hole Soul Gem saving stops the cycle after the purchase ------------------------------------------

{
  const page = makePage({
    buildings: {
      gem_structure: { count: 0, priceAt: () => ({ Soul_Gem: 1 }) },
      later: { count: 0, priceAt: () => ({ Money: 1 }) },
    },
    resources: { Soul_Gem: { amount: 2 }, Money: { amount: 2 } },
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("gem_structure", 50), target("later", 40)], {
      saveWhiteholeGems: true,
    }),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(
    page.clicks,
    ["city-gem_structure"],
    "a Soul Gem purchase ends the white-hole construction cycle",
  );
}

/**
 * A.R.P.A. is switched off for every case here, so each of these must stay unused: with
 * `autoARPA` false the cycle must never reach for a discovery pass, which is the most expensive
 * thing in it.
 */
function noProjects() {
  const unused = (name) => () => {
    throw new Error(`${name} used while A.R.P.A. automation is off`);
  };
  return {
    readSettings: () => ({}),
    mountSuppression: {
      available: true,
      withoutMounting: unused("withoutMounting"),
    },
    panels: { open: unused("open") },
    drawnProjects: {
      read: unused("read"),
      exists: unused("exists"),
    },
  };
}

function makeControl(dependencies) {
  return createCapturedConstructionControl({
    ...noProjects(),
    ...dependencies,
  });
}

/** A queue entry as the game stores it: an id the cost oracle resolves, plus its label. */
function queued(id, label = id) {
  const separator = id.indexOf("-");
  return {
    id,
    action: id.slice(0, separator),
    type: id.slice(separator + 1),
    label,
    q: 1,
  };
}

// --- a real purchase, with the panel never rendered -------------------------------------------------

{
  const page = makePage({
    buildings: {
      basic_housing: {
        count: 9,
        priceAt: (count) => ({ Money: 20 + count * 8, Lumber: 10 + count * 6 }),
      },
    },
    resources: { Money: { amount: 500 }, Lumber: { amount: 500 } },
  });
  const skipped = [];
  const activity = [];
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("basic_housing", 100)]),
    onSkipped: (key, reason) => skipped.push([key, reason]),
    onActivity: (message) => activity.push(message),
  });

  const outcome = control.runCycle();
  assert.equal(outcome.status, "succeeded");
  assert.deepEqual(page.clicks, ["city-basic_housing"]);
  assert.equal(
    page.root.city.basic_housing.count,
    10,
    "the game's own action ran",
  );
  assert.equal(
    page.root.resource.Money.amount,
    500 - 92,
    "the game's escalated price was paid",
  );
  assert.equal(page.root.resource.Lumber.amount, 500 - 64);
  assert.deepEqual(skipped, []);
  assert.deepEqual(activity, ["Built city-basic_housing (10)"]);
  assert.deepEqual(page.root.queue.queue, [], "the cost probe left no trace");
}

// The executor exposes the full decision-to-effect boundary when diagnostics are enabled.
{
  const page = makePage({
    buildings: {
      farm: { count: 0, priceAt: () => ({ Money: 10 }) },
    },
    resources: { Money: { amount: 500 } },
  });
  const messages = [];
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
    onDiagnostic: (message) => messages.push(message),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(messages, [
    "autoBuild.candidates 1",
    "autoBuild.affordable city-farm",
    "autoBuild.decision city-farm",
    "build.execute.attempt city-farm",
    "build.execute.touch false",
    "build.execute.before 0",
    "build.execute.queueBefore 0",
    "build.execute.invokeOk true",
    "build.execute.after 1",
    "build.execute.queueAfter 0",
    "build.execute.built true",
    "build.execute.queued false",
    "build.execute.noop false",
    "autoBuild.outcome succeeded",
  ]);
}

// A successful invocation that changes neither count nor queue is observable as a no-op.
{
  const page = makePage({
    touch: true,
    buildings: {
      farm: { count: 0, noop: true, priceAt: () => ({ Money: 10 }) },
    },
    resources: { Money: { amount: 500 } },
  });
  const messages = [];
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
    onDiagnostic: (message) => messages.push(message),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.ok(messages.includes("build.execute.touch true"));
  assert.ok(messages.includes("build.execute.invokeOk true"));
  assert.ok(messages.includes("build.execute.built false"));
  assert.ok(messages.includes("build.execute.queued false"));
  assert.ok(messages.includes("build.execute.noop true"));
}

// --- unaffordable is a decision, not an error ---------------------------------------------------------

{
  const page = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 1000 }) } },
    resources: { Money: { amount: 10 } },
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(page.root.city.farm.count, 0);
}

// The build source carries the action oracle's regional pool into shared affordability; the
// civilization-wide total must not make a Home action look affordable.
{
  const page = makePage({
    buildings: {
      regional_farm: {
        count: 0,
        pool: "spc_home",
        priceAt: () => ({ Money: 200 }),
      },
    },
    resources: {
      Money: {
        amount: 1000,
        max: 10000,
        reg: { spc_home: 50 },
        regMax: { spc_home: 100 },
      },
    },
    shadow: 5,
    supplySplit: true,
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("regional_farm", 50)]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
}

// --- a higher-weighted competitor protects its resource ------------------------------------------------

{
  const page = makePage({
    buildings: {
      wardenclyffe: { count: 0, priceAt: () => ({ Money: 1000 }) },
      farm: { count: 0, priceAt: () => ({ Money: 200 }) },
    },
    resources: { Money: { amount: 300, max: 1000, diff: 10 } },
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("wardenclyffe", 90), target("farm", 10)]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(
    page.clicks,
    [],
    "the cheap building waits for the expensive one",
  );
  assert.equal(page.root.resource.Money.amount, 300);

  // Just enough for the expensive one only: it is bought, and the cheap one still yields, now
  // measured against the holdings that purchase actually left.
  page.root.resource.Money.amount = 1500;
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["city-wardenclyffe"]);
  assert.equal(page.root.resource.Money.amount, 500);

  // Enough for both: the competitor is affordable, so it no longer reserves anything.
  page.root.resource.Money.amount = 3000;
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, [
    "city-wardenclyffe",
    "city-wardenclyffe",
    "city-farm",
  ]);
  assert.equal(page.root.city.wardenclyffe.count, 2);
  assert.equal(page.root.city.farm.count, 1);
  assert.equal(page.root.resource.Money.amount, 3000 - 1000 - 200);
}

// --- maximum, absent buildings, and queued targets -------------------------------------------------------

{
  const page = makePage({
    buildings: {
      farm: { count: 3, priceAt: () => ({ Money: 10 }) },
      mine: { count: 0, priceAt: () => ({ Money: 10 }) },
    },
    resources: { Money: { amount: 500 } },
    queue: [{ id: "city-mine" }],
    queueDisplay: true,
  });
  const skipped = [];
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([
      target("farm", 50, 3),
      target("mine", 40),
      target("not_a_building", 30),
    ]),
    onSkipped: (key, reason) => skipped.push([key, reason]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(
    page.clicks,
    [],
    "at maximum, queued by the player, or not in the game",
  );
  assert.deepEqual(skipped, [
    ["city-not_a_building", "not present in game state"],
  ]);
}

// A hidden queue does not block captured construction, and ordered queues only block their first
// entry. These are the same queue visibility and qAny gates used by the game's own queue loop.
{
  const hidden = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 10 }) } },
    resources: { Money: { amount: 500 } },
    queue: [{ id: "city-farm" }],
  });
  const hiddenControl = makeControl({
    rootState: hidden.rootState,
    controls: hidden.registry,
    readPolicy: policy([target("farm", 50)]),
  });
  assert.equal(hiddenControl.runCycle().status, "succeeded");
  assert.deepEqual(hidden.clicks, ["city-farm"]);

  const ordered = makePage({
    buildings: {
      first: { count: 0, priceAt: () => ({ Money: 10 }) },
      second: { count: 0, priceAt: () => ({ Money: 10 }) },
    },
    resources: { Money: { amount: 500 } },
    queue: [{ id: "city-first" }, { id: "city-second" }],
    queueDisplay: true,
  });
  const orderedControl = makeControl({
    rootState: ordered.rootState,
    controls: ordered.registry,
    readPolicy: policy([target("first", 50), target("second", 40)]),
  });
  assert.equal(orderedControl.runCycle().status, "succeeded");
  assert.deepEqual(ordered.clicks, ["city-second"]);
}

// --- a control the game never built is reported, never read as "locked" -------------------------------------

{
  const page = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 10 }) } },
    resources: { Money: { amount: 500 } },
  });
  page.controls.delete("city-farm");
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
  });
  const outcome = control.runCycle();
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.failure.code, "build-control-missing");
  assert.match(outcome.failure.message, /city-farm/);
}

// --- a superseded control fails as stale rather than running the old closure ---------------------------------

{
  const page = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 10 }) } },
    resources: { Money: { amount: 500 } },
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: {
      ...page.registry,
      resolve: (elementId) =>
        elementId === "city-farm"
          ? { elementId, generation: 99, methods: ["action"] }
          : page.registry.resolve(elementId),
    },
    readPolicy: policy([target("farm", 50)]),
  });
  const outcome = control.runCycle();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "stale-build-control");
  assert.deepEqual(page.clicks, []);
}

// --- before the game has state ---------------------------------------------------------------------------------

{
  const control = makeControl({
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
    readPolicy: policy([target("farm", 50)]),
  });
  const outcome = control.runCycle();
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.failure.code, "game-state-not-captured");
}

// --- a cost the game cannot price drops the candidate, it is not guessed at ---------------------------------------

{
  const page = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 10 }) } },
    resources: { Money: { amount: 500 } },
  });
  page.controls.delete("buildQueue");
  const skipped = [];
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
    onSkipped: (key, reason) => skipped.push([key, reason]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(
    skipped.some(([key]) => key === "city-farm"),
    true,
  );
}

// --- the research queue reserves too, and costs one catalog read per cycle ----------------------

{
  // Three managed buildings and two queued technologies. Every candidate asks the same conflict
  // question, so a catalog read per candidate would be six discovery passes for one cycle.
  const page = makePage({
    buildings: {
      farm: { count: 0, priceAt: () => ({ Money: 200 }) },
      mine: { count: 0, priceAt: () => ({ Money: 200 }) },
      warehouse: { count: 0, priceAt: () => ({ Money: 200 }) },
    },
    resources: { Money: { amount: 500, max: 1000 } },
    researchQueue: [
      { id: "tech-mining", label: "Mining", req: true, cna: false },
      { id: "tech-smelting", label: "Smelting", req: true, cna: false },
    ],
  });
  const reads = [];
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([
      target("farm", 50),
      target("mine", 40),
      target("warehouse", 30),
    ]),
    readOfferedTechs: () => {
      reads.push("read");
      return [
        { elementId: "tech-mining", cost: { Money: 400 }, generation: 1 },
        { elementId: "tech-smelting", cost: { Money: 900 }, generation: 1 },
      ];
    },
  });

  assert.equal(control.runCycle().status, "succeeded");
  // 400 reserved for the queue head out of 500 held leaves 100, and every building wants 200.
  assert.deepEqual(page.clicks, []);
  assert.equal(reads.length, 1, "one catalog read for the whole cycle");
  assert.equal(control.runCycle().status, "succeeded");
  assert.equal(
    reads.length,
    2,
    "and one for the next cycle, never a stale answer",
  );
}

{
  // The same page with nothing waiting in the research queue never asks for the catalog.
  const page = makePage({
    buildings: { farm: { count: 0, priceAt: () => ({ Money: 200 }) } },
    resources: { Money: { amount: 500, max: 1000 } },
    researchQueue: [],
  });
  const reads = [];
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
    readOfferedTechs: () => {
      reads.push("read");
      return [];
    },
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["city-farm"]);
  assert.deepEqual(reads, []);
}

// --- the player’s queue reserves what it is saving for ------------------------------------------

/** One managed farm at 200 Money, a visible queue, and whatever the caller wants reserved. */
function reservationPage(options = {}) {
  return makePage({
    buildings: {
      farm: { count: 0, priceAt: () => ({ Money: 200 }) },
      warehouse: { count: 0, priceAt: () => ({ Money: 400 }) },
      mine: { count: 0, priceAt: () => ({ Money: 450 }) },
    },
    resources: { Money: { amount: 500, max: 1000 } },
    queueDisplay: true,
    ...options,
  });
}

{
  // 400 reserved out of 500 held leaves 100, and the farm wants 200.
  const page = reservationPage({
    queue: [queued("city-warehouse", "Warehouse")],
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(page.root.resource.Money.amount, 500);
  // The probe entry is gone and the player’s own queue is untouched.
  assert.deepEqual(
    page.root.queue.queue.map((entry) => entry.id),
    ["city-warehouse"],
  );
}

{
  // The same page with reservations switched off is a purchase.
  const page = reservationPage({
    queue: [queued("city-warehouse", "Warehouse")],
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)], { respectReservations: false }),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["city-farm"]);
}

{
  // An important building spends through the reservation.
  const page = reservationPage({
    queue: [queued("city-warehouse", "Warehouse")],
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50, Number.MAX_SAFE_INTEGER, true)]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["city-farm"]);
}

{
  // A hidden queue is not being bought from, so it reserves nothing.
  const page = reservationPage({
    queue: [queued("city-warehouse", "Warehouse")],
    queueDisplay: false,
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["city-farm"]);
}

{
  // With qAny off the game works strictly down the queue, so only the head entry reserves. The
  // cheap head leaves room for the farm; the expensive second entry is not being saved for.
  const page = reservationPage({
    queue: [queued("city-farm", "Farm"), queued("city-mine", "Mine")],
  });
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("warehouse", 50)]),
  });
  // Buying the 400 warehouse out of 700 leaves 300, which still covers the 200 head reservation.
  page.root.resource.Money.amount = 700;
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["city-warehouse"]);
}

{
  // With qAny on the game buys whichever queued item it can, so every entry reserves.
  const page = reservationPage({
    queue: [queued("city-farm", "Farm"), queued("city-mine", "Mine")],
    buyAnyQueued: true,
  });
  page.root.resource.Money.amount = 700;
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("warehouse", 50)]),
  });
  // Same 700 and the same warehouse as the qAny-off case above; the only difference is that the
  // 450 mine is now being saved for too, and 300 left does not cover it.
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
}

{
  // A reservation nothing could ever store is one the game has written off; reserving it would
  // stall every build sharing the resource.
  const page = reservationPage({
    queue: [queued("city-warehouse", "Warehouse")],
  });
  page.root.resource.Money.max = 300;
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["city-farm"]);
}

{
  // A queued item the cost oracle cannot price is reported, and spending is skipped rather than
  // proceeding as though nothing were reserved.
  const page = reservationPage({
    queue: [queued("city-unknown_structure", "Mystery")],
  });
  const skipped = [];
  const control = makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("farm", 50)]),
    onSkipped: (key, reason) => skipped.push([key, reason]),
  });
  assert.equal(control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(
    skipped.some(([key]) => key === "city-unknown_structure"),
    true,
  );
}

// --- the queue-ignore gate is the strict storage test --------------------------------------------
// These manage the queued warehouse itself with reservations off, so the only thing deciding
// between the warehouse and the farm is whether the gate reads the queued entry as one the game
// is saving for. An ignored warehouse yields to the farm; a written-off one competes and wins.

/** The queued warehouse competing with the farm, with nothing else reserving against either. */
function ignoreGateControl(page) {
  return makeControl({
    rootState: page.rootState,
    controls: page.registry,
    readPolicy: policy([target("warehouse", 50), target("farm", 40)], {
      respectReservations: false,
    }),
  });
}

{
  // A zero capacity IS a ceiling here, matching upstream `cap >= 0`: the queued 400-Money
  // warehouse can never be stored, so it is not ignored, and current affordability also refuses
  // the purchase before the action closure is invoked.
  const page = reservationPage({
    queue: [queued("city-warehouse", "Warehouse")],
    resources: { Money: { amount: 500, max: 0 } },
  });
  assert.equal(ignoreGateControl(page).runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
}

{
  // A positive cost in a resource the game is not displaying is one the game refuses to save
  // for, so the queued warehouse competes instead of yielding.
  const page = reservationPage({
    queue: [queued("city-warehouse", "Warehouse")],
    resources: { Money: { amount: 500, max: 10000, display: false } },
  });
  assert.equal(ignoreGateControl(page).runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["city-warehouse"]);
}

console.log("captured-build ok");
