import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  planBattle,
  prepareBattle,
} from "../../../src/domain/combat/battle.ts";
import {
  makeAutomation,
  makeRoot,
} from "../../support/fixtures/captured-battle-fixture.mjs";

const settings = {
  achievementGuards: false,
  foreignPacifist: false,
  foreignPowerRequired: 75,
  foreignPolicyInferior: "Sabotage",
  foreignPolicySuperior: "Ignore",
  foreignPolicyRival: "Ignore",
  foreignProtect: "never",
  foreignAttackHealthySoldiersPercent: 100,
  foreignAttackLivingSoldiersPercent: 100,
  foreignMinAdvantage: 0,
  foreignMaxAdvantage: 0,
  foreignMaxSiegeBattalion: 10,
  foreignUnification: false,
  foreignOccupyLast: false,
  autoHell: false,
};

function fixture({
  city = "garrison",
  hell,
  fort = "gFort",
  incompleteFort = false,
  bothCity = false,
  bothFort = false,
} = {}) {
  const root = makeRoot({
    autoHell: hell,
    policy: hell ? "Occupy" : "Sabotage",
  });
  if (hell) root.portal.fortress.patrols = 3;
  const configuredSettings = {
    ...settings,
    autoHell: Boolean(hell),
    foreignPolicyInferior: hell ? "Occupy" : "Sabotage",
  };
  const automation = makeAutomation(root, configuredSettings, {
    hell: Boolean(hell),
  });
  const { controls, handles, trace } = automation;
  const originalResolve = controls.resolve.bind(controls);
  const originalInvoke = controls.invoke.bind(controls);
  const cityHandle =
    city === "garrison"
      ? handles.garrison
      : { ...handles.garrison, elementId: "c_garrison" };
  const fortHandle =
    fort === "gFort"
      ? handles.fortress
      : { ...handles.fortress, elementId: "fort" };
  const alternateFort = incompleteFort
    ? { ...fortHandle, methods: ["patrolling", "patDec"] }
    : fortHandle;
  const state = {
    city: cityHandle,
    foreign: handles.foreign,
    fort: alternateFort,
    gFort: handles.fortress,
    onInvoke: () => {},
  };
  controls.resolve = (id) => {
    if (id === "garrison")
      return city === "garrison"
        ? state.city
        : { ...handles.garrison, methods: ["hell"] };
    if (id === "c_garrison")
      return city === "c_garrison"
        ? state.city
        : bothCity
          ? { ...handles.garrison, elementId: "c_garrison" }
          : undefined;
    if (id === "foreign") return state.foreign;
    if (id === "fort")
      return fort === "fort" || incompleteFort ? state.fort : undefined;
    if (id === "gFort")
      return hell && (fort === "gFort" || incompleteFort || bothFort)
        ? state.gFort
        : undefined;
    return originalResolve(id);
  };
  controls.invoke = (handle, method, args) => {
    state.onInvoke(handle, method);
    const underlying =
      handle.elementId === "c_garrison"
        ? handles.garrison
        : handle.elementId === "fort"
          ? handles.fortress
          : handle;
    const result = originalInvoke(underlying, method, args);
    trace.at(-1)[0] = handle.elementId;
    return result;
  };
  return { root, automation, state, trace, settings: configuredSettings };
}

function sample(f) {
  const cycle = f.automation.adapter.reader.readCycle();
  if (!cycle.available) return { cycle };
  const parameters = prepareBattle(cycle);
  const battlefield = f.automation.adapter.reader.readBattlefield(parameters);
  return { cycle, decision: planBattle(parameters, battlefield) };
}

for (const city of ["garrison", "c_garrison"]) {
  const f = fixture({ city, bothCity: city === "garrison" });
  const { cycle, decision } = sample(f);
  assert.equal(cycle.available, true);
  assert.deepEqual(
    f.trace
      .filter(([, method]) => ["hell", "s_max"].includes(method))
      .map(([id, method]) => [id, method]),
    [
      [city, "hell"],
      [city, "s_max"],
    ],
  );
  assert.ok(f.trace.some(([id, method]) => id === city && method === "rating"));
  assert.equal(
    f.automation.adapter.executor.execute(decision).status,
    "succeeded",
  );
  assert.ok(
    f.trace.some(([id, method]) => id === city && method === "campaign"),
  );
}

