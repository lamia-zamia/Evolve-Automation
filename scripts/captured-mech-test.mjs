import assert from "node:assert/strict";

import { runCapturedMech } from "../src/application/captured-mech.ts";
import { createCapturedMech } from "../src/adapters/evolve/combat/captured-mech.ts";
import { planCapturedMechBuild } from "../src/domain/combat/captured-mech.ts";

const root = {
  settings: { qKey: false, keyMap: { q: "q" } },
  portal: {
    mechbay: {
      max: 10,
      bay: 0,
      active: 0,
      scouts: 0,
      mechs: [],
      blueprint: {
        size: "small",
        chassis: "tread",
        hardpoint: ["laser"],
        equip: [],
        infernal: false,
      },
    },
    purifier: { supply: 75_000, sup_max: 100_000 },
  },
  resource: { Soul_Gem: { amount: 1 }, Supply: { rateOfChange: 250 } },
};
const settings = { autoMech: true, mechBuild: "user" };
const trace = [];
let queueKeyPressed = false;
const assembly = {
  elementId: "mechAssembly",
  generation: 1,
  methods: ["build", "bay", "price", "soul"],
};
const controls = {
  resolve: (id) => (id === "mechAssembly" ? assembly : undefined),
  invoke: (handle, method) => {
    assert.equal(handle, assembly);
    if (method === "bay") return { ok: true, value: 1 };
    if (method === "price") return { ok: true, value: 75_000 };
    if (method === "soul") return { ok: true, value: 1 };
    if (method === "build") {
      trace.push(method);
      const blueprint = root.portal.mechbay.blueprint;
      root.portal.mechbay.mechs.push({
        size: blueprint.size,
        chassis: blueprint.chassis,
        hardpoint: [...blueprint.hardpoint],
        equip: [...blueprint.equip],
        infernal: blueprint.infernal,
      });
      root.portal.mechbay.bay += 1;
      root.portal.mechbay.active += 1;
      root.portal.purifier.supply -= 75_000;
      root.resource.Soul_Gem.amount -= 1;
      return { ok: true, value: undefined };
    }
    return { ok: false, reason: "unknown-method" };
  },
  capturedElementIds: () => ["mechAssembly"],
};

