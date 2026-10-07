import assert from "node:assert/strict";
import vm from "node:vm";
import { OUTER_FLEET_REGIONS } from "../../../src/domain/combat/outer-fleet-regions.ts";
import { createCapturedSpaceRegionMechanics } from "../../../src/adapters/evolve/captured-space-region-mechanics.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_PANELS,
  MAIN_TAB_SETTING,
  SPACE_TABS_SETTING,
  SPACE_TAB_INDEX,
  SUB_TAB_CONTROLS,
} from "../../../src/adapters/evolve/captured-tab-discovery.ts";
// Synthetic answers deliberately carry no game rules. Each retained method closes over live state.
function spaceMechanicsBehaviorFixture() {
  const state = Object.fromEntries(
    OUTER_FLEET_REGIONS.map((region) => [
      region,
      {
        nav: true,
        syndicate: true,
      },
    ]),
  );
  const context = vm.createContext({ state, regions: OUTER_FLEET_REGIONS });
  const projects = vm.runInContext(
    `Object.fromEntries(regions.map(region => [region, {
    info: {
      zone: "inner",
      nav() { return state[region].nav; },
      syndicate() { return state[region].syndicate; },
    },
  }]))`,
    context,
  );
  return { state, projects, pageObject: vm.runInContext("Object", context) };
}

function spaceMechanicsTestHarness() {
  const native = spaceMechanicsBehaviorFixture();
  const page = { Object: native.pageObject };
  const calls = [];
  let draw = () => native.pageObject.keys(native.projects);
  let result = { outcome: { status: "succeeded" } };
  const dependencies = {
    pageWindow: page,
    discovery: {
      discover(path, scope) {
        calls.push({ path, scope });
        draw();
        return result;
      },
    },
  };
  return {
    native,
    page,
    calls,
    dependencies,
    adapter: createCapturedSpaceRegionMechanics(dependencies),
    setDraw(value) {
      draw = value;
    },
    setResult(value) {
      result = value;
    },
  };
}

function spaceMechanicsTestValue(adapter, region) {
  const answer = adapter.read(region);
  assert.equal(answer.kind, "value", `${region} has a native answer`);
  assert.equal(Object.isFrozen(answer.value), true);
  return answer.value;
}

// One forced protected Civilization / Inner System draw caches authority, not live answers.
{
  const harness = spaceMechanicsTestHarness();
  const descriptor = Object.getOwnPropertyDescriptor(
    harness.native.pageObject,
    "keys",
  );
  assert.deepEqual(spaceMechanicsTestValue(harness.adapter, "spc_moon"), {
    zone: "inner",
    reachable: true,
    syndicateEnabled: true,
  });
  assert.deepEqual(harness.calls, [
    {
      path: [
        {
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.civilization,
        },
        {
          setting: SPACE_TABS_SETTING,
          control: SUB_TAB_CONTROLS[SPACE_TABS_SETTING],
          index: SPACE_TAB_INDEX.space,
        },
      ],
      scope: {
        forceDraw: true,
        mount: [`#${MAIN_TAB_PANELS[MAIN_TAB_INDEX.civilization]}`],
      },
    },
  ]);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(harness.native.pageObject, "keys"),
    descriptor,
  );
  harness.setDraw(() => assert.fail("captured authority must never redraw"));
  for (const region of OUTER_FLEET_REGIONS) {
    const state = harness.native.state[region];
    state.nav = false;
    state.syndicate = false;
    assert.deepEqual(spaceMechanicsTestValue(harness.adapter, region), {
      zone: "inner",
      reachable: false,
      syndicateEnabled: false,
    });
    state.nav = true;
    state.syndicate = true;
    assert.deepEqual(spaceMechanicsTestValue(harness.adapter, region), {
      zone: "inner",
      reachable: true,
      syndicateEnabled: true,
    });
  }
  assert.equal(harness.calls.length, 1);
}

