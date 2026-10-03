import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createCapturedHellAutomation } from "../src/adapters/evolve/combat/captured-hell.ts";

function makeRoot({ enemies = 1, minions = 1500, warlord = true } = {}) {
  return {
    race: { warlord },
    portal: {
      minions: { spawns: minions },
      throne: { enemy: Array.from({ length: enemies }, () => ({ f: 100 })) },
    },
  };
}

function makeControls(
  invoked,
  available = true,
  methods = ["attack"],
  { fortressId = "fort", cityCurrent = 60, cityMaximum = 60 } = {},
) {
  return {
    resolve: (elementId) =>
      available && elementId === fortressId
        ? { elementId, generation: 1, methods: [...methods, "patrolling"] }
        : elementId === "garrison"
          ? {
              elementId,
              generation: 1,
              methods: ["hell", "s_max", "rating"],
            }
          : undefined,
    invoke: (handle, method, args) => {
      invoked.push({ elementId: handle.elementId, method, args });
      if (method === "hell") return { ok: true, value: cityCurrent };
      if (method === "s_max") return { ok: true, value: cityMaximum };
      if (method === "rating") return { ok: true, value: args[0] * 2.5 };
      if (method === "patrolling") {
        return { ok: true, value: args[0] };
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds: () =>
      available ? [fortressId, "garrison"] : ["garrison"],
  };
}

function makeEvacuationRoot({
  assigned = 40,
  patrols = 2,
  patrolSize = 5,
} = {}) {
  return {
    race: { warlord: false },
    tech: { elysium: 0 },
    civic: { garrison: { workers: 100, max: 100, crew: 0 } },
    portal: {
      fortress: {
        garrison: 40,
        patrols,
        patrol_size: patrolSize,
        assigned,
      },
    },
    space: { fob: { troops: 0 } },
  };
}

// A configured Warlord attacks the first captured enemy fortress.
{
  const root = makeRoot();
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    readSettings: () => ({
      warlordHandleFortress: true,
      warlordMinimumMinions: 1000,
    }),
  });
  assert.deepEqual(automation.run(), { status: "succeeded" });
  assert.deepEqual(invoked, [
    { elementId: "fort", method: "attack", args: [0] },
  ]);
}

// The minion threshold and the captured setting remain pure policy gates.
{
  const root = makeRoot({ minions: 1000 });
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    readSettings: () => ({
      warlordHandleFortress: true,
      warlordMinimumMinions: 1000,
    }),
  });
  assert.deepEqual(automation.run(), { status: "succeeded" });
  assert.deepEqual(invoked, []);
}

// The command becomes stale when the live fortress control is not captured.
{
  const root = makeRoot();
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([], false),
    readSettings: () => ({
      warlordHandleFortress: true,
      warlordMinimumMinions: 1000,
    }),
  });
  const outcome = automation.run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "hell-controls-unavailable");
}

// Incomplete non-Warlord Hell state does not authorize fortress mutations.
{
  const root = makeRoot({ warlord: false });
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    readSettings: () => ({ warlordHandleFortress: true }),
  });
  assert.deepEqual(automation.run(), { status: "succeeded" });
  assert.deepEqual(
    invoked.filter(({ elementId }) => elementId === "fort"),
    [],
  );
}

// When the captured counts show that Hell cannot be entered, evacuation uses only the upstream
// fortress controls; soldier-rating calculation remains unnecessary below this gate.
{
  const root = makeEvacuationRoot();
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked, true, ["patSizeDec", "patDec", "aLast"]),
    readSettings: () => ({
      hellHomeGarrison: 10,
      hellMinSoldiers: 100,
      hellMinSoldiersPercent: 90,
      hellHandlePatrolSize: true,
    }),
  });
  assert.deepEqual(automation.run(), { status: "succeeded" });
  assert.deepEqual(
    Object.fromEntries(
      ["patSizeDec", "patDec", "aLast"].map((method) => [
        method,
        invoked.filter((entry) => entry.method === method).length,
      ]),
    ),
    { patSizeDec: 5, patDec: 2, aLast: 40 },
  );
}