const adapter = createCapturedMech({
  rootState: {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls,
  readSettings: () => settings,
  keyState: {
    readPressed: (key) => {
      assert.equal(key, "q");
      return queueKeyPressed;
    },
  },
});

assert.equal(adapter.reader.read().available, true);
assert.deepEqual(planCapturedMechBuild(adapter.reader.read()), {
  kind: "build-captured-mech",
  designSize: "small",
  expectedBaySpace: 10,
  expectedPurifierSupply: 75_000,
  expectedSoulGems: 1,
});
assert.equal(runCapturedMech(adapter).status, "succeeded");
assert.deepEqual(trace, ["build"]);
assert.equal(root.portal.mechbay.bay, 1);
assert.equal(root.portal.mechbay.mechs.length, 1);
assert.deepEqual(root.portal.mechbay.mechs[0], {
  size: "small",
  chassis: "tread",
  hardpoint: ["laser"],
  equip: [],
  infernal: false,
});
assert.equal(root.portal.purifier.supply, 0);
assert.equal(root.resource.Soul_Gem.amount, 0);

root.settings.qKey = true;
root.portal.mechbay.bay = 0;
root.portal.purifier.supply = 75_000;
root.resource.Soul_Gem.amount = 1;
assert.equal(adapter.reader.read().available, true);
assert.equal(
  planCapturedMechBuild(adapter.reader.read()).kind,
  "build-captured-mech",
);
queueKeyPressed = true;
assert.equal(adapter.reader.read().available, true);
assert.equal(planCapturedMechBuild(adapter.reader.read()), null);
queueKeyPressed = false;
root.settings.qKey = false;
settings.mechBuild = "random";
assert.equal(adapter.reader.read().available, false);
settings.mechBuild = "user";
root.portal.mechbay.blueprint.infernal = true;
assert.equal(adapter.reader.read().available, true);
assert.equal(planCapturedMechBuild(adapter.reader.read()), null);

assert.equal(
  planCapturedMechBuild({
    available: true,
    enabled: true,
    buildMode: "user",
    queueKeyHeld: false,
    governorTask: false,
    infernal: false,
    designSize: "small",
    designSpace: 1,
    designSupply: 1,
    designSoul: 1,
    baySpace: 1,
    purifierSupply: 0,
    soulGems: 1,
  }),
  null,
);

// A governor task stands down even the explicit blueprint path.
assert.equal(
  planCapturedMechBuild({
    available: true,
    enabled: true,
    buildMode: "user",
    queueKeyHeld: false,
    governorTask: true,
    infernal: false,
    designSize: "small",
    designSpace: 1,
    designSupply: 10,
    designSoul: 1,
    baySpace: 10,
    purifierSupply: 100,
    soulGems: 10,
  }),
  null,
);

// Shared state model: inventory, bay, blueprint, funds, and typed settings.
{
  root.portal.mechbay.mechs = [];
  root.portal.mechbay.bay = 0;
  root.portal.mechbay.active = 0;
  root.portal.mechbay.blueprint.infernal = false;
  const state = adapter.reader.readState();
  assert.equal(state.available, true);
  assert.equal(state.queueKeyHeld, false);
  assert.equal(state.warlord, false);
  assert.deepEqual(state.bay, {
    maximum: 10,
    occupied: 0,
    active: 0,
    scouts: 0,
  });
  assert.equal(state.inventory.length, 0);
  assert.deepEqual(state.blueprint, {
    size: "small",
    chassis: "tread",
    hardpoint: ["laser"],
    equip: [],
    infernal: false,
  });
  assert.deepEqual(state.funds, {
    purifierSupply: 75_000,
    purifierMax: 100_000,
    soulGems: 1,
    supplyRate: 250,
    gemsRate: 0,
    purifierFullyOn: false,
  });
  assert.equal(state.settings.buildMode, "user");
  assert.equal(state.settings.scrapMode, "mixed");
  assert.equal(state.settings.scrapEfficiency, 1.5);
}

// Malformed bay stands down instead of guessing.
{
  const badRoot = structuredClone(root);
  badRoot.portal.mechbay.max = "ten";
  const badAdapter = createCapturedMech({
    rootState: {
      readRoot: () => badRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => settings,
    keyState: { readPressed: () => false },
  });
  assert.equal(badAdapter.reader.readState().available, false);
  assert.equal(badAdapter.reader.read().available, false);
}

// Unknown build mode fails closed to "none"; negative numbers fall back.
{
  const oddAdapter = createCapturedMech({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => ({
      autoMech: true,
      mechBuild: "warp",
      mechScrapEfficiency: -2,
    }),
    keyState: { readPressed: () => false },
  });
  const state = oddAdapter.reader.readState();
  assert.equal(state.available, true);
  assert.equal(state.settings.buildMode, "none");
  assert.equal(state.settings.scrapEfficiency, 1.5);
}

// Build invoked but nothing appeared: one invocation, then STOP.
{
  const stuckRoot = structuredClone(root);
  stuckRoot.portal.mechbay.bay = 0;
  stuckRoot.portal.mechbay.mechs = [];
  stuckRoot.portal.purifier.supply = 75_000;
  stuckRoot.resource.Soul_Gem.amount = 1;
  let invocations = 0;
  const stuckControls = {
    resolve: (id) => (id === "mechAssembly" ? assembly : undefined),
    invoke: (handle, method) => {
      if (method === "bay") return { ok: true, value: 1 };
      if (method === "price") return { ok: true, value: 75_000 };
      if (method === "soul") return { ok: true, value: 1 };
      if (method === "build") {
        invocations += 1;
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => ["mechAssembly"],
  };
  const stuck = createCapturedMech({
    rootState: {
      readRoot: () => stuckRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: stuckControls,
    readSettings: () => ({ autoMech: true, mechBuild: "user" }),
    keyState: { readPressed: () => false },
  });
  const outcome = runCapturedMech(stuck);
  assert.equal(outcome.status, "stale");
  assert.equal(invocations, 1);
  assert.equal(stuckRoot.portal.mechbay.mechs.length, 0);
}

console.log("captured mech checks passed");