for (const failure of [
  () => ({ ok: true, value: "bad" }),
  () => ({ ok: false, reason: "threw" }),
  () => {
    throw new Error("native read failed");
  },
]) {
  const f = fixture();
  const invoke = f.automation.controls.invoke;
  f.automation.controls.invoke = (handle, method, args) =>
    method === "hell" ? failure() : invoke(handle, method, args);
  assert.equal(sample(f).cycle.available, false);
}

for (const change of ["generation", "root"]) {
  const f = fixture({ bothCity: true });
  f.state.onInvoke = (handle, method) => {
    if (handle.elementId !== "garrison" || method !== "hell") return;
    if (change === "generation")
      f.state.city = { ...f.state.city, generation: 2 };
    else f.automation.sourceRoot.current = makeRoot();
  };
  assert.equal(sample(f).cycle.available, false);
  assert.deepEqual(
    f.trace.filter(([, method]) => method === "s_max"),
    [],
  );
  assert.equal(
    f.trace.some(([id]) => id === "c_garrison"),
    false,
  );
}

{
  const f = fixture({ bothCity: true });
  f.state.onInvoke = (handle, method) => {
    if (handle.elementId === "garrison" && method === "s_max")
      f.state.city = { ...f.state.city, generation: 2 };
  };
  assert.equal(sample(f).cycle.available, false);
  assert.equal(
    f.trace.some(([id]) => id === "c_garrison"),
    false,
  );
}

for (const fort of ["fort", "gFort"]) {
  const f = fixture({ hell: true, fort });
  const { cycle, decision } = sample(f);
  assert.equal(cycle.available, true);
  assert.equal(
    f.automation.adapter.executor.execute(decision).status,
    "succeeded",
  );
  for (const method of ["patrolling", "patDec", "aLast"]) {
    assert.ok(
      f.trace.some(([id, called]) => id === fort && called === method),
      method,
    );
  }
}

{
  const f = fixture({ hell: true, fort: "fort", incompleteFort: true });
  const { cycle, decision } = sample(f);
  assert.equal(cycle.available, true);
  assert.equal(
    f.automation.adapter.executor.execute(decision).status,
    "succeeded",
  );
  assert.ok(
    f.trace.some(([id, method]) => id === "gFort" && method === "patrolling"),
  );
  assert.equal(
    f.trace.some(([id]) => id === "fort"),
    false,
  );
}

for (const failure of [
  "generation",
  "root",
  "malformed",
  "rejected",
  "throwing",
]) {
  const f = fixture({ hell: true, fort: "fort", incompleteFort: true });
  const invoke = f.automation.controls.invoke;
  f.automation.controls.invoke = (handle, method, args) => {
    if (handle.elementId !== "gFort" || method !== "patrolling")
      return invoke(handle, method, args);
    if (failure === "generation")
      f.state.gFort = { ...f.state.gFort, generation: 2 };
    if (failure === "root") f.automation.sourceRoot.current = makeRoot();
    if (failure === "throwing") throw new Error("native refusal");
    if (failure === "rejected") return { ok: false, reason: "threw" };
    if (failure === "malformed") return { ok: true, value: NaN };
    return invoke(handle, method, args);
  };
  assert.equal(sample(f).cycle.available, false);
  assert.equal(
    f.trace.some(([id]) => id === "fort"),
    false,
  );
}

{
  const f = fixture({ hell: true, fort: "fort", bothFort: true });
  f.state.onInvoke = (handle, method) => {
    if (handle.elementId === "fort" && method === "patrolling")
      f.state.fort = { ...f.state.fort, generation: 2 };
  };
  assert.equal(sample(f).cycle.available, false);
  assert.equal(
    f.trace.some(([id]) => id === "gFort"),
    false,
  );
}

for (const changed of ["city", "foreign", "fort"]) {
  const f = fixture({ hell: true, fort: "fort" });
  const { decision } = sample(f);
  f.trace.length = 0;
  f.state[changed] = { ...f.state[changed], generation: 2 };
  assert.equal(f.automation.adapter.executor.execute(decision).status, "stale");
  assert.deepEqual(f.trace, []);
  assert.equal(f.root.stats.attacks, 0);
}

{
  const f = fixture();
  const cycle = f.automation.adapter.reader.readCycle();
  f.settings.foreignMinAdvantage = 25;
  const battlefield = f.automation.adapter.reader.readBattlefield(
    prepareBattle(cycle),
  );
  assert.equal(battlefield.currentTarget, null);
  assert.deepEqual(battlefield.occupationTargets, []);
}