// Once the gate allows entry, a captured garrison rating supplies both soldier targets and the
// fortress controls receive the resulting management commands.
{
  const root = {
    ...makeEvacuationRoot({ assigned: 0, patrols: 0, patrolSize: 1 }),
    civic: {
      garrison: { workers: 1000, max: 1000, crew: 0 },
      govern: { type: "" },
    },
    portal: {
      fortress: {
        garrison: 0,
        patrols: 0,
        patrol_size: 1,
        assigned: 0,
        walls: 50,
        threat: 1000,
      },
      turret: { on: 0 },
      war_drone: { on: 0 },
      war_droid: { on: 0 },
    },
    city: { boot_camp: { count: 0 } },
    tech: { elysium: 0, turret: 0, portal: 0 },
  };
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked, true, [
      "aNext",
      "patSizeInc",
      "patInc",
      "rating",
    ]),
    readSettings: () => ({
      hellHomeGarrison: 10,
      hellMinSoldiers: 20,
      hellMinSoldiersPercent: 90,
      hellLowWallsMulti: 3,
      hellTargetFortressDamage: 100,
      hellPatrolMinRating: 30,
      hellPatrolThreatPercent: 8,
    }),
  });
  assert.deepEqual(automation.run(), { status: "succeeded" });
  assert.ok(invoked.some(({ method }) => method === "rating"));
  assert.ok(
    invoked
      .filter(({ method }) => method === "rating")
      .every(({ args }) => args[1] === false),
  );
  assert.equal(invoked.filter(({ method }) => method === "aNext").length, 990);
  assert.equal(
    invoked.filter(({ method }) => method === "patSizeInc").length,
    31,
  );
  assert.equal(invoked.filter(({ method }) => method === "patInc").length, 24);
}

// Enabled authority management uses the captured resource bag and rejects malformed authority
// state rather than silently treating it as zero.
{
  const root = {
    ...makeEvacuationRoot({ assigned: 0, patrols: 0, patrolSize: 1 }),
    civic: {
      garrison: { workers: 1000, max: 1000, crew: 0 },
      govern: { type: "" },
    },
    portal: {
      fortress: {
        garrison: 0,
        patrols: 0,
        patrol_size: 1,
        assigned: 0,
        walls: 50,
        threat: 1000,
      },
    },
    city: { boot_camp: { count: 0 } },
    tech: { elysium: 0, turret: 0, portal: 0 },
    resource: { Authority: { amount: "invalid", max: 1000, display: true } },
  };
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([], true, ["rating"]),
    readSettings: () => ({
      authorityManage: true,
      generalMinimumAuthority: 100,
    }),
  });
  const outcome = automation.run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "hell-calculation-unavailable");
}

// Both rendered ordinary bindings execute every adjustment kind. Native city values deliberately
// disagree with workers, crew, fortress, FOB, and Eden pillbox-shaped root data.
for (const fortressId of ["fort", "gFort"]) {
  const root = makeEvacuationRoot();
  root.eden = { pillbox: { staffed: 37 } };
  root.space.fob.troops = 19;
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked, true, ["patSizeDec", "patDec", "aLast"], {
      fortressId,
      cityCurrent: -3,
      cityMaximum: 0,
    }),
    readSettings: () => ({ hellMinSoldiers: 100 }),
  });
  assert.equal(automation.run().status, "succeeded");
  assert.deepEqual(
    [
      ...new Set(
        invoked
          .filter(({ elementId }) => elementId === fortressId)
          .filter(({ method }) => method !== "patrolling")
          .map(({ method }) => method),
      ),
    ],
    ["patSizeDec", "patDec", "aLast"],
  );
}

