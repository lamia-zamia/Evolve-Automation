import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.deepEqual(Object.keys(hooks.authorityPolicy), [
  "getAuthorityTarget",
  "getAuthorityPerSoldier",
  "getRequiredAuthorityGarrison",
  "getPredictedAuthorityAfterRemovingSoldiers",
  "assessAuthorityRemoval",
]);
assert.equal(typeof hooks.setAuthorityPolicyTestContext, "function");

function setContext({
  authorityManage = true,
  authorityTarget = 100,
  authority = 100,
  authorityMax = 137,
  evilTech = 1,
  highPopulationPercent = 100,
  grenadier = false,
  government = "federation",
} = {}) {
  hooks.setAuthorityPolicyTestContext({
    game: {
      global: {
        race: {
          ...(grenadier ? { grenadier: true } : {}),
          ...(highPopulationPercent !== 100 ? { high_pop: true } : {}),
        },
        tech: { evil: evilTech },
        civic: { govern: { type: government } },
      },
      traits: {
        high_pop: { vars: () => [1, highPopulationPercent] },
      },
    },
    settings: {
      authorityManage,
      generalMinimumAuthority: authorityTarget,
    },
    resources: {
      Authority: {
        currentQuantity: authority,
        maxQuantity: authorityMax,
      },
    },
  });
}

setContext({ authorityTarget: 0 });
assert.equal(hooks.authorityPolicy.getAuthorityTarget(), null);
setContext({ authorityManage: false, authorityTarget: -1 });
assert.equal(hooks.authorityPolicy.getAuthorityTarget(), null);
setContext({ authorityTarget: -1, authorityMax: 137 });
assert.equal(hooks.authorityPolicy.getAuthorityTarget(), 137);
setContext({ authorityTarget: 120 });
assert.equal(hooks.authorityPolicy.getAuthorityTarget(), 120);

setContext({ evilTech: 1 });
assert.ok(
  Math.abs(hooks.authorityPolicy.getAuthorityPerSoldier() - 0.8) < 1e-12,
);
setContext({
  evilTech: 1,
  highPopulationPercent: 50,
  grenadier: true,
  government: "dictator",
});
assert.ok(
  Math.abs(hooks.authorityPolicy.getAuthorityPerSoldier() - 0.784) < 1e-12,
);
setContext({ evilTech: 0, government: "autocracy" });
assert.ok(
  Math.abs(hooks.authorityPolicy.getAuthorityPerSoldier() - 0.756) < 1e-12,
);

setContext({ authorityTarget: 0, authority: 20 });
assert.equal(hooks.authorityPolicy.getRequiredAuthorityGarrison(25), 0);
setContext({ authority: 96, authorityTarget: 100, evilTech: 1 });
assert.equal(hooks.authorityPolicy.getRequiredAuthorityGarrison(20), 25);
setContext({ authority: 110, authorityTarget: 100, evilTech: 1 });
assert.equal(hooks.authorityPolicy.getRequiredAuthorityGarrison(25), 13);
setContext({
  authority: 100,
  authorityTarget: 100,
  evilTech: 1,
  highPopulationPercent: 0,
});
assert.equal(hooks.authorityPolicy.getRequiredAuthorityGarrison(25), 25);

setContext({ authority: 100, evilTech: 1 });
assert.equal(
  hooks.authorityPolicy.getPredictedAuthorityAfterRemovingSoldiers(2),
  98,
);
assert.equal(
  hooks.authorityPolicy.getPredictedAuthorityAfterRemovingSoldiers(1.25),
  99,
);
assert.deepEqual(
  { ...hooks.authorityPolicy.assessAuthorityRemoval(2) },
  {
    status: "ready",
    target: 100,
    predicted: 98,
    blocksRemoval: true,
  },
);

hooks.setAuthorityPolicyTestContext({
  game: {},
  settings: { authorityManage: true, generalMinimumAuthority: 100 },
  resources: {
    Authority: { currentQuantity: 100, maxQuantity: 137 },
  },
});
assert.deepEqual(
  { ...hooks.authorityPolicy.assessAuthorityRemoval(2) },
  { status: "unavailable", reason: "invalid-game-state" },
);

console.log("Authority policy bundled characterization tests passed");