{
  const f = fixture();
  f.state.onInvoke = (_handle, method) => {
    if (method === "gvis") f.settings.foreignMinAdvantage = 25;
  };
  assert.equal(sample(f).decision, null);
  assert.equal(
    f.automation.adapter.executor.execute({ kind: "launch-battle" }).status,
    "stale",
  );
}

{
  const f = fixture();
  const cycle = f.automation.adapter.reader.readCycle();
  f.root.civic.garrison.wounded += 1;
  const battlefield = f.automation.adapter.reader.readBattlefield(
    prepareBattle(cycle),
  );
  assert.equal(battlefield.currentTarget, null);
}

for (const [change, mutate] of [
  (f) => {
    f.settings.foreignMinAdvantage = 25;
  },
  (f) => {
    f.root.civic.foreign.gov0.mil += 20;
  },
  (f) => {
    f.root.civic.garrison.cityGarrison -= 1;
  },
  (f) => {
    f.root.civic.garrison.wounded += 1;
  },
  (f) => {
    f.root.civic.foreign.gov0.hstl += 1;
  },
].entries()) {
  const f = fixture();
  const { decision } = sample(f);
  assert.ok(decision);
  f.trace.length = 0;
  mutate(f);
  assert.equal(
    f.automation.adapter.executor.execute(decision).status,
    "stale",
    `change ${change}`,
  );
  assert.equal(
    f.trace.some(([, method]) => method === "campaign"),
    false,
  );
}

{
  const f = fixture();
  const { decision } = sample(f);
  f.settings.foreignPowerRequired = undefined;
  assert.equal(
    f.automation.adapter.executor.execute(decision).status,
    "succeeded",
  );
}

{
  const f = fixture();
  f.root.civic.foreign.gov1 = { ...f.root.civic.foreign.gov0, mil: 100 };
  const { decision } = sample(f);
  assert.ok(decision);
  f.root.civic.foreign.gov1.mil += 1;
  f.trace.length = 0;
  assert.equal(f.automation.adapter.executor.execute(decision).status, "stale");
  assert.equal(
    f.trace.some(([, method]) => method === "campaign"),
    false,
  );
}

for (const failure of [
  "false",
  "malformed",
  "rejected",
  "throwing",
  "generation",
  "root",
]) {
  const f = fixture();
  const invoke = f.automation.controls.invoke;
  f.automation.controls.invoke = (handle, method, args) => {
    if (method !== "gvis") return invoke(handle, method, args);
    if (failure === "generation")
      f.state.foreign = { ...f.state.foreign, generation: 2 };
    if (failure === "root") f.automation.sourceRoot.current = makeRoot();
    if (failure === "throwing") throw new Error("native visibility failed");
    if (failure === "rejected") return { ok: false, reason: "threw" };
    if (failure === "malformed") return { ok: true, value: "visible" };
    if (failure === "false") return { ok: true, value: false };
    return invoke(handle, method, args);
  };
  const { decision } = sample(f);
  assert.equal(decision, null, failure);
  assert.equal(
    f.automation.adapter.executor.execute({ kind: "launch-battle" }).status,
    "stale",
  );
}

{
  const f = fixture();
  const { decision } = sample(f);
  const invoke = f.automation.controls.invoke;
  f.automation.controls.invoke = (handle, method, args) =>
    method === "gvis"
      ? { ok: true, value: false }
      : invoke(handle, method, args);
  f.trace.length = 0;
  assert.equal(f.automation.adapter.executor.execute(decision).status, "stale");
  assert.equal(
    f.trace.some(([, method]) => method === "campaign"),
    false,
  );
}

for (const change of ["generation", "root"]) {
  const f = fixture();
  const invoke = f.automation.controls.invoke;
  f.automation.controls.invoke = (handle, method, args) => {
    if (method === "rating") {
      if (change === "generation")
        f.state.city = { ...f.state.city, generation: 2 };
      else f.automation.sourceRoot.current = makeRoot();
    }
    return invoke(handle, method, args);
  };
  assert.equal(sample(f).decision, null);
  assert.equal(
    f.automation.adapter.executor.execute({ kind: "launch-battle" }).status,
    "stale",
  );
}

for (const failure of ["rejected", "throwing", "malformed"]) {
  for (const hell of [false, true]) {
    const f = fixture({ hell });
    const invoke = f.automation.controls.invoke;
    f.automation.controls.invoke = (handle, method, args) => {
      if (method !== "rating") return invoke(handle, method, args);
      if (failure === "throwing") throw new Error("native rating failed");
      if (failure === "malformed") return { ok: true, value: NaN };
      return { ok: false, reason: "threw" };
    };
    assert.equal(sample(f).decision, null);
    assert.equal(
      f.automation.adapter.executor.execute({ kind: "launch-battle" }).status,
      "stale",
    );
  }
}

