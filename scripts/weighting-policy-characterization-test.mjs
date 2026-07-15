import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  cloneInto: (value) => value,
  console,
  localStorage: { getItem: () => null },
  Math,
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  unsafeWindow: {},
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

const policy = hooks.weightingPolicy;
assert.ok(policy, "weighting policy hook missing");
assert.deepEqual(Array.from(Object.keys(policy)), [
  "wrGlobalCondition",
  "wrIndividualCondition",
  "wrDescription",
  "wrMultiplier",
  "authorityCapBuildings",
  "INFLATION_CHALLENGE_MONEY",
  "RETIREMENT_PREP",
  "inflationMoneyStorageBuildings",
  "inflationMoneyIncomeBuildings",
  "galaxyCombatShips",
  "weightingRules",
]);
assert.deepEqual(
  [
    policy.wrGlobalCondition,
    policy.wrIndividualCondition,
    policy.wrDescription,
    policy.wrMultiplier,
  ],
  [0, 1, 2, 3],
);
assert.equal(policy.INFLATION_CHALLENGE_MONEY, 250_000_000_000);
assert.deepEqual(
  { ...policy.RETIREMENT_PREP },
  {
    fusionGenerators: 20,
    factories: 18,
    scienceLabs: 11,
    graphene: 200_000_000,
  },
);
assert.equal(
  policy.weightingRules.every(
    (rule) =>
      rule.length === 4 && rule.every((phase) => typeof phase === "function"),
  ),
  true,
);

function normalizeFunctionSource(fn) {
  return fn
    .toString()
    .replace(/\b([A-Za-z_$][A-Za-z0-9_$]*?)\d+\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
const ruleSourceHash = createHash("sha256")
  .update(
    JSON.stringify(
      policy.weightingRules.map((rule) =>
        rule.map((phase) => normalizeFunctionSource(phase)),
      ),
    ),
  )
  .digest("hex");
const bindings = (items) => Array.from(items, (item) => item._vueBinding);
assert.deepEqual(
  {
    rules: policy.weightingRules.length,
    hash: ruleSourceHash,
    authority: bindings(policy.authorityCapBuildings),
    storage: bindings(policy.inflationMoneyStorageBuildings),
    income: bindings(policy.inflationMoneyIncomeBuildings),
    ships: bindings(policy.galaxyCombatShips),
  },
  {
    rules: 71,
    hash: "e8677fb2776befaf2a801e927d957878f7cb41834b61f1f7e386004aa3f596cc",
    authority: [
      "city-garrison",
      "city-temple",
      "space-space_barracks",
      "interstellar-cruiser",
      "space-space_station",
      "portal-brute",
      "portal-minions",
      "portal-throne",
      "eden-bunker",
    ],
    storage: [
      "city-bank",
      "city-casino",
      "space-spc_casino",
      "space-titan_bank",
      "tauceti-tauceti_casino",
      "interstellar-exchange",
      "portal-vault",
      "portal-war_vault",
      "portal-hell_casino",
      "eden-eternal_bank",
    ],
    income: [
      "city-tourist_center",
      "city-casino",
      "space-spc_casino",
      "tauceti-tauceti_casino",
      "interstellar-luxury_condo",
      "portal-hell_casino",
    ],
    ships: [
      "galaxy-scout_ship",
      "galaxy-corvette_ship",
      "galaxy-frigate_ship",
      "galaxy-cruiser_ship",
      "galaxy-dreadnought",
    ],
  },
);
console.log("Weighting policy bundled characterization tests passed");
