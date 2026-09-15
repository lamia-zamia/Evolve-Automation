import assert from "node:assert/strict";

import { runCapturedMech } from "../src/application/captured-mech.ts";
import { createCapturedMech } from "../src/adapters/evolve/combat/captured-mech.ts";
import { planCapturedMechBuild } from "../src/domain/combat/captured-mech.ts";

const root = {
  settings: { qKey: false },
  portal: {
    mechbay: {
      max: 10,
      bay: 0,
      blueprint: { size: "small", infernal: false },
    },
    purifier: { supply: 75_000 },
  },
  resource: { Soul_Gem: { amount: 1 } },
};
const settings = { autoMech: true, mechBuild: "user" };
const trace = [];
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
      root.portal.mechbay.bay += 1;
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
assert.equal(root.portal.purifier.supply, 0);
assert.equal(root.resource.Soul_Gem.amount, 0);

root.settings.qKey = true;
assert.equal(adapter.reader.read().available, true);
assert.equal(planCapturedMechBuild(adapter.reader.read()), null);
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
    queueKeyEnabled: false,
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

console.log("captured mech checks passed");