// Repeated identities and unrelated Object.keys calls are accepted; distinct candidates are not.
{
  const harness = spaceMechanicsTestHarness();
  harness.setDraw(() => {
    assert.deepEqual(
      Array.from(harness.native.pageObject.keys({ ordinary: 1 })),
      ["ordinary"],
    );
    harness.native.pageObject.keys(harness.native.projects);
    harness.native.pageObject.keys(harness.native.projects);
  });
  assert.equal(harness.adapter.read("spc_titan").kind, "value");
}
{
  const harness = spaceMechanicsTestHarness();
  const other = spaceMechanicsBehaviorFixture();
  harness.setDraw(() => {
    harness.native.pageObject.keys(harness.native.projects);
    harness.native.pageObject.keys(other.projects);
    harness.native.pageObject.keys(harness.native.projects);
  });
  assert.deepEqual(harness.adapter.read("spc_titan"), { kind: "absent" });
  harness.setDraw(() =>
    harness.native.pageObject.keys(harness.native.projects),
  );
  assert.equal(harness.adapter.read("spc_titan").kind, "value");
  assert.equal(harness.calls.length, 2);
}

// Missing, incomplete, unreadable and array-shaped metadata cannot become authority.
for (const badShape of [
  "missing",
  "entry",
  "info",
  "zone-missing",
  "zone-unknown",
  "zone-unreadable",
  "nav",
  "syndicate",
  "unreadable",
  "candidate-array",
  "entry-array",
  "info-array",
]) {
  const harness = spaceMechanicsTestHarness();
  let candidate = harness.native.projects;
  if (badShape === "missing") candidate = {};
  if (badShape === "entry") delete candidate.spc_eris;
  if (badShape === "info") candidate.spc_eris.info = null;
  if (badShape === "zone-missing") delete candidate.spc_eris.info.zone;
  if (badShape === "zone-unknown") candidate.spc_eris.info.zone = "beyond";
  if (badShape === "zone-unreadable")
    Object.defineProperty(candidate.spc_eris.info, "zone", {
      get() {
        throw new Error("zone");
      },
    });
  if (badShape === "nav") candidate.spc_eris.info.nav = undefined;
  if (badShape === "syndicate") candidate.spc_eris.info.syndicate = "function";
  if (badShape === "unreadable")
    Object.defineProperty(candidate.spc_eris.info, "nav", {
      get() {
        throw new Error("unreadable nav");
      },
    });
  if (badShape === "candidate-array") candidate = Object.assign([], candidate);
  if (badShape === "entry-array")
    candidate.spc_eris = Object.assign([], candidate.spc_eris);
  if (badShape === "info-array")
    candidate.spc_eris.info = Object.assign([], candidate.spc_eris.info);
  const descriptor = Object.getOwnPropertyDescriptor(
    harness.native.pageObject,
    "keys",
  );
  harness.setDraw(() => harness.native.pageObject.keys(candidate));
  assert.deepEqual(
    harness.adapter.read("spc_titan"),
    { kind: "absent" },
    badShape,
  );
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(harness.native.pageObject, "keys"),
    descriptor,
  );
}

// Failed discovery (including after candidate observation) never caches authority.
for (const failure of [
  "draw-before",
  "draw-after",
  "rejected",
  "restoration",
]) {
  const harness = spaceMechanicsTestHarness();
  const descriptor = Object.getOwnPropertyDescriptor(
    harness.native.pageObject,
    "keys",
  );
  harness.setDraw(() => {
    if (failure === "draw-before") throw new Error("discovery failed");
    harness.native.pageObject.keys(harness.native.projects);
    if (failure === "draw-after")
      throw new Error("discovery failed after observation");
  });
  if (failure === "rejected" || failure === "restoration") {
    harness.setResult({ outcome: { status: "rejected", reason: failure } });
  }
  assert.deepEqual(harness.adapter.read("spc_titan"), { kind: "absent" });
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(harness.native.pageObject, "keys"),
    descriptor,
  );
  harness.setResult({ outcome: { status: "succeeded" } });
  harness.setDraw(() =>
    harness.native.pageObject.keys(harness.native.projects),
  );
  assert.equal(harness.adapter.read("spc_titan").kind, "value");
  assert.equal(harness.calls.length, 2);
}

// The native receiver and truthiness are preserved, with no root arithmetic replacing methods.
{
  const harness = spaceMechanicsTestHarness();
  const info = harness.native.projects.spc_titan.info;
  info.nav = function (...args) {
    assert.equal(this, info);
    assert.deepEqual(args, []);
    return "native true";
  };
  info.syndicate = function (...args) {
    assert.equal(this, info);
    assert.deepEqual(args, []);
    return 0;
  };
  assert.deepEqual(spaceMechanicsTestValue(harness.adapter, "spc_titan"), {
    zone: "inner",
    reachable: true,
    syndicateEnabled: false,
  });
  info.nav = function () {
    return 0;
  };
  info.syndicate = function () {
    return [];
  };
  assert.deepEqual(spaceMechanicsTestValue(harness.adapter, "spc_titan"), {
    zone: "inner",
    reachable: false,
    syndicateEnabled: true,
  });
}