function runNativeFillScenario(cityCurrent, cityMaximum, fortressId = "gFort") {
  const root = {
    ...makeEvacuationRoot({ assigned: 0, patrols: 0, patrolSize: 1 }),
    civic: { garrison: { workers: 1000, max: 1000, crew: 0 } },
    portal: {
      fortress: {
        garrison: 0,
        patrols: 0,
        patrol_size: 1,
        assigned: 0,
        walls: 50,
        threat: 1000,
      },
    },
    eden: { pillbox: { staffed: 300 } },
    space: { fob: { troops: 200 } },
  };
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked, true, ["aNext", "patSizeInc", "patInc"], {
      fortressId,
      cityCurrent,
      cityMaximum,
    }),
    readSettings: () => ({ hellHomeGarrison: 10, hellMinSoldiers: 20 }),
  });
  const outcome = automation.run();
  return { outcome, invoked };
}
{
  const full = runNativeFillScenario(100, 100);
  const depleted = runNativeFillScenario(0, 100);
  assert.equal(full.outcome.status, "succeeded");
  assert.equal(depleted.outcome.status, "succeeded");
  const count = (run, method) =>
    run.invoked.filter(({ method: called }) => called === method).length;
  for (const method of ["aNext", "patSizeInc", "patInc"]) {
    assert.ok(count(full, method) > 0);
    assert.ok(
      full.invoked
        .filter(({ method: called }) => called === method)
        .every(({ elementId }) => elementId === "gFort"),
    );
  }
  assert.ok(count(depleted, "patSizeInc") > count(full, "patSizeInc"));
  assert.ok(count(depleted, "patInc") < count(full, "patInc"));

  // The same native current count has a different fill ratio when the native maximum includes
  // reservations that the root's workforce fields cannot reveal.
  const ordinaryMaximum = runNativeFillScenario(60, 100);
  const reservedMaximum = runNativeFillScenario(60, 200);
  assert.equal(ordinaryMaximum.outcome.status, "succeeded");
  assert.equal(reservedMaximum.outcome.status, "succeeded");
  assert.ok(
    count(reservedMaximum, "patSizeInc") > count(ordinaryMaximum, "patSizeInc"),
  );
}
{
  const run = runNativeFillScenario(100, 100, "fort");
  assert.equal(run.outcome.status, "succeeded");
  for (const method of ["aNext", "patSizeInc", "patInc"]) {
    assert.ok(
      run.invoked.some(
        (entry) => entry.elementId === "fort" && entry.method === method,
      ),
    );
  }
}

// Missing native city authority or a changed native revalidation answer cannot mutate Hell.
{
  const root = makeEvacuationRoot();
  const invoked = [];
  const base = makeControls(invoked, true, ["patSizeDec", "patDec", "aLast"]);
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: {
      ...base,
      resolve: (id) => (id === "garrison" ? undefined : base.resolve(id)),
    },
    readSettings: () => ({ hellMinSoldiers: 100 }),
  });
  const outcome = automation.run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "hell-city-garrison-unavailable");
  assert.deepEqual(invoked, []);
}
{
  const root = {
    ...makeEvacuationRoot(),
    civic: { garrison: { workers: 1000, max: 1000, crew: 0 } },
  };
  const invoked = [];
  const base = makeControls(invoked, true, ["aNext", "patSizeInc", "patInc"]);
  let snapshot = 0;
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: {
      ...base,
      invoke: (handle, method, args) => {
        if (method === "hell") return { ok: true, value: 60 };
        if (method === "s_max")
          return { ok: true, value: ++snapshot === 1 ? 100 : 200 };
        return base.invoke(handle, method, args);
      },
    },
    readSettings: () => ({}),
  });
  const outcome = automation.run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "hell-plan-no-longer-valid");
  assert.deepEqual(
    invoked.filter(
      ({ elementId, method }) =>
        elementId === "fort" && method !== "patrolling",
    ),
    [],
  );
}