for (const field of ["garrison", "patrols", "patrol_size"]) {
  const f = fixture({ hell: true });
  const { decision } = sample(f);
  assert.ok(decision);
  f.trace.length = 0;
  f.root.portal.fortress[field] += 1;
  assert.equal(f.automation.adapter.executor.execute(decision).status, "stale");
  assert.equal(
    f.trace.some(([, method]) =>
      ["patDec", "aLast", "campaign"].includes(method),
    ),
    false,
  );
}

{
  const f = fixture({ hell: true });
  const { decision } = sample(f);
  f.state.onInvoke = (_handle, method) => {
    if (method === "patrolling") f.settings.foreignMinAdvantage = 25;
  };
  f.trace.length = 0;
  assert.equal(f.automation.adapter.executor.execute(decision).status, "stale");
  assert.equal(
    f.trace.some(([, method]) =>
      ["patDec", "aLast", "campaign"].includes(method),
    ),
    false,
  );
}

for (const method of ["patDec", "next", "aNext"]) {
  const f = fixture({ hell: method === "patDec" });
  const { decision } = sample(f);
  assert.ok(decision);
  f.state.onInvoke = (_handle, called) => {
    if (called === method) f.root.civic.foreign.gov0.mil += 1;
  };
  f.trace.length = 0;
  assert.equal(f.automation.adapter.executor.execute(decision).status, "stale");
  assert.ok(
    f.trace.some(([, called]) => called === method),
    method,
  );
  assert.equal(
    f.trace.some(([, called]) => called === "campaign"),
    false,
  );
}

for (const method of ["aNext", "patDec"]) {
  const f = fixture({ hell: method === "patDec" });
  f.root.tech.military = 0;
  const invoke = f.automation.controls.invoke;
  f.automation.controls.invoke = (handle, called, args) => {
    const result = invoke(handle, called, args);
    return called === "rating" && result.ok
      ? { ...result, value: args[0] * (f.root.tech.military ? 5 : 10) }
      : result;
  };
  const { decision } = sample(f);
  assert.ok(decision);
  f.state.onInvoke = (_handle, called) => {
    if (called === method) f.root.tech.military = 1;
  };
  f.trace.length = 0;
  assert.equal(f.automation.adapter.executor.execute(decision).status, "stale");
  assert.ok(
    f.trace.some(([, called]) => called === method),
    method,
  );
  assert.ok(
    f.trace.some(([, called]) => called === "rating"),
    method,
  );
  assert.equal(
    f.trace.some(([, called]) => called === "campaign"),
    false,
  );
}

for (const method of ["patDec", "next", "aNext"]) {
  const f = fixture({ hell: method === "patDec" });
  const { decision } = sample(f);
  f.state.onInvoke = (handle, called) => {
    if (called !== method) return;
    if (handle.elementId === "gFort")
      f.state.gFort = { ...f.state.gFort, generation: 2 };
    else f.state.foreign = { ...f.state.foreign, generation: 2 };
  };
  f.trace.length = 0;
  assert.equal(f.automation.adapter.executor.execute(decision).status, "stale");
  assert.ok(f.trace.some(([, called]) => called === method));
  assert.equal(
    f.trace.some(([, called]) => called === "campaign"),
    false,
  );
}

{
  const f = fixture();
  f.root.civic.foreign.gov0.occ = true;
  const { decision } = sample(f);
  assert.equal(decision?.releaseControl, true);
  f.root.civic.foreign.gov0.mil += 1;
  f.trace.length = 0;
  assert.equal(f.automation.adapter.executor.execute(decision).status, "stale");
  assert.equal(
    f.trace.some(([, method]) => method === "campaign"),
    false,
  );
}

const battleSource = readFileSync(
  new URL("../../../src/adapters/evolve/combat/battle.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(battleSource, /["'](?:hell|s_max|patrolling)["']/);
assert.match(battleSource, /readCapturedCityGarrisonSnapshotFromControl\(/);
assert.match(battleSource, /readCapturedHellGarrisonFromControl\(/);
assert.doesNotMatch(battleSource, /readCapturedHellGarrison\(/);

console.log("Captured Battle control coherence checks passed");