// Cached methods may become unreadable or throw; neither state is a native false answer.
for (const method of ["nav", "syndicate"]) {
  for (const failure of ["not-callable", "getter", "invocation"]) {
    const harness = spaceMechanicsTestHarness();
    const info = harness.native.projects.spc_titan.info;
    assert.equal(harness.adapter.read("spc_titan").kind, "value");
    const original = info[method];
    if (failure === "not-callable") info[method] = false;
    if (failure === "invocation")
      info[method] = () => {
        throw new Error("native failure");
      };
    if (failure === "getter")
      Object.defineProperty(info, method, {
        configurable: true,
        get() {
          throw new Error("native getter failed");
        },
      });
    assert.deepEqual(harness.adapter.read("spc_titan"), { kind: "invalid" });
    Object.defineProperty(info, method, {
      configurable: true,
      writable: true,
      value: original,
    });
    assert.equal(harness.adapter.read("spc_titan").kind, "value");
    assert.equal(harness.calls.length, 1);
  }
}

// Nested reads are unavailable within one adapter and across adapters sharing the page Object.
{
  const harness = spaceMechanicsTestHarness();
  const second = createCapturedSpaceRegionMechanics(harness.dependencies);
  harness.setDraw(() => {
    assert.deepEqual(harness.adapter.read("spc_titan"), { kind: "absent" });
    assert.deepEqual(second.read("spc_titan"), { kind: "absent" });
    harness.native.pageObject.keys(harness.native.projects);
  });
  assert.equal(harness.adapter.read("spc_titan").kind, "value");
  assert.equal(harness.calls.length, 1);
  harness.setDraw(() =>
    harness.native.pageObject.keys(harness.native.projects),
  );
  assert.equal(second.read("spc_titan").kind, "value");
  assert.equal(harness.calls.length, 2);
}

// Hook replacement and failed descriptor restoration make capture unavailable and uncached.
for (const failure of ["replacement", "restore-trap"]) {
  const harness = spaceMechanicsTestHarness();
  const owner = harness.native.pageObject;
  const descriptor = Object.getOwnPropertyDescriptor(owner, "keys");
  const replacement = () => [];
  if (failure === "replacement")
    harness.setDraw(() => {
      owner.keys(harness.native.projects);
      Object.defineProperty(owner, "keys", {
        ...descriptor,
        value: replacement,
      });
    });
  if (failure === "restore-trap") {
    let definitions = 0;
    harness.page.Object = new Proxy(owner, {
      defineProperty(target, key, value) {
        definitions += 1;
        if (definitions === 2) throw new Error("restoration denied");
        return Reflect.defineProperty(target, key, value);
      },
    });
  }
  assert.deepEqual(harness.adapter.read("spc_titan"), { kind: "absent" });
  if (failure === "replacement") assert.equal(owner.keys, replacement);
  Object.defineProperty(owner, "keys", descriptor);
  harness.page.Object = owner;
  harness.setDraw(() => owner.keys(harness.native.projects));
  assert.equal(harness.adapter.read("spc_titan").kind, "value");
  assert.equal(harness.calls.length, 2);
}

{
  const harness = spaceMechanicsTestHarness();
  assert.deepEqual(harness.adapter.read("not-a-configured-region"), {
    kind: "invalid",
  });
  assert.equal(harness.calls.length, 0);
}

console.log("Captured native Space region mechanics tests passed");

// The retained native metadata remains authoritative when its zone changes.
{
  const harness = spaceMechanicsTestHarness();
  assert.equal(
    spaceMechanicsTestValue(harness.adapter, "spc_red").zone,
    "inner",
  );
  harness.native.projects.spc_red.info.zone = "outer";
  assert.equal(
    spaceMechanicsTestValue(harness.adapter, "spc_red").zone,
    "outer",
  );
  harness.native.projects.spc_red.info.zone = "unsupported";
  assert.deepEqual(harness.adapter.read("spc_red"), { kind: "invalid" });
}