// A changed fortress generation stops execution on the selected binding; a second binding cannot
// rescue the rest of a partly executed plan.
{
  const root = makeEvacuationRoot();
  const invoked = [];
  const base = makeControls(invoked, true, ["patSizeDec", "patDec", "aLast"]);
  let generation = 1;
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: {
      ...base,
      resolve: (id) =>
        id === "fort"
          ? {
              elementId: id,
              generation,
              methods: ["patrolling", "patSizeDec", "patDec", "aLast"],
            }
          : id === "gFort"
            ? {
                elementId: id,
                generation: 1,
                methods: ["patrolling", "patSizeDec", "patDec", "aLast"],
              }
            : base.resolve(id),
      invoke: (handle, method, args) => {
        if (handle.elementId === "fort" && method !== "patrolling")
          generation++;
        return base.invoke(handle, method, args);
      },
    },
    readSettings: () => ({ hellMinSoldiers: 100 }),
  });
  assert.equal(automation.run().status, "stale");
  assert.deepEqual(
    invoked.filter(({ elementId }) => elementId === "gFort"),
    [],
  );
  assert.equal(
    invoked.filter(
      ({ elementId, method }) =>
        elementId === "fort" && method !== "patrolling",
    ).length,
    1,
  );
}
{
  const root = makeEvacuationRoot();
  const invoked = [];
  const base = makeControls(invoked, true, ["patSizeDec", "patDec", "aLast"]);
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: {
      ...base,
      resolve: (id) => (id === "fort" ? undefined : base.resolve(id)),
    },
    readSettings: () => ({ hellMinSoldiers: 100 }),
  });
  assert.equal(automation.run().status, "stale");
  assert.deepEqual(
    invoked.filter(({ elementId }) => elementId === "fort"),
    [],
  );
}
{
  const root = makeRoot();
  const invoked = [];
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked, true, ["attack"], { fortressId: "gFort" }),
    readSettings: () => ({
      warlordHandleFortress: true,
      warlordMinimumMinions: 1000,
    }),
  });
  assert.equal(automation.run().status, "stale");
  assert.deepEqual(invoked, []);
}

const hellSource = readFileSync(
  new URL("../src/adapters/evolve/combat/captured-hell.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  hellSource,
  /currentCityGarrison:\s*workers|maximumCityGarrison:\s*maximumWorkers/,
);
assert.doesNotMatch(
  hellSource,
  /fobTroops|pillbox.*currentCityGarrison|pillbox.*maximumCityGarrison/,
);

function runNativeOracleScenario({
  fortressId = "fort",
  stationed = 15,
  rating = (n) => n * n,
  authority = false,
  patrolTarget = 30,
  onRead = () => {},
} = {}) {
  const root = makeEvacuationRoot({ assigned: 20, patrols: 1, patrolSize: 5 });
  root.portal.fortress.garrison = 20;
  root.portal.fortress.walls = 100;
  root.portal.fortress.threat = 0;
  root.resource = { Authority: { amount: 0, max: 100, display: true } };
  const calls = [];
  let currentRoot = root;
  let fortressGeneration = 1;
  let cityGeneration = 1;
  let stationedReads = 0;
  const controls = {
    resolve: (id) =>
      id === fortressId
        ? {
            elementId: id,
            generation: fortressGeneration,
            methods: [
              "patrolling",
              "aNext",
              "aLast",
              "patInc",
              "patDec",
              "patSizeInc",
              "patSizeDec",
            ],
          }
        : id === "garrison"
          ? {
              elementId: id,
              generation: cityGeneration,
              methods: ["hell", "s_max", "rating"],
            }
          : undefined,
    invoke: (handle, method, args = []) => {
      calls.push([handle.elementId, method, ...args]);
      if (method === "hell" || method === "s_max")
        return { ok: true, value: 100 };
      if (method === "rating") return { ok: true, value: rating(args[0]) };
      if (method === "patrolling") {
        stationedReads += 1;
        onRead({
          replaceRoot: () => {
            currentRoot = {};
          },
          replaceFortress: () => {
            fortressGeneration += 1;
          },
          replaceCity: () => {
            cityGeneration += 1;
          },
          read: stationedReads,
        });
        const value =
          typeof stationed === "function"
            ? stationed(stationedReads)
            : stationed;
        if (value instanceof Error) throw value;
        return value && typeof value === "object" && "ok" in value
          ? value
          : { ok: true, value };
      }
      return { ok: true, value: undefined };
    },
  };
  const automation = createCapturedHellAutomation({
    rootState: { readRoot: () => currentRoot },
    controls,
    readSettings: () => ({
      hellHomeGarrison: 10,
      hellMinSoldiers: 20,
      hellPatrolMinRating: patrolTarget,
      hellBolsterPatrolRating: 0,
      authorityManage: authority,
      generalMinimumAuthority: 20,
    }),
  });
  return { outcome: automation.run(), calls, stationedReads };
}

const mutationCount = (result, method) =>
  result.calls.filter(([, called]) => called === method).length;
for (const fortressId of ["fort", "gFort"]) {
  // Forge- and guard-post-shaped native deductions alter stationed defenders even though the
  // visible fortress fields are identical. Authority responds to the native answer.
  const ordinary = runNativeOracleScenario({ fortressId, authority: true });
  const forge = runNativeOracleScenario({
    fortressId,
    authority: true,
    stationed: 5,
  });
  const guardPost = runNativeOracleScenario({
    fortressId,
    authority: true,
    stationed: 9,
  });
  for (const result of [ordinary, forge, guardPost]) {
    assert.equal(result.outcome.status, "succeeded");
    assert.equal(result.stationedReads, 2);
    assert.ok(
      result.calls
        .filter(([, method]) => method === "patrolling")
        .every(([id, , value]) => id === fortressId && value === 20),
    );
  }
  assert.notEqual(
    mutationCount(ordinary, "patInc"),
    mutationCount(forge, "patInc"),
  );
  assert.notEqual(
    mutationCount(forge, "patInc"),
    mutationCount(guardPost, "patInc"),
  );
}

const nonlinear = runNativeOracleScenario();
assert.equal(nonlinear.outcome.status, "succeeded");
assert.equal(mutationCount(nonlinear, "patSizeInc"), 1); // native rating(6) = 36, so size 5 → 6
assert.ok(
  nonlinear.calls
    .filter(([, method]) => method === "rating")
    .every(([, , , scale]) => scale === false),
);
const changedCurve = runNativeOracleScenario({ rating: (n) => n * 10 });
assert.equal(changedCurve.outcome.status, "succeeded");
assert.equal(mutationCount(changedCurve, "patSizeDec"), 2); // native rating(3) = 30
const unreachable = runNativeOracleScenario({ patrolTarget: 20000 });
assert.equal(unreachable.outcome.status, "succeeded");
assert.equal(mutationCount(unreachable, "patSizeInc"), 85); // capacity 90 → 91, policy budgets 90
for (const stationed of [
  { ok: true, value: undefined },
  "invalid",
  NaN,
  { ok: false, reason: "threw" },
  new Error("native"),
]) {
  const result = runNativeOracleScenario({ stationed });
  assert.equal(result.outcome.status, "stale");
  assert.equal(mutationCount(result, "patInc"), 0);
  assert.equal(mutationCount(result, "aNext"), 0);
}
for (const options of [
  { stationed: (read) => (read === 1 ? 15 : 5) },
  {
    stationed: 15,
    onRead: ({ replaceRoot, read }) => {
      if (read === 1) replaceRoot();
    },
  },
  {
    stationed: 15,
    onRead: ({ replaceFortress, read }) => {
      if (read === 1) replaceFortress();
    },
  },
  {
    stationed: 15,
    onRead: ({ replaceCity, read }) => {
      if (read === 1) replaceCity();
    },
  },
]) {
  const result = runNativeOracleScenario(options);
  assert.equal(result.outcome.status, "stale");
  assert.equal(mutationCount(result, "patInc"), 0);
  assert.equal(mutationCount(result, "aNext"), 0);
}
for (const rating of [
  () => undefined,
  () => {
    throw Error("native rating");
  },
  () => ({ ok: false, reason: "threw" }),
]) {
  const result = runNativeOracleScenario({ rating });
  assert.equal(result.outcome.status, "stale");
  assert.equal(mutationCount(result, "aNext"), 0);
}

console.log("Captured Hell adapter tests passed");
